import { getGlobalReplSettings } from "../global/ReplStateStore";
import { getGlobalToolRegistry } from "../global/ToolRegistryStore";
import type {
  ToolDefinition,
  ToolParametersDefinition,
} from "./registry/ToolRegistry";
import {
  findLocation,
  listDirectoryTree,
  readContext,
} from "./functions/Reading";
import {
  appendToFile,
  createDirectory,
  createFile,
  deleteDirectory,
  deleteFile,
} from "./functions/Writing";
import { readPlan, savePlan } from "./functions/Planning";
import { runTerminal } from "./functions/Terminal";
import { spawnAgent } from "./functions/SpawnAgent";
import {
  normalizePermissionsToCategories,
  resolveAgentIdentifier,
} from "./utils/ToolUtils";

type ToolArguments = Record<string, unknown>;
type ToolImplementation = (argumentsObject: ToolArguments) => unknown | Promise<unknown>;

const INACCESSIBLE_TOOL_MESSAGE = "Error - that tool is not accessible.";

const TOOL_IMPLEMENTATIONS: Record<string, ToolImplementation> = {
  listDirectoryTree: () => listDirectoryTree(),
  findLocation: (argumentsObject) => findLocation(argumentsObject.name as string),
  readContext: (argumentsObject) => readContext(argumentsObject.targetPath as string),
  createDirectory: (argumentsObject) => createDirectory(argumentsObject.directoryPath as string),
  createFile: (argumentsObject) =>
    createFile(argumentsObject.filePath as string, argumentsObject.contents as string | undefined),
  appendToFile: (argumentsObject) =>
    appendToFile(argumentsObject.filePath as string, argumentsObject.contents as string),
  deleteFile: (argumentsObject) => deleteFile(argumentsObject.filePath as string),
  deleteDirectory: (argumentsObject) =>
    deleteDirectory(argumentsObject.directoryPath as string),
  runTerminal: (argumentsObject) => runTerminal(argumentsObject.command as string),
  savePlan: (argumentsObject) =>
    savePlan(argumentsObject.name as string, argumentsObject.content as string),
  readPlan: (argumentsObject) => readPlan(argumentsObject.filename as string),
  spawnAgent: (argumentsObject) =>
    spawnAgent(argumentsObject.agentName as never, argumentsObject.prompt as string),
};

/**
 * Returns whether a value is a plain JSON-like object.
 * @param {unknown} value Value to inspect.
 * @returns {value is Record<string, unknown>} `true` when the value is a non-null object and not an array.
 */
function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Formats a runtime value for use in argument validation messages.
 * @param {unknown} value Value to describe.
 * @returns {string} A concise type description for the provided value.
 */
function describeValueType(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

/**
 * Validates one argument value against a registry property definition.
 * @param {string} argumentName Argument name being validated.
 * @param {unknown} value Runtime value to validate.
 * @param {NonNullable<ToolParametersDefinition["properties"]>[string]} propertyDefinition Registry property definition.
 * @returns {string | undefined} A validation error message, or `undefined` when valid.
 */
function validateArgumentValue(
  argumentName: string,
  value: unknown,
  propertyDefinition: NonNullable<ToolParametersDefinition["properties"]>[string],
): string | undefined {
  if (propertyDefinition.type === undefined) {
    return undefined;
  }

  if (propertyDefinition.type === "string" && typeof value !== "string") {
    return `Invalid arguments for tool "${argumentName}": expected string but received ${describeValueType(value)}.`;
  }

  if (propertyDefinition.type === "number" && typeof value !== "number") {
    return `Invalid arguments for tool "${argumentName}": expected number but received ${describeValueType(value)}.`;
  }

  if (
    propertyDefinition.type === "integer" &&
    (typeof value !== "number" || !Number.isInteger(value))
  ) {
    return `Invalid arguments for tool "${argumentName}": expected integer but received ${describeValueType(value)}.`;
  }

  if (propertyDefinition.type === "boolean" && typeof value !== "boolean") {
    return `Invalid arguments for tool "${argumentName}": expected boolean but received ${describeValueType(value)}.`;
  }

  if (propertyDefinition.type === "object" && !isObjectRecord(value)) {
    return `Invalid arguments for tool "${argumentName}": expected object but received ${describeValueType(value)}.`;
  }

  if (propertyDefinition.type === "array" && !Array.isArray(value)) {
    return `Invalid arguments for tool "${argumentName}": expected array but received ${describeValueType(value)}.`;
  }

  return undefined;
}

/**
 * Validates one tool arguments object against the registry schema for that tool.
 * @param {string} toolName Tool name being invoked.
 * @param {ToolDefinition} toolDefinition Registry definition for the tool.
 * @param {unknown} argumentsObject Runtime argument payload to validate.
 * @returns {string | undefined} A validation error message, or `undefined` when valid.
 */
function validateToolArguments(
  toolName: string,
  toolDefinition: ToolDefinition,
  argumentsObject: unknown,
): string | undefined {
  const parameters = toolDefinition.parameters as ToolParametersDefinition | undefined;
  const required = Array.isArray(toolDefinition.required)
    ? toolDefinition.required.filter((value): value is string => typeof value === "string")
    : [];
  const additionalProperties =
    typeof parameters?.additionalProperties === "boolean"
      ? parameters.additionalProperties
      : typeof toolDefinition.additionalProperties === "boolean"
        ? toolDefinition.additionalProperties
      : undefined;

  if (parameters === undefined) {
    return undefined;
  }

  if (parameters.type !== "object") {
    return `Invalid tool schema for "${toolName}": root parameters type must be object.`;
  }

  if (!isObjectRecord(argumentsObject)) {
    return `Invalid arguments for tool "${toolName}": expected an object but received ${describeValueType(argumentsObject)}.`;
  }

  const properties = parameters.properties ?? {};
  const requiredArguments = new Set(required);

  for (const requiredArgument of requiredArguments) {
    if (!(requiredArgument in argumentsObject)) {
      return `Invalid arguments for tool "${toolName}": missing required argument "${requiredArgument}".`;
    }
  }

  if (additionalProperties === false) {
    for (const argumentName of Object.keys(argumentsObject)) {
      if (!(argumentName in properties)) {
        return `Invalid arguments for tool "${toolName}": unexpected argument "${argumentName}".`;
      }
    }
  }

  for (const [argumentName, argumentValue] of Object.entries(argumentsObject)) {
    const propertyDefinition = properties[argumentName];

    if (propertyDefinition === undefined) {
      continue;
    }

    const validationError = validateArgumentValue(
      argumentName,
      argumentValue,
      propertyDefinition,
    );

    if (validationError !== undefined) {
      return validationError.replace(`tool "${argumentName}"`, `tool "${toolName}" argument "${argumentName}"`);
    }
  }

  return undefined;
}

/**
 * Converts a tool return value into the string form expected by the agent loop.
 * @param {unknown} result Raw tool result.
 * @returns {string} A stringified representation of the tool result.
 */
function serializeToolResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  if (result === undefined) {
    return "";
  }

  return JSON.stringify(result);
}

/**
 * Executes an allowed tool call for the specified agent and returns the result as a string.
 * @param {string} fullAgentName Full agent identifier, such as `code.orchestrator`.
 * @param {string} toolName Tool name requested by the agent.
 * @param {ToolArguments} argumentsObject JSON object containing the tool arguments.
 * @returns {Promise<string>} Tool result text, or an error message string when execution fails.
 */
export async function runTool(
  fullAgentName: string,
  toolName: string,
  argumentsObject: ToolArguments,
): Promise<string> {
  try {
    let resolvedAgent;

    try {
      resolvedAgent = resolveAgentIdentifier(fullAgentName);
    } catch {
      return INACCESSIBLE_TOOL_MESSAGE;
    }

    const settings = getGlobalReplSettings();
    const agentSettings = settings.agentSettings[resolvedAgent.mode]?.[resolvedAgent.agentName];
    if (agentSettings === undefined) {
      return INACCESSIBLE_TOOL_MESSAGE;
    }

    const permissions = agentSettings.permissions;
    const categories = normalizePermissionsToCategories(permissions);
    const toolRegistry = getGlobalToolRegistry();

    if (!toolRegistry.verifyTool(categories, toolName)) {
      return INACCESSIBLE_TOOL_MESSAGE;
    }

    const toolDefinition = toolRegistry.getToolDefinition(categories, toolName);
    if (toolDefinition === undefined) {
      return INACCESSIBLE_TOOL_MESSAGE;
    }

    const argumentsValidationError = validateToolArguments(
      toolName,
      toolDefinition,
      argumentsObject,
    );
    if (argumentsValidationError !== undefined) {
      return argumentsValidationError;
    }

    const toolImplementation = TOOL_IMPLEMENTATIONS[toolName];
    if (toolImplementation === undefined) {
      return INACCESSIBLE_TOOL_MESSAGE;
    }

    const result = await toolImplementation(argumentsObject);
    return serializeToolResult(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(
      `[ToolExecutor] Caught error while running "${toolName}":`,
      error,
      `message: ${errorMessage}`,
    );
    return error instanceof Error ? error.message : String(error);
  }
}
