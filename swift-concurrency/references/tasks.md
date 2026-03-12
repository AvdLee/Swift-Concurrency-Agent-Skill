# Tasks

Use this when:

- You need to start async work from synchronous code.
- You are choosing between `Task`, `async let`, and task groups.
- You need cancellation, priorities, or structured vs unstructured guidance.

Skip this file if:

- The problem is mainly actor isolation or sendability.
- The work is stream-shaped; use `async-sequences.md` or `async-algorithms.md`.

Jump to:

- Picking the right task tool
- Cancellation
- Task groups
- SwiftUI usage

## Pick the Smallest Tool

| Need | Tool |
|---|---|
| Start async work from sync code | `Task { }` |
| Fixed number of child operations | `async let` |
| Dynamic number of child operations | `withTaskGroup` / `withThrowingTaskGroup` |
| Fire-and-forget with different isolation/executor rules | `Task.detached` only with explicit justification |

Prefer structured concurrency whenever possible.

## Creating a Task

```swift
func refreshButtonTapped() {
    Task {
        await refresh()
    }
}
```

Keep a task reference only when you need cancellation, deduplication, or result access.

```swift
final class Loader {
    private var task: Task<Void, Never>?

    func start() {
        task?.cancel()
        task = Task {
            await refresh()
        }
    }
}
```

## Cancellation

Cancellation is cooperative. Child tasks are notified, but they still need to stop their own work.

```swift
func process() async throws {
    try Task.checkCancellation()
    let data = try await fetch()
    try Task.checkCancellation()
    consume(data)
}
```

Check cancellation:

- before expensive work
- after a suspension that may make the result irrelevant
- inside long loops

## `async let`

Use when the number of operations is known up front:

```swift
async let profile = loadProfile()
async let settings = loadSettings()

let result = await (profile, settings)
```

This is the simplest way to express fixed parallelism.

## Task Groups

Use when the number of child tasks is dynamic:

```swift
let images = await withTaskGroup(of: UIImage?.self) { group in
    for url in urls {
        group.addTask { await download(url) }
    }

    var images: [UIImage] = []
    while let image = await group.next() {
        if let image {
            images.append(image)
        }
    }

    return images
}
```

Use `withThrowingTaskGroup` when child failures should propagate.

**Critical**: errors in child tasks do not automatically fail the group. You must iterate (e.g. `for try await` or `group.next()`) to surface them. Without iteration, child errors are silently swallowed.

Use `addTaskUnlessCancelled` to prevent adding work to an already-cancelled group.

### Discarding Task Groups

Use `withDiscardingTaskGroup` / `withThrowingDiscardingTaskGroup` for fire-and-forget work where results are not needed:

```swift
await withDiscardingTaskGroup { group in
    group.addTask { await logEvent("login") }
    group.addTask { await preloadCache() }
}
```

More memory efficient than regular task groups because results are not stored. First error in the throwing variant cancels the group and propagates.

## Structured vs Unstructured

Prefer structured work when the parent owns the lifetime of the child work.

Use unstructured tasks only when you genuinely need a new top-level task boundary, for example:

- starting async work from a sync callback
- view or UI event handlers
- bridging old APIs during migration

`Task.detached` is rarer still. Use it only when inherited actor context, priority, and task-local values should not apply.

## SwiftUI

Prefer SwiftUI's task APIs when the work is view-owned:

```swift
.task {
    await refresh()
}
```

```swift
.task(id: query) {
    await search(query)
}
```

`.task(id:)` is usually better than manual "cancel previous search task" code for view-driven changes.

## Priority

Priorities are hints, not a guarantee.

- Use higher priority for user-visible work.
- Use lower priority for background or analytics work.
- Do not try to encode correctness through priority.

## Anti-Patterns

Avoid these:

- Replacing structured child work with many unrelated top-level tasks.
- Using `Task.detached` just to "make it background."
- Ignoring cancellation in long-running operations.
- Keeping a stored task forever without a clear owner or cleanup path.

## Related References

- Streams -> `async-sequences.md`
- Debounce / throttle -> `async-algorithms.md`
- Lifetime and retain cycles -> `memory-management.md`
