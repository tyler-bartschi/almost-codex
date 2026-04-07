import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Settings } from "../../src/global/Settings";
import { setGlobalReplState, clearGlobalReplState } from "../../src/global/ReplStateStore";
import { initializeGlobalToolRegistry } from "../../src/global/ToolRegistryStore";
import type { ReplState } from "../../src/repl/ReplExecutorTypes";
import { runTool } from "../../src/tools/ToolExecutor";

/**
 * Creates a temporary workspace directory for tool executor tests.
 * @param {string} prefix Prefix used for the temporary directory name.
 * @returns {string} The created temporary directory path.
 */
function createTempWorkspace(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Stores a REPL state fixture with real settings and an isolated root directory.
 * @param {string} rootDir Root directory exposed through the global REPL state.
 * @returns {void} Does not return a value.
 */
function setToolExecutorReplState(rootDir: string): void {
  const settings = Settings.fromSettingsFile("user_default");
  const replState: ReplState = {
    currentMode: "code",
    currentAgent: "code.orchestrator",
    rootDir,
    settings,
    shouldExit: false,
    shouldClear: false,
  };

  setGlobalReplState(replState);
}

describe("ToolExecutor", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = createTempWorkspace("tool-executor-");
    setToolExecutorReplState(tempRoot);
    initializeGlobalToolRegistry();
  });

  afterEach(() => {
    clearGlobalReplState();
    fs.rmSync(tempRoot, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it("runs an accessible read tool for the requested agent", async () => {
    fs.writeFileSync(path.join(tempRoot, "note.txt"), "hello", "utf-8");

    await expect(
      runTool("code.orchestrator", "readContext", { targetPath: "note.txt" }),
    ).resolves.toBe("hello");
  });

  it("returns an inaccessible message when the agent lacks permission for the tool", async () => {
    await expect(
      runTool("code.orchestrator", "createFile", { filePath: "note.txt", contents: "hello" }),
    ).resolves.toBe("Error - that tool is not accessible.");
  });

  it("returns an inaccessible message when the agent identifier is unknown", async () => {
    await expect(
      runTool("code.unknown", "readContext", { targetPath: "note.txt" }),
    ).resolves.toBe("Error - that tool is not accessible.");
  });

  it("returns a helpful message when a required argument is missing", async () => {
    await expect(
      runTool("code.orchestrator", "readContext", {} as Record<string, unknown>),
    ).resolves.toBe(
      'Invalid arguments for tool "readContext": missing required argument "targetPath".',
    );
  });

  it("returns a helpful message when an argument has the wrong type", async () => {
    await expect(
      runTool("code.orchestrator", "findLocation", { name: 123 as unknown as string }),
    ).resolves.toBe(
      'Invalid arguments for tool "findLocation" argument "name": expected string but received number.',
    );
  });

  it("returns a helpful message when an unexpected argument is provided", async () => {
    await expect(
      runTool("code.orchestrator", "listDirectoryTree", { extra: true }),
    ).resolves.toBe(
      'Invalid arguments for tool "listDirectoryTree": unexpected argument "extra".',
    );
  });

  it("serializes non-string tool results", async () => {
    const alphaPath = path.join(tempRoot, "alpha", "example.md");
    const betaPath = path.join(tempRoot, "beta", "example.md");

    fs.mkdirSync(path.dirname(alphaPath), { recursive: true });
    fs.mkdirSync(path.dirname(betaPath), { recursive: true });
    fs.writeFileSync(alphaPath, "alpha", "utf-8");
    fs.writeFileSync(betaPath, "beta", "utf-8");

    await expect(
      runTool("code.orchestrator", "findLocation", { name: "example.md" }),
    ).resolves.toBe(JSON.stringify(["alpha/example.md", "beta/example.md"]));
  });

  it("returns the tool error message instead of throwing", async () => {
    await expect(
      runTool("code.orchestrator", "readContext", { targetPath: "missing.txt" }),
    ).resolves.toBe("Requested file or directory cannot be found: missing.txt");
  });
});
