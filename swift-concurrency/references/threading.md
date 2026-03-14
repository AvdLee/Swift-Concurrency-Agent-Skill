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
- Actor Reentrancy
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

## Actor Reentrancy

While an actor method is suspended at an `await`, other tasks can enter the actor and mutate state. This causes subtle bugs:

```swift
actor BankAccount {
    var balance = 0

    func deposit(amount: Int) async {
        balance += amount          // balance increased by amount
        await logTransaction()     // suspension: another deposit can run here
        balance += 10              // bonus -- but balance may have changed
    }
}
```

Two concurrent `deposit(amount: 100)` calls can produce `100 -> 200 -> 210 -> 220` instead of the expected `100 -> 110 -> 210 -> 220`.

**Rule**: complete all critical state mutations before the next `await`. Move side effects (logging, networking) after the state is settled.

Fixed version:

```swift
func deposit(amount: Int) async {
    balance += amount
    balance += 10      // bonus applied before suspension
    await logTransaction()  // side effect after state is settled
}
```

## Swift 6.2-Era Behavior

The most migration-sensitive execution change is how `nonisolated async` functions execute.

### Before (pre-Swift 6.2 behavior)

A `nonisolated async` function always hopped to the cooperative thread pool (background):

```swift
nonisolated func process() async { /* always ran off MainActor */ }
```

### After (`NonisolatedNonsendingByDefault` enabled)

The same function now inherits the caller's isolation by default:

```swift
nonisolated func process() async { /* runs on caller's actor, e.g. MainActor */ }
```

Common symptom: "my function used to run in the background, now it runs on MainActor and blocks the UI."

### `@concurrent` -- opt into concurrent execution

Use `@concurrent` when the function should explicitly hop off the caller's isolation:

```swift
@concurrent
func processInBackground() async { /* always runs on cooperative pool */ }
```

### `nonisolated(nonsending)` -- the explicit form of the new default

Marks a function as nonisolated but non-sending: it can inherit caller isolation without requiring its arguments or captures to be `Sendable`. This is the explicit spelling of the new default behavior.

### Decision guide

| Situation | Use |
|---|---|
| `nonisolated async` work can safely inherit caller isolation | plain `nonisolated` (inherits caller isolation under `NonisolatedNonsendingByDefault`) |
| Work must run off the caller's actor | `@concurrent` |
| You need the explicit nonsending annotation | `nonisolated(nonsending)` |
| Feature flags are unknown | check the project settings before advising |

Do not give pre-Swift-6.2 execution advice without confirming the active feature set.

### Default actor isolation

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

## Common Misconceptions

- "Each Task runs on its own thread" -- false; tasks share the cooperative pool.
- "`await` blocks the thread" -- false; it suspends the task, freeing the thread.
- "Task execution order is guaranteed" -- false; order depends on scheduling.
- "Same task = same thread" -- false; after suspension, a task may resume on any thread.

## GCD to Isolation Domain Migration

Instead of asking "what thread should this run on?" ask "what isolation domain should own this work?"

- `DispatchQueue.main.async { }` -> `@MainActor func updateUI()`
- `DispatchQueue.global().async { }` -> `func work() async` (or `@concurrent` if it must leave caller isolation)

## Anti-Patterns

Avoid these:

- Mapping every task to a conceptual thread.
- Treating `await` as a blocking call.
- Using GCD queue hopping when actor isolation already expresses the ownership model.
- Debugging correctness by thread ID instead of by isolation and ordering.
