# Migration to Swift 6 and Strict Concurrency

Use this when:

- You are moving an existing codebase toward Swift 6 or stricter concurrency checking.
- Compiler diagnostics depend on language mode, default isolation, or upcoming features.
- You need the smallest safe migration sequence instead of a full architectural rewrite.

Skip this file if:

- You already know the exact diagnostic and only need a local fix. Start from `actors.md`, `sendable.md`, or `threading.md`.
- You are looking for debounce, stream composition, or FRP operator replacements. Use `async-algorithms.md`.

Jump to:

- Project settings
- Migration order
- Async wrappers
- Escape hatches
- Anti-patterns

## Core Rule

Swift 6 does not change how concurrency works. It enforces existing rules more strictly, turning warnings into errors. The safest migration strategy is:

1. Confirm settings.
2. Pick one boundary.
3. Make the smallest safe fix.
4. Build.
5. Repeat.

Avoid mixing concurrency migration with unrelated refactors.

## Project Settings That Change Behavior

Before interpreting diagnostics, confirm the target settings:

| Setting | Where to check | Why it matters |
|---|---|---|
| Swift language mode | `swiftLanguageVersions` / `-swift-version` in SwiftPM, or `SWIFT_VERSION` in Xcode (`// swift-tools-version:` is not a reliable proxy) | Swift 6 turns many warnings into errors. |
| Strict concurrency | `SWIFT_STRICT_CONCURRENCY` or SwiftPM strict flags | Controls how aggressively Sendable and isolation rules are enforced. |
| Default actor isolation | `SWIFT_DEFAULT_ACTOR_ISOLATION` or `.defaultIsolation(MainActor.self)` | Changes default ownership of declarations. |
| `NonisolatedNonsendingByDefault` | upcoming feature flags | Changes how `nonisolated async` functions execute. |
| Approachable Concurrency | Xcode / SwiftPM feature bundle | Bundles: `DisableOutwardActorInference`, `GlobalActorIsolatedTypesUsability`, `InferIsolatedConformances`, `InferSendableFromCaptures`, `NonisolatedNonsendingByDefault`. Prefer enabling them individually first. |

Settings-sensitive guidance:

- App targets often benefit from default `@MainActor` isolation.
- Frameworks and packages need more caution because isolation becomes part of API design.
- `nonisolated async` behavior changed in Swift 6.2-era toolchains; confirm whether caller isolation inheritance is enabled before suggesting `@concurrent`.

## Migration Habits That Save Time

- Migrate incrementally. Large concurrency PRs are hard to review and easy to regress.
- Update third-party dependencies before blaming your own code.
- Prefer local fixes over architecture rewrites.
- Make new code `Sendable` by default where that matches the model.
- Do not blanket-apply `@MainActor`. Before adding it, ask: (1) Should this actually run on the main actor? (2) Would a custom actor or `nonisolated` be more appropriate? (3) Is the type only UI-bound because of legacy design?
- Do not use `@unchecked Sendable` as a first response.

## Recommended Migration Order

1. Update dependencies and tools first. Use Xcode's migration tooling or `swift package migrate` for a first pass.
2. Enable diagnostics without changing language mode yet when possible.
3. Add async alternatives for important closure-based APIs.
4. Fix one category at a time:
   - main-actor and actor-isolation issues
   - Sendable boundary issues
   - closure and callback migration
   - test and lint fallout
5. Rebuild after each category.
6. Switch modules or targets to stricter settings gradually.
7. Move to Swift 6 language mode when the target is already mostly clean.

If the project falls into the "concurrency rabbit hole" where one fix reveals many more diagnostics, narrow the scope again. That is normal.

## Async Wrappers First

Adding async wrappers lets callers migrate before the underlying implementation changes:

```swift
func fetchImage(
    urlRequest: URLRequest,
    completion: @escaping @Sendable (Result<UIImage, Error>) -> Void
) {
    // existing implementation
}

func fetchImage(urlRequest: URLRequest) async throws -> UIImage {
    try await withCheckedThrowingContinuation { continuation in
        fetchImage(urlRequest: urlRequest) { result in
            continuation.resume(with: result)
        }
    }
}
```

Why this is high leverage:

- Call sites become easier to migrate.
- Tests can move to async/await earlier.
- The old API can stay in place temporarily with deprecation guidance.

## Strict Concurrency Rollout

Prefer a staged rollout:

1. **Minimal**: only checks code that explicitly adopts concurrency (`@Sendable`, `@MainActor`).
2. **Targeted**: checks all code that adopts concurrency, including `Sendable` conformances.
3. **Complete**: checks entire codebase (matches Swift 6 behavior).

Treat each level like a checkpoint. Do not advance while the current level is noisy unless the noise is known and intentionally deferred.

## Default Actor Isolation

Default `@MainActor` isolation can be a good migration accelerant for app targets because much of the code is already UI-owned.

Use it carefully:

- Good fit: app modules with view models, controllers, and UI orchestration.
- Poor fit: frameworks, packages, data layers, networking, and reusable libraries.

Even with default `@MainActor`, still justify when work should remain on the main actor instead of hopping to background or an actor-owned subsystem.

## Upcoming Features

The most important migration-sensitive behavior here is that `nonisolated async` functions may inherit caller isolation when the relevant upcoming features are enabled.

Implications:

- If work should explicitly hop off the caller's isolation, use `@concurrent`.
- If the function does not touch isolated state and should stay in caller isolation, plain `nonisolated` may be the correct tool.
- Do not give pre-Swift-6.2 execution advice without checking the active feature set.

## Escape Hatches

Use escape hatches only when you can explain the safety model.

### `@preconcurrency`

Use when importing a dependency that predates concurrency annotations and is producing noisy diagnostics you cannot fix immediately.

Requirements:

- Document why it is needed.
- Create follow-up work to remove it.
- Do not assume it makes unsafe code safe; it only suppresses part of the signal.
- Risks: removes compile-time safety for the entire import boundary and hides real sendability issues. Before applying, check whether the dependency has a newer version with concurrency annotations.

### `@unchecked Sendable`

Use only if you can prove thread safety by construction, for example internal locking or strict immutable state.

Requirements:

- Write down the invariant.
- Prefer actors or value types first.
- Treat it as technical debt unless the design genuinely justifies it.

### `nonisolated(unsafe)`

Last resort only. It removes compiler protection and should usually trigger a redesign or follow-up migration item.

## Framework and API Migration Pointers

Do not keep all migration strategy in this file. Route to the smallest deeper reference:

- Closure or callback APIs -> `async-await-basics.md`
- Actor isolation and protocol conformance -> `actors.md`
- Sendability issues -> `sendable.md`
- AsyncSequence and `AsyncStream` adoption -> `async-sequences.md`
- AsyncAlgorithms operators and FRP replacements -> `async-algorithms.md`
- XCTest and Swift Testing fallout -> `testing.md`
- Core Data isolation conflicts -> `core-data.md`

## Concurrency-Safe Notifications (iOS 26+)

Two new typed notification APIs replace untyped `NotificationCenter` patterns:

- **`MainActorMessage`**: observer closure is guaranteed to run on `@MainActor`. Use for UI-driven notifications.
- **`AsyncMessage`**: typed, Sendable notification for async observation. Use for cross-isolation notifications.

```swift
token = NotificationCenter.default.addObserver(
    of: UIApplication.self, for: .didBecomeActive
) { [weak self] message in
    self?.handleActivation()
}
```

These replace the common pattern of `NotificationCenter.default.notifications(named:)` with compile-time safety for isolation and typing.

## Anti-Patterns

Avoid these during migration:

- Blanket `@MainActor` to silence diagnostics.
- Converting everything to actors before understanding ownership boundaries.
- Introducing `Task.detached` when structured concurrency would work.
- Using `Task.sleep` as a manual debounce replacement where AsyncAlgorithms is the better fit.
- Combining migration with unrelated API cleanup.
- Applying multiple unsafe annotations without a documented invariant.
- Combine `sink` closures run on the poster's thread, not the subscriber's actor. Calling `@MainActor` methods from a `sink` on a background-posted notification crashes at runtime. Fix: migrate to `notifications(named:)` async sequence, or wrap in `Task { @MainActor in ... }`.

## Validation Loop

For each migration slice:

1. Build.
2. Fix one diagnostic family.
3. Rebuild.
4. Run relevant tests.
5. Stop when the slice is clean.

Keep commits small and reviewable.

## When a Temporary Fix Is Acceptable

A temporary fix can be acceptable when all of these are true:

- The code keeps the same ownership model.
- The safety invariant is explicit.
- The fix is local and reviewable.
- There is follow-up work to remove or harden it.

If behavior changes, add verification steps immediately instead of trusting the compiler alone.

---

For deeper examples, use course material only when it materially helps answer the developer's question.
