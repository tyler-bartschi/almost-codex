import * as fs from "fs";
import * as path from "path";
import promptSync from "prompt-sync";
import type { RestrictedObjectLike } from "./ToolUtils";
import { isRestrictedPath, resolvePathWithinRoot } from "./ToolUtils";

/**
 * Verifies that a target path is not protected or concealed before a write operation proceeds.
 * @param {string} targetPath Absolute target path being modified.
 * @param {string} rootDir Absolute root directory from which access is allowed.
 * @param {RestrictedObjectLike[]} protectedObjects Protected filesystem objects that cannot be modified.
 * @param {RestrictedObjectLike[]} concealedObjects Concealed filesystem objects that cannot be modified.
 * @returns {void} No return value.
 */
function assertWritableTarget(
  targetPath: string,
  rootDir: string,
  protectedObjects: RestrictedObjectLike[],
  concealedObjects: RestrictedObjectLike[],
): void {
  if (isRestrictedPath(targetPath, rootDir, protectedObjects)) {
    throw new Error(`Path is protected and cannot be written: ${targetPath}`);
  }

  if (isRestrictedPath(targetPath, rootDir, concealedObjects)) {
    throw new Error(`Path is concealed and cannot be written: ${targetPath}`);
  }
}

/**
 * Prompts the user to confirm a destructive delete operation.
 * @param {"file" | "directory"} targetType Filesystem object type being deleted.
 * @param {string} targetPath Absolute path of the filesystem object being deleted.
 * @returns {void} No return value.
 */
function confirmDeletion(targetType: "file" | "directory", targetPath: string): void {
  const prompt = promptSync({ sigint: true });
  const response = prompt(`Delete ${targetType} "${targetPath}"? [y/N]: `).trim().toLowerCase();

  if (response !== "y" && response !== "yes") {
    throw new Error(`Deletion cancelled by user for ${targetType}: ${targetPath}`);
  }
}

/**
 * Creates a directory within the root directory.
 * @param {string} directoryPath Directory path to create.
 * @param {string} rootDir Absolute root directory from which access is allowed.
 * @param {RestrictedObjectLike[]} protectedObjects Protected filesystem objects that cannot be modified.
 * @param {RestrictedObjectLike[]} concealedObjects Concealed filesystem objects that cannot be modified.
 * @returns {string} The absolute created directory path.
 */
export function createDirectory(
  directoryPath: string,
  rootDir: string,
  protectedObjects: RestrictedObjectLike[],
  concealedObjects: RestrictedObjectLike[],
): string {
  const resolvedDirectoryPath = resolvePathWithinRoot(directoryPath, rootDir, false);
  assertWritableTarget(resolvedDirectoryPath, rootDir, protectedObjects, concealedObjects);
  fs.mkdirSync(resolvedDirectoryPath, { recursive: true });
  return resolvedDirectoryPath;
}

/**
 * Creates a file within the root directory and writes optional contents to it.
 * @param {string} filePath File path to create.
 * @param {string} rootDir Absolute root directory from which access is allowed.
 * @param {RestrictedObjectLike[]} protectedObjects Protected filesystem objects that cannot be modified.
 * @param {RestrictedObjectLike[]} concealedObjects Concealed filesystem objects that cannot be modified.
 * @param {string} [contents=""] Text to write into the created file.
 * @returns {string} The absolute created file path.
 */
export function createFile(
  filePath: string,
  rootDir: string,
  protectedObjects: RestrictedObjectLike[],
  concealedObjects: RestrictedObjectLike[],
  contents: string = "",
): string {
  const resolvedFilePath = resolvePathWithinRoot(filePath, rootDir, false);
  assertWritableTarget(resolvedFilePath, rootDir, protectedObjects, concealedObjects);
  fs.mkdirSync(path.dirname(resolvedFilePath), { recursive: true });
  fs.writeFileSync(resolvedFilePath, contents, "utf-8");
  return resolvedFilePath;
}

/**
 * Appends contents to an existing file within the root directory.
 * @param {string} filePath Existing file path to append to.
 * @param {string} rootDir Absolute root directory from which access is allowed.
 * @param {RestrictedObjectLike[]} protectedObjects Protected filesystem objects that cannot be modified.
 * @param {RestrictedObjectLike[]} concealedObjects Concealed filesystem objects that cannot be modified.
 * @param {string} contents Text to append to the file.
 * @returns {string} The absolute modified file path.
 */
export function appendToFile(
  filePath: string,
  rootDir: string,
  protectedObjects: RestrictedObjectLike[],
  concealedObjects: RestrictedObjectLike[],
  contents: string,
): string {
  const resolvedFilePath = resolvePathWithinRoot(filePath, rootDir);
  assertWritableTarget(resolvedFilePath, rootDir, protectedObjects, concealedObjects);
  fs.appendFileSync(resolvedFilePath, contents, "utf-8");
  return resolvedFilePath;
}

/**
 * Deletes a file within the root directory.
 * @param {string} filePath File path to delete.
 * @param {string} rootDir Absolute root directory from which access is allowed.
 * @param {RestrictedObjectLike[]} protectedObjects Protected filesystem objects that cannot be modified.
 * @param {RestrictedObjectLike[]} concealedObjects Concealed filesystem objects that cannot be modified.
 * @returns {string} The absolute deleted file path.
 */
export function deleteFile(
  filePath: string,
  rootDir: string,
  protectedObjects: RestrictedObjectLike[],
  concealedObjects: RestrictedObjectLike[],
): string {
  const resolvedFilePath = resolvePathWithinRoot(filePath, rootDir);
  assertWritableTarget(resolvedFilePath, rootDir, protectedObjects, concealedObjects);
  confirmDeletion("file", resolvedFilePath);
  fs.unlinkSync(resolvedFilePath);
  return resolvedFilePath;
}

/**
 * Deletes a directory recursively within the root directory.
 * @param {string} directoryPath Directory path to delete.
 * @param {string} rootDir Absolute root directory from which access is allowed.
 * @param {RestrictedObjectLike[]} protectedObjects Protected filesystem objects that cannot be modified.
 * @param {RestrictedObjectLike[]} concealedObjects Concealed filesystem objects that cannot be modified.
 * @returns {string} The absolute deleted directory path.
 */
export function deleteDirectory(
  directoryPath: string,
  rootDir: string,
  protectedObjects: RestrictedObjectLike[],
  concealedObjects: RestrictedObjectLike[],
): string {
  const resolvedDirectoryPath = resolvePathWithinRoot(directoryPath, rootDir);
  assertWritableTarget(resolvedDirectoryPath, rootDir, protectedObjects, concealedObjects);
  confirmDeletion("directory", resolvedDirectoryPath);
  fs.rmSync(resolvedDirectoryPath, { recursive: true, force: false });
  return resolvedDirectoryPath;
}
