# Observation Framework & Swift Concurrency

Use this when:
- You're using `@Observable` classes with `@MainActor` or custom actors
- You see data-race warnings when accessing observed properties from async contexts
- You need to bridge `@Observable` with `AsyncStream` or `AsyncSequence`
- You're migrating from `ObservableObject` and hitting concurrency issues

Skip this file if:
- You need general async/await patterns → [async-await-basics.md](async-await-basics.md)
- You need actor fundamentals → [actors.md](actors.md)
- You need Sendable conformance details → [sendable.md](sendable.md)
- You need Combine-to-Concurrency migration → [migration.md](migration.md)

Jump to:
- [Observable with MainActor](#observable-with-mainactor)
- [Observable with Custom Actors](#observable-with-custom-actors)
- [Accessing Observed Properties from Async Contexts](#accessing-observed-properties-from-async-contexts)
- [Bridging Observable to AsyncStream](#bridging-observable-to-asyncstream)
- [Preventing Data Races](#preventing-data-races)
- [Passing @Observable Across Isolation Boundaries](#passing-observable-across-isolation-boundaries)
- [Migration from ObservableObject](#migration-from-observableobject)
- [Common Diagnostics](#common-diagnostics)

---

## Observable with MainActor

The most common pattern: an `@Observable` class isolated to the main actor.

```swift
// ✅ Correct: Entire class isolated to @MainActor
@MainActor
@Observable
final class CounterModel {
    var count = 0

    func increment() {
        count += 1
    }

    func loadFromServer() async throws {
        let value = await fetchCount() // Suspends, resumes on MainActor
        count = value
    }
}
```

When a class is `@MainActor`-isolated, all its stored properties and synchronous methods run on the main actor. Async methods suspend and resume on the main actor automatically.

```swift
// ❌ Wrong: Mixing isolation without care
@Observable
final class CounterModel {
    @MainActor var count = 0 // Only this property is isolated

    func increment() {
        count += 1 // ⚠️ Error: Main actor-isolated property accessed from nonisolated context
    }
}
```

**Rule of thumb**: Isolate the entire class with `@MainActor` rather than individual properties. Partial isolation leads to fragmented access and confusing diagnostics.

---

## Observable with Custom Actors

For models that don't need main-actor isolation, use a `globalActor` or contain an actor for internal synchronization.

### Global Actor Isolation

```swift
@globalActor
actor BackgroundActor {
    static let shared = BackgroundActor()
}

@BackgroundActor
@Observable
final class DataProcessor {
    var progress: Double = 0.0
    var results: [ProcessedItem] = []

    func process(items: [RawItem]) async {
        for (index, item) in items.enumerated() {
            results.append(await transform(item))
            progress = Double(index + 1) / Double(items.count)
        }
    }
}
```

### Reading from Another Isolation Domain

```swift
// ✅ Use await to cross isolation boundaries
func showProgress() async {
    let processor = DataProcessor()
    let current = await processor.progress
    print("Progress: \(current)")
}
```

---

## Accessing Observed Properties from Async Contexts

### Sequential Access

```swift
@MainActor
@Observable
final class UserProfile {
    var name: String = ""
    var avatarURL: URL?

    func refresh() async throws {
        let data = try await api.fetchProfile()
        // Back on MainActor after await
        name = data.name
        avatarURL = data.avatarURL
    }
}
```

### Parallel Access with Task Groups

```swift
@MainActor
@Observable
final class Dashboard {
    var stats: Stats?
    var notifications: [Notification] = []

    func loadAll() async throws {
        // Run fetches in parallel, update properties on MainActor
        async let fetchedStats = api.fetchStats()
        async let fetchedNotifications = api.fetchNotifications()

        let (s, n) = try await (fetchedStats, fetchedNotifications)
        stats = s
        notifications = n
    }
}
```

### Offloading Work, Updating on MainActor

```swift
@MainActor
@Observable
final class ImageProcessor {
    var processedImage: CGImage?
    var isProcessing = false

    func process(input: Data) async throws {
        isProcessing = true
        // Heavy work off the main actor
        let result = try await Task.detached {
            try HeavyImageFilter.apply(to: input)
        }.value
        // Back on MainActor
        processedImage = result
        isProcessing = false
    }
}
```

> **Note**: Prefer `Task.detached` or a dedicated actor for CPU-heavy work. Keeping heavy computation on `@MainActor` blocks the UI.

---

## Bridging Observable to AsyncStream

`@Observable` does not natively produce an `AsyncSequence`. Use `withObservationTracking` to bridge changes into an `AsyncStream`.

```swift
@MainActor
@Observable
final class SearchModel {
    var query: String = ""
    private(set) var results: [Item] = []
    private var searchTask: Task<Void, Never>?

    func startObservingQuery() {
        searchTask = Task { [weak self] in
            let queryStream = AsyncStream<String> { continuation in
                @Sendable func observe() {
                    withObservationTracking {
                        _ = self?.query
                    } onChange: {
                        Task { @MainActor in
                            continuation.yield(self?.query ?? "")
                            observe()
                        }
                    }
                }
                observe()
            }

            for await query in queryStream.debounce(for: .milliseconds(300)) {
                guard !Task.isCancelled else { return }
                await self?.performSearch(query)
            }
        }
    }

    private func performSearch(_ text: String) async {
        guard !text.isEmpty else {
            results = []
            return
        }
        results = (try? await api.search(text)) ?? []
    }

    func stopObserving() {
        searchTask?.cancel()
    }
}
```

**Key points**:
- `withObservationTracking` fires `onChange` only once per tracking cycle — you must re-register after each change
- Use `[weak self]` to avoid retain cycles in long-lived streams
- Always check `Task.isCancelled` in the consuming loop

---

## Preventing Data Races

### Problem: Unprotected Shared State

```swift
// ❌ Data race: no isolation, accessed from multiple tasks
@Observable
final class Counter {
    var count = 0
}

let counter = Counter()
await withTaskGroup(of: Void.self) { group in
    for _ in 0..<100 {
        group.addTask { counter.count += 1 } // 💥 Data race
    }
}
```

### Solution 1: Actor Isolation

```swift
// ✅ MainActor isolation prevents concurrent access
@MainActor
@Observable
final class Counter {
    var count = 0

    func increment() {
        count += 1
    }
}

let counter = Counter()
await withTaskGroup(of: Void.self) { group in
    for _ in 0..<100 {
        group.addTask { await counter.increment() }
    }
}
```

### Solution 2: Dedicated Actor as Internal Synchronization

```swift
// ✅ Actor protects mutable state, Observable exposes read-only view
@MainActor
@Observable
final class Counter {
    private(set) var count = 0

    private actor State {
        var value = 0
        func increment() -> Int {
            value += 1
            return value
        }
    }

    private let state = State()

    func increment() async {
        let newValue = await state.increment()
        count = newValue // Update on MainActor
    }
}
```

### Decision Table: Choosing an Isolation Strategy

| Scenario | Strategy | Why |
|---|---|---|
| UI-bound model | `@MainActor` on class | Simplest; all property access is safe |
| Background processing model | `@globalActor` on class | Keeps work off main thread |
| Mixed read/write from multiple contexts | `@MainActor` class + `Task.detached` for heavy work | MainActor owns state, offload computation |
| High-contention counter/accumulator | Internal actor + `@MainActor` surface | Actor serializes writes, MainActor publishes |

---

## Passing @Observable Across Isolation Boundaries

`@Observable` classes are reference types and are **not** implicitly `Sendable`. Passing them across isolation boundaries triggers a compiler error in Swift 6.

### Problem

```swift
// ❌ Compiler error in Swift 6
@MainActor
@Observable
final class Settings {
    var theme: String = "light"
}

actor SyncEngine {
    func apply(settings: Settings) {
        // Error: Sending value of non-Sendable type 'Settings' risks data races
    }
}
```

### Solution 1: Pass a Sendable Snapshot

Extract the values you need into a `Sendable` value type:

```swift
struct SettingsSnapshot: Sendable {
    let theme: String
}

actor SyncEngine {
    func apply(snapshot: SettingsSnapshot) {
        // ✅ SettingsSnapshot is Sendable
        print("Applying theme: \(snapshot.theme)")
    }
}

// At the call site
let snapshot = SettingsSnapshot(theme: settings.theme)
await syncEngine.apply(snapshot: snapshot)
```

### Solution 2: Read via `await` Without Transferring Ownership

If you only need to read a few properties, access them across isolation without passing the object:

```swift
actor SyncEngine {
    func sync(with model: UserModel) async {
        let name = await model.name  // Read across boundary
        // Use name locally
    }
}
```

### Solution 3: `@unchecked Sendable` (Last Resort)

Only when you can **document and guarantee** thread safety:

```swift
@MainActor
@Observable
final class AppState: @unchecked Sendable {
    // ⚠️ Safety invariant: all mutations happen on @MainActor.
    // TODO: Remove @unchecked once compiler supports this pattern natively.
    var isLoggedIn = false
}
```

**Rule**: Require a documented safety invariant and a follow-up removal plan.

---

## Migration from ObservableObject

| `ObservableObject` (old) | `@Observable` (new) |
|---|---|
| `class MyModel: ObservableObject` | `@Observable final class MyModel` |
| `@Published var name = ""` | `var name = ""` |
| `objectWillChange.send()` | Automatic — tracked on property access |
| `$name` publisher → `sink` | `withObservationTracking` or `AsyncStream` bridge |

### Before (Combine-based)

```swift
// ❌ Old pattern: manual publisher, Combine pipeline
class SearchModel: ObservableObject {
    @Published var query = ""
    @Published var results: [Item] = []
    private var cancellables = Set<AnyCancellable>()

    init() {
        $query
            .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
            .sink { [weak self] text in
                Task { await self?.search(text) }
            }
            .store(in: &cancellables)
    }
}
```

### After (Swift Concurrency)

```swift
// ✅ Modern pattern: @Observable + AsyncStream
@MainActor
@Observable
final class SearchModel {
    var query = ""
    private(set) var results: [Item] = []

    func observeQuery() async {
        for await debouncedQuery in queryStream().debounce(for: .milliseconds(300)) {
            guard !Task.isCancelled else { return }
            results = (try? await api.search(debouncedQuery)) ?? []
        }
    }

    private func queryStream() -> AsyncStream<String> {
        AsyncStream { [weak self] continuation in
            @Sendable func track() {
                guard let self else {
                    continuation.finish()
                    return
                }
                withObservationTracking {
                    _ = self.query
                } onChange: {
                    Task { @MainActor [weak self] in
                        guard let self else {
                            continuation.finish()
                            return
                        }
                        continuation.yield(self.query)
                        track()
                    }
                }
            }
            track()
        }
    }
}
```

**Key differences**:
- No `Combine` import or `AnyCancellable` bookkeeping
- Class is `final` — `@Observable` uses a macro, not protocol inheritance
- All concurrency is structured via `Task` and `AsyncStream`

---

## Common Diagnostics

| Error / Warning | Cause | Fix |
|---|---|---|
| `Main actor-isolated property 'x' can not be accessed from a nonisolated context` | Accessing `@MainActor` property without `await` | Use `await` or move caller to same isolation |
| `Capture of non-sendable type 'MyModel' in @Sendable closure` | Passing `@Observable` object into `Task {}` | Add `@MainActor` to the class, or use `@Sendable` with `await` access |
| `Actor-isolated property 'x' can not be mutated from a Sendable closure` | Writing to actor-isolated property inside `Task.detached` | Read/write through `await` on the owning actor |
| `Reference to property 'x' in closure requires explicit use of 'self'` | Standard Swift capture rule, not concurrency-specific | Add `self.` prefix |
| Data race at runtime (TSAN) | No isolation on `@Observable` class accessed from multiple tasks | Apply `@MainActor` or actor isolation to the class |
| `Sending value of non-Sendable type 'MyModel' risks causing data races` | Passing `@Observable` object across isolation boundaries | Pass a `Sendable` value-type snapshot instead of the object |

---

## Further Learning

- [actors.md](actors.md) — Actor fundamentals and isolation rules
- [sendable.md](sendable.md) — Sendable conformance for types crossing isolation
- [migration.md](migration.md) — Migrating from Combine and completion handlers

For in-depth coverage of Swift Concurrency, see [Swift Concurrency Course](https://www.swiftconcurrencycourse.com).
