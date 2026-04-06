import { spawnSync, type SpawnSyncReturns } from "child_process";
import promptSync from "prompt-sync";
import { runReplGitSafeCheck } from "../../src/repl/ReplGitSafeCheck";

jest.mock("prompt-sync", () => jest.fn());
jest.mock("child_process", () => ({
  spawnSync: jest.fn(),
}));

type PromptFunction = (ask: string) => string;
type PromptFactoryFunction = (config?: { sigint?: boolean }) => PromptFunction;

const mockedPromptSync = promptSync as unknown as jest.MockedFunction<PromptFactoryFunction>;
const mockedSpawnSync = spawnSync as jest.MockedFunction<typeof spawnSync>;

/**
 * Creates a typed Jest prompt mock that returns a fixed response.
 * @param {string} response Prompt response to return.
 * @returns {jest.MockedFunction<PromptFunction>} The configured prompt mock.
 */
function createPromptMock(response: string): jest.MockedFunction<PromptFunction> {
  return jest.fn<string, [string]>().mockReturnValue(response);
}

/**
 * Builds a mocked `spawnSync` response for git command tests.
 * @param {number | null} status Exit status to report.
 * @param {string} stdout Standard output to report.
 * @param {string} stderr Standard error to report.
 * @returns {SpawnSyncReturns<string>} Mocked process result.
 */
function createSpawnResult(
  status: number | null,
  stdout = "",
  stderr = "",
): SpawnSyncReturns<string> {
  return {
    pid: 0,
    output: [null, stdout, stderr],
    stdout,
    stderr,
    status,
    signal: null,
  };
}

describe("runReplGitSafeCheck", () => {
  const rootDir = "/tmp/project";
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockedPromptSync.mockReset();
    mockedSpawnSync.mockReset();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("continues immediately when git mode is unsafe", () => {
    const result = runReplGitSafeCheck({ gitMode: "unsafe" }, rootDir);

    expect(result).toBe(true);
    expect(mockedSpawnSync).not.toHaveBeenCalled();
    expect(mockedPromptSync).not.toHaveBeenCalled();
  });

  it("warns and continues when the directory is not inside a git repository", () => {
    mockedSpawnSync.mockReturnValue(
      createSpawnResult(128, "", "fatal: not a git repository"),
    );

    const result = runReplGitSafeCheck({ gitMode: "safe" }, rootDir);

    expect(result).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`"${rootDir}" is not inside a git repository`),
    );
  });

  it("continues without prompting when there are no uncommitted changes", () => {
    mockedSpawnSync
      .mockReturnValueOnce(createSpawnResult(0, "true\n"))
      .mockReturnValueOnce(createSpawnResult(0, ""));

    const result = runReplGitSafeCheck({ gitMode: "safe" }, rootDir);

    expect(result).toBe(true);
    expect(mockedPromptSync).not.toHaveBeenCalled();
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      2,
      "git",
      ["status", "--porcelain", "--untracked-files=all", "--", "."],
      {
        cwd: rootDir,
        encoding: "utf-8",
        stdio: "pipe",
      },
    );
  });

  it("commits outstanding changes with the default message when the prompt is blank", () => {
    mockedPromptSync.mockReturnValue(createPromptMock("   "));
    mockedSpawnSync
      .mockReturnValueOnce(createSpawnResult(0, "true\n"))
      .mockReturnValueOnce(createSpawnResult(0, " M src/index.ts\n"))
      .mockReturnValueOnce(createSpawnResult(0, ""))
      .mockReturnValueOnce(createSpawnResult(0, "[main abc123] startup save\n"));

    const result = runReplGitSafeCheck({ gitMode: "safe" }, rootDir);

    expect(result).toBe(true);
    expect(mockedPromptSync).toHaveBeenCalledWith({ sigint: true });
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      3,
      "git",
      ["add", "--all", "--", "."],
      {
        cwd: rootDir,
        encoding: "utf-8",
        stdio: "pipe",
      },
    );
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      4,
      "git",
      [
        "commit",
        "-m",
        "saving prior changes on almost-codex startup",
      ],
      {
        cwd: rootDir,
        encoding: "utf-8",
        stdio: "pipe",
      },
    );
    expect(logSpy).toHaveBeenCalledWith("Saved existing git changes before starting the REPL.");
  });

  it("exits startup when committing the existing changes fails", () => {
    mockedPromptSync.mockReturnValue(createPromptMock("checkpoint"));
    mockedSpawnSync
      .mockReturnValueOnce(createSpawnResult(0, "true\n"))
      .mockReturnValueOnce(createSpawnResult(0, "?? notes.md\n"))
      .mockReturnValueOnce(createSpawnResult(0, ""))
      .mockReturnValueOnce(createSpawnResult(1, "", "Author identity unknown"));

    const result = runReplGitSafeCheck({ gitMode: "safe" }, rootDir);

    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      "Git safe startup check failed: Author identity unknown",
    );
  });
});
