import * as fs from "fs";
import * as path from "path";
import type { FileSystemObject } from "../../global/Settings";

export type RestrictedObjectLike = Pick<FileSystemObject, "path" | "type">;

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
