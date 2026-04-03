import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import promptSync from "prompt-sync";
import type { Settings } from "../../../src/global/Settings";
import { FileSystemObject } from "../../../src/global/Settings";
import { clearGlobalReplState, setGlobalReplState } from "../../../src/global/ReplStateStore";
import type { ReplState } from "../../../src/repl/replExecutorTypes";
import {
  appendToFile,
  createDirectory,
  createFile,
  deleteDirectory,
  deleteFile,
} from "../../../src/tools/functions/Writing";

jest.mock("prompt-sync", () => jest.fn());

type PromptFunction = (ask: string) => string;
type PromptFactoryFunction = (config?: { sigint?: boolean }) => PromptFunction;

const mockedPromptSync = promptSync as unknown as jest.MockedFunction<PromptFactoryFunction>;

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
 * Stores a REPL state fixture for writing tool tests.
 * @param {string} rootDir Root directory to expose through the store.
 * @param {FileSystemObject[]} [protectedObjects=[]] Protected objects to expose through settings.
 * @param {FileSystemObject[]} [concealedObjects=[]] Concealed objects to expose through settings.
 * @returns {void} Does not return a value.
 */
function setWritingReplState(
  rootDir: string,
  protectedObjects: FileSystemObject[] = [],
  concealedObjects: FileSystemObject[] = [],
): void {
  const settings = {
    protectedObjects,
    concealedObjects,
  } as Settings;
  const replState: ReplState = {
    currentMode: "code",
    rootDir,
    settings,
    shouldExit: false,
    shouldClear: false,
  };

  setGlobalReplState(replState);
}

describe("Writing tools", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = createTempWorkspace("writing-tools-");
    setWritingReplState(tempRoot);
    mockedPromptSync.mockReset();
  });

  afterEach(() => {
    clearGlobalReplState();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("creates a directory within the root directory", () => {
    const directoryPath = path.join("nested", "docs");

    const createdPath = createDirectory(directoryPath);

    expect(createdPath).toBe(path.join(tempRoot, "nested", "docs"));
    expect(fs.statSync(createdPath).isDirectory()).toBe(true);
  });

  it("creates a file with contents within the root directory", () => {
    const filePath = path.join("notes", "todo.txt");

    const createdPath = createFile(filePath, "write tests");

    expect(createdPath).toBe(path.join(tempRoot, "notes", "todo.txt"));
    expect(fs.readFileSync(createdPath, "utf-8")).toBe("write tests");
  });

  it("appends contents to an existing file without overwriting existing contents", () => {
    const filePath = path.join(tempRoot, "log.txt");
    fs.writeFileSync(filePath, "first line", "utf-8");

    const updatedPath = appendToFile(filePath, "\nsecond line");

    expect(updatedPath).toBe(filePath);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("first line\nsecond line");
  });

  it("deletes an existing file within the root directory", () => {
    const filePath = path.join(tempRoot, "remove-me.txt");
    fs.writeFileSync(filePath, "temporary", "utf-8");
    const promptMock = createPromptMock("yes");
    mockedPromptSync.mockReturnValue(promptMock);

    const deletedPath = deleteFile(filePath);

    expect(deletedPath).toBe(filePath);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(promptMock).toHaveBeenCalledWith(`Delete file "${filePath}"? [y/N]: `);
  });

  it("deletes an existing directory recursively within the root directory", () => {
    const directoryPath = path.join(tempRoot, "remove-dir");
    fs.mkdirSync(path.join(directoryPath, "nested"), { recursive: true });
    fs.writeFileSync(path.join(directoryPath, "nested", "file.txt"), "temporary", "utf-8");
    const promptMock = createPromptMock("y");
    mockedPromptSync.mockReturnValue(promptMock);

    const deletedPath = deleteDirectory(directoryPath);

    expect(deletedPath).toBe(directoryPath);
    expect(fs.existsSync(directoryPath)).toBe(false);
    expect(promptMock).toHaveBeenCalledWith(`Delete directory "${directoryPath}"? [y/N]: `);
  });

  it("cancels file deletion when the user does not confirm with y or yes", () => {
    const filePath = path.join(tempRoot, "keep-me.txt");
    fs.writeFileSync(filePath, "temporary", "utf-8");
    mockedPromptSync.mockReturnValue(createPromptMock("no"));

    expect(() => deleteFile(filePath)).toThrow(
      `Deletion cancelled by user for file: ${filePath}`,
    );
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("rejects creating a file outside the root directory", () => {
    const outsidePath = path.join("..", "outside.txt");

    expect(() => createFile(outsidePath, "forbidden")).toThrow(
      `Requested file or directory cannot be found: ${outsidePath}`,
    );
  });

  it("rejects appending to a missing file within the root directory", () => {
    const missingPath = path.join(tempRoot, "missing.txt");

    expect(() => appendToFile(missingPath, "extra")).toThrow(
      `Requested file or directory cannot be found: ${missingPath}`,
    );
  });

  it("rejects writes to a protected file", () => {
    const filePath = path.join(tempRoot, "protected.txt");
    fs.writeFileSync(filePath, "locked", "utf-8");

    setWritingReplState(tempRoot, [new FileSystemObject(filePath, "file")]);

    expect(() => appendToFile(filePath, "blocked")).toThrow(
      `Path is protected and cannot be written: ${filePath}`,
    );
  });

  it("rejects writes inside a concealed directory declared relative to the root directory", () => {
    const filePath = path.join("secret", "hidden.txt");

    setWritingReplState(tempRoot, [], [new FileSystemObject("secret", "directory")]);

    expect(() => createFile(filePath, "hidden")).toThrow(
      `Path is concealed and cannot be written: ${path.join(tempRoot, filePath)}`,
    );
  });

  it("rejects creating a directory inside a protected directory", () => {
    const protectedDirectoryPath = path.join(tempRoot, "protected-area");
    fs.mkdirSync(protectedDirectoryPath);

    setWritingReplState(tempRoot, [new FileSystemObject("protected-area", "directory")]);

    expect(() => createDirectory(path.join("protected-area", "child"))).toThrow(
      `Path is protected and cannot be written: ${path.join(tempRoot, "protected-area", "child")}`,
    );
  });

  it("rejects deleting a protected directory", () => {
    const protectedDirectoryPath = path.join(tempRoot, "protected-area");
    fs.mkdirSync(protectedDirectoryPath);

    setWritingReplState(tempRoot, [new FileSystemObject("protected-area", "directory")]);

    expect(() => deleteDirectory(protectedDirectoryPath)).toThrow(
      `Path is protected and cannot be written: ${protectedDirectoryPath}`,
    );
  });
});
