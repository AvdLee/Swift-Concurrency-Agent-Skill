# Observation Framework & Swift Concurrency

Use this when:
- You're using `@Observable` classes with `@MainActor` or custom actors
- You see data-race warnings when accessing observed properties from async contexts
- You need to bridge `@Observable` with `AsyncSequence` (via `Observations` on Swift 6.2+, or `AsyncStream` as fallback)
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
- [Bridging Observable to AsyncSequence](#bridging-observable-to-asyncsequence)
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

    func process(items: [RawItem], transform: @Sendable (RawItem) -> ProcessedItem) {
        for (index, item) in items.enumerated() {
            results.append(transform(item))
            progress = Double(index + 1) / Double(items.count)
        }
    }
}
```

### Reading from Another Isolation Domain

```swift
// ✅ Use await to cross isolation boundaries
func showProgress() async {
    let processor = await DataProcessor() // init is BackgroundActor-isolated too
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

### Parallel Access with `async let`

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

> **Note**: For CPU-heavy work, prefer a dedicated actor or a `nonisolated` `async` method marked `@concurrent` so the call stays structured. Reserve `Task.detached` for the specific case where you must escape inherited actor isolation (see `tasks.md` — "Detached Tasks"). Either way, keep heavy computation off `@MainActor` so the UI stays responsive.

---

## Bridging Observable to AsyncSequence

### Swift 6.2+ (iOS 26 / macOS 26): `Observations`

Swift 6.2 added [`Observations`](https://developer.apple.com/documentation/observation/observations), an `AsyncSequence` that streams transactional updates to any `@Observable` properties read inside its closure. This is the modern, framework-independent way to observe `@Observable` from concurrency code.

```swift
@MainActor
@Observable
final class SearchModel {
    var query: String = ""
    private(set) var results: [Item] = []

    func observeQuery() async {
        let queryChanges = Observations { self.query }

        // `.debounce(for:)` requires AsyncAlgorithms — see `async-algorithms.md`.
        for await text in queryChanges.debounce(for: .milliseconds(300)) {
            guard !Task.isCancelled else { return }
            results = text.isEmpty ? [] : (try? await api.search(text)) ?? []
        }
    }
}
```

`Observations` batches synchronous mutations until the next `await`, so observers only see consistent snapshots — no half-updated state. It is **not back-ported**; reach for the fallback below if you need to support older OS versions.

### Pre-Swift 6.2 fallback: `withObservationTracking` + `AsyncStream`

`withObservationTracking` fires `onChange` only once per cycle, so the closure has to re-register itself to keep observing.

```swift
import AsyncAlgorithms

@MainActor
@Observable
final class SearchModel {
    var query: String = ""
    private(set) var results: [Item] = []

    func observeQuery() async {
        let stream = AsyncStream<String> { continuation in
            @Sendable func track() {
                withObservationTracking {
                    _ = self.query
                } onChange: {
                    Task { @MainActor in
                        continuation.yield(self.query)
                        track()
                    }
                }
            }
            track()
        }

        for await text in stream.debounce(for: .milliseconds(300)) {
            guard !Task.isCancelled else { return }
            results = text.isEmpty ? [] : (try? await api.search(text)) ?? []
        }
    }
}
```

**Lifecycle notes** (apply to both patterns):
- The consumer (`for await …`) owns cancellation. Cancelling the enclosing `Task` ends the loop.
- In the fallback, finish the `AsyncStream` continuation when ownership ends (e.g. in `deinit` on a non-isolated coordinator) to avoid leaking the stream.

---

## Preventing Data Races

### Problem: Unprotected Shared State

```swift
// ❌ Won't compile under Swift 6 strict concurrency
@Observable
final class Counter {
    var count = 0
}

let counter = Counter()
await withTaskGroup(of: Void.self) { group in
    for _ in 0..<100 {
        // Error: capture of non-Sendable type 'Counter' in a `@Sendable` closure
        group.addTask { counter.count += 1 }
    }
}
```

Under Swift 6, `withTaskGroup.addTask` requires a `@Sendable` closure, so capturing a non-isolated `@Observable` class is rejected at compile time before any runtime race can occur. The fix is to give the class a clear isolation domain, not to silence the warning with `@unchecked Sendable`.

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
| Mixed read/write from multiple contexts | `@MainActor` class + a dedicated actor (or `@concurrent` async method) for heavy work | MainActor owns state; the actor or `@concurrent` call offloads computation off the main thread without unstructured `Task.detached` |
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

> **Note**: A `@MainActor` `@Observable` class is already implicitly `Sendable` because access is serialized through the main actor — you do not need `@unchecked Sendable` on it. If you have a genuinely non-isolated `@Observable` that must cross boundaries, prefer a Sendable snapshot or actor wrapping; reach for `@unchecked Sendable` only with a documented safety invariant. See `sendable.md` for the full discussion of safe escape hatches.

---

## Migration from ObservableObject

`@Observable` removes the publisher surface, so concurrency migrations stop being about Combine bookkeeping and start being about isolation. Mapping:

| `ObservableObject` (old) | `@Observable` (new) |
|---|---|
| `class MyModel: ObservableObject` | `@Observable final class MyModel` |
| `@Published var name = ""` | `var name = ""` |
| `objectWillChange.send()` | Automatic — tracked on property access |
| `$name` publisher → `sink` | `Observations { … }` (Swift 6.2+) or `withObservationTracking` fallback |

For full Combine-to-Concurrency examples — including `@Published` + `debounce` + `sink` rewritten as `@Observable` + `AsyncSequence` — use `references/async-algorithms.md` (operator-by-operator mapping) and `references/migration.md` (real-world migration walkthroughs). The "Bridging Observable to AsyncSequence" section above shows the modern replacement for `$name.sink { … }` patterns specifically.

---

## Common Diagnostics

| Error / Warning | Cause | Fix |
|---|---|---|
| `Main actor-isolated property 'x' can not be accessed from a nonisolated context` | Accessing `@MainActor` property without `await` | Use `await` or move caller to same isolation |
| `Capture of non-sendable type 'MyModel' in @Sendable closure` | Passing `@Observable` object into `Task {}` | Add `@MainActor` to the class, or use `@Sendable` with `await` access |
| `Actor-isolated property 'x' can not be mutated from a Sendable closure` | Writing to actor-isolated property inside `Task.detached` | Read/write through `await` on the owning actor |
| `Reference to property 'x' in closure requires explicit use of 'self'` | Standard Swift capture rule, not concurrency-specific | Add `self.` prefix |
| `Capture of non-Sendable type 'X' in a '@Sendable' closure` when adding work to a task group | No isolation on the `@Observable` class, so it isn't `Sendable` | Apply `@MainActor` or a global actor to the class so it is isolated and access goes through `await` |
| `Sending value of non-Sendable type 'MyModel' risks causing data races` | Passing `@Observable` object across isolation boundaries | Pass a `Sendable` value-type snapshot instead of the object |

---

## Further Learning

- [actors.md](actors.md) — Actor fundamentals and isolation rules
- [sendable.md](sendable.md) — Sendable conformance for types crossing isolation
- [migration.md](migration.md) — Migrating from Combine and completion handlers

For in-depth coverage of Swift Concurrency, see [Swift Concurrency Course](https://www.swiftconcurrencycourse.com).
