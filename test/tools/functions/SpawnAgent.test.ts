import OpenAI from "openai";
import { initializeGlobalPromptStore } from "../../../src/global/PromptStore";
import { Settings, type AgentSettings } from "../../../src/global/Settings";
import { clearGlobalReplState, setGlobalReplState } from "../../../src/global/ReplStateStore";
import { initializeGlobalToolRegistry } from "../../../src/global/ToolRegistryStore";
import type { ReplState } from "../../../src/repl/ReplExecutorTypes";
import { spawnAgent } from "../../../src/tools/functions/SpawnAgent";
import * as ToolExecutor from "../../../src/tools/ToolExecutor";

type MockResponse = {
  output: Array<Record<string, unknown>>;
  output_text: string;
};

/**
 * Builds a settings-shaped fixture without mutating on-disk config files.
 *
 * @param {Partial<Pick<Settings, "defaultModel" | "defaultReasoning" | "agentSettings">>} [overrides={}] Field overrides for the fixture.
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
 * Builds a mutable REPL state fixture for spawn-agent tests.
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
 * Creates an OpenAI client-shaped mock that replays the provided responses.
 *
 * @param {MockResponse[]} responses Ordered Responses API payloads to return.
 * @returns {OpenAI} Mock OpenAI client for `spawnAgent`.
 */
function createMockClient(responses: MockResponse[]): OpenAI {
  return {
    responses: {
      create: jest.fn<Promise<MockResponse>, [Record<string, unknown>]>(
        async () => responses.shift() as MockResponse,
      ),
    },
  } as unknown as OpenAI;
}

describe("spawnAgent", () => {
  beforeEach(() => {
    initializeGlobalPromptStore();
    initializeGlobalToolRegistry();
    clearGlobalReplState();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    clearGlobalReplState();
    jest.restoreAllMocks();
  });

  it("throws when the requested agent does not exist in the current mode", async () => {
    const settings = createSettingsFixture();
    setGlobalReplState(createReplState(settings));

    await expect(spawnAgent("documenter", "Write docs")).rejects.toThrow(
      'Agent "documenter" does not exist in mode "code". Available agents: executor, orchestrator, planner',
    );
  });

  it("builds prompt history, tool list, and default model settings from the active mode", async () => {
    const agentSettings = structuredClone(createSettingsFixture().agentSettings) as AgentSettings;
    agentSettings.code.executor.permissions = ["read"];
    const settings = createSettingsFixture({
      defaultModel: "gpt-4.1",
      defaultReasoning: "high",
      agentSettings,
    });
    setGlobalReplState(createReplState(settings));

    const client = createMockClient([{ output: [], output_text: "done" }]);

    await expect(spawnAgent("executor", "Inspect note.txt", client)).resolves.toBe("done");

    const createMock = client.responses.create as jest.Mock;
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        model: "gpt-4.1",
        reasoning: { effort: "high" },
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "listDirectoryTree" }),
          expect.objectContaining({ name: "readContext" }),
        ]),
        input: [
          {
            role: "system",
            content: expect.stringContaining("efficient assistant"),
          },
          {
            role: "system",
            content: expect.stringContaining("You are the Code Executor agent."),
          },
          {
            role: "user",
            content: "Inspect note.txt",
          },
        ],
      }),
    );
    expect(createMock.mock.calls[0][0].tools).toHaveLength(3);
  });

  it("uses the agent-specific model and reasoning overrides when configured", async () => {
    const agentSettings = structuredClone(createSettingsFixture().agentSettings) as AgentSettings;
    agentSettings.code.executor.model = "o3";
    agentSettings.code.executor.reasoning = "low";
    const settings = createSettingsFixture({ agentSettings });
    setGlobalReplState(createReplState(settings));

    const client = createMockClient([{ output: [], output_text: "override" }]);

    await expect(spawnAgent("executor", "Run override check", client)).resolves.toBe("override");

    const request = (client.responses.create as jest.Mock).mock.calls[0][0];
    expect(request.model).toBe("o3");
    expect(request.reasoning).toEqual({ effort: "low" });
  });

  it("routes model tool calls through ToolExecutor.runTool with the full agent name", async () => {
    const settings = createSettingsFixture();
    setGlobalReplState(createReplState(settings));

    const runToolSpy = jest
      .spyOn(ToolExecutor, "runTool")
      .mockResolvedValue("tool output");
    const client = createMockClient([
      {
        output: [
          {
            type: "function_call",
            name: "readContext",
            call_id: "call_123",
            arguments: JSON.stringify({ targetPath: "note.txt" }),
          },
        ],
        output_text: "",
      },
      {
        output: [],
        output_text: "final answer",
      },
    ]);

    await expect(spawnAgent("executor", "Read note.txt", client)).resolves.toBe("final answer");

    expect(runToolSpy).toHaveBeenCalledWith("code.executor", "readContext", {
      targetPath: "note.txt",
    });
    const secondRequest = (client.responses.create as jest.Mock).mock.calls[1][0];
    expect(secondRequest.input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "function_call_output",
          call_id: "call_123",
          output: "tool output",
        }),
      ]),
    );
  });
});
