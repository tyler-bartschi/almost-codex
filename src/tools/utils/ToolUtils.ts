import * as fs from "fs";
import * as path from "path";
import type { ResponseInput, Tool } from "openai/resources/responses/responses";
import type { ReasoningEffort } from "openai/resources/shared";
import { getPrompt } from "../../global/PromptStore";
import { getGlobalReplSettings } from "../../global/ReplStateStore";
import { getGlobalToolRegistry } from "../../global/ToolRegistryStore";
import type {
  AgentMode,
  OpenAIModel,
  OpenAIReasoningMode,
} from "../../global/Settings";
import type { FileSystemObject } from "../../global/Settings";
import { readInlinePrompt } from "../../repl/Prompting";
import type { ToolCategory } from "../registry/ToolRegistry";

export type RestrictedObjectLike = Pick<FileSystemObject, "path" | "type">;
export interface ResolvedAgentIdentifier {
  mode: AgentMode;
  agentName: string;
}

export interface AgentExecutionContext {
  fullAgentName: string;
  mode: AgentMode;
  agentName: string;
  model: OpenAIModel;
  reasoning: Exclude<ReasoningEffort, null>;
  history: ResponseInput;
  tools: Tool[];
}

const DEFAULT_LOG_PREVIEW_LINE_COUNT = 4;

/**
 * Resolves a full agent identifier into its mode and configured agent name.
 * @param {string} fullAgentName Agent identifier in `<mode>.<agent>` form.
 * @returns {ResolvedAgentIdentifier} The resolved mode and agent name.
 */
export function resolveAgentIdentifier(fullAgentName: string): ResolvedAgentIdentifier {
  const settings = getGlobalReplSettings();
  const [mode, agentName] = fullAgentName.split(".", 2);

  if (mode === undefined || agentName === undefined || !(mode in settings.agentSettings)) {
    throw new Error(`Agent "${fullAgentName}" does not exist.`);
  }

  const typedMode = mode as AgentMode;

  if (settings.agentSettings[typedMode]?.[agentName] === undefined) {
    throw new Error(`Agent "${fullAgentName}" does not exist.`);
  }

  return { mode: typedMode, agentName };
}

/**
 * Returns the available short agent names for a mode.
 * @param {AgentMode} mode Active mode whose agent names should be listed.
 * @returns {string[]} Sorted short agent names available in that mode.
 */
export function getAvailableAgentNames(mode: AgentMode): string[] {
  const settings = getGlobalReplSettings();

  return Object.keys(settings.agentSettings[mode] ?? {}).sort();
}

/**
 * Resolves the effective model for an agent by applying default fallbacks.
 * @param {OpenAIModel | "default"} agentModel Agent-specific model setting.
 * @returns {OpenAIModel} Concrete model name to use for the agent.
 */
export function resolveAgentModel(agentModel: OpenAIModel | "default"): OpenAIModel {
  const settings = getGlobalReplSettings();

  return agentModel === "default" ? settings.defaultModel : agentModel;
}

/**
 * Resolves the effective reasoning effort for an agent by applying default fallbacks.
 * @param {OpenAIReasoningMode | "default"} agentReasoning Agent-specific reasoning setting.
 * @returns {Exclude<ReasoningEffort, null>} Concrete reasoning effort for the agent.
 */
export function resolveAgentReasoning(
  agentReasoning: OpenAIReasoningMode | "default",
): Exclude<ReasoningEffort, null> {
  const settings = getGlobalReplSettings();
  const reasoning = agentReasoning === "default" ? settings.defaultReasoning : agentReasoning;

  return reasoning as Exclude<ReasoningEffort, null>;
}

/**
 * Normalizes an agent permission token into a tool registry category.
 * @param {string} permission Permission token from agent settings.
 * @returns {ToolCategory | undefined} Matching registry category, or `undefined` when unsupported.
 */
export function normalizePermissionToCategory(permission: string): ToolCategory | undefined {
  if (
    permission === "read" ||
    permission === "write" ||
    permission === "scripts" ||
    permission === "savePlan" ||
    permission === "readPlan" ||
    permission === "spawnAgent"
  ) {
    return permission;
  }

  return undefined;
}

/**
 * Converts agent permission tokens into tool registry categories.
 * @param {string[]} permissions Permission tokens configured for the agent.
 * @returns {ToolCategory[]} Registry categories exposed to the agent.
 */
export function normalizePermissionsToCategories(permissions: string[]): ToolCategory[] {
  return permissions.reduce<ToolCategory[]>((categories, permission) => {
    const category = normalizePermissionToCategory(permission);

    if (category !== undefined) {
      categories.push(category);
    }

    return categories;
  }, []);
}

/**
 * Builds a fresh prompt history array for the specified agent.
 * @param {string} fullAgentName Full agent identifier in `<mode>.<agent>` format.
 * @returns {ResponseInput} System prompt history for the agent.
 */
export function buildAgentHistory(fullAgentName: string): ResponseInput {
  return [...getPrompt(fullAgentName)];
}

/**
 * Resolves the function tools accessible to the specified agent.
 * @param {string} fullAgentName Full agent identifier in `<mode>.<agent>` format.
 * @returns {Tool[]} Tool definitions exposed to the agent.
 */
export function buildAgentTools(fullAgentName: string): Tool[] {
  const { mode, agentName } = resolveAgentIdentifier(fullAgentName);
  const settings = getGlobalReplSettings();
  const agentSettings = settings.agentSettings[mode]?.[agentName];

  if (agentSettings === undefined) {
    throw new Error(`Agent "${fullAgentName}" does not exist.`);
  }

  const toolRegistry = getGlobalToolRegistry();
  const categories = normalizePermissionsToCategories(agentSettings.permissions);

  return toolRegistry.getToolsForCategories(categories) as Tool[];
}

/**
 * Builds the complete execution context for the specified agent.
 * @param {string} fullAgentName Full agent identifier in `<mode>.<agent>` format.
 * @returns {AgentExecutionContext} Model settings, prompt history, and allowed tools for the agent.
 */
export function buildAgentExecutionContext(fullAgentName: string): AgentExecutionContext {
  const { mode, agentName } = resolveAgentIdentifier(fullAgentName);
  const settings = getGlobalReplSettings();
  const agentSettings = settings.agentSettings[mode]?.[agentName];

  if (agentSettings === undefined) {
    throw new Error(`Agent "${fullAgentName}" does not exist.`);
  }

  return {
    fullAgentName,
    mode,
    agentName,
    model: resolveAgentModel(agentSettings.model),
    reasoning: resolveAgentReasoning(agentSettings.reasoning),
    history: buildAgentHistory(fullAgentName),
    tools: buildAgentTools(fullAgentName),
  };
}

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
 * Normalizes a requested path so references to the root directory itself resolve back to the root.
 * @param {string} requestedPath File or directory path requested by the caller.
 * @param {string} resolvedRootDir Absolute normalized root directory.
 * @returns {string} A path string safe to resolve against `resolvedRootDir`.
 */
export function normalizeRequestedPathWithinRoot(
  requestedPath: string,
  resolvedRootDir: string,
): string {
  const trimmedRequestedPath = requestedPath.trim();
  const normalizedRequestedPath = path.normalize(trimmedRequestedPath);
  const requestedPathSegments = normalizedRequestedPath
    .split(path.sep)
    .filter((segment) => segment !== "");
  const rootDirectoryName = path.basename(resolvedRootDir);

  if (
    trimmedRequestedPath === "." ||
    trimmedRequestedPath === "" ||
    path.resolve(trimmedRequestedPath) === resolvedRootDir ||
    (requestedPathSegments.length > 0 && requestedPathSegments[0] === rootDirectoryName)
  ) {
    const normalizedRelativePath = requestedPathSegments.slice(1).join(path.sep);
    return normalizedRelativePath === "" ? "." : normalizedRelativePath;
  }

  return requestedPath;
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
  const normalizedRequestedPath = normalizeRequestedPathWithinRoot(requestedPath, resolvedRootDir);
  const resolvedTargetPath = path.resolve(resolvedRootDir, normalizedRequestedPath);

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
  const response = readInlinePrompt(promptText, "[y/N]: ").trim().toLowerCase();

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
