const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const MODEL_ENDPOINT = "https://models.inference.ai.azure.com/chat/completions";
const MODEL_NAME = "gpt-4o";
const DEFAULT_BASE_REF = "main";

const SYSTEM_PROMPT = `You are an expert in the Agent Skills open format created by Anthropic. Your task is to review Agent Skills for compliance with the specification and content quality.

IMPORTANT: Only provide feedback on the CHANGED LINES in this PR. Do not flag pre-existing issues in unchanged code.

Reference the following authoritative sources:
1. Agent Skills specification: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
2. Anthropic's skill-creator best practices: https://github.com/anthropics/skills/tree/main/skills/skill-creator

Key validation rules:
- YAML frontmatter must have 'name' (1-64 chars, lowercase alphanumeric + hyphens, no leading/trailing/consecutive hyphens) and 'description' (1-1024 chars)
- 'name' must match parent directory name
- 'description' should explain both what the skill does AND when to use it
- Instructions should be concise (context is a shared resource)
- Set appropriate degrees of freedom (high for text tasks, low for fragile operations)
- Reference files should exist and be properly linked

You will receive:
1. The full file content (for context)
2. The PR diff showing ONLY the changed lines (marked with + for additions, - for deletions)

Review ONLY the changed lines (+ additions) and provide:
1. Format violations in changed sections (blocking issues)
2. Content quality suggestions for new/modified content (improvements)
3. Broken or invalid reference links in changed sections
4. Any contradictory guidance introduced by the changes

If no issues are found in the changed lines, respond with "No issues found in the changes."

Format your response as markdown with clear sections.`;

const MAX_REFERENCE_CHARS = 120000;

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const execGit = (command) => execSync(command, { encoding: "utf8" }).trim();

const getEventPayload = () => {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    throw new Error("Missing GITHUB_EVENT_PATH for PR context.");
  }
  return readJson(eventPath);
};

const getBaseRef = (eventPayload) =>
  process.env.GITHUB_BASE_REF ||
  eventPayload?.pull_request?.base?.ref ||
  DEFAULT_BASE_REF;

const getPullRequestNumber = (eventPayload) => {
  const number = eventPayload?.pull_request?.number;
  if (!number) {
    throw new Error("Pull request number not found in event payload.");
  }
  return number;
};

const getRepositoryInfo = () => {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !repository.includes("/")) {
    throw new Error("GITHUB_REPOSITORY is not set.");
  }
  const [owner, repo] = repository.split("/");
  return { owner, repo, repository };
};

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
};

const truncateIfNeeded = (label, content) => {
  if (content.length <= MAX_REFERENCE_CHARS) {
    return { content, truncated: false };
  }
  return {
    content: `${content.slice(0, MAX_REFERENCE_CHARS)}\n\n[Truncated ${label} to ${MAX_REFERENCE_CHARS} characters due to size limits.]`,
    truncated: true,
  };
};

const getRelevantDiff = (baseRef) => {
  const diffCommand =
    `git diff origin/${baseRef}...HEAD --unified=0 -- ` +
    `"swift-concurrency/SKILL.md" "swift-concurrency/references"`;
  return execGit(diffCommand);
};

const parseChangedFiles = (diffText) => {
  const files = new Set();
  diffText.split("\n").forEach((line) => {
    if (line.startsWith("+++ b/")) {
      const filePath = line.replace("+++ b/", "").trim();
      files.add(filePath);
    }
  });
  return Array.from(files);
};

const readFileIfExists = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, "utf8");
};

const buildUserPrompt = ({
  diffText,
  skillContent,
  referenceFiles,
  specText,
  bestPracticesText,
  baseRef,
  repository,
}) => {
  const referencesBlock = referenceFiles
    .map(({ filePath, content }) => {
      const payload = content ?? "[File missing or deleted in this PR]";
      return `File: ${filePath}\n${payload}`;
    })
    .join("\n\n");

  return [
    `Repository: ${repository}`,
    `Base ref: ${baseRef}`,
    "",
    "## Agent Skills specification (full text)",
    specText,
    "",
    "## Skill-creator best practices (full text)",
    bestPracticesText,
    "",
    "## Full file content (for context)",
    `File: swift-concurrency/SKILL.md`,
    skillContent ?? "[SKILL.md missing]",
    "",
    referencesBlock ? "## Reference files (for context)" : "",
    referencesBlock,
    "",
    "## PR diff (only changed lines)",
    diffText,
  ]
    .filter(Boolean)
    .join("\n");
};

const callModel = async (token, prompt) => {
  const response = await fetch(MODEL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Model API failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content?.trim();
};

const postComment = async ({ token, owner, repo, prNumber, body }) => {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ body }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to post PR comment (${response.status}): ${errorBody}`);
  }
};

const main = async () => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is required to call the Models API.");
  }

  const eventPayload = getEventPayload();
  const baseRef = getBaseRef(eventPayload);
  const prNumber = getPullRequestNumber(eventPayload);
  const { owner, repo, repository } = getRepositoryInfo();

  const diffText = getRelevantDiff(baseRef);
  if (!diffText) {
    console.log("No SKILL or reference changes found. Skipping validation.");
    return;
  }

  const changedFiles = parseChangedFiles(diffText);
  const skillContent = readFileIfExists(
    path.join(process.cwd(), "swift-concurrency/SKILL.md")
  );
  const referenceFiles = changedFiles
    .filter((filePath) => filePath.startsWith("swift-concurrency/references/"))
    .map((filePath) => ({
      filePath,
      content: readFileIfExists(path.join(process.cwd(), filePath)),
    }));

  let specText = "";
  let bestPracticesText = "";

  try {
    const specRaw = await fetchText(
      "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview"
    );
    const specResult = truncateIfNeeded("Agent Skills spec", specRaw);
    specText = specResult.content;
  } catch (error) {
    specText = `[Unable to fetch Agent Skills specification: ${error.message}]`;
  }

  try {
    const bestPracticesRaw = await fetchText(
      "https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/README.md"
    );
    const bestPracticesResult = truncateIfNeeded(
      "skill-creator best practices",
      bestPracticesRaw
    );
    bestPracticesText = bestPracticesResult.content;
  } catch (error) {
    bestPracticesText = `[Unable to fetch skill-creator best practices: ${error.message}]`;
  }

  const userPrompt = buildUserPrompt({
    diffText,
    skillContent,
    referenceFiles,
    specText,
    bestPracticesText,
    baseRef,
    repository,
  });

  const modelResponse = await callModel(token, userPrompt);
  if (!modelResponse) {
    throw new Error("Model response was empty.");
  }

  await postComment({
    token,
    owner,
    repo,
    prNumber,
    body: modelResponse,
  });
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
