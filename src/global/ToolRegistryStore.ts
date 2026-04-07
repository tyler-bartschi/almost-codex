import { ToolRegistry } from "../tools/registry/ToolRegistry";

let globalToolRegistry: ToolRegistry | undefined;

/**
 * Initializes the global tool registry instance.
 * @param {string} [registryPath] Optional ToolRegistry.json path to load.
 * @returns {ToolRegistry} The initialized tool registry instance.
 */
export function initializeGlobalToolRegistry(
  registryPath?: string,
): ToolRegistry {
  globalToolRegistry = new ToolRegistry(registryPath);

  return globalToolRegistry;
}

/**
 * Returns the initialized global tool registry instance.
 * @returns {ToolRegistry} The initialized tool registry.
 * @throws {Error} Thrown when the global tool registry has not been initialized.
 */
export function getGlobalToolRegistry(): ToolRegistry {
  if (globalToolRegistry === undefined) {
    throw new Error("Global tool registry has not been initialized.");
  }

  return globalToolRegistry;
}
