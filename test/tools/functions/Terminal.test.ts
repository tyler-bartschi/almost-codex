import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import promptSync from "prompt-sync";
import type { Settings } from "../../../src/global/Settings";
import { clearGlobalReplState, setGlobalReplState } from "../../../src/global/ReplStateStore";
import type { ReplState } from "../../../src/repl/replExecutorTypes";
import { RunTerminal } from "../../../src/tools/functions/Terminal";

jest.mock("prompt-sync", () => jest.fn());
jest.mock("child_process", () => ({
  execSync: jest.fn(),
}));

type PromptFunction = (ask: string) => string;
type PromptFactoryFunction = (config?: { sigint?: boolean }) => PromptFunction;

const mockedPromptSync = promptSync as unknown as jest.MockedFunction<PromptFactoryFunction>;
const mockedExecSync = execSync as jest.MockedFunction<typeof execSync>;

/**
 * Creates a typed Jest prompt mock that returns a fixed response.
 * @param {string} response Prompt response to return.
 * @returns {jest.MockedFunction<PromptFunction>} The configured prompt mock.
 */
function createPromptMock(response: string): jest.MockedFunction<PromptFunction> {
  return jest.fn<string, [string]>().mockReturnValue(response);
}

/**
 * Creates a temporary test workspace directory.
 * @param {string} prefix Prefix used for the temp directory name.
 * @returns {string} The created temporary directory path.
 */
function createTempWorkspace(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Stores a REPL state fixture for terminal tool tests.
 * @param {string} rootDir Root directory to expose through the store.
 * @returns {void} Does not return a value.
 */
function setTerminalReplState(rootDir: string): void {
  const settings = {
    protectedObjects: [],
    concealedObjects: [],
  } as Pick<Settings, "concealedObjects" | "protectedObjects">;
  const replState: ReplState = {
    currentMode: "code",
    rootDir,
    settings: settings as Settings,
    shouldExit: false,
    shouldClear: false,
  };

  setGlobalReplState(replState);
}

describe("Terminal tools", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = createTempWorkspace("terminal-tools-");
    setTerminalReplState(tempRoot);
    mockedPromptSync.mockReset();
    mockedExecSync.mockReset();
  });

  afterEach(() => {
    clearGlobalReplState();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("returns terminal output after the user approves the command", () => {
    const promptMock = createPromptMock("yes");
    mockedPromptSync.mockReturnValue(promptMock);
    mockedExecSync.mockReturnValue("ok\n" as never);

    const output = RunTerminal("printf 'ok\\n'");

    expect(output).toBe("ok\n");
    expect(promptMock).toHaveBeenCalledWith(
      `Run terminal command "printf 'ok\\n'" from "${tempRoot}"? [y/N]: `,
    );
    expect(mockedExecSync).toHaveBeenCalledWith("printf 'ok\\n'", {
      cwd: tempRoot,
      encoding: "utf-8",
      shell: "/bin/sh",
      stdio: "pipe",
    });
  });

  it("throws when the user declines to run the command", () => {
    mockedPromptSync.mockReturnValue(createPromptMock("no"));

    expect(() => RunTerminal("pwd")).toThrow("Terminal command cancelled by user: pwd");
    expect(mockedExecSync).not.toHaveBeenCalled();
  });

  it("throws captured terminal output when the command fails", () => {
    mockedPromptSync.mockReturnValue(createPromptMock("y"));
    const commandError = new Error("command failed") as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
    };
    commandError.stdout = "partial output\n";
    commandError.stderr = "permission denied\n";
    mockedExecSync.mockImplementation(() => {
      throw commandError;
    });

    expect(() => RunTerminal("rm protected-file")).toThrow(
      "partial output\npermission denied",
    );
  });

  it("runs commands from the configured REPL root directory", () => {
    mockedPromptSync.mockReturnValue(createPromptMock("y"));
    mockedExecSync.mockImplementation(
      (...args: Parameters<typeof execSync>) => {
        const [command, options] = args;
        return `${String(command)} @ ${String(options?.cwd)}` as never;
      },
    );

    const output = RunTerminal("pwd");

    expect(output).toBe(`pwd @ ${tempRoot}`);
    expect(mockedExecSync).toHaveBeenCalledWith("pwd", {
      cwd: tempRoot,
      encoding: "utf-8",
      shell: "/bin/sh",
      stdio: "pipe",
    });
  });
});
