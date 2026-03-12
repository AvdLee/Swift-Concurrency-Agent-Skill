---
name: swift-concurrency
description: 'Diagnose data races, convert callback-based code to async/await, implement actor isolation patterns, resolve Sendable conformance issues, and guide Swift 6 migration. Use when developers mention: (1) Swift Concurrency, async/await, actors, or tasks, (2) "use Swift Concurrency" or "modern concurrency patterns", (3) migrating to Swift 6, (4) data races or thread safety issues, (5) refactoring closures to async/await, (6) @MainActor, Sendable, or actor isolation, (7) concurrent code architecture or performance optimization, (8) concurrency-related linter warnings (SwiftLint or similar; e.g. async_without_await, Sendable/actor isolation/MainActor lint).'
---
# Swift Concurrency

## Fast Path

Before proposing a fix:

1. Analyze `Package.swift` or `.pbxproj` to determine Swift language mode, strict concurrency level, default isolation, and upcoming features. Do this always, not only for migration work.
2. Capture the exact diagnostic and offending symbol.
3. Determine the isolation boundary: `@MainActor`, custom actor, actor instance isolation, or `nonisolated`.
4. Confirm whether the code is UI-bound or intended to run off the main actor.

Project settings that change concurrency behavior:

| Setting | SwiftPM (`Package.swift`) | Xcode (`.pbxproj`) |
|---|---|---|
| Language mode | `swiftLanguageVersions` or `-swift-version` (`// swift-tools-version:` is not a reliable proxy) | Swift Language Version |
| Strict concurrency | strict concurrency feature flags | `SWIFT_STRICT_CONCURRENCY` |
| Default isolation | `.defaultIsolation(MainActor.self)` | `SWIFT_DEFAULT_ACTOR_ISOLATION` |
| Upcoming features | `.enableUpcomingFeature(...)` | `SWIFT_UPCOMING_FEATURE_*` |

Guardrails:

- Do not recommend `@MainActor` as a blanket fix. Justify why the code is truly UI-bound.
- Prefer structured concurrency over unstructured tasks. Use `Task.detached` only with a clear reason.
- If recommending `@preconcurrency`, `@unchecked Sendable`, or `nonisolated(unsafe)`, require a documented safety invariant and a follow-up removal plan.
- Optimize for the smallest safe change. Do not refactor unrelated architecture during migration.

## Quick Fix Mode

Use Quick Fix Mode when all of these are true:

- The issue is localized to one file or one type.
- The isolation boundary is clear.
- The fix can be explained in 1-2 behavior-preserving steps.

Skip Quick Fix Mode when any of these are true:

- Build settings or default isolation are unknown.
- The issue crosses module boundaries or changes public API behavior.
- The likely fix depends on unsafe escape hatches.

## Common Diagnostics

| Diagnostic | First check | Smallest safe fix | Escalate to |
|---|---|---|---|
| `Main actor-isolated ... cannot be used from a nonisolated context` | Is this truly UI-bound? | Isolate the caller or use `await MainActor.run { ... }` only when main-actor ownership is correct. | `references/actors.md`, `references/threading.md` |
| `Actor-isolated type does not conform to protocol` | Must the requirement run on the actor? | Prefer isolated conformance; use `nonisolated` only for truly nonisolated requirements. | `references/actors.md` |
| `Sending value of non-Sendable type ... risks causing data races` | What isolation boundary is being crossed? | Keep access inside one actor, or convert the transferred value to an immutable/value type. | `references/sendable.md`, `references/threading.md` |
| `SwiftLint async_without_await` | Is `async` actually required by protocol, override, or `@concurrent`? | Remove `async`, or use a narrow suppression with rationale. | `references/linting.md` |
| `wait(...) is unavailable from asynchronous contexts` | Is this legacy XCTest async waiting? | Replace with `await fulfillment(of:)` or Swift Testing equivalents. | `references/testing.md` |
| Core Data concurrency warnings | Are `NSManagedObject` instances crossing contexts or actors? | Pass `NSManagedObjectID` or map to a Sendable value type. | `references/core-data.md` |
| `Thread.current` unavailable from asynchronous contexts | Are you debugging by thread instead of isolation? | Reason in terms of isolation and use Instruments/debugger instead. | `references/threading.md` |

## Smallest Safe Fixes

Prefer changes that preserve behavior while satisfying data-race safety:

- UI-bound state: isolate the type or member to `@MainActor`.
- Shared mutable state: move it behind an `actor`, or use `@MainActor` only if the state is UI-owned.
- Background work: when work must hop off caller isolation, use an `async` API marked `@concurrent`; when work can safely inherit caller isolation, use `nonisolated` without `@concurrent`.
- Sendability issues: prefer immutable values and explicit boundaries over `@unchecked Sendable`.

## Concurrency Tool Selection

| Need | Tool | Key Guidance |
|---|---|---|
| Single async operation | `async/await` | Default choice for sequential async work |
| Fixed parallel operations | `async let` | Known count at compile time; auto-cancelled on throw |
| Dynamic parallel operations | `withTaskGroup` | Unknown count; structured -- cancels children on scope exit |
| Sync-to-async bridge | `Task { }` | Inherits actor context; use `Task.detached` only with documented reason |
| Shared mutable state | `actor` | Prefer over locks/queues; keep isolated sections small |
| UI-bound state | `@MainActor` | Only for truly UI-related code; justify isolation |

## Reference Router

Open the smallest reference that matches the question:

- Foundations
  - `references/async-await-basics.md`: async/await basics and closure-to-async bridges
  - `references/tasks.md`: `Task`, cancellation, task groups, structured vs unstructured work
  - `references/actors.md`: actor isolation, `@MainActor`, reentrancy, isolated conformances
  - `references/sendable.md`: `Sendable`, `@Sendable`, region isolation, escape hatches
  - `references/threading.md`: execution model, suspension points, Swift 6.2 isolation behavior
- Streams
  - `references/async-sequences.md`: when to use `AsyncSequence` or `AsyncStream`
  - `references/async-algorithms.md`: debounce, throttle, merge, `combineLatest`, channels, timers
- Applied topics
  - `references/testing.md`: Swift Testing first, XCTest fallback, leak checks
  - `references/performance.md`: profiling, actor hops, suspension cost
  - `references/memory-management.md`: retain cycles, long-lived tasks, cleanup
  - `references/core-data.md`: `NSManagedObjectID`, `perform`, default isolation conflicts
- Migration and tooling
  - `references/migration.md`: migration order, project settings, `@preconcurrency`, rollout strategy
  - `references/linting.md`: concurrency-focused lint rules
- Glossary
  - `references/glossary.md`: quick definitions

## Verification

When changing concurrency code:

1. Re-check build settings before interpreting diagnostics.
2. Build and clear the current category of errors before moving on.
3. Run tests, especially actor-, lifetime-, and cancellation-sensitive tests.
4. Use Instruments for performance claims instead of guessing.
5. Verify deallocation and cancellation behavior for long-lived tasks.
6. Check `Task.isCancelled` in long-running operations.
7. Never use semaphores or ad hoc locking in async contexts when actor isolation or `Mutex` would express ownership more safely.

Course links are optional deeper learning only. Use them sparingly.

---

**Note**: This skill is based on the comprehensive [Swift Concurrency Course](https://www.swiftconcurrencycourse.com?utm_source=github&utm_medium=agent-skill&utm_campaign=skill-footer) by Antoine van der Lee.
