import { execSync } from "child_process";
import { getGlobalReplRootDir } from "../../global/ReplStateStore";
import { getUserVerification, logToolCall, logToolReturn } from "../utils/ToolUtils";

/**
 * Executes a shell command from the REPL root directory after explicit user approval.
 * @param {string} command UNIX-based terminal command to execute.
 * @returns {string} The combined command output captured from stdout and stderr.
 */
export function runTerminal(command: string): string {
  logToolCall("runTerminal", { command });
  const rootDir = getGlobalReplRootDir();

  getUserVerification(
    `Run terminal command "${command}" from "${rootDir}"? [y/N]: `,
    `Terminal command cancelled by user: ${command}`,
  );

  try {
    const output = execSync(command, {
      cwd: rootDir,
      encoding: "utf-8",
      shell: "/bin/sh",
      stdio: "pipe",
    });
    logToolReturn("runTerminal");
    return output;
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    const stdout =
      typeof execError.stdout === "string"
        ? execError.stdout
        : execError.stdout?.toString("utf-8") ?? "";
    const stderr =
      typeof execError.stderr === "string"
        ? execError.stderr
        : execError.stderr?.toString("utf-8") ?? "";
    const combinedOutput = `${stdout}${stderr}`.trim();

    if (combinedOutput.length > 0) {
      throw new Error(combinedOutput);
    }

    throw new Error(`Terminal command failed: ${command}`);
  }
}
