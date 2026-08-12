# All Installation Options

The [README](README.md) covers the recommended installation paths: [skills.sh](README.md#option-a-using-skillssh-recommended), the OpenAI Plugins Directory (ChatGPT & Codex), Claude Code, and Cursor. This file lists every other supported client.

## pi package manager

Install via [pi](https://github.com/mariozechner/pi-mono):
```bash
pi install https://github.com/AvdLee/Swift-Concurrency-Agent-Skill
```

The skill will be available automatically in pi sessions.

## Gemini CLI

Install globally (user-level skill available in all Gemini CLI sessions):
```bash
gemini skills install https://github.com/AvdLee/Swift-Concurrency-Agent-Skill
```

Or install at workspace level so the skill is shared with your team via version control:
```bash
gemini skills install https://github.com/AvdLee/Swift-Concurrency-Agent-Skill --scope workspace
```

You can verify the installation with:
```bash
gemini skills list
```

For more information, see the [Gemini CLI Agent Skills documentation](https://geminicli.com/docs/cli/skills/).

*Instructions contributed by [@clanzhang](https://github.com/clanzhang).*

## Autohand Code

Install the skill globally:
```bash
git clone https://github.com/AvdLee/Swift-Concurrency-Agent-Skill.git
mkdir -p ~/.autohand/skills
cp -R Swift-Concurrency-Agent-Skill/skills/swift-concurrency ~/.autohand/skills/
```

Or install it only for the current project:
```bash
git clone https://github.com/AvdLee/Swift-Concurrency-Agent-Skill.git
mkdir -p .autohand/skills
cp -R Swift-Concurrency-Agent-Skill/skills/swift-concurrency .autohand/skills/
```

Autohand Code discovers skills from `~/.autohand/skills/` and `.autohand/skills/`.

*Instructions contributed by [@igorcosta](https://github.com/igorcosta).*

## Manual install

1) **Clone** this repository.
2) **Install or symlink** the `skills/swift-concurrency/` folder following your tool's official skills installation docs (see links below).
3) **Use your AI tool** as usual and ask it to use the "swift-concurrency" skill for Swift Concurrency tasks.

> Note: the skill folder moved from the repository root to `skills/swift-concurrency/` when adopting the Agent Plugins format. A symlink at the old `swift-concurrency/` path keeps existing local clones and scripts working; it will be removed in the next major version.

### Where to Save Skills

Follow your tool's official documentation, here are a few popular ones:
- **Codex:** [Where to save skills](https://developers.openai.com/codex/skills/#where-to-save-skills)
- **Claude:** [Using Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)
- **Cursor:** [Enabling Skills](https://cursor.com/docs/context/skills#enabling-skills)
- **Gemini CLI:** [Agent Skills](https://geminicli.com/docs/cli/skills/)
- **Autohand Code:** `~/.autohand/skills/` or `.autohand/skills/`

**How to verify:**

Your agent should reference the triage/playbook in `skills/swift-concurrency/SKILL.md` and jump into the relevant reference file for your error or task.

## Trigger the skill

After installing through any of these options, use the skill in your AI agent, for example:
> Use the swift concurrency skill and analyze the current project for Swift Concurrency improvements
