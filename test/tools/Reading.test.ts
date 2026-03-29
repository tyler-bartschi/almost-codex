import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { FileSystemObject } from "../../src/global/Settings";
import {
  findLocation,
  listDirectoryTree,
  readContext,
  readDirectory,
  readFile,
} from "../../src/tools/Reading";

/**
 * Creates a temporary test workspace directory.
 * @param {string} prefix Prefix used for the temp directory name.
 * @returns {string} The created temporary directory path.
 */
function createTempWorkspace(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("Reading tools", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = createTempWorkspace("reading-tools-");
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("reads a file as a string", () => {
    const filePath = path.join(tempRoot, "note.txt");
    fs.writeFileSync(filePath, "hello world", "utf-8");

    expect(readFile(filePath)).toBe("hello world");
  });

  it("reads all direct files in a directory and combines their contents", () => {
    const directoryPath = path.join(tempRoot, "docs");
    fs.mkdirSync(directoryPath);
    fs.writeFileSync(path.join(directoryPath, "b.txt"), "second", "utf-8");
    fs.writeFileSync(path.join(directoryPath, "a.txt"), "first", "utf-8");
    fs.mkdirSync(path.join(directoryPath, "nested"));

    expect(readDirectory(directoryPath)).toBe(
      "File: a.txt\nfirst\n\nFile: b.txt\nsecond",
    );
  });

  it("reads a file through readContext when the path is not concealed", () => {
    const filePath = path.join(tempRoot, "visible.txt");
    fs.writeFileSync(filePath, "visible", "utf-8");

    expect(readContext(filePath, tempRoot, [])).toBe("visible");
  });

  it("rejects a path when it exactly matches a concealed object", () => {
    const filePath = path.join(tempRoot, "secret.txt");
    fs.writeFileSync(filePath, "hidden", "utf-8");

    expect(() =>
      readContext(filePath, tempRoot, [new FileSystemObject(filePath, "file")]),
    ).toThrow(`Path is concealed and cannot be read: ${filePath}`);
  });

  it("rejects a path when an absolute request is inside a relative concealed directory", () => {
    const originalCwd = process.cwd();
    const projectRoot = path.join(tempRoot, "project");
    const concealedDirectory = path.join(projectRoot, "src", "secret");
    const filePath = path.join(concealedDirectory, "hidden.txt");

    fs.mkdirSync(concealedDirectory, { recursive: true });
    fs.writeFileSync(filePath, "hidden", "utf-8");
    process.chdir(projectRoot);

    try {
      expect(() =>
        readContext(filePath, projectRoot, [
          new FileSystemObject(path.join("src", "secret"), "directory"),
        ]),
      ).toThrow(`Path is concealed and cannot be read: ${filePath}`);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("rejects a file request when the target is outside the root directory", () => {
    const filePath = path.join(tempRoot, "outside.txt");
    fs.writeFileSync(filePath, "outside", "utf-8");
    const nestedRoot = path.join(tempRoot, "project");
    fs.mkdirSync(nestedRoot);

    expect(() => readContext(filePath, nestedRoot, [])).toThrow(
      `Requested file or directory cannot be found: ${filePath}`,
    );
  });

  it("rejects a file request when the target does not exist within the root directory", () => {
    const missingFilePath = path.join(tempRoot, "missing.txt");

    expect(() => readContext(missingFilePath, tempRoot, [])).toThrow(
      `Requested file or directory cannot be found: ${missingFilePath}`,
    );
  });

  it("finds matching file and directory names throughout the tree", () => {
    const alphaExample = path.join(tempRoot, "alpha", "example.md");
    const betaExample = path.join(tempRoot, "beta", "nested", "example.md");
    const srcOne = path.join(tempRoot, "src");
    const srcTwo = path.join(tempRoot, "packages", "feature", "src");

    fs.mkdirSync(path.dirname(alphaExample), { recursive: true });
    fs.mkdirSync(path.dirname(betaExample), { recursive: true });
    fs.mkdirSync(srcOne, { recursive: true });
    fs.mkdirSync(srcTwo, { recursive: true });
    fs.writeFileSync(alphaExample, "alpha", "utf-8");
    fs.writeFileSync(betaExample, "beta", "utf-8");

    expect(findLocation("example.md", tempRoot, [])).toEqual([
      path.join("alpha", "example.md"),
      path.join("beta", "nested", "example.md"),
    ]);
    expect(findLocation("src", tempRoot, [])).toEqual([
      path.join("packages", "feature", "src"),
      "src",
    ]);
  });

  it("lists the visible directory tree with nested formatting", () => {
    const docsDirectory = path.join(tempRoot, "docs");
    const nestedDirectory = path.join(docsDirectory, "guides");
    const sourceDirectory = path.join(tempRoot, "src");

    fs.mkdirSync(nestedDirectory, { recursive: true });
    fs.mkdirSync(sourceDirectory, { recursive: true });
    fs.writeFileSync(path.join(tempRoot, "README.md"), "root readme", "utf-8");
    fs.writeFileSync(path.join(docsDirectory, "overview.md"), "overview", "utf-8");
    fs.writeFileSync(path.join(nestedDirectory, "intro.md"), "intro", "utf-8");
    fs.writeFileSync(path.join(sourceDirectory, "index.ts"), "export {};", "utf-8");

    expect(listDirectoryTree(tempRoot, [])).toBe(
      `${path.basename(tempRoot)}/\n` +
        "├── docs/\n" +
        "│   ├── guides/\n" +
        "│   │   └── intro.md\n" +
        "│   └── overview.md\n" +
        "├── src/\n" +
        "│   └── index.ts\n" +
        "└── README.md",
    );
  });

  it("omits concealed files and directories from the listed tree", () => {
    const visibleDirectory = path.join(tempRoot, "visible");
    const concealedDirectory = path.join(tempRoot, "secret");
    const concealedFile = path.join(visibleDirectory, "hidden.txt");

    fs.mkdirSync(visibleDirectory, { recursive: true });
    fs.mkdirSync(concealedDirectory, { recursive: true });
    fs.writeFileSync(path.join(visibleDirectory, "shown.txt"), "shown", "utf-8");
    fs.writeFileSync(concealedFile, "hidden", "utf-8");
    fs.writeFileSync(path.join(concealedDirectory, "secret.txt"), "secret", "utf-8");

    expect(
      listDirectoryTree(tempRoot, [
        new FileSystemObject(path.join("visible", "hidden.txt"), "file"),
        new FileSystemObject("secret", "directory"),
      ]),
    ).toBe(`${path.basename(tempRoot)}/\n└── visible/\n    └── shown.txt`);
  });

  it("does not return paths for concealed objects", () => {
    const visibleExample = path.join(tempRoot, "alpha", "example.md");
    const concealedDirectory = path.join(tempRoot, "beta", "nested");
    const concealedExample = path.join(concealedDirectory, "example.md");

    fs.mkdirSync(path.dirname(visibleExample), { recursive: true });
    fs.mkdirSync(concealedDirectory, { recursive: true });
    fs.writeFileSync(visibleExample, "visible", "utf-8");
    fs.writeFileSync(concealedExample, "concealed", "utf-8");

    expect(
      findLocation("example.md", tempRoot, [
        new FileSystemObject(path.join("beta", "nested"), "directory"),
      ]),
    ).toEqual([path.join("alpha", "example.md")]);
  });

  it("rejects a findLocation request when no matching file or directory exists", () => {
    expect(() => findLocation("missing.txt", tempRoot, [])).toThrow(
      "Requested file or directory cannot be found: missing.txt",
    );
  });
});
