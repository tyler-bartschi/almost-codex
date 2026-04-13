import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { initializeGlobalPromptStore } from "../../../src/global/PromptStore";
import { Settings, type AgentSettings } from "../../../src/global/Settings";
import { clearGlobalReplState, setGlobalReplState } from "../../../src/global/ReplStateStore";
import { initializeGlobalToolRegistry } from "../../../src/global/ToolRegistryStore";
import type { ReplState } from "../../../src/repl/ReplExecutorTypes";
import {
  buildAgentExecutionContext,
  normalizePermissionsToCategories,
  normalizeRequestedPathWithinRoot,
  resolvePathWithinRoot,
} from "../../../src/tools/utils/ToolUtils";

/**
 * Builds a settings-shaped fixture without mutating on-disk config files.
 *
 * @param {Partial<Pick<Settings, "defaultModel" | "defaultReasoning" | "defaultPersonality" | "agentSettings">>} [overrides={}] Field overrides for the fixture.
 * @returns {Settings} In-memory settings fixture for tests.
 */
function createSettingsFixture(
  overrides: Partial<
    Pick<Settings, "defaultModel" | "defaultReasoning" | "defaultPersonality" | "agentSettings">
  > = {},
): Settings {
  const baseSettings = Settings.fromUserDefault();
  const clonedAgentSettings = structuredClone(baseSettings.agentSettings) as AgentSettings;

  return {
    defaultModel: baseSettings.defaultModel,
    defaultReasoning: baseSettings.defaultReasoning,
    defaultPersonality: baseSettings.defaultPersonality,
    agentSettings: clonedAgentSettings,
    ...overrides,
  } as Settings;
}

/**
 * Builds a mutable REPL state fixture for tool-utils tests.
 *
 * @param {Settings} settings Settings instance to expose through the REPL state.
 * @returns {ReplState} REPL state configured for code-mode agent tests.
 */
function createReplState(settings: Settings): ReplState {
  return {
    currentMode: "code",
    currentAgent: "code.orchestrator",
    rootDir: process.cwd(),
    settings,
    shouldExit: false,
    shouldClear: false,
  };
}

/**
 * Creates a temporary test workspace directory.
 * @param {string} prefix Prefix used for the temp directory name.
 * @returns {string} The created temporary directory path.
 */
function createTempWorkspace(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("ToolUtils", () => {
  beforeEach(() => {
    initializeGlobalPromptStore();
    initializeGlobalToolRegistry();
    clearGlobalReplState();
  });

  afterEach(() => {
    clearGlobalReplState();
  });

  it("builds agent execution context using default model, reasoning, history, and tools", () => {
    const agentSettings = structuredClone(createSettingsFixture().agentSettings) as AgentSettings;
    agentSettings.code.executor.permissions = ["read"];
    const settings = createSettingsFixture({
      defaultModel: "gpt-4.1",
      defaultReasoning: "high",
      agentSettings,
    });
    setGlobalReplState(createReplState(settings));

    const context = buildAgentExecutionContext("code.executor");

    expect(context.model).toBe("gpt-4.1");
    expect(context.reasoning).toBe("high");
    expect(context.history).toEqual([
      {
        role: "system",
        content: expect.stringContaining("efficient assistant"),
      },
      {
        role: "system",
        content: expect.stringContaining("You are the Code Executor agent."),
      },
    ]);
    expect(context.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "listDirectoryTree" }),
        expect.objectContaining({ name: "findLocation" }),
        expect.objectContaining({ name: "readContext" }),
      ]),
    );
  });

  it("builds agent execution context using agent-specific overrides", () => {
    const agentSettings = structuredClone(createSettingsFixture().agentSettings) as AgentSettings;
    agentSettings.code.executor.model = "o3";
    agentSettings.code.executor.reasoning = "low";
    const settings = createSettingsFixture({ agentSettings });
    setGlobalReplState(createReplState(settings));

    const context = buildAgentExecutionContext("code.executor");

    expect(context.model).toBe("o3");
    expect(context.reasoning).toBe("low");
  });

  it("normalizes supported permission tokens into tool categories", () => {
    expect(
      normalizePermissionsToCategories([
        "read",
        "write",
        "scripts",
        "savePlan",
        "readPlan",
        "spawnAgent",
        "unknown",
      ]),
    ).toEqual(["read", "write", "scripts", "savePlan", "readPlan", "spawnAgent"]);
  });

  it("normalizes a single-segment request that names the root directory", () => {
    const rootDir = path.join("/workspace", "experiment");

    expect(normalizeRequestedPathWithinRoot("experiment", rootDir)).toBe(".");
  });

  it("resolves a request that names the root directory back to the root path", () => {
    const tempRoot = createTempWorkspace("tool-utils-root-");

    try {
      const nestedRoot = path.join(tempRoot, "experiment");
      fs.mkdirSync(nestedRoot);

      expect(resolvePathWithinRoot("experiment", nestedRoot)).toBe(nestedRoot);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
