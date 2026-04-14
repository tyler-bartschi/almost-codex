import { spawnSync, type SpawnSyncReturns } from "child_process";
import type { Settings } from "../global/Settings";
import { readInlinePrompt } from "./Prompting";

const DEFAULT_STARTUP_COMMIT_MESSAGE = "saving prior changes on almost-codex startup";

interface GitCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/**
 * Executes a git command from the configured REPL root directory.
 * @param {string} rootDir Directory from which the git command should run.
 * @param {string[]} args Git CLI arguments to execute.
 * @returns {GitCommandResult} Normalized command result including stdout/stderr text.
 */
function runGitCommand(rootDir: string, args: string[]): GitCommandResult {
  const result: SpawnSyncReturns<string> = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf-8",
    stdio: "pipe",
  });

  if (result.error) {
    throw result.error;
  }

  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/**
 * Determines whether the configured root directory is inside a git work tree.
 * @param {string} rootDir Directory from which startup checks should operate.
 * @returns {boolean} `true` when `rootDir` is inside a git repository; otherwise `false`.
 */
function isGitInitialized(rootDir: string): boolean {
  const result = runGitCommand(rootDir, ["rev-parse", "--is-inside-work-tree"]);

  if (result.ok) {
    return result.stdout.trim() === "true";
  }

  const combinedOutput = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (combinedOutput.includes("not a git repository")) {
    return false;
  }

  throw new Error(result.stderr.trim() || result.stdout.trim() || "Unable to determine git status.");
}

/**
 * Checks whether the configured root directory contains uncommitted git changes.
 * @param {string} rootDir Directory from which startup checks should operate.
 * @returns {boolean} `true` when tracked or untracked changes exist beneath `rootDir`.
 */
function hasUncommittedChanges(rootDir: string): boolean {
  const result = runGitCommand(rootDir, [
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    ".",
  ]);

  if (!result.ok) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || "Unable to inspect git working tree.",
    );
  }

  return result.stdout.trim().length > 0;
}

/**
 * Prompts the user for a startup commit message and falls back to the default when blank.
 * @returns {string} The user-supplied commit message or the default startup message.
 */
function promptForCommitMessage(): string {
  const commitMessage = readInlinePrompt(
    "Git safe mode detected uncommitted changes.",
    "Enter a commit message (leave blank for default): ",
  ).trim();
  return commitMessage.length > 0 ? commitMessage : DEFAULT_STARTUP_COMMIT_MESSAGE;
}

/**
 * Adds and commits outstanding git changes under the configured root directory.
 * @param {string} rootDir Directory from which startup checks should operate.
 * @param {string} commitMessage Commit message to use for the startup save.
 * @returns {void} Does not return a value.
 */
function commitStartupChanges(rootDir: string, commitMessage: string): void {
  const addResult = runGitCommand(rootDir, ["add", "--all", "--", "."]);
  if (!addResult.ok) {
    throw new Error(
      addResult.stderr.trim() || addResult.stdout.trim() || "Unable to stage startup changes.",
    );
  }

  const commitResult = runGitCommand(rootDir, ["commit", "-m", commitMessage]);
  if (!commitResult.ok) {
    throw new Error(
      commitResult.stderr.trim() ||
        commitResult.stdout.trim() ||
        "Unable to commit startup changes.",
    );
  }
}

/**
 * Enforces git-safe startup behavior before the REPL loop begins.
 * @param {Pick<Settings, "gitMode">} settings Active settings containing the git safety mode.
 * @param {string} rootDir Directory from which startup checks should operate.
 * @returns {boolean} `true` when startup can continue; otherwise `false`.
 */
export function runReplGitSafeCheck(
  settings: Pick<Settings, "gitMode">,
  rootDir: string,
): boolean {
  if (settings.gitMode !== "safe") {
    return true;
  }

  try {
    if (!isGitInitialized(rootDir)) {
      console.warn(
        `Warning: git safe mode is enabled, but "${rootDir}" is not inside a git repository. Using git for version control is recommended.`,
      );
      return true;
    }

    if (!hasUncommittedChanges(rootDir)) {
      return true;
    }

    const commitMessage = promptForCommitMessage();
    commitStartupChanges(rootDir, commitMessage);
    console.log("Saved existing git changes before starting the REPL.");
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Git safe startup check failed: ${message}`);
    return false;
  }
}
