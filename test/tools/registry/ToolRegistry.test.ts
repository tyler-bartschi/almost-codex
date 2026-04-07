import { ToolRegistry } from "../../../src/tools/registry/ToolRegistry";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

describe("ToolRegistry", () => {
  it("returns read tool definitions without their registry keys", () => {
    const toolRegistry = new ToolRegistry();

    expect(toolRegistry.getReadTools(["findLocation", "readContext"])).toEqual([
      {
        type: "function",
        name: "listDirectoryTree",
        description:
          "Lists the visible file tree beneath the project root. Returns a formatted tree representation of the visible project structure.",
        strict: true,
        parameters: {
          type: "object",
          properties: {},
        },
        required: [],
        additionalProperties: false,
      },
    ]);
  });

  it("returns write tool definitions without excluded tools", () => {
    const toolRegistry = new ToolRegistry();

    expect(toolRegistry.getWriteTools(["deleteDirectory", "deleteFile"])).toEqual([
      {
        type: "function",
        name: "appendToFile",
        description:
          "Appends text to an existing file in the accessible project area. Returns the absolute path of the modified file.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "The relative path of the file to append to.",
            },
            contents: {
              type: "string",
              description: "The text content to append to the file.",
            },
          },
        },
        required: ["filePath", "contents"],
        additionalProperties: false,
      },
      {
        type: "function",
        name: "createFile",
        description:
          "Creates a file in the accessible project area and writes the provided contents to it. Missing parent directories are created automatically. Returns the absolute path of the created file.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "The relative path of the file to create.",
            },
            contents: {
              type: "string",
              description: "The text content to write into the new file.",
            },
          },
        },
        required: ["filePath"],
        additionalProperties: false,
      },
      {
        type: "function",
        name: "createDirectory",
        description:
          "Creates a directory in the accessible project area. Missing parent directories are created automatically. Returns the absolute path of the created directory.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            directoryPath: {
              type: "string",
              description: "The relative path of the directory to create.",
            },
          },
        },
        required: ["directoryPath"],
        additionalProperties: false,
      },
    ]);
  });

  it("returns an empty read tool list when every read tool is excluded", () => {
    const toolRegistry = new ToolRegistry();

    expect(
      toolRegistry.getReadTools(["listDirectoryTree", "findLocation", "readContext"]),
    ).toEqual([]);
  });

  it("excludes only the requested write tool names", () => {
    const toolRegistry = new ToolRegistry();

    expect(toolRegistry.getWriteTools(["appendToFile", "createDirectory"])).toEqual([
      {
        type: "function",
        name: "deleteDirectory",
        description:
          "Deletes a directory recursively from the accessible project area after user confirmation. Returns the absolute path of the deleted directory.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            directoryPath: {
              type: "string",
              description: "The relative path of the directory to delete.",
            },
          },
        },
        required: ["directoryPath"],
        additionalProperties: false,
      },
      {
        type: "function",
        name: "deleteFile",
        description:
          "Deletes a file from the accessible project area after user confirmation. Returns the absolute path of the deleted file.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "The relative path of the file to delete.",
            },
          },
        },
        required: ["filePath"],
        additionalProperties: false,
      },
      {
        type: "function",
        name: "createFile",
        description:
          "Creates a file in the accessible project area and writes the provided contents to it. Missing parent directories are created automatically. Returns the absolute path of the created file.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "The relative path of the file to create.",
            },
            contents: {
              type: "string",
              description: "The text content to write into the new file.",
            },
          },
        },
        required: ["filePath"],
        additionalProperties: false,
      },
    ]);
  });

  it("returns save-plan tool definitions without excluded tools", () => {
    const toolRegistry = new ToolRegistry();

    expect(toolRegistry.getSavePlanTools()).toEqual([
      {
        type: "function",
        name: "savePlan",
        description:
          "Creates a markdown planning file under the REPL root agent-plans directory. Returns the generated planning file name once it has been written.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Base name to use for the planning file.",
            },
            content: {
              type: "string",
              description: "Markdown content to write into the planning file.",
            },
          },
        },
        required: ["name", "content"],
        additionalProperties: false,
      },
    ]);
  });

  it("returns an empty script tool list when the only script tool is excluded", () => {
    const toolRegistry = new ToolRegistry();

    expect(toolRegistry.getScriptTools(["RunTerminal"])).toEqual([]);
  });

  it("returns script tool definitions without excluded tools", () => {
    const toolRegistry = new ToolRegistry();

    expect(toolRegistry.getScriptTools()).toEqual([
      {
        type: "function",
        name: "RunTerminal",
        description:
          "Runs a UNIX-based terminal command from the accessible project root after explicit user confirmation. Returns the terminal output as a string.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The UNIX-based terminal command to execute from the project root.",
            },
          },
        },
        required: ["command"],
        additionalProperties: false,
      },
    ]);
  });

  it("returns an empty save-plan tool list when the save-plan tool is excluded", () => {
    const toolRegistry = new ToolRegistry();

    expect(toolRegistry.getSavePlanTools(["savePlan"])).toEqual([]);
  });

  it("returns read-plan tool definitions without excluded tools", () => {
    const toolRegistry = new ToolRegistry();

    expect(toolRegistry.getReadPlanTools()).toEqual([
      {
        type: "function",
        name: "readPlan",
        description:
          "Reads a markdown planning file from the root agent-plans directory. Returns the contents of the planning file.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            filename: {
              type: "string",
              description: "Planning file name to read.",
            },
          },
        },
        required: ["filename"],
        additionalProperties: false,
      },
    ]);
  });

  it("returns an empty read-plan tool list when the read-plan tool is excluded", () => {
    const toolRegistry = new ToolRegistry();

    expect(toolRegistry.getReadPlanTools(["readPlan"])).toEqual([]);
  });

  it("returns spawn-agent tool definitions without excluded tools", () => {
    const toolRegistry = new ToolRegistry();

    expect(toolRegistry.getSpawnAgent()).toEqual([
      {
        type: "function",
        name: "spawnAgent",
        description:
          "Starts a named agent with the provided prompt. Returns the eventual agent response.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            agentName: {
              type: "string",
              description: "The agent variant to run.",
            },
            prompt: {
              type: "string",
              description: "The prompt text to send to the selected agent.",
            },
          },
        },
        required: ["agentName", "prompt"],
        additionalProperties: false,
      },
    ]);
  });

  it("returns an empty spawn-agent tool list when the spawn-agent tool is excluded", () => {
    const toolRegistry = new ToolRegistry();

    expect(toolRegistry.getSpawnAgent(["spawnAgent"])).toEqual([]);
  });

  it("returns true when a tool exists in a requested category", () => {
    const toolRegistry = new ToolRegistry();

    expect(toolRegistry.verifyTool(["read"], "readContext")).toBe(true);
  });

  it("returns true when a tool exists in any requested category", () => {
    const toolRegistry = new ToolRegistry();

    expect(toolRegistry.verifyTool(["read", "script"], "RunTerminal")).toBe(true);
  });

  it("returns false when a tool does not exist in the requested categories", () => {
    const toolRegistry = new ToolRegistry();

    expect(toolRegistry.verifyTool(["read", "savePlan"], "spawnAgent")).toBe(false);
  });

  it("throws when a registry section is not an object", () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "tool-registry-"));
    const registryPath = path.join(tempDirectory, "ToolRegistry.json");

    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        read: [],
        write: {},
        scripts: {},
        savePlan: {},
        readPlan: {},
        spawnAgent: {},
      }),
      "utf-8",
    );

    expect(() => new ToolRegistry(registryPath)).toThrow(
      `Invalid tool registry file: ${registryPath} (read)`,
    );

    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });
});
