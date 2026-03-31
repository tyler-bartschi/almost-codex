import * as fs from "fs";
import * as path from "path";

export type ToolDefinition = Record<string, unknown> & {
  type: string;
  name: string;
};

type ToolCollection = Record<string, ToolDefinition>;

type ToolRegistryContents = {
  read: ToolCollection;
  write: ToolCollection;
};

/**
 * Loads and exposes the tool metadata declared in ToolRegistry.json.
 */
export class ToolRegistry {
  private readonly toolRegistry: ToolRegistryContents;
  private readonly readTools: ToolCollection;
  private readonly writeTools: ToolCollection;

  /**
   * Creates a tool registry from the provided ToolRegistry.json file.
   * @param {string} [registryPath] Optional path to the ToolRegistry.json file.
   * @returns {ToolRegistry} The initialized registry instance.
   */
  public constructor(registryPath?: string) {
    const resolvedRegistryPath = registryPath ?? ToolRegistry.getDefaultRegistryPath();
    const registryContents = fs.readFileSync(resolvedRegistryPath, "utf-8");
    const parsedRegistry = JSON.parse(registryContents) as Partial<ToolRegistryContents>;

    if (
      parsedRegistry.read === undefined ||
      parsedRegistry.write === undefined ||
      typeof parsedRegistry.read !== "object" ||
      typeof parsedRegistry.write !== "object" ||
      parsedRegistry.read === null ||
      parsedRegistry.write === null
    ) {
      throw new Error(`Invalid tool registry file: ${resolvedRegistryPath}`);
    }

    this.toolRegistry = {
      read: parsedRegistry.read as ToolCollection,
      write: parsedRegistry.write as ToolCollection,
    };
    this.readTools = this.toolRegistry.read;
    this.writeTools = this.toolRegistry.write;
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
   * Resolves the ToolRegistry.json path using the compiled location first and source as a fallback.
   * @returns {string} The absolute path to the tool registry JSON file.
   */
  private static getDefaultRegistryPath(): string {
    const candidatePaths = [
      path.join(__dirname, "ToolRegistry.json"),
      path.resolve(process.cwd(), "src", "tools", "ToolRegistry.json"),
    ];

    for (const candidatePath of candidatePaths) {
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    throw new Error("ToolRegistry.json could not be found.");
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
