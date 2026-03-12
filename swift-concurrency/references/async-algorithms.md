# AsyncAlgorithms

Use this when:

- You need time-based or multi-stream operators that the standard library does not provide.
- You are replacing Combine/Rx operators like debounce, throttle, merge, or `combineLatest`.
- You need a stream-first solution instead of manually spawning and canceling tasks.

Skip this file if:

- You only need a single async result. Use plain `async/await`.
- You are bridging callbacks or delegates into a stream. Start with `async-sequences.md`.

Jump to:

- Choose the right tool
- Operator map
- Minimal patterns
- Anti-patterns

## Choose the Right Tool

| Need | Best tool |
|---|---|
| One result | `async/await` |
| Stream from callbacks or delegates | `AsyncStream` / `AsyncThrowingStream` |
| Transform or combine async streams | `AsyncAlgorithms` |
| View-bound restart-on-change work | SwiftUI `.task(id:)` |

Install/import only when the package is already part of the project and the extra operators are warranted.

### Installation

```swift
.package(url: "https://github.com/apple/swift-async-algorithms", from: "1.0.0")
// target dependency: .product(name: "AsyncAlgorithms", package: "swift-async-algorithms")
```

## Operator Map

| Operator | Use when | Avoid when |
|---|---|---|
| `debounce` | Wait for inactivity before acting | You need every value |
| `throttle` | Limit repeated actions to a fixed interval | Ordering of every intermediate value matters |
| `merge` | Values from multiple independent sources can interleave | You need paired output |
| `combineLatest` | Each output depends on the latest value from several sources | You need one-to-one pairing |
| `zip` | Values should be paired in order | Sources produce at very different rates |
| `chain` | Concatenate sequences end-to-end in order | Interleaved output is acceptable (use `merge`) |
| `removeDuplicates` | Suppress consecutive duplicate values | You need to deduplicate across non-consecutive positions |
| `chunks` / `chunked` | Batch values by count, time, or signal | Every value must be processed individually |
| `compacted` | Strip `nil` from an async sequence of optionals | The sequence is not optional-typed |
| `adjacentPairs` | Compare each value with the previous one | You need wider windows |
| `AsyncChannel` / `AsyncThrowingChannel` | You need backpressure or multi-producer coordination | A plain `AsyncStream` is enough |
| `AsyncTimerSequence` | You need a structured timer stream | A single delayed sleep is enough |

## Minimal Patterns

### Debounce

Use when rapid inputs should collapse into one result:

```swift
for await query in searchQueries.debounce(for: .milliseconds(300)) {
    await performSearch(query)
}
```

Prefer this over manually spawning a new sleeping task for each keystroke.

### Throttle

Use when repeated actions should fire at most once per interval:

```swift
for await _ in taps.throttle(for: .seconds(1)) {
    await submit()
}
```

### Merge

Use when any source can emit the next value:

```swift
for await message in chatA.merge(chatB) {
    render(message)
}
```

### CombineLatest

Use when the latest value from each stream is needed together:

```swift
for await (username, email) in usernames.combineLatest(emails) {
    validate(username: username, email: email)
}
```

### Zip

Use when outputs should be paired in order:

```swift
for await (image, metadata) in images.zip(metadata) {
    cache(image: image, metadata: metadata)
}
```

### AsyncChannel

Use when producers should respect consumer pace:

```swift
let channel = AsyncChannel<Event>()

Task {
    await channel.send(.started)
    channel.finish()
}

for await event in channel {
    handle(event)
}
```

### AsyncTimerSequence

Use when work should repeat on a structured timer:

```swift
for await _ in AsyncTimerSequence(interval: .seconds(30)) {
    await refresh()
}
```

## Common Replacements

Replace these patterns with stream operators when the code is fundamentally stream-shaped:

- "Cancel previous search task, sleep, then search" -> `debounce`
- "Ignore button mashing" -> `throttle`
- "Listen to multiple sources at once" -> `merge`
- "Validate form from latest field values" -> `combineLatest`
- "Coordinate producer and consumer pace" -> `AsyncChannel`

## Anti-Patterns

Avoid these:

- Re-implementing debounce with `Task.sleep` plus manual task bookkeeping when the problem is really stream composition.
- Rebuilding Combine/Rx style operators manually with shared mutable state.
- Pulling in AsyncAlgorithms when plain `AsyncStream` or `.task(id:)` would be simpler.
- Treating `AsyncChannel` as the default stream type; most one-producer flows can start with `AsyncStream`.

## Combine Operator Mapping

| Combine | AsyncAlgorithms / Swift Concurrency |
|---|---|
| `.debounce` | `debounce(for:)` |
| `.throttle` | `throttle(for:)` |
| `.merge` | `merge()` |
| `.combineLatest` | `combineLatest()` |
| `.zip` | `zip()` |
| `.removeDuplicates` | `removeDuplicates()` |
| `.share()` | `AsyncChannel` (backpressure-aware multi-consumer) |
| `.flatMap` | `TaskGroup` (not a stream operator) |
| `.receive(on:)` | `@MainActor` or `Task` with explicit isolation |
| `.eraseToAnyPublisher()` | `any AsyncSequence<Element, Error>` |
| `.concat` | `chain()` |

## Migration Note

When migrating from Combine or Rx, move the operator itself here but keep ownership decisions in the relevant domain file:

- actor ownership -> `actors.md`
- sendability -> `sendable.md`
- stream creation -> `async-sequences.md`
- migration rollout -> `migration.md`
