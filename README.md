<p align="center">
    <a href="https://www.swiftconcurrencycourse.com?utm_source=github&utm_medium=agent-skill&utm_campaign=swift-concurrency-skill">
        <img width="900px" src="assets/github_readme_banner.jpg" alt="Swift Concurrency Agent Skill banner">
    </a>
</p>

# Swift Concurrency Agent Skill

Expert guidance for any AI coding tool that supports the [Agent Skills open format](https://agentskills.io/home) — safe concurrency, performance, and Swift 6+ migration.

Based on the comprehensive [Swift Concurrency Course](https://www.swiftconcurrencycourse.com?utm_source=github&utm_medium=agent-skill&utm_campaign=swift-concurrency-skill), distilled into actionable, concise references for agents.

## Who this is for
- Teams migrating to Swift 6 / strict concurrency who need safe defaults and quick triage.
- Developers debugging data races, isolation errors, or flaky async tests.
- Anyone wanting performance-minded concurrency patterns (actors, tasks, Sendable, async streams).

## How to Use This Skill

### Option A: Using OpenSkills (recommended)
1) Install OpenSkills:  
   ```bash
   npm i -g openskills
   ```
2) `cd` into your project directory.  
3) Install this skill:  
   ```bash
   openskills install avdlee/Swift-Concurrency-Agent-Skill
   ```
4) Sync into your `AGENTS.md`:  
   ```bash
   openskills sync
   ```
5) Use the skill in your AI agent, for example:  
   > Use the swift concurrency skill and analyze the current project for Swift Concurrency improvements

### Option B: Claude Code Plugin

#### Personal Usage

To install this Skill for your personal use in Claude Code:

1. Add the marketplace:
   ```bash
   /plugin marketplace add AvdLee/Swift-Concurrency-Agent-Skill
   ```

2. Install the Skill:
   ```bash
   /plugin install swift-concurrency@swift-concurrency-agent-skill
   ```

#### Project Configuration

To automatically provide this Skill to everyone working in a repository, configure the repository's `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "swift-concurrency@swift-concurrency-agent-skill": true
  },
  "extraKnownMarketplaces": {
    "swift-concurrency-agent-skill": {
      "source": {
        "source": "github",
        "repo": "AvdLee/Swift-Concurrency-Agent-Skill"
      }
    }
  }
}
```

When team members open the project, Claude Code will prompt them to install the Skill.

### Option C: Manual install
1) **Clone** this repository.  
2) **Install or symlink** the `swift-concurrency/` folder following your tool’s official skills installation docs (see links below).  
3) **Use your AI tool** as usual and ask it to use the “swift-concurrency” skill for Swift Concurrency tasks.

#### Where to Save Skills

Follow your tool’s official documentation, here are a few popular ones:
- **Codex:** [Where to save skills](https://developers.openai.com/codex/skills/#where-to-save-skills)
- **Claude:** [Using Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview#using-skills)
- **Cursor:** [Enabling Skills](https://cursor.com/docs/context/skills#enabling-skills)

**How to verify**: 

Your agent should reference the triage/playbook in `swift-concurrency/SKILL.md` and jump into the relevant reference file for your error or task.

## What This Skill Offers

This skill gives your AI coding tool comprehensive Swift Concurrency guidance. It can:

### Guide Your Concurrency Decisions
- Choose the right tool for the job (async/await, actors, tasks, task groups)
- Understand when to use `@MainActor`, custom actors, or `nonisolated`
- Navigate isolation domains and prevent data races at compile time
- Apply `Sendable` conformance correctly for value and reference types

### Write Safe Concurrent Code
- Avoid common pitfalls like actor reentrancy and retain cycles
- Prevent data races with proper isolation
- Handle task cancellation and error propagation correctly
- Manage memory safely in concurrent contexts

### Optimize Performance
- Choose between serialized, asynchronous, and parallel execution
- Reduce actor contention and unnecessary suspension points
- Understand the tradeoffs of parallelism

### Migrate to Swift 6
- Step-by-step migration strategies for existing codebases
- Enable strict concurrency checking incrementally
- Rewrite closure-based code to async/await
- Migrate from Combine/RxSwift to Swift Concurrency
- Use migration tooling for upcoming Swift features

### Test Concurrent Code
- Write reliable tests using Swift Testing (recommended) or XCTest
- Handle `@MainActor` isolation in tests
- Use `withMainSerialExecutor` for deterministic testing
- Avoid flaky tests with proper async handling

### Integrate with Core Data
- Safely pass data between isolation domains using `NSManagedObjectID`
- Implement the Data Access Object (DAO) pattern
- Use custom actor executors when needed
- Avoid common Core Data concurrency pitfalls

## What Makes This Skill Different

**Expert Knowledge**: Based on real-world experience migrating large production codebases to Swift 6, distilled from the comprehensive [Swift Concurrency Course](https://www.swiftconcurrencycourse.com?utm_source=github&utm_medium=agent-skill&utm_campaign=swift-concurrency-skill).

**Non-Opinionated**: Focuses on industry-standard best practices and compile-time safety, not architectural preferences. Works with any Swift project, coding style, or architecture.

**Swift 6.2 Ready**: Covers the latest Swift Concurrency features including:
- Default Actor Isolation
- `isolated deinit`
- Global Actor Conformance for protocols
- `nonisolated(nonsending)` and `@concurrent`
- Approachable Concurrency build settings
- Concurrency-safe notifications (iOS 26+)

**Practical & Concise**: Assumes your AI agent is already smart. Focuses on what developers need to know, not what they already understand. Includes code examples for every pattern.

## See it in action
[![Youtube Video](assets/agent_skills_watch_on_youtube.png)](https://www.youtube.com/watch?v=khekVi1PK3o)


## Skill Structure

```
swift-concurrency/
├── SKILL.md                    # Main skill file with decision trees
└── references/
    ├── async-await-basics.md   # Fundamentals of async/await syntax
    ├── tasks.md                # Task lifecycle, cancellation, priorities
    ├── sendable.md             # Isolation domains and Sendable conformance
    ├── actors.md               # Actor isolation, global actors, reentrancy
    ├── async-sequences.md      # AsyncSequence and AsyncStream patterns
    ├── threading.md            # Threads vs tasks, suspension points
    ├── memory-management.md    # Retain cycles, weak self, isolated deinit
    ├── core-data.md            # Core Data integration patterns
    ├── performance.md          # Optimization with Xcode Instruments
    ├── testing.md              # Testing concurrent code
    ├── migration.md            # Step-by-step Swift 6 migration guide
    ├── glossary.md             # Terms & concepts for Swift Concurrency
    └── linting.md              # Linting rules for strict concurrency
```

## Contributing

Found an issue or have a suggestion? Feel free to open a PR. This skill is maintained to reflect the latest Swift Concurrency best practices and will be updated as the language evolves.

## About the Author

Created by [Antoine van der Lee](https://www.avanderlee.com), a Swift Concurrency expert and creator of the [Swift Concurrency Course](https://www.swiftconcurrencycourse.com?utm_source=github&utm_medium=agent-skill&utm_campaign=swift-concurrency-skill). With years of experience in Swift & Swift Concurrency, this skill distills practical knowledge into actionable guidance for AI assistants. He [published tens of articles on Swift Concurrency](https://www.avanderlee.com/category/concurrency/) on his blog called SwiftLee.

## License

This skill is open-source and available under the MIT License. See [LICENSE](LICENSE) for details.



