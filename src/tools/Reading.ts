import * as fs from "fs";
import * as path from "path";
import type { FileSystemObject } from "../global/Settings";

type ConcealedObjectLike = Pick<FileSystemObject, "path" | "type">;

/**
 * Returns normalized path variants used when comparing concealed entries.
 * @param {string} targetPath Raw path supplied by the caller or settings.
 * @returns {string[]} Normalized comparison variants for the provided path.
 */
function getPathVariants(targetPath: string): string[] {
  const normalizedPath = path.normalize(targetPath);
  const resolvedPath = path.resolve(targetPath);
  const variants = [targetPath, normalizedPath, resolvedPath];

  try {
    variants.push(fs.realpathSync.native(targetPath));
  } catch {
    try {
      variants.push(fs.realpathSync(targetPath));
    } catch {
      // Ignore paths that do not exist when canonicalizing.
    }
  }

  return Array.from(new Set(variants));
}

/**
 * Determines whether a candidate path is equal to or nested within a parent directory path.
 * @param {string} candidatePath Path being evaluated.
 * @param {string} parentPath Potential parent directory path.
 * @returns {boolean} `true` when `candidatePath` equals or is contained by `parentPath`.
 */
function isSameOrNestedPath(candidatePath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

/**
 * Determines whether the requested path is concealed by exact match or by a concealed parent directory.
 * @param {string} requestedPath File or directory path requested by the caller.
 * @param {ConcealedObjectLike[]} concealedObjects Concealed filesystem objects to enforce.
 * @returns {boolean} `true` when the requested path should not be accessible.
 */
function isConcealed(
  requestedPath: string,
  concealedObjects: ConcealedObjectLike[],
): boolean {
  const requestedVariants = getPathVariants(requestedPath);

  return concealedObjects.some((concealedObject) => {
    const concealedVariants = getPathVariants(concealedObject.path);

    if (concealedVariants.some((variant) => requestedVariants.includes(variant))) {
      return true;
    }

    if (concealedObject.type !== "directory") {
      return false;
    }

    return requestedVariants.some((requestedVariant) =>
      concealedVariants.some((concealedVariant) =>
        isSameOrNestedPath(requestedVariant, concealedVariant),
      ),
    );
  });
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
 * Reads a file or directory after enforcing concealment rules.
 * @param {string} targetPath File or directory path to read.
 * @param {ConcealedObjectLike[]} concealedObjects Concealed filesystem objects that cannot be read.
 * @returns {string} The file contents or concatenated directory contents.
 */
export function readContext(
  targetPath: string,
  concealedObjects: ConcealedObjectLike[],
): string {
  if (isConcealed(targetPath, concealedObjects)) {
    return `Path is concealed and cannot be read: ${targetPath}`;
  }

  const targetStats = fs.statSync(targetPath);
  if (targetStats.isDirectory()) {
    return readDirectory(targetPath);
  }

  return readFile(targetPath);
}

/**
 * Recursively finds all files or directories whose base name matches the requested name.
 * @param {string} name File or directory name to match.
 * @param {string} rootDirectory Absolute root directory from which to search.
 * @returns {string[]} Relative paths from the root directory for every matching filesystem object.
 */
export function findLocation(name: string, rootDirectory: string): string[] {
  if (!path.isAbsolute(rootDirectory)) {
    throw new Error(`Root directory must be an absolute path: ${rootDirectory}`);
  }

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
        matches.push(path.relative(rootDirectory, entryPath));
      }

      if (entry.isDirectory()) {
        walk(entryPath);
      }
    }
  }

  walk(rootDirectory);
  return matches.sort((leftPath, rightPath) => leftPath.localeCompare(rightPath));
}
