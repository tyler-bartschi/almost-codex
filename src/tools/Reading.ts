import * as fs from "fs";
import * as path from "path";
import type { RestrictedObjectLike } from "./ToolUtils";
import { isRestrictedPath, resolvePathWithinRoot } from "./ToolUtils";

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
 * Reads a file or directory after enforcing concealment rules.
 * @param {string} targetPath File or directory path to read.
 * @param {string} rootDir Absolute root directory from which access is allowed.
 * @param {ConcealedObjectLike[]} concealedObjects Concealed filesystem objects that cannot be read.
 * @returns {string} The file contents or concatenated directory contents.
 */
export function readContext(
  targetPath: string,
  rootDir: string,
  concealedObjects: RestrictedObjectLike[],
): string {
  const resolvedTargetPath = resolvePathWithinRoot(targetPath, rootDir);

  if (isRestrictedPath(resolvedTargetPath, rootDir, concealedObjects)) {
    throw new Error(`Path is concealed and cannot be read: ${targetPath}`);
  }

  const targetStats = fs.statSync(resolvedTargetPath);
  if (targetStats.isDirectory()) {
    return readDirectory(resolvedTargetPath);
  }

  return readFile(resolvedTargetPath);
}

/**
 * Recursively finds all files or directories whose base name matches the requested name.
 * @param {string} name File or directory name to match.
 * @param {string} rootDir Absolute root directory from which to search.
 * @returns {string[]} Relative paths from the root directory for every matching filesystem object.
 */
export function findLocation(name: string, rootDir: string): string[] {
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

  return matches.sort((leftPath, rightPath) => leftPath.localeCompare(rightPath));
}
