const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const README_PATH = path.join(process.cwd(), "README.md");
const REFERENCES_DIR = path.join(process.cwd(), "swift-concurrency/references");
const DEFAULT_BASE_REF = "main";

const execGit = (command) => execSync(command, { encoding: "utf8" }).trim();

const getEventPayload = () => {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(eventPath, "utf8"));
};

const getBaseRef = (eventPayload) =>
  process.env.GITHUB_BASE_REF ||
  eventPayload?.pull_request?.base?.ref ||
  DEFAULT_BASE_REF;

const getReferenceChanges = (baseRef) => {
  const diff = execGit(
    `git diff origin/${baseRef}...HEAD --name-status -- "swift-concurrency/references"`
  );
  return diff;
};

const parseDescriptions = (blockContent) => {
  const descriptions = new Map();
  blockContent.split("\n").forEach((line) => {
    const match = line.match(/(?:├──|└──)\s+([^\s#]+\.md)\s*(?:#\s*(.*))?/);
    if (match) {
      const [, fileName, description] = match;
      descriptions.set(fileName, description?.trim() || "");
    }
  });
  return descriptions;
};

const buildStructureBlock = (referenceFiles, existingDescriptions) => {
  const allNames = ["SKILL.md", ...referenceFiles];
  const maxLength = allNames.reduce(
    (max, name) => Math.max(max, name.length),
    0
  );

  const lines = [];
  lines.push("swift-concurrency/");
  const skillDescription =
    existingDescriptions.get("SKILL.md") || "Main skill file with decision trees";
  lines.push(
    `├── ${"SKILL.md".padEnd(maxLength)}   # ${skillDescription}`.trimEnd()
  );
  lines.push("└── references/");

  referenceFiles.forEach((fileName, index) => {
    const isLast = index === referenceFiles.length - 1;
    const tree = isLast ? "└──" : "├──";
    const description =
      existingDescriptions.get(fileName) || "TODO: Add description";
    lines.push(
      `    ${tree} ${fileName.padEnd(maxLength)}   # ${description}`.trimEnd()
    );
  });

  return lines.join("\n");
};

const main = () => {
  if (!fs.existsSync(README_PATH)) {
    throw new Error("README.md not found.");
  }
  if (!fs.existsSync(REFERENCES_DIR)) {
    throw new Error("References directory not found.");
  }

  const eventPayload = getEventPayload();
  const baseRef = getBaseRef(eventPayload);

  const referenceDiff = getReferenceChanges(baseRef);
  if (!referenceDiff) {
    console.log("No reference file changes detected. Skipping README sync.");
    return;
  }

  const readme = fs.readFileSync(README_PATH, "utf8");
  const blockRegex = /(## Skill Structure[\s\S]*?)```[\s\S]*?```/;
  const match = readme.match(blockRegex);
  if (!match) {
    throw new Error("Skill Structure code block not found in README.");
  }

  const existingBlockMatch = readme.match(/## Skill Structure[\s\S]*?```([\s\S]*?)```/);
  const existingBlock = existingBlockMatch ? existingBlockMatch[1].trim() : "";
  const existingDescriptions = parseDescriptions(existingBlock);

  const referenceFiles = fs
    .readdirSync(REFERENCES_DIR)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  const newBlockContent = buildStructureBlock(
    referenceFiles,
    existingDescriptions
  );
  const newBlock = `\`\`\`\n${newBlockContent}\n\`\`\``;

  const updatedReadme = readme.replace(blockRegex, `$1${newBlock}`);

  if (updatedReadme === readme) {
    console.log("README already up to date.");
    return;
  }

  fs.writeFileSync(README_PATH, updatedReadme);
  console.log("README updated with latest reference files.");
};

main();
