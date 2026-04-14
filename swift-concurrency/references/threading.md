# Threading

Use this when:

- You need to understand the relationship between tasks and threads.
- You are debugging suspension points, actor reentrancy, or unexpected execution contexts.
- You need Swift 6.2 behavior guidance (`nonisolated async`, `@concurrent`, `nonisolated(nonsending)`).

Skip this file if:

- You mainly need to protect mutable state. Use `actors.md`.
- You need to make types safe to transfer. Use `sendable.md`.

Jump to:

- Core Concepts (Tasks vs Threads)
- Cooperative Thread Pool
- Suspension Points and Actor Reentrancy
- Swift 6.2 Changes (SE-461, SE-466)
- Default Isolation Domain
- Debugging Thread Execution
- Common Misconceptions
- Migration Strategy

## Core Concepts

### What is a Thread?

System-level resource that runs instructions. High overhead for creation and switching. Swift Concurrency abstracts thread management away.

### Tasks vs Threads

**Tasks** are units of async work, not tied to specific threads. Swift dynamically schedules tasks on available threads from a cooperative pool.

**Key insight**: No direct relationship between one task and one thread.

> **Course Deep Dive**: This topic is covered in detail in [Lesson 7.1: How Threads relate to Tasks](https://www.swiftconcurrencycourse.com?utm_source=github&utm_medium=agent-skill&utm_campaign=lesson-reference)

**Important (Swift 6+)**: Avoid using `Thread.current` inside async contexts. In Swift 6 language mode, `Thread.current` is unavailable from asynchronous contexts and will fail to compile. Prefer reasoning in terms of isolation domains; use Instruments and the debugger to observe execution when needed.

## Cooperative Thread Pool

Swift creates only as many threads as CPU cores. Tasks share these threads efficiently.

### How it works

1. **Limited threads**: Number matches CPU cores
2. **Task scheduling**: Tasks scheduled onto available threads
3. **Suspension**: At `await`, task suspends, thread freed for other work
4. **Resumption**: Task resumes on any available thread (not necessarily the same one)

```swift
func example() async {
    print("Started on: \(Thread.current)")
    
    try await Task.sleep(for: .seconds(1))
    
    print("Resumed on: \(Thread.current)") // Likely different thread
}
```

### Forward progress guarantee

Every task on the cooperative pool must make forward progress. Blocking a thread without releasing it starves the pool.

**Never do this in async contexts:**
```swift
// DEADLOCK RISK: semaphore blocks the thread, Task may never get a thread to signal
func syncWrapper() -> Data {
    let sem = DispatchSemaphore(value: 0)
    var result: Data!
    Task {
        result = try? await fetchData()
        sem.signal()  // May never execute if pool is exhausted
    }
    sem.wait()  // Blocks the thread
    return result
}
```

The pool can have as few as 1 thread (iOS Simulator). Use `DISPATCH_COOPERATIVE_POOL_STRICT=1` environment variable to test with a single-threaded pool.

**Safe alternatives to blocking primitives:**
- `Mutex.withLock {}` -- brief synchronous lock, does not depend on other tasks
- `withCheckedContinuation` -- bridges callback APIs to async/await
- `AsyncStream` -- bridges streaming data to async iteration

Some code cannot be bridged to Swift Concurrency. If a synchronous delegate protocol requires an async result, the only safe options are: redesign the protocol to be async, or do not use Swift Concurrency for that code path.

### Benefits over GCD

**Prevents thread explosion**:
- No excessive thread creation
- No high memory overhead from idle threads
- No excessive context switching
- No priority inversion

**Better performance**:
- Fewer threads = less context switching
- Continuations instead of blocking
- CPU cores stay busy efficiently

## Threading Mindset → Isolation Mindset

### Old way (GCD)

```swift
// Thinking about threads
DispatchQueue.main.async {
    // Update UI on main thread
}

DispatchQueue.global(qos: .background).async {
    // Heavy work on background thread
}
```

### New way (Swift Concurrency)

```swift
// Thinking about isolation domains
@MainActor
func updateUI() {
    // Runs on main actor (usually main thread)
}

func heavyWork() async {
    // Runs on any available thread in pool
}
```

### Think in isolation domains

**Don't ask**: "What thread should this run on?"

**Ask**: "What isolation domain should own this work?"

- `@MainActor` for UI updates
- Custom actors for specific state
- Nonisolated for general async work

### Provide hints, not commands

```swift
Task(priority: .userInitiated) {
    await doWork()
}
```

You're describing the nature of work, not assigning threads. Swift optimizes execution.

> **Course Deep Dive**: This topic is covered in detail in [Lesson 7.2: Getting rid of the "Threading Mindset"](https://www.swiftconcurrencycourse.com?utm_source=github&utm_medium=agent-skill&utm_campaign=lesson-reference)

## Suspension Points

### What is a suspension point?

Moment where task **may** pause to allow other work. Marked by `await`.

```swift
let data = await fetchData() // Potential suspension
```

**Critical**: `await` marks *possible* suspension, not guaranteed. If operation completes synchronously, no suspension occurs.

### Why suspension points matter

1. **Code may pause unexpectedly** - resumes later, possibly different thread
2. **State can change** - mutable state may be modified during suspension
3. **Actor reentrancy** - other tasks can access actor during suspension

### Actor reentrancy example

```swift
actor BankAccount {
    private var balance: Int = 0
    
    func deposit(amount: Int) async {
        balance += amount
        print("Balance: \(balance)")
        
        await logTransaction(amount) // ⚠️ Suspension point
        
        balance += 10 // Bonus
        print("After bonus: \(balance)")
    }
    
    func logTransaction(_ amount: Int) async {
        try? await Task.sleep(for: .seconds(1))
    }
}

// Two concurrent deposits
async let _ = account.deposit(amount: 100)
async let _ = account.deposit(amount: 100)

// Unexpected: 100 → 200 → 210 → 220
// Expected:   100 → 110 → 210 → 220
```

**Why**: During `logTransaction`, second deposit runs, modifying balance before first completes.

### Avoiding reentrancy bugs

**Complete actor work before suspending**:

```swift
func deposit(amount: Int) async {
    balance += amount
    balance += 10 // Bonus applied first
    print("Final balance: \(balance)")
    
    await logTransaction(amount) // Suspend after state changes
}
```

**Rule**: Don't mutate actor state after suspension points.

> **Course Deep Dive**: This topic is covered in detail in [Lesson 7.3: Understanding Task suspension points](https://www.swiftconcurrencycourse.com?utm_source=github&utm_medium=agent-skill&utm_campaign=lesson-reference)

## Thread Execution Patterns

### Default: Background threads

Tasks run on cooperative thread pool (background threads):

```swift
Task {
    print(Thread.current) // Background thread
}
```

### Main thread execution

Use `@MainActor` for main thread:

```swift
@MainActor
func updateUI() {
    Task {
        print(Thread.current) // Main thread
    }
}
```

### Inheritance example

```swift
@MainActor
func updateUI() {
    print("Main thread: \(Thread.current)")
    
    await backgroundTask() // Switches to background
    
    print("Back on main: \(Thread.current)") // Returns to main
}

func backgroundTask() async {
    print("Background: \(Thread.current)")
}
```

## Swift 6.2 Changes

### Nonisolated async functions (SE-461)

**Old behavior**: Nonisolated async functions always switch to the global executor (background).

**New behavior**: Run on the caller's **executor** by default.

**Critical distinction**: The function inherits the caller's **executor** (where it runs), NOT the caller's **isolation** (what it can access). The function remains `nonisolated` -- it cannot access actor-isolated state.

```swift
class NotSendable {
    func performAsync() async {
        // Runs on caller's executor (e.g. main thread if called from @MainActor)
        // But is still nonisolated -- cannot access @MainActor state
    }
}

@MainActor
func caller() async {
    let obj = NotSendable()
    await obj.performAsync()
    // Old: Background thread
    // New: Main thread (runs on caller's executor)
}
```

### executor != isolation (critical gotcha)

`nonisolated(nonsending)` changes WHERE code runs, but NOT what it can access:

```swift
@MainActor
class ViewModel {
    var count = 0

    func doWork() async {
        await helper()
    }
}

nonisolated(nonsending) func helper() async {
    // Runtime: runs on main thread (caller's executor)
    // Compile-time: nonisolated (no access to @MainActor state)

    Task {
        // This Task inherits STATIC isolation of helper() -- nonisolated
        // It does NOT inherit @MainActor, despite running on main thread
        // viewModel.count += 1  // ERROR: main actor-isolated property
    }
}
```

**Why**: `Task {}` inherits static (compile-time) isolation, not the runtime executor.
Per [SE-0461](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0461-async-function-isolation.md): "Unstructured tasks created within nonisolated functions do NOT inherit the caller's isolation automatically."

**Correct patterns**:
- Return data to the caller instead of creating Task inside nonisolated functions
- Use `Task { @MainActor in }` for explicit isolation
- Use `isolated (any Actor)? = #isolation` parameter for dynamic isolation

### Enabling new behavior

In Xcode 16+:

```swift
// Build setting or swift-settings
.enableUpcomingFeature("NonisolatedNonsendingByDefault")
```

### Opting out with @concurrent

Force function to switch away from caller's isolation:

```swift
@concurrent
func performAsync() async {
    print(Thread.current) // Always background
}
```

### nonisolated(nonsending)

Runs on the caller's **executor** without crossing an isolation boundary, so no Sendable/sending checks:

```swift
nonisolated(nonsending) func storeTouch(...) async {
    // Runs on caller's executor, no isolation boundary crossed
}
```

**Use when**: Method doesn't need to switch executor, avoiding Sendable requirements.
**Remember**: The function is still nonisolated -- it cannot access actor-isolated state, and `Task {}` inside it will be nonisolated.

## Default Isolation Domain (SE-466)

### Configuring default isolation

**Build setting** (Xcode 16+):
- Default Actor Isolation: `MainActor` or `None`

**Swift Package**:

```swift
.target(
    name: "MyTarget",
    swiftSettings: [
        .defaultIsolation(MainActor.self)
    ]
)
```

### Why change default?

Most app code runs on main thread. Setting `@MainActor` as default:
- Reduces false warnings
- Avoids "concurrency rabbit hole"
- Makes migration easier

### Inference with @MainActor default

```swift
// With @MainActor as default:

func f() {} // Inferred: @MainActor

class C {
    init() {} // Inferred: @MainActor
    static var value = 10 // Inferred: @MainActor
}

@MyActor
struct S {
    func f() {} // Inferred: @MyActor (explicit override)
}

> **Course Deep Dive**: This topic is covered in detail in [Lesson 7.5: Controlling the default isolation domain (Updated for Swift 6.2)](https://www.swiftconcurrencycourse.com?utm_source=github&utm_medium=agent-skill&utm_campaign=lesson-reference)
```

### Per-module setting

Must opt in for each module/package. Not global across dependencies.

### Backward compatibility

Opt-in only. Default remains `nonisolated` if not specified.

## Debugging Thread Execution

### Print current thread

**⚠️ Important**: `Thread.current` is unavailable in Swift 6 language mode from async contexts. The compiler error states: "Class property 'current' is unavailable from asynchronous contexts; Thread.current cannot be used from async contexts."

**Workaround** (Swift 6+ mode only):

```swift
extension Thread {
    public static var currentThread: Thread {
        Thread.current
    }
}

print("Thread: \(Thread.currentThread)")
```

### Debug navigator

1. Set breakpoint in task
2. Debug → Pause
3. Check Debug Navigator for thread info

### Verify main thread

```swift
assert(Thread.isMainThread)
```

## Common Misconceptions

### ❌ Each Task runs on new thread

**Wrong**. Tasks share limited thread pool, reuse threads.

### ❌ await blocks the thread

**Wrong**. `await` suspends task without blocking thread. Other tasks can use the thread.

### ❌ Task execution order is guaranteed

**Wrong**. Tasks execute based on system scheduling. Use `await` to enforce order.

### ❌ Same task = same thread

**Wrong**. Task can resume on different thread after suspension.

## Why Sendable Matters

Since tasks move between threads unpredictably:

```swift
func example() async {
    print("Thread 1: \(Thread.current)")
    
    await someWork()
    
    print("Thread 2: \(Thread.current)") // Different thread
}
```

Values crossing suspension points may cross threads. **Sendable** ensures safety.

## Best Practices

1. **Stop thinking about threads** - think isolation domains
2. **Trust the system** - Swift optimizes thread usage
3. **Use @MainActor for UI** - clear, explicit main thread execution
4. **Minimize suspension points in actors** - avoid reentrancy bugs
5. **Complete state changes before suspending** - prevent inconsistent state
6. **Use priorities as hints** - not guarantees
7. **Make types Sendable** - safe across thread boundaries
8. **Enable Swift 6.2 features** - easier migration, better defaults
9. **Set default isolation for apps** - reduce false warnings
10. **Don't force thread switching** - let Swift optimize

## Migration Strategy

### For new projects (Xcode 16+)

1. Set default isolation to `@MainActor`
2. Enable `NonisolatedNonsendingByDefault`
3. Use `@concurrent` for explicit background work

### For existing projects

1. Gradually enable Swift 6 language mode
2. Consider default isolation change
3. Use `@concurrent` to maintain old behavior where needed
4. Migrate module by module

## Decision Tree

```
Need to control execution?
├─ UI updates? → @MainActor
├─ Specific state isolation? → Custom actor
├─ Background work? → Regular async (trust Swift)
└─ Need to force background? → @concurrent (Swift 6.2+)

Seeing Sendable warnings?
├─ Can make type Sendable? → Add conformance
├─ Same isolation OK? → nonisolated(nonsending)
└─ Need different isolation? → Make Sendable or refactor
```

## GCD to Isolation Domain Migration

Instead of asking "what thread should this run on?" ask "what isolation domain should own this work?"

- `DispatchQueue.main.async { }` → `@MainActor func updateUI()`
- `DispatchQueue.global().async { }` → `func work() async` (or `@concurrent` if it must leave caller isolation)
- `DispatchQueue(label:).sync { }` → `actor` or `Mutex` for protecting state
- Serial queue for ordering → `actor` (guarantees serial access)

## Decision Rules

- UI state → usually `@MainActor`
- Mutable shared state → usually an `actor`
- Plain async work with no isolated state → `async` API with explicit ownership
- Work that must hop away from caller isolation under Swift 6.2-era behavior → consider `@concurrent`

## Common Mistakes Agents Make

- Recommending GCD queue hopping when actor isolation already expresses the ownership model.
- Debugging correctness by thread ID instead of by isolation and ordering.
- Treating `await` as a blocking call — it suspends the task, freeing the thread.
- Mapping each `Task` to a conceptual thread.

## Performance Insights

### Why fewer threads = better performance

- **Less context switching**: CPU spends more time on actual work
- **Better cache utilization**: Threads stay on same cores longer
- **No thread explosion**: Predictable resource usage
- **Forward progress**: Threads never block, always productive

### Cooperative pool advantages

- Matches hardware (one thread per core)
- Prevents oversubscription
- Efficient task scheduling
- Automatic load balancing

## Key Sources

- [SE-0461: Async Function Isolation](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0461-async-function-isolation.md) -- nonisolated(nonsending), @concurrent, executor != isolation
- [SE-0466: Control Default Actor Isolation](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0466-control-default-actor-isolation.md) -- defaultIsolation
- [Saagar Jha: Swift Concurrency Waits for No One](https://saagarjha.com/blog/2023/12/22/swift-concurrency-waits-for-no-one/) -- forward progress, cooperative pool

