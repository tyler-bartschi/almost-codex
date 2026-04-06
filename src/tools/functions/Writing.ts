import * as fs from "fs";
import * as path from "path";
import {
  getGlobalReplConcealedObjects,
  getGlobalReplProtectedObjects,
  getGlobalReplRootDir,
} from "../../global/ReplStateStore";
import {
  getUserVerification,
  isRestrictedPath,
  resolvePathWithinRoot,
} from "../utils/ToolUtils";

/**
 * Verifies that a target path is not protected or concealed before a write operation proceeds.
 * @param {string} targetPath Absolute target path being modified.
 * @returns {void} No return value.
 */
function assertWritableTarget(targetPath: string): void {
  const rootDir = getGlobalReplRootDir();
  const protectedObjects = getGlobalReplProtectedObjects();
  const concealedObjects = getGlobalReplConcealedObjects();

  if (isRestrictedPath(targetPath, rootDir, protectedObjects)) {
    throw new Error(`Path is protected and cannot be written: ${targetPath}`);
  }

  if (isRestrictedPath(targetPath, rootDir, concealedObjects)) {
    throw new Error(`Path is concealed and cannot be written: ${targetPath}`);
  }
}

/**
 * Creates a directory within the root directory.
 * @param {string} directoryPath Directory path to create.
 * @returns {string} The absolute created directory path.
 */
export function createDirectory(directoryPath: string): string {
  const rootDir = getGlobalReplRootDir();
  const resolvedDirectoryPath = resolvePathWithinRoot(
    directoryPath,
    rootDir,
    false,
  );
  assertWritableTarget(resolvedDirectoryPath);
  fs.mkdirSync(resolvedDirectoryPath, { recursive: true });
  return resolvedDirectoryPath;
}

/**
 * Creates a file within the root directory and writes optional contents to it.
 * @param {string} filePath File path to create.
 * @param {string} [contents=""] Text to write into the created file.
 * @returns {string} The absolute created file path.
 */
export function createFile(filePath: string, contents: string = ""): string {
  const rootDir = getGlobalReplRootDir();
  const resolvedFilePath = resolvePathWithinRoot(filePath, rootDir, false);
  assertWritableTarget(resolvedFilePath);
  fs.mkdirSync(path.dirname(resolvedFilePath), { recursive: true });
  fs.writeFileSync(resolvedFilePath, contents, "utf-8");
  return resolvedFilePath;
}

/**
 * Appends contents to an existing file within the root directory.
 * @param {string} filePath Existing file path to append to.
 * @param {string} contents Text to append to the file.
 * @returns {string} The absolute modified file path.
 */
export function appendToFile(filePath: string, contents: string): string {
  const rootDir = getGlobalReplRootDir();
  const resolvedFilePath = resolvePathWithinRoot(filePath, rootDir);
  assertWritableTarget(resolvedFilePath);
  fs.appendFileSync(resolvedFilePath, contents, "utf-8");
  return resolvedFilePath;
}

/**
 * Deletes a file within the root directory.
 * @param {string} filePath File path to delete.
 * @returns {string} The absolute deleted file path.
 */
export function deleteFile(filePath: string): string {
  const rootDir = getGlobalReplRootDir();
  const resolvedFilePath = resolvePathWithinRoot(filePath, rootDir);
  assertWritableTarget(resolvedFilePath);
  getUserVerification(
    `Delete file "${resolvedFilePath}"? [y/N]: `,
    `Deletion cancelled by user for file: ${resolvedFilePath}`,
  );
  fs.unlinkSync(resolvedFilePath);
  return resolvedFilePath;
}

/**
 * Deletes a directory recursively within the root directory.
 * @param {string} directoryPath Directory path to delete.
 * @returns {string} The absolute deleted directory path.
 */
export function deleteDirectory(directoryPath: string): string {
  const rootDir = getGlobalReplRootDir();
  const resolvedDirectoryPath = resolvePathWithinRoot(directoryPath, rootDir);
  assertWritableTarget(resolvedDirectoryPath);
  getUserVerification(
    `Delete directory "${resolvedDirectoryPath}"? [y/N]: `,
    `Deletion cancelled by user for directory: ${resolvedDirectoryPath}`,
  );
  fs.rmSync(resolvedDirectoryPath, { recursive: true, force: false });
  return resolvedDirectoryPath;
}
