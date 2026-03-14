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

The `confirmation` block must `await` the async work that triggers the effect. Without `await`, the test silently passes without verifying anything.

### Use a Continuation

Best for strictly one-shot callbacks. Do not use for multi-fire observations (a second `resume()` traps at runtime):

```swift
await withCheckedContinuation { continuation in
    model.onCompletion = { continuation.resume() }
    model.startBackgroundWork()
}
```

For events that may fire more than once, use `confirmation` or an `AsyncStream`-based approach instead.

### Flaky intermediate-state check (common agent mistake)

```swift
// ❌ Flaky -- task may not have started yet
let task = Task { try await fetcher.fetch(url) }
#expect(fetcher.isLoading == true) // Race condition
```

Use `withMainSerialExecutor` + `Task.yield()` to control scheduling before asserting intermediate state.

## Flake Control

When state transitions are timing-sensitive, make scheduling deterministic instead of relying on sleeps.

Projects that already use Point-Free's ConcurrencyExtras often do this with `withMainSerialExecutor`:

```swift
try await withMainSerialExecutor {
    let task = Task { await viewModel.load() }
    await Task.yield()
    #expect(viewModel.isLoading)
    await task.value
}
```

**Critical**: `withMainSerialExecutor` does not work with parallel test execution. Mark the suite as serialized:

```swift
@Suite(.serialized)
@MainActor
final class ViewModelTests { ... }
```

If you do not have ConcurrencyExtras, fall back to explicit `Task.yield()`, actor isolation, or suite serialization instead of adding arbitrary sleeps.

## XCTest Fallback

For legacy XCTest code, replace blocking wait APIs with async-aware variants.

**Deadlock warning**: use `await fulfillment(of:)`, not `wait(for:timeout:)`. The blocking `wait` variant deadlocks when called from an async test method.

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

## Async Setup and Teardown

Swift Testing suites can use `init` for async setup. For async teardown, use a `TestScoping` trait:

```swift
@MainActor
struct DatabaseTrait: SuiteTrait, TestTrait, TestScoping {
    func provideScope(
        for test: Test,
        testCase: Test.Case?,
        performing function: () async throws -> Void
    ) async throws {
        let database = Database()
        await database.prepare()
        try await function()
        await database.cleanup()
    }
}

@Suite(DatabaseTrait())
@MainActor
final class DatabaseTests {
    @Test func insertsData() async throws { /* ... */ }
}
```

`deinit` cannot call async methods, so `TestScoping` is the recommended path for async cleanup.

For legacy XCTest, use `override func setUp() async throws` and `override func tearDown() async throws`.

XCTest equivalent of `@Suite(.serialized)` for `withMainSerialExecutor`:

```swift
override func invokeTest() {
    withMainSerialExecutor { super.invokeTest() }
}
```

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
