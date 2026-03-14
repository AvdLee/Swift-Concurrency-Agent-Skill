# Glossary

| Term | Definition |
|---|---|
| Actor isolation | Compiler-enforced ownership of mutable state by an actor or global actor. |
| AsyncChannel | AsyncAlgorithms channel with send-side backpressure semantics. |
| AsyncSequence | A type that yields values asynchronously over time and is consumed with `for await`. |
| AsyncStream | A convenient way to build an async sequence from callbacks, delegates, or custom producers. |
| AsyncThrowingStream | `AsyncStream` variant that can finish with an error. |
| AsyncTimerSequence | AsyncAlgorithms timer sequence that emits values on an interval. |
| `@concurrent` | Explicitly opts a `nonisolated async` function into concurrent execution instead of inheriting caller isolation. |
| `@preconcurrency` | Suppresses some diagnostics from modules that predate concurrency annotations without making them safe. |
| `@Sendable` | Function-type annotation that requires captured values to be safe across concurrency boundaries. |
| Cancellation | Cooperative signal that a task should stop as soon as it can do so safely. |
| `combineLatest` | AsyncAlgorithms operator that emits whenever any input emits, using the latest value from each source. |
| Continuation | Bridge from callback-based code into async/await. |
| Cooperative thread pool | Swift runtime pool that schedules tasks without one thread per task. Avoid blocking operations (locks, semaphores, synchronous I/O) that starve the pool. |
| Debounce | Wait for inactivity before emitting the latest value. |
| Default actor isolation | Module-level default ownership such as `@MainActor` applied to declarations. |
| Executor | Runtime mechanism that decides where isolated work runs. |
| Global actor | Shared isolation domain such as `@MainActor`. |
| Isolation domain | Boundary that owns mutable state and prevents unsynchronized concurrent access. |
| Merge | AsyncAlgorithms operator that interleaves values from multiple async sequences. |
| `nonisolated` | Marks a declaration as not owned by the surrounding actor or global actor. |
| `nonisolated(nonsending)` | Swift 6.2-era behavior that allows an async function to avoid sending non-Sendable values while inheriting caller isolation. |
| Region-based isolation | Ownership model that allows certain non-Sendable values to move safely between regions. |
| Reentrancy | Ability for other actor work to run while an actor method is suspended. Must not assume actor state is unchanged after an `await`. |
| Sendable | Marker protocol for values that are safe to transfer across isolation boundaries. |
| Strict concurrency checking | Compiler enforcement levels for Sendable and isolation diagnostics. |
| Structured concurrency | Child-task model where lifetimes are scoped to the parent operation. |
| Suspension point | An `await` where execution may pause and later resume. |
| Task local | Task-scoped value that propagates through the task hierarchy. |
| Throttle | Emit at most one value per time interval. |
| Zip | AsyncAlgorithms operator that pairs values from sources in order. |
