import * as fs from "fs";
import * as path from "path";

export type ToolDefinition = Record<string, unknown> & {
  type: string;
  name: string;
};

type ToolCollection = Record<string, ToolDefinition>;
type ToolCategory = "read" | "write" | "script" | "savePlan" | "readPlan" | "spawnAgent";

type ToolRegistryContents = {
  read: ToolCollection;
  write: ToolCollection;
  scripts: ToolCollection;
  savePlan: ToolCollection;
  readPlan: ToolCollection;
  spawnAgent: ToolCollection;
};

const REQUIRED_TOOL_REGISTRY_SECTIONS = [
  "read",
  "write",
  "scripts",
  "savePlan",
  "readPlan",
  "spawnAgent",
] as const;

/**
 * Loads and exposes the tool metadata declared in ToolRegistry.json.
 */
export class ToolRegistry {
  private readonly toolRegistry: ToolRegistryContents;
  private readonly readTools: ToolCollection;
  private readonly writeTools: ToolCollection;
  private readonly scriptTools: ToolCollection;
  private readonly savePlanTools: ToolCollection;
  private readonly readPlanTools: ToolCollection;
  private readonly spawnAgentTools: ToolCollection;

  /**
   * Creates a tool registry from the provided ToolRegistry.json file.
   * @param {string} [registryPath] Optional path to the ToolRegistry.json file.
   * @returns {ToolRegistry} The initialized registry instance.
   */
  public constructor(registryPath?: string) {
    const resolvedRegistryPath = registryPath ?? ToolRegistry.getDefaultRegistryPath();
    const registryContents = fs.readFileSync(resolvedRegistryPath, "utf-8");
    const parsedRegistry = ToolRegistry.validateToolRegistryContents(
      JSON.parse(registryContents),
      resolvedRegistryPath,
    );

    this.toolRegistry = {
      read: parsedRegistry.read,
      write: parsedRegistry.write,
      scripts: parsedRegistry.scripts,
      savePlan: parsedRegistry.savePlan,
      readPlan: parsedRegistry.readPlan,
      spawnAgent: parsedRegistry.spawnAgent,
    };
    this.readTools = this.toolRegistry.read;
    this.writeTools = this.toolRegistry.write;
    this.scriptTools = this.toolRegistry.scripts;
    this.savePlanTools = this.toolRegistry.savePlan;
    this.readPlanTools = this.toolRegistry.readPlan;
    this.spawnAgentTools = this.toolRegistry.spawnAgent;
  }

  /**
   * Returns the registered read tools, excluding any requested tool names.
   * @param {string[]} [excludedTools=[]] Tool names to omit from the result.
   * @returns {ToolDefinition[]} The read tool definitions without their outer registry keys.
   */
  public getReadTools(excludedTools: string[] = []): ToolDefinition[] {
    return this.filterTools(this.readTools, excludedTools);
  }

  /**
   * Returns the registered write tools, excluding any requested tool names.
   * @param {string[]} [excludedTools=[]] Tool names to omit from the result.
   * @returns {ToolDefinition[]} The write tool definitions without their outer registry keys.
   */
  public getWriteTools(excludedTools: string[] = []): ToolDefinition[] {
    return this.filterTools(this.writeTools, excludedTools);
  }

  /**
   * Returns the registered script tools, excluding any requested tool names.
   * @param {string[]} [excludedTools=[]] Tool names to omit from the result.
   * @returns {ToolDefinition[]} The script tool definitions without their outer registry keys.
   */
  public getScriptTools(excludedTools: string[] = []): ToolDefinition[] {
    return this.filterTools(this.scriptTools, excludedTools);
  }

  /**
   * Returns the registered save-plan tools, excluding any requested tool names.
   * @param {string[]} [excludedTools=[]] Tool names to omit from the result.
   * @returns {ToolDefinition[]} The save-plan tool definitions without their outer registry keys.
   */
  public getSavePlanTools(excludedTools: string[] = []): ToolDefinition[] {
    return this.filterTools(this.savePlanTools, excludedTools);
  }

  /**
   * Returns the registered read-plan tools, excluding any requested tool names.
   * @param {string[]} [excludedTools=[]] Tool names to omit from the result.
   * @returns {ToolDefinition[]} The read-plan tool definitions without their outer registry keys.
   */
  public getReadPlanTools(excludedTools: string[] = []): ToolDefinition[] {
    return this.filterTools(this.readPlanTools, excludedTools);
  }

  /**
   * Returns the registered spawn-agent tools, excluding any requested tool names.
   * @param {string[]} [excludedTools=[]] Tool names to omit from the result.
   * @returns {ToolDefinition[]} The spawn-agent tool definitions without their outer registry keys.
   */
  public getSpawnAgent(excludedTools: string[] = []): ToolDefinition[] {
    return this.filterTools(this.spawnAgentTools, excludedTools);
  }

  /**
   * Verifies whether a tool name exists in any of the requested tool categories.
   * @param {ToolCategory[]} categories Tool categories to search.
   * @param {string} toolName Tool name to verify.
   * @returns {boolean} `true` when the tool exists in at least one requested category; otherwise `false`.
   */
  public verifyTool(categories: ToolCategory[], toolName: string): boolean {
    const toolCollections = categories.map((category) => this.getToolCollectionForCategory(category));

    return toolCollections.some((tools) => toolName in tools);
  }

  /**
   * Resolves the ToolRegistry.json path using the compiled location first and source as a fallback.
   * @returns {string} The absolute path to the tool registry JSON file.
   */
  private static getDefaultRegistryPath(): string {
    const candidatePaths = [
      path.join(__dirname, "ToolRegistry.json"),
      path.resolve(process.cwd(), "src", "tools", "registry", "ToolRegistry.json"),
    ];

    for (const candidatePath of candidatePaths) {
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    throw new Error("ToolRegistry.json could not be found.");
  }

  /**
   * Validates the parsed tool registry JSON and returns a typed registry object.
   * @param {unknown} value Parsed JSON value to validate.
   * @param {string} registryPath Registry path used in validation error messages.
   * @returns {ToolRegistryContents} The validated tool registry contents.
   * @throws {Error} Thrown when the tool registry is missing a required section or has an invalid section shape.
   */
  private static validateToolRegistryContents(
    value: unknown,
    registryPath: string,
  ): ToolRegistryContents {
    if (!ToolRegistry.isRecord(value)) {
      throw new Error(`Invalid tool registry file: ${registryPath}`);
    }

    for (const sectionName of REQUIRED_TOOL_REGISTRY_SECTIONS) {
      ToolRegistry.validateToolCollectionSection(value[sectionName], sectionName, registryPath);
    }

    return value as ToolRegistryContents;
  }

  /**
   * Validates a single top-level tool collection section from the registry.
   * @param {unknown} sectionValue Parsed section value to validate.
   * @param {(typeof REQUIRED_TOOL_REGISTRY_SECTIONS)[number]} sectionName Top-level section name being checked.
   * @param {string} registryPath Registry path used in validation error messages.
   * @returns {void} Does not return a value.
   * @throws {Error} Thrown when the section is missing or not an object.
   */
  private static validateToolCollectionSection(
    sectionValue: unknown,
    sectionName: (typeof REQUIRED_TOOL_REGISTRY_SECTIONS)[number],
    registryPath: string,
  ): void {
    if (!ToolRegistry.isRecord(sectionValue)) {
      throw new Error(`Invalid tool registry file: ${registryPath} (${sectionName})`);
    }
  }

  /**
   * Determines whether a parsed JSON value is a non-null object record.
   * @param {unknown} value Parsed JSON value to inspect.
   * @returns {value is Record<string, unknown>} `true` when the value is a non-null object record and not an array.
   */
  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * Resolves a public tool category name to its internal tool collection.
   * @param {ToolCategory} category Tool category to resolve.
   * @returns {ToolCollection} The matching tool collection.
   */
  private getToolCollectionForCategory(category: ToolCategory): ToolCollection {
    switch (category) {
      case "read":
        return this.readTools;
      case "write":
        return this.writeTools;
      case "script":
        return this.scriptTools;
      case "savePlan":
        return this.savePlanTools;
      case "readPlan":
        return this.readPlanTools;
      case "spawnAgent":
        return this.spawnAgentTools;
    }
  }

  /**
   * Filters a tool collection and returns cloned tool definitions without their registry keys.
   * @param {ToolCollection} tools Tool collection to filter.
   * @param {string[]} excludedTools Tool names to omit from the result.
   * @returns {ToolDefinition[]} The filtered tool definitions.
   */
  private filterTools(tools: ToolCollection, excludedTools: string[]): ToolDefinition[] {
    const excludedToolSet = new Set(excludedTools);

    return Object.values(tools)
      .filter((tool) => !excludedToolSet.has(tool.name))
      .map((tool) => ({ ...tool }));
  }
}
