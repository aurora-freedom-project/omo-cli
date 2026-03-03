import { join } from "node:path";
import { getOpenCodeStorageDir } from "../../shared/data-path";

/** Root storage directory for OpenCode rules data. */
export const OPENCODE_STORAGE = getOpenCodeStorageDir();
/** Directory for rules injector state storage. */
export const RULES_INJECTOR_STORAGE = join(OPENCODE_STORAGE, "rules-injector");

/** File/directory names that indicate a project root. */
export const PROJECT_MARKERS = [
  ".git",
  "pyproject.toml",
  "package.json",
  "Cargo.toml",
  "go.mod",
  ".venv",
];

/** Project subdirectory pairs [parent, child] that may contain rule files. */
export const PROJECT_RULE_SUBDIRS: [string, string][] = [
  [".github", "instructions"],
  [".cursor", "rules"],
  [".claude", "rules"],
];

/** Specific project-level rule files to check for. */
export const PROJECT_RULE_FILES: string[] = [
  ".github/copilot-instructions.md",
];

/** Pattern matching GitHub instruction files. */
export const GITHUB_INSTRUCTIONS_PATTERN = /\.instructions\.md$/;

/** Relative path for user-level rule directory. */
export const USER_RULE_DIR = ".claude/rules";

/** Valid file extensions for rule files. */
export const RULE_EXTENSIONS = [".md", ".mdc"];
