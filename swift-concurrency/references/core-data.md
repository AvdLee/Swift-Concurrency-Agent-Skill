# Core Data and Swift Concurrency

Use this when:

- Core Data objects are crossing task, actor, or context boundaries.
- You are seeing Sendable or isolation diagnostics around `NSManagedObject`.
- You need a safe pattern for view-context vs background-context work.

Skip this file if:

- You are not using Core Data.
- You mainly need generic actor or Sendable guidance. Use `actors.md` or `sendable.md`.

Jump to:

- non-Sendable rules
- transfer patterns
- background work
- default isolation conflicts

## Core Rules

- `NSManagedObject` is not Sendable.
- `NSManagedObjectID` is safe to pass across isolation boundaries.
- Context-bound work should stay inside `NSManagedObjectContext.perform`.
- Do not use `@unchecked Sendable` to silence Core Data warnings on managed objects.

## Safe Transfer Patterns

| Need | Preferred transfer |
|---|---|
| Refer to an object later | `NSManagedObjectID` |
| Pass data across actors/tasks | map to a Sendable value type |
| Mutate a managed object | re-fetch it inside the destination context |

Example value transfer:

```swift
struct ArticleSnapshot: Sendable {
    let id: NSManagedObjectID
    let title: String
}
```

## View Context vs Background Context

Keep view-context work on the main actor when the app architecture expects that:

```swift
@MainActor
func fetchArticle(id: NSManagedObjectID, in viewContext: NSManagedObjectContext) -> Article? {
    viewContext.object(with: id) as? Article
}
```

Only pass a main-queue or view context to this helper.

Do background work by moving only the identifier or snapshot:

```swift
func processArticle(id: NSManagedObjectID, container: NSPersistentContainer) async throws {
    let context = container.newBackgroundContext()

    try await context.perform {
        guard let article = context.object(with: id) as? Article else { return }
        // mutate article
        try context.save()
    }
}
```

## Bridging Missing Async APIs

Some Core Data APIs still need bridging:

```swift
extension NSPersistentContainer {
    func loadPersistentStores() async throws {
        try await withCheckedThrowingContinuation { continuation in
            loadPersistentStores { _, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }
}
```

## Default `@MainActor` Isolation Conflicts

Default main-actor isolation can reduce migration noise in app code, but Core Data generated types can still create confusing boundaries.

Common diagnostic: `Main actor-isolated initializer has different actor isolation from nonisolated overridden declaration`. Fix: set entity code generation to Manual/None and mark the generated class as `nonisolated`.

Guidelines:

- Isolate wrapper APIs and app-facing orchestration instead of assuming every managed object should be `@MainActor`.
- Keep background mutation APIs explicit.
- Avoid passing managed objects from main-actor code into background tasks.
- For multi-context setups, enable `viewContext.automaticallyMergesChangesFromParent = true` to keep the view context in sync with background saves.

## Practical Store Shape

The simplest high-value pattern is usually:

- main-actor wrapper for view-context reads and UI-triggered writes
- async helper for background context work
- `NSManagedObjectID` or value snapshots across boundaries

You usually do not need a custom actor executor to get safe migration wins.

## Advanced Note: Custom Executors

Custom Core Data executors are advanced and niche. Reach for them only when:

- simpler `perform`-based wrappers are demonstrably insufficient
- the design truly benefits from actor-based context ownership
- the team understands the maintenance cost

For most migration work, they are unnecessary complexity.

## Anti-Patterns

Avoid these:

- Marking `NSManagedObject` subclasses as `Sendable`.
- Passing managed objects between contexts or actors.
- Hiding Core Data ownership issues behind `@unchecked Sendable`.
- Rewriting the entire persistence stack when `objectID` plus `perform` would solve the immediate problem.

## Debugging

Enable the Core Data concurrency assertions launch argument to catch cross-context violations at runtime: `-com.apple.CoreData.ConcurrencyDebug 1`.
