# Threading

Use this when:

- Someone is reasoning in terms of threads instead of isolation.
- A bug report mentions `Thread.current`, "background thread", or "what thread does this run on?"
- You need to explain suspension points, executor hops, or Swift 6.2-era execution behavior.

Skip this file if:

- The real issue is actor ownership or protocol isolation. Use `actors.md`.
- The real issue is sendability across boundaries. Use `sendable.md`.

Jump to:

- Think in Isolation, Not Threads
- Suspension Points
- Swift 6.2-Era Behavior
- Debugging

## Think in Isolation, Not Threads

Core model:

- Tasks are units of async work.
- Threads are a runtime resource used to execute that work.
- One task is not tied to one thread.
- After an `await`, execution may resume on a different thread.

The important question is usually not "which thread?" but "which isolation domain owns this state?"

## Suspension Points

An `await` is a possible suspension point:

- Other work may run while the current task is suspended.
- Actor state may change before execution resumes.
- Reentrancy bugs come from assuming state is unchanged after `await`.

Rule of thumb:

- Read mutable actor state before suspension only if you are prepared for it to change.
- Prefer finishing a critical mutation before the next `await`.

## Cooperative Thread Pool

Swift Concurrency uses a cooperative pool instead of creating a new thread per task.

Implications:

- `await` does not block a thread the way a semaphore or sleeping thread would.
- Blocking APIs inside async code can still starve the pool.
- Prefer async-native APIs and actor isolation over manual queue juggling.

## Swift 6.2-Era Behavior

The most migration-sensitive execution change is around `nonisolated async` functions.

When the relevant upcoming features are enabled:

- `nonisolated async` may inherit the caller's isolation.
- Use `@concurrent` when the function should explicitly run concurrently instead of inheriting caller isolation.
- Do not assume "nonisolated means background thread" without checking the active feature set.

Default actor isolation also matters:

- `@MainActor` default isolation can reduce noise in app targets.
- It changes ownership and diagnostics, so it is not just a cosmetic setting.

## Debugging

Avoid debugging async behavior by printing `Thread.current`.

Prefer:

- isolation reasoning
- breakpoints and debugger context
- Instruments' Swift Concurrency template
- targeted logging around ownership and suspension points

If code fails because `Thread.current` is unavailable from async contexts, fix the debugging approach instead of fighting the compiler.

## Decision Rules

- UI state -> usually `@MainActor`
- mutable shared state -> usually an `actor`
- plain async work with no isolated state -> `async` API with explicit ownership
- work that must hop away from caller isolation under Swift 6.2-era behavior -> consider `@concurrent`

## Anti-Patterns

Avoid these:

- Mapping every task to a conceptual thread.
- Treating `await` as a blocking call.
- Using GCD queue hopping when actor isolation already expresses the ownership model.
- Debugging correctness by thread ID instead of by isolation and ordering.
