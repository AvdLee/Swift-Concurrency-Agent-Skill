---
name: swift-concurrency
description: 'Expert guidance on Swift Concurrency best practices, patterns, and implementation. Use when developers mention: (1) Swift Concurrency, async/await, actors, or tasks, (2) "use Swift Concurrency" or "modern concurrency patterns", (3) migrating to Swift 6, (4) data races or thread safety issues, (5) refactoring closures to async/await, (6) @MainActor, Sendable, or actor isolation, (7) concurrent code architecture or performance optimization, (8) concurrency-related linter warnings (SwiftLint or similar; e.g. async_without_await, Sendable/actor isolation/MainActor lint).'
---
# Swift Concurrency

## Overview

This skill provides expert guidance on Swift Concurrency, covering modern async/await patterns, actors, tasks, Sendable conformance, and migration to Swift 6. Use this skill to help developers write safe, performant concurrent code and navigate the complexities of Swift's structured concurrency model.

## Agent Behavior Contract (Follow These Rules)

1. Analyze the project/package file to find out which Swift language mode (Swift 5.x vs Swift 6) and which Xcode/Swift toolchain is used when advice depends on it.
2. Before proposing fixes, identify the isolation boundary: `@MainActor`, custom actor, actor instance isolation, or nonisolated.
3. Do not recommend `@MainActor` as a blanket fix. Justify why main-actor isolation is correct for the code.
4. Prefer structured concurrency (child tasks, task groups) over unstructured tasks. Use `Task.detached` only with a clear reason.
5. If recommending `@preconcurrency`, `@unchecked Sendable`, or `nonisolated(unsafe)`, require:
   - a documented safety invariant
   - a follow-up ticket to remove or migrate it
6. For migration work, optimize for minimal blast radius (small, reviewable changes) and add verification steps.
7. Course references are for deeper learning only. Use them sparingly and only when they clearly help answer the developer's question.

## Triage Checklist (Before Advising)

- Capture the exact compiler diagnostics and the offending symbol(s).
- Identify the current isolation boundary and module defaults (`@MainActor`, custom actor, default isolation).
- Confirm whether the code is UI-bound or intended to run off the main actor.

## Quick Fix Mode (Use When)

Use Quick Fix Mode when:
- The errors are localized (single file or one type) and the isolation boundary is clear.
- The fix does not require API redesign or multi-module changes.
- You can explain the fix in 1–2 steps without changing behavior.

Skip Quick Fix Mode when:
- Default isolation or strict concurrency settings are unknown and likely affect behavior.
- The error crosses module boundaries or involves public API changes.
- The fix would require `@unchecked Sendable`, `@preconcurrency`, or `nonisolated(unsafe)` without a clear invariant.

## Recommended Tools for Analysis

When analyzing Swift projects for concurrency issues:

1. **Project Settings Discovery**
   - Use `Read` on `Package.swift` for SwiftPM settings (tools version, strict concurrency flags, upcoming features)
   - Use `Grep` for `SWIFT_STRICT_CONCURRENCY` or `SWIFT_DEFAULT_ACTOR_ISOLATION` in `.pbxproj` files
   - Use `Grep` for `SWIFT_UPCOMING_FEATURE_` to find enabled upcoming features



## Project Settings Intake (Evaluate Before Advising)

Concurrency behavior depends on build settings. Always try to determine:

- Default actor isolation (is the module default `@MainActor` or `nonisolated`?)
- Strict concurrency checking level (minimal/targeted/complete)
- Whether upcoming features are enabled (especially `NonisolatedNonsendingByDefault`)
- Swift language mode (Swift 5.x vs Swift 6) and SwiftPM tools version

### Manual checks (no scripts)

- SwiftPM:
  - Check `Package.swift` for `.defaultIsolation(MainActor.self)`.
  - Check `Package.swift` for `.enableUpcomingFeature("NonisolatedNonsendingByDefault")`.
  - Check for strict concurrency flags: `.enableExperimentalFeature("StrictConcurrency=targeted")` (or similar).
  - Check tools version at the top: `// swift-tools-version: ...`
- Xcode projects:
  - Search `project.pbxproj` for:
    - `SWIFT_DEFAULT_ACTOR_ISOLATION`
    - `SWIFT_STRICT_CONCURRENCY`
    - `SWIFT_UPCOMING_FEATURE_` (and/or `SWIFT_ENABLE_EXPERIMENTAL_FEATURES`)

If any of these are unknown, ask the developer to confirm them before giving migration-sensitive guidance.

## Smallest Safe Fixes (Quick Wins)

Prefer edits that preserve behavior while satisfying data-race safety.

- **UI-bound types**: isolate the type or specific members to `@MainActor` (justify why UI-bound).
- **Global/static mutable state**: move into an `actor` or isolate to `@MainActor` if UI-only.
- **Background work**: for work that should always hop off the caller’s isolation, move expensive work into an `async` function marked `@concurrent`; for work that doesn’t touch isolated state but can inherit the caller’s isolation (for example with `NonisolatedNonsendingByDefault`), use `nonisolated` without `@concurrent`, or use an `actor` to guard mutable state.
- **Sendable errors**: prefer immutable/value types; avoid `@unchecked Sendable` unless you can prove and document thread safety.

## Quick Fix Playbook (Common Diagnostics -> Minimal Fix)

- **"Main actor-isolated ... cannot be used from a nonisolated context"**
  - Quick fix: if UI-bound, make the caller `@MainActor` or hop with `await MainActor.run { ... }`.
  - Escalate if this is non-UI code or causes reentrancy; use `references/actors.md`.
- **"Actor-isolated type does not conform to protocol"**
  - Quick fix: add isolated conformance (e.g., `extension Foo: @MainActor SomeProtocol`).
  - Escalate if the protocol requirements must be `nonisolated`; use `references/actors.md`.
- **"Sending value of non-Sendable type ... risks causing data races"**
  - Quick fix: confine access inside an actor or convert to a value type with immutable (`let`) state.
  - Escalate before `@unchecked Sendable`; use `references/sendable.md` and `references/threading.md`.
- **SwiftLint `async_without_await`**
  - Quick fix: remove `async` if not required; if required by protocol/override/@concurrent, use narrow suppression with rationale. See `references/linting.md`.
- **"wait(...) is unavailable from asynchronous contexts" (XCTest)**
  - Quick fix: use `await fulfillment(of:)` or Swift Testing equivalents. See `references/testing.md`.

## Escalation Path (When Quick Fixes Aren't Enough)

1. Gather project settings (default isolation, strict concurrency level, upcoming features).
2. Re-evaluate isolation boundaries and which types cross them.
3. Use the decision tree + references for the deeper fix.
4. If behavior changes are possible, document the invariant and add tests/verification steps.

## Quick Decision Tree

When a developer needs concurrency guidance, follow this decision tree:

1. **Starting fresh with async code?**
   - Read `references/async-await-basics.md` for foundational patterns
   - For parallel operations → `references/tasks.md` (async let, task groups)

2. **Protecting shared mutable state?**
   - Need to protect class-based state → `references/actors.md` (actors, @MainActor)
   - Need thread-safe value passing → `references/sendable.md` (Sendable conformance)

3. **Managing async operations?**
   - Structured async work → `references/tasks.md` (Task, child tasks, cancellation)
   - Streaming data → `references/async-sequences.md` (AsyncSequence, AsyncStream)

4. **Working with legacy frameworks?**
   - Core Data integration → `references/core-data.md`
   - General migration → `references/migration.md`

5. **Performance or debugging issues?**
   - Slow async code → `references/performance.md` (profiling, suspension points)
   - Testing concerns → `references/testing.md` (XCTest, Swift Testing)

6. **Understanding threading behavior?**
   - Read `references/threading.md` for thread/task relationship and isolation

7. **Memory issues with tasks?**
   - Read `references/memory-management.md` for retain cycle prevention

## Triage-First Playbook (Common Errors -> Next Best Move)

- SwiftLint concurrency-related warnings
  - Use `references/linting.md` for rule intent and preferred fixes; avoid dummy awaits as “fixes”.
- SwiftLint `async_without_await` warning
  - Remove `async` if not required; if required by protocol/override/@concurrent, prefer narrow suppression over adding fake awaits. See `references/linting.md`.
- "Sending value of non-Sendable type ... risks causing data races"
  - First: identify where the value crosses an isolation boundary
  - Then: use `references/sendable.md` and `references/threading.md` (especially Swift 6.2 behavior changes)
- "Main actor-isolated ... cannot be used from a nonisolated context"
  - First: decide if it truly belongs on `@MainActor`
  - Then: use `references/actors.md` (global actors, `nonisolated`, isolated parameters) and `references/threading.md` (default isolation)
- "Class property 'current' is unavailable from asynchronous contexts" (Thread APIs)
  - Use `references/threading.md` to avoid thread-centric debugging and rely on isolation + Instruments
- "Actor-isolated type does not conform to protocol" (protocol conformance errors)
  - First: determine whether the protocol requirements must execute on the actor (for example, UI work on `@MainActor`) or can safely be `nonisolated`.
  - Then: follow the Quick Fix Playbook entry for actor-isolated protocol conformance and `references/actors.md` for implementation patterns (isolated conformances, `nonisolated` requirements, and escalation steps).
- XCTest async errors like "wait(...) is unavailable from asynchronous contexts"
  - Use `references/testing.md` (`await fulfillment(of:)` and Swift Testing patterns)
- Core Data concurrency warnings/errors
  - Use `references/core-data.md` (DAO/`NSManagedObjectID`, default isolation conflicts)

## Core Patterns Reference

### When to Use Each Concurrency Tool

**async/await** - Making existing synchronous code asynchronous
```swift
// Use for: Single asynchronous operations
func fetchUser() async throws -> User {
    try await networkClient.get("/user")
}
```

**async let** - Running multiple independent async operations in parallel
```swift
// Use for: Fixed number of parallel operations known at compile time
async let user = fetchUser()
async let posts = fetchPosts()
let profile = try await (user, posts)
```

**Task** - Starting unstructured asynchronous work
```swift
// Use for: Fire-and-forget operations, bridging sync to async contexts
Task {
    await updateUI()
}
```

**Task Group** - Dynamic parallel operations with structured concurrency
```swift
// Use for: Unknown number of parallel operations at compile time
await withTaskGroup(of: Result.self) { group in
    for item in items {
        group.addTask { await process(item) }
    }
}
```

**Actor** - Protecting mutable state from data races
```swift
// Use for: Shared mutable state accessed from multiple contexts
actor DataCache {
    private var cache: [String: Data] = [:]
    func get(_ key: String) -> Data? { cache[key] }
}
```

**@MainActor** - Ensuring UI updates on main thread
```swift
// Use for: View models, UI-related classes
@MainActor
class ViewModel: ObservableObject {
    @Published var data: String = ""
}
```

### Common Scenarios

**Scenario: Network request with UI update**
```swift
Task { @concurrent in
    let data = try await fetchData() // Background
    await MainActor.run {
        self.updateUI(with: data) // Main thread
    }
}
```

**Scenario: Multiple parallel network requests**
```swift
async let users = fetchUsers()
async let posts = fetchPosts()
async let comments = fetchComments()
let (u, p, c) = try await (users, posts, comments)
```

**Scenario: Processing array items in parallel**
```swift
await withTaskGroup(of: ProcessedItem.self) { group in
    for item in items {
        group.addTask { await process(item) }
    }
    for await result in group {
        results.append(result)
    }
}
```

## Swift 6 Migration Quick Guide

Key changes in Swift 6:
- **Strict concurrency checking** enabled by default
- **Complete data-race safety** at compile time
- **Sendable requirements** enforced on boundaries
- **Isolation checking** for all async boundaries

For detailed migration steps, see `references/migration.md`.

## Reference Files

Load these files as needed for specific topics:

- **`async-await-basics.md`** - async/await syntax, execution order, async let, URLSession patterns
- **`tasks.md`** - Task lifecycle, cancellation, priorities, task groups, structured vs unstructured
- **`threading.md`** - Thread/task relationship, suspension points, isolation domains, nonisolated
- **`memory-management.md`** - Retain cycles in tasks, memory safety patterns
- **`actors.md`** - Actor isolation, @MainActor, global actors, reentrancy, custom executors, Mutex
- **`sendable.md`** - Sendable conformance, value/reference types, @unchecked, region isolation
- **`linting.md`** - Concurrency-focused lint rules and SwiftLint `async_without_await`
- **`async-sequences.md`** - AsyncSequence, AsyncStream, when to use vs regular async methods
- **`core-data.md`** - NSManagedObject sendability, custom executors, isolation conflicts
- **`performance.md`** - Profiling with Instruments, reducing suspension points, execution strategies
- **`testing.md`** - XCTest async patterns, Swift Testing, concurrency testing utilities
- **`migration.md`** - Swift 6 migration strategy, closure-to-async conversion, @preconcurrency, FRP migration

## Best Practices Summary

1. **Prefer structured concurrency** - Use task groups over unstructured tasks when possible
2. **Minimize suspension points** - Keep actor-isolated sections small to reduce context switches
3. **Use @MainActor judiciously** - Only for truly UI-related code
4. **Make types Sendable** - Enable safe concurrent access by conforming to Sendable
5. **Handle cancellation** - Check Task.isCancelled in long-running operations
6. **Avoid blocking** - Never use semaphores or locks in async contexts
7. **Test concurrent code** - Use proper async test methods and consider timing issues

## Verification Checklist (When You Change Concurrency Code)

- Confirm build settings (default isolation, strict concurrency, upcoming features) before interpreting diagnostics.
- For Quick Fix Mode: compile the affected target/module and rerun the specific diagnostics or lints.
- After refactors:
  - Run tests, especially concurrency-sensitive ones (see `references/testing.md`).
  - If performance-related, verify with Instruments (see `references/performance.md`).
  - If lifetime-related, verify deinit/cancellation behavior (see `references/memory-management.md`).

## Glossary

See `references/glossary.md` for quick definitions of core concurrency terms used across this skill.

---

**Note**: This skill is based on the comprehensive [Swift Concurrency Course](https://www.swiftconcurrencycourse.com?utm_source=github&utm_medium=agent-skill&utm_campaign=skill-footer) by Antoine van der Lee.
