# Memory Management

Use this when:

- A task may be keeping an object alive longer than expected.
- You suspect a retain cycle involving a stored task or infinite async sequence.
- You need to decide between strong capture, weak capture, and explicit cancellation.

Skip this file if:

- The main problem is test design. Use `testing.md`.
- The main problem is task structure rather than lifetime. Use `tasks.md`.

Jump to:

- retain cycles
- one-way retention
- async sequences
- cleanup

## Core Rules

- Tasks capture references like closures do.
- A retain cycle exists when `self` owns a task and that task strongly captures `self`.
- Strong capture is sometimes fine for short-lived work.
- Infinite or long-lived work needs explicit ownership planning.

## Retain Cycle Pattern

This is the classic cycle:

```swift
final class Loader {
    private var task: Task<Void, Never>?

    func start() {
        task = Task {
            await self.poll()
        }
    }
}
```

`self` owns `task`, and `task` owns `self`.

### Safer Long-Lived Pattern

```swift
task = Task { [weak self] in
    while let self, !Task.isCancelled {
        await self.poll()
        try? await Task.sleep(for: .seconds(1))
    }
}
```

Check `Task.isCancelled` so the loop exits when the task is cancelled. Without it, `try?` swallows the `CancellationError` from `Task.sleep` and the loop keeps spinning.

Use this pattern for polling, observers, and other indefinite work.

## One-Way Retention

If `self` does not store the task, strong capture may be acceptable:

```swift
func save() {
    Task {
        await database.save(model)
    }
}
```

That still keeps `self` alive until the task finishes, so it is only a good fit for short-lived work.

## Async Sequences Need Extra Care

Infinite streams are the easiest way to keep an object alive forever.

```swift
task = Task { [weak self] in
    for await event in events {
        guard let self else { return }
        self.handle(event)
    }
}
```

Also consider explicit cancellation when the owner has a natural stop event.

## `isolated deinit`

`isolated deinit` is useful for actor-isolated cleanup:

```swift
@MainActor
final class ViewModel {
    private var task: Task<Void, Never>?

    isolated deinit {
        task?.cancel()
    }
}
```

Important: it does not break a retain cycle. If the cycle prevents deinit, cleanup never runs.

## Detection

Look for these signals:

- an object never deallocates after its owner goes away
- stored tasks with no clear cancellation point
- async sequences that never finish
- observation code that outlives the UI or controller that started it

## Practical Rules

- Short-lived task + no stored task -> strong capture may be fine.
- Stored long-lived task -> prefer weak capture or explicit stop ownership.
- Infinite async sequence -> assume you need cancellation or weak capture.
- Cleanup in deinit -> good secondary protection, not a primary cycle breaker.

## Testing

Write a focused deallocation test instead of guessing. See `testing.md` for examples.

## Common Mistakes

```swift
// ❌ Forgetting weak self in indefinite loops
Task {
    while true {
        self.poll() // Retain cycle -- self owns task, task owns self
        try? await Task.sleep(for: .seconds(1))
    }
}

// ❌ Strong capture in async sequences
Task {
    for await item in stream {
        self.process(item) // May never release if stream never finishes
    }
}

// ❌ Not canceling stored tasks
class Manager {
    var task: Task<Void, Never>?
    func start() {
        task = Task { await self.work() } // Retain cycle
    }
    // Missing: deinit { task?.cancel() }
}

// ❌ Assuming deinit breaks cycles
deinit {
    task?.cancel() // Never called if retain cycle already exists
}
```

### Notification observer with weak capture

```swift
Task { [weak self] in
    for await _ in NotificationCenter.default.notifications(named: .didUpdate) {
        guard let self else { break }
        await self.handleUpdate()
    }
}
```

## Anti-Patterns

Avoid these:

- Assuming `Task {}` somehow avoids closure capture rules.
- Storing long-lived tasks without a cancellation plan.
- Expecting `deinit` cleanup to break an existing cycle.
- Using weak capture everywhere without thinking about ownership; some short-lived work should stay strong and simple.
