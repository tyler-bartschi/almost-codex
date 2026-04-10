import * as fs from "fs";
import * as path from "path";
import promptSync from "prompt-sync";
import type { FileSystemObject } from "../../global/Settings";

export type RestrictedObjectLike = Pick<FileSystemObject, "path" | "type">;
const DEFAULT_LOG_PREVIEW_LINE_COUNT = 4;

/**
 * Returns normalized path variants used when comparing restricted entries.
 * @param {string} targetPath Raw path supplied by the caller or settings.
 * @returns {string[]} Normalized comparison variants for the provided path.
 */
export function getPathVariants(targetPath: string): string[] {
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
export function isSameOrNestedPath(candidatePath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

/**
 * Resolves a requested path against the provided root directory and optionally verifies that it exists.
 * @param {string} requestedPath File or directory path requested by the caller.
 * @param {string} rootDir Absolute root directory from which access is allowed.
 * @param {boolean} [requireExists=true] Whether the target path must already exist.
 * @returns {string} The absolute resolved path within the root directory.
 */
export function resolvePathWithinRoot(
  requestedPath: string,
  rootDir: string,
  requireExists: boolean = true,
): string {
  if (!path.isAbsolute(rootDir)) {
    throw new Error(`Root directory must be an absolute path: ${rootDir}`);
  }

  const resolvedRootDir = path.resolve(rootDir);
  const resolvedTargetPath = path.resolve(resolvedRootDir, requestedPath);

  if (!isSameOrNestedPath(resolvedTargetPath, resolvedRootDir)) {
    throw new Error(`Requested file or directory cannot be found: ${requestedPath}`);
  }

  if (requireExists && !fs.existsSync(resolvedTargetPath)) {
    throw new Error(`Requested file or directory cannot be found: ${requestedPath}`);
  }

  return resolvedTargetPath;
}

/**
 * Determines whether the requested path is restricted by exact match or by a restricted parent directory.
 * @param {string} requestedPath File or directory path requested by the caller.
 * @param {string} rootDir Absolute root directory from which access is allowed.
 * @param {RestrictedObjectLike[]} restrictedObjects Restricted filesystem objects to enforce.
 * @returns {boolean} `true` when the requested path should not be accessible.
 */
export function isRestrictedPath(
  requestedPath: string,
  rootDir: string,
  restrictedObjects: RestrictedObjectLike[],
): boolean {
  const requestedVariants = getPathVariants(requestedPath);

  return restrictedObjects.some((restrictedObject) => {
    const resolvedRestrictedPath = resolvePathWithinRoot(restrictedObject.path, rootDir, false);
    const restrictedVariants = getPathVariants(resolvedRestrictedPath);

    if (restrictedVariants.some((variant) => requestedVariants.includes(variant))) {
      return true;
    }

    if (restrictedObject.type !== "directory") {
      return false;
    }

    return requestedVariants.some((requestedVariant) =>
      restrictedVariants.some((restrictedVariant) =>
        isSameOrNestedPath(requestedVariant, restrictedVariant),
      ),
    );
  });
}

/**
 * Prompts the user to explicitly approve a risky tool action before it proceeds.
 * @param {string} promptText Prompt shown to the user.
 * @param {string} rejectionErrorMessage Error message thrown when the user declines.
 * @returns {void} Does not return a value.
 */
export function getUserVerification(promptText: string, rejectionErrorMessage: string): void {
  const prompt = promptSync({ sigint: true });
  const response = prompt(promptText).trim().toLowerCase();

  if (response !== "y" && response !== "yes") {
    throw new Error(rejectionErrorMessage);
  }
}

/**
 * Returns a short preview of multiline text for logging.
 * @param {string} text Full text content being logged.
 * @param {number} [lineCount=DEFAULT_LOG_PREVIEW_LINE_COUNT] Number of lines to include in the preview.
 * @returns {string} The first requested lines, plus an omission marker when truncated.
 */
export function createLogPreview(
  text: string,
  lineCount: number = DEFAULT_LOG_PREVIEW_LINE_COUNT,
): string {
  const lines = text.split("\n");
  const preview = lines.slice(0, lineCount).join("\n");

  return lines.length > lineCount ? `${preview}\n...` : preview;
}

/**
 * Logs a callable tool invocation with its name and parameters.
 * @param {string} toolName Registered tool name being executed.
 * @param {Record<string, unknown>} parameters Parameters received by the tool.
 * @returns {void} No return value.
 */
export function logToolCall(toolName: string, parameters: Record<string, unknown>): void {
  console.log(`[Tool:${toolName}] called with parameters:`, parameters);
}

/**
 * Logs that a callable tool is about to return.
 * @param {string} toolName Registered tool name being executed.
 * @returns {void} No return value.
 */
export function logToolReturn(toolName: string): void {
  console.log(`[Tool:${toolName}] about to return`);
}
