import { ToolRegistry } from "../../../src/tools/registry/ToolRegistry";

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
});
