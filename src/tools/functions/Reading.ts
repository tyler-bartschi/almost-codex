import * as fs from "fs";
import * as path from "path";
import {
  getGlobalReplConcealedObjects,
  getGlobalReplRootDir,
} from "../../global/ReplStateStore";
import type { RestrictedObjectLike } from "../utils/ToolUtils";
import {
  isRestrictedPath,
  logToolCall,
  logToolReturn,
  resolvePathWithinRoot,
} from "../utils/ToolUtils";

/**
 * Returns the root directory and concealed objects from the active REPL state.
 * @returns {[string, RestrictedObjectLike[]]} The active root directory and concealed objects tuple.
 */
function getReadingContext(): [string, RestrictedObjectLike[]] {
  return [getGlobalReplRootDir(), getGlobalReplConcealedObjects()];
}

/**
 * Reads a file and returns its contents as a UTF-8 string.
 * @param {string} filePath Path to the file to read.
 * @returns {string} The file contents.
 */
export function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Reads all direct child files within a directory and returns their combined contents.
 * @param {string} directoryPath Path to the directory to read.
 * @returns {string} A single string containing the contents of each file in the directory.
 */
export function readDirectory(directoryPath: string): string {
  const directoryEntries = fs.readdirSync(directoryPath, { withFileTypes: true });
  const fileContents: string[] = [];

  for (const entry of directoryEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile()) {
      continue;
    }

    const entryPath = path.join(directoryPath, entry.name);
    fileContents.push(`File: ${entry.name}\n${readFile(entryPath)}`);
  }

  return fileContents.join("\n\n");
}

/**
 * Lists the visible file tree beneath a root directory as a formatted string.
 * @returns {string} A formatted tree representation rooted at `rootDir`.
 */
export function listDirectoryTree(): string {
  logToolCall("listDirectoryTree", {});
  const [rootDir, concealedObjects] = getReadingContext();
  const resolvedRootDir = resolvePathWithinRoot(".", rootDir);
  const treeLines = [`${path.basename(resolvedRootDir) || resolvedRootDir}/`];

  /**
   * Appends visible descendants for the current directory to the tree output.
   * @param {string} currentDirectory Directory currently being traversed.
   * @param {string} prefix Prefix used to align nested tree branches.
   * @returns {void} No return value.
   */
  function walk(currentDirectory: string, prefix: string): void {
    const visibleEntries = fs
      .readdirSync(currentDirectory, { withFileTypes: true })
      .filter((entry) => !isRestrictedPath(path.join(currentDirectory, entry.name), rootDir, concealedObjects))
      .sort((leftEntry, rightEntry) => {
        if (leftEntry.isDirectory() !== rightEntry.isDirectory()) {
          return leftEntry.isDirectory() ? -1 : 1;
        }

        return leftEntry.name.localeCompare(rightEntry.name);
      });

    visibleEntries.forEach((entry, index) => {
      const entryPath = path.join(currentDirectory, entry.name);
      const isLastEntry = index === visibleEntries.length - 1;
      const branchPrefix = isLastEntry ? "└── " : "├── ";
      const childPrefix = isLastEntry ? "    " : "│   ";
      const displayName = entry.isDirectory() ? `${entry.name}/` : entry.name;

      treeLines.push(`${prefix}${branchPrefix}${displayName}`);

      if (entry.isDirectory()) {
        walk(entryPath, `${prefix}${childPrefix}`);
      }
    });
  }

  walk(resolvedRootDir, "");

  logToolReturn("listDirectoryTree");
  return treeLines.join("\n");
}

/**
 * Reads a file or directory after enforcing concealment rules.
 * @param {string} targetPath File or directory path to read.
 * @returns {string} The file contents or concatenated directory contents.
 */
export function readContext(targetPath: string): string {
  logToolCall("readContext", { targetPath });
  const [rootDir, concealedObjects] = getReadingContext();
  const resolvedTargetPath = resolvePathWithinRoot(targetPath, rootDir);

  if (isRestrictedPath(resolvedTargetPath, rootDir, concealedObjects)) {
    throw new Error(`Path is concealed and cannot be read: ${targetPath}`);
  }

  const targetStats = fs.statSync(resolvedTargetPath);
  if (targetStats.isDirectory()) {
    const directoryContents = readDirectory(resolvedTargetPath);
    logToolReturn("readContext");
    return directoryContents;
  }

  const fileContents = readFile(resolvedTargetPath);
  logToolReturn("readContext");
  return fileContents;
}

/**
 * Recursively finds all files or directories whose base name matches the requested name.
 * @param {string} name File or directory name to match.
 * @returns {string[]} Relative paths from the root directory for every matching filesystem object.
 */
export function findLocation(name: string): string[] {
  logToolCall("findLocation", { name });
  const [rootDir, concealedObjects] = getReadingContext();
  const resolvedRootDir = resolvePathWithinRoot(".", rootDir);

  const matches: string[] = [];

  /**
   * Walks the file tree beneath the provided directory and records matching entries.
   * @param {string} currentDirectory Directory currently being traversed.
   * @returns {void} No return value.
   */
  function walk(currentDirectory: string): void {
    const directoryEntries = fs.readdirSync(currentDirectory, { withFileTypes: true });

    for (const entry of directoryEntries) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (isRestrictedPath(entryPath, rootDir, concealedObjects)) {
        continue;
      }

      if (entry.name === name) {
        matches.push(path.relative(resolvedRootDir, entryPath));
      }

      if (entry.isDirectory()) {
        walk(entryPath);
      }
    }
  }

  walk(resolvedRootDir);

  if (matches.length === 0) {
    throw new Error(`Requested file or directory cannot be found: ${name}`);
  }

  const sortedMatches = matches.sort((leftPath, rightPath) =>
    leftPath.localeCompare(rightPath)
  );
  logToolReturn("findLocation");
  return sortedMatches;
}
