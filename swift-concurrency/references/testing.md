# Testing Concurrent Code

Use this when:

- You are writing async tests.
- A test is flaky because of task scheduling or actor isolation.
- You need to replace XCTest waiting APIs or verify deallocation.

Skip this file if:

- You mainly need production ownership guidance. Use `actors.md`, `tasks.md`, or `memory-management.md`.

Jump to:

- Swift Testing first
- waiting strategies
- flake control
- XCTest fallback
- leak checks

## Prefer Swift Testing

Use Swift Testing for new code when available. It fits async code better than legacy XCTest patterns.

Minimal example:

```swift
@Test
@MainActor
func searchReturnsResults() async {
    let searcher = ArticleSearcher()
    await searcher.search("swift")
    #expect(!searcher.results.isEmpty)
}
```

## Waiting for Async Effects

Choose the smallest waiting tool that matches the shape of the test.

### Await the API Directly

Best when the production API is already structured:

```swift
let result = try await service.load()
#expect(result.count == 3)
```

### Use `confirmation`

Best when a structured async action should trigger an observable effect:

```swift
await confirmation { confirm in
    model.onDidChange = { confirm() }
    await model.refresh()
}
```

### Use a Continuation

Best when testing unstructured tasks or callback-style notifications:

```swift
await withCheckedContinuation { continuation in
    model.onDidChange = { continuation.resume() }
    model.startBackgroundWork()
}
```

## Flake Control

When state transitions are timing-sensitive, make scheduling deterministic instead of relying on sleeps.

```swift
try await withMainSerialExecutor {
    let task = Task { await viewModel.load() }
    await Task.yield()
    #expect(viewModel.isLoading)
    await task.value
}
```

Use serial execution only for tests that actually need it. If the suite relies on a main serial executor helper, ensure tests do not run in parallel unintentionally.

## XCTest Fallback

For legacy XCTest code, replace blocking wait APIs with async-aware variants:

```swift
final class ServiceTests: XCTestCase {
    func testLoad() async throws {
        let exp = expectation(description: "loaded")
        Task {
            await service.load()
            exp.fulfill()
        }
        await fulfillment(of: [exp])
    }
}
```

If the project can adopt Swift Testing, prefer migrating new tests first instead of rewriting every old test immediately.

## Testing Actor-Isolated Code

Match the test isolation to the system under test:

- `@MainActor` type -> mark the test `@MainActor`
- custom actor API -> call it with `await`
- mixed isolation -> assert through public APIs rather than reaching across boundaries

## Leak and Lifetime Checks

Use small focused tests for task-owned lifetimes:

```swift
@Test
func ownerDeallocatesAfterWorkStops() async {
    weak var weakOwner: Owner?

    do {
        let owner = Owner()
        weakOwner = owner
        owner.stop()
    }

    await Task.yield()
    #expect(weakOwner == nil)
}
```

For retain-cycle guidance, see `memory-management.md`.

## Anti-Patterns

Avoid these:

- Using `Task.sleep` as a synchronization primitive in tests.
- Asserting intermediate state without controlling scheduling.
- Reaching into isolated internals instead of testing public behavior.
- Keeping both Swift Testing and XCTest versions of the same example unless they teach different migration paths.
