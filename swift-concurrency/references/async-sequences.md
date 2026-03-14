# Async Sequences and Streams

Use this when:

- Values arrive over time instead of as a single result.
- You need to bridge callbacks or delegates into Swift Concurrency.
- You need a stream boundary before deciding whether to add AsyncAlgorithms operators.

Skip this file if:

- You only need one eventual result. Use a normal `async` function.
- You already have a stream and mainly need debounce, throttle, or merging. Use `async-algorithms.md`.

Jump to:

- Decision guide
- `AsyncStream`
- Delegate bridging
- Lifecycle and cleanup

## Decision Guide

| Problem shape | Best tool |
|---|---|
| One async result | `async throws -> Value` |
| Many values over time | `AsyncSequence` |
| Bridge callbacks to a stream | `AsyncStream` / `AsyncThrowingStream` |
| Stream transformations | `AsyncAlgorithms` |

## Basic Consumption

```swift
for await value in values {
    handle(value)
}
```

Treat `for await` like any other long-lived async boundary: cancellation and lifetime still matter.

**Important**: `AsyncStream` supports only one consumer. If multiple tasks iterate the same stream, values split between them unpredictably. There is no built-in broadcast/share primitive; `AsyncChannel` from AsyncAlgorithms is also point-to-point. For true multicast, use multiple `AsyncStream` continuations or a custom broadcast wrapper.

## Prefer `AsyncStream` for Bridging

Most custom stream work should start with `AsyncStream` or `AsyncThrowingStream`, not a hand-written `AsyncSequence`.

### Callback Bridge

```swift
func download(_ url: URL) -> AsyncThrowingStream<Status, Error> {
    AsyncThrowingStream { continuation in
        startDownload(url) { event in
            switch event {
            case .progress(let value):
                continuation.yield(.progress(value))
            case .finished(let data):
                continuation.yield(.finished(data))
                continuation.finish()
            case .failed(let error):
                continuation.finish(throwing: error)
            }
        }
    }
}
```

### Delegate Bridge Skeleton

```swift
final class LocationMonitor: NSObject, CLLocationManagerDelegate {
    private var continuation: AsyncThrowingStream<CLLocation, Error>.Continuation?

    let stream: AsyncThrowingStream<CLLocation, Error>

    override init() {
        var capturedContinuation: AsyncThrowingStream<CLLocation, Error>.Continuation!
        self.stream = AsyncThrowingStream { continuation in
            capturedContinuation = continuation
        }
        super.init()
        self.continuation = capturedContinuation
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations {
            continuation?.yield(location)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        continuation?.finish(throwing: error)
    }
}
```

## Lifecycle and Cleanup

Always decide how the stream ends and how cleanup happens:

```swift
AsyncStream<Event> { continuation in
    continuation.onTermination = { @Sendable _ in
        stopObserving()
    }
}
```

Guidelines:

- Call `finish()` when the producer is truly done.
- Use `onTermination` to remove observers, stop delegates, or cancel underlying work.
- Assume cancellation can happen before normal completion.

## Buffering

Only think about buffering when producer speed and consumer speed differ enough to matter.

Available policies:

- `.unbounded` (default): buffers all values; risk of unbounded memory growth if consumer is slow.
- `.bufferingNewest(n)`: keeps only the newest N values; drops oldest on overflow.
- `.bufferingOldest(n)`: keeps only the oldest N values; drops newest on overflow.

Start with the default. Reach for a bounded policy when dropped or delayed values matter. If producer/consumer coordination matters more than buffering, consider `AsyncChannel` in `async-algorithms.md`.

## When to Write a Custom `AsyncSequence`

Do it rarely.

Prefer a custom `AsyncSequence` only when:

- You need a reusable sequence type with a stable public API.
- `AsyncStream` is too limiting for the semantics you need.
- The iterator logic itself is the value, not just a bridge.

For most app and migration work, `AsyncStream` is the simpler and cheaper answer.

## Polling with `AsyncStream.init(unfolding:)`

Safer than a manual `while` loop -- automatically finishes when the closure returns `nil`:

```swift
let pings = AsyncStream(unfolding: {
    try? await Task.sleep(for: .seconds(5))
    return await ping()
})
```

## Standard Library Bridges

Prefer built-in async sequences before creating your own bridge:

```swift
for await notification in NotificationCenter.default.notifications(named: .didUpdate) {
    handle(notification)
}
```

This is usually better than wrapping the same notification source in a custom `AsyncStream`.

## Anti-Patterns

Avoid these:

- Writing a full custom `AsyncSequence` when an `AsyncStream` bridge is enough.
- Forgetting `finish()` for finite producers.
- Holding observers or delegates forever because `onTermination` is missing.
- Using streams for one-shot APIs that should just be `async`.
- Sharing a single `AsyncStream` between multiple consumers (values split unpredictably).

### Common mistakes agents make

```swift
// ❌ Values after finish() are silently dropped
continuation.finish()
continuation.yield(1) // Never received

// ❌ Stream never terminates (forgot finish)
AsyncStream { continuation in
    continuation.yield(1)
    // Missing: continuation.finish()
}

// ❌ Over-engineered: do not wrap single-value operations in streams
func fetchData() -> AsyncThrowingStream<Data, Error> // Use async throws -> Data instead
```

## Where to Go Next

- Stream operators -> `async-algorithms.md`
- Lifetime issues -> `memory-management.md`
- Testing stream-driven code -> `testing.md`
