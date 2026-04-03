import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Settings } from "../../../src/global/Settings";
import { clearGlobalReplState, setGlobalReplState } from "../../../src/global/ReplStateStore";
import type { ReplState } from "../../../src/repl/replExecutorTypes";
import { readPlan, savePlan } from "../../../src/tools/functions/Planning";

jest.mock("fs", () => {
  const actualFs = jest.requireActual("fs") as typeof import("fs");

  return {
    ...actualFs,
    writeFileSync: jest.fn(actualFs.writeFileSync),
  };
});

const mockedWriteFileSync = fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>;

/**
 * Creates a temporary test workspace directory.
 * @param {string} prefix Prefix used for the temp directory name.
 * @returns {string} The created temporary directory path.
 */
function createTempWorkspace(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Stores a REPL state fixture for planning tool tests.
 * @param {string} rootDir Root directory to expose through the store.
 * @returns {void} Does not return a value.
 */
function setPlanningReplState(rootDir: string): void {
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

describe("Planning tools", () => {
  let tempRoot: string;

  beforeEach(() => {
    jest.useFakeTimers();
    tempRoot = createTempWorkspace("planning-tools-");
    setPlanningReplState(tempRoot);
    mockedWriteFileSync.mockReset();
    mockedWriteFileSync.mockImplementation(jest.requireActual("fs").writeFileSync);
  });

  afterEach(() => {
    jest.useRealTimers();
    clearGlobalReplState();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("creates the agent-plans directory when it is missing and writes the plan content", () => {
    jest.setSystemTime(new Date(2026, 3, 2, 14, 5, 6, 789));

    const fileName = savePlan("roadmap", "# Plan");
    const expectedFileName = "roadmap-2026-04-02T14:05:06.789.md";
    const planDirectoryPath = path.join(tempRoot, "agent-plans");
    const planFilePath = path.join(planDirectoryPath, expectedFileName);

    expect(fileName).toBe(expectedFileName);
    expect(fs.statSync(planDirectoryPath).isDirectory()).toBe(true);
    expect(fs.readFileSync(planFilePath, "utf-8")).toBe("# Plan");
  });

  it("reuses an existing agent-plans directory and writes a new plan file into it", () => {
    jest.setSystemTime(new Date(2026, 3, 2, 8, 9, 10, 11));
    const planDirectoryPath = path.join(tempRoot, "agent-plans");
    fs.mkdirSync(planDirectoryPath, { recursive: true });
    fs.writeFileSync(path.join(planDirectoryPath, "existing.md"), "keep", "utf-8");

    const fileName = savePlan("notes", "content");

    expect(fileName).toBe("notes-2026-04-02T08:09:10.011.md");
    expect(fs.readFileSync(path.join(planDirectoryPath, "existing.md"), "utf-8")).toBe("keep");
    expect(fs.readFileSync(path.join(planDirectoryPath, fileName), "utf-8")).toBe("content");
  });

  it("throws a clear error when the generated plan file name is already taken", () => {
    mockedWriteFileSync.mockImplementation(
      (
        file: fs.PathOrFileDescriptor,
        data: string | NodeJS.ArrayBufferView,
        options?: fs.WriteFileOptions,
      ): void => {
        const error = new Error("exists") as NodeJS.ErrnoException;
        error.code = "EEXIST";
        throw error;
      },
    );

    expect(() => savePlan("retry", "plan body")).toThrow(
      "File name already taken. Please try again with a different file name",
    );
  });

  it("reads an existing plan file from the agent-plans directory", () => {
    const planDirectoryPath = path.join(tempRoot, "agent-plans");
    const planFilePath = path.join(planDirectoryPath, "saved-plan.md");
    fs.mkdirSync(planDirectoryPath, { recursive: true });
    fs.writeFileSync(planFilePath, "# Existing Plan", "utf-8");

    expect(readPlan("saved-plan.md")).toBe("# Existing Plan");
  });

  it("throws when the agent-plans directory does not exist", () => {
    expect(() => readPlan("missing-plan.md")).toThrow("The plan does not exist");
  });

  it("throws when the requested plan file does not exist", () => {
    const planDirectoryPath = path.join(tempRoot, "agent-plans");
    fs.mkdirSync(planDirectoryPath, { recursive: true });

    expect(() => readPlan("missing-plan.md")).toThrow("The plan does not exist");
  });
});
