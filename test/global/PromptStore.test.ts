import {
  getAskChatPrompt,
  getCodeExecutorPrompt,
  getCodeOrchestratorPrompt,
  getCodePlannerPrompt,
  getDocumentChatPrompt,
  getDocumentDocumenterPrompt,
  getPrompt,
  getPlanChatPrompt,
  getPlanExpanderPrompt,
  getPlanStepGeneratorPrompt,
  getPlanSynthesizerPrompt,
  getPersonalities,
  getPrompts,
  getTestTesterPrompt,
  initializeGlobalPromptStore,
} from "../../src/global/PromptStore";
import { Settings, type AgentSettings } from "../../src/global/Settings";
import {
  clearGlobalReplState,
  setGlobalReplState,
} from "../../src/global/ReplStateStore";
import type { ReplState } from "../../src/repl/ReplExecutorTypes";

/**
 * Builds a REPL state fixture with initialized settings for prompt store tests.
 * @param {Partial<ReplState>} [overrides={}] Field overrides to apply to the default fixture.
 * @returns {ReplState} A mutable REPL state fixture.
 */
function createReplStateFixture(overrides: Partial<ReplState> = {}): ReplState {
  return {
    currentMode: "code",
    currentAgent: "code.orchestrator",
    rootDir: process.cwd(),
    settings: createSettingsFixture(),
    shouldExit: false,
    shouldClear: false,
    ...overrides,
  };
}

/**
 * Builds an in-memory settings fixture for prompt store tests.
 * @param {Partial<Pick<Settings, "defaultPersonality" | "agentSettings">>} [overrides={}] Field overrides to apply.
 * @returns {Settings} A settings-shaped fixture object.
 */
function createSettingsFixture(
  overrides: Partial<Pick<Settings, "defaultPersonality" | "agentSettings">> = {},
): Settings {
  const baseSettings = Settings.fromUserDefault();
  const clonedAgentSettings = structuredClone(baseSettings.agentSettings) as AgentSettings;

  return {
    defaultPersonality: baseSettings.defaultPersonality,
    agentSettings: clonedAgentSettings,
    ...overrides,
  } as Settings;
}

describe("PromptStore", () => {
  beforeEach(() => {
    clearGlobalReplState();
  });

  afterEach(() => {
    clearGlobalReplState();
  });

  it("returns the initialized personalities map", () => {
    const store = initializeGlobalPromptStore(process.cwd());
    const personalities = getPersonalities();

    expect(personalities).toBe(store.personalities);
    expect(personalities).toEqual(
      expect.objectContaining({
        efficient: expect.stringContaining("efficient assistant"),
        pirate: expect.stringContaining("speak and act like a pirate"),
      }),
    );
    expect("prompt" in personalities).toBe(false);
  });

  it("returns the initialized grouped prompt map", () => {
    const store = initializeGlobalPromptStore(process.cwd());
    const prompts = getPrompts();

    expect(prompts).toBe(store.prompts);
    expect(prompts).toEqual(
      expect.objectContaining({
        ask: expect.objectContaining({
          chat: expect.stringContaining("You are the Ask Chat agent."),
        }),
        code: expect.objectContaining({
          orchestrator: expect.stringContaining("You are the Code Orchestrator agent."),
        }),
      }),
    );
    expect("prompt" in prompts).toBe(false);
    expect("prompt" in prompts.ask).toBe(false);
    expect("prompt" in prompts.code).toBe(false);
  });

  it.each([
    ["getAskChatPrompt", getAskChatPrompt, "efficient", "You are the Ask Chat agent."],
    ["getCodeExecutorPrompt", getCodeExecutorPrompt, "efficient", "You are the Code Executor agent."],
    [
      "getCodeOrchestratorPrompt",
      getCodeOrchestratorPrompt,
      "efficient",
      "You are the Code Orchestrator agent.",
    ],
    ["getCodePlannerPrompt", getCodePlannerPrompt, "efficient", "You are the Code Planner agent."],
    ["getDocumentChatPrompt", getDocumentChatPrompt, "efficient", "You are the Document Chat agent."],
    [
      "getDocumentDocumenterPrompt",
      getDocumentDocumenterPrompt,
      "efficient",
      "You are the Documenter agent.",
    ],
    ["getPlanChatPrompt", getPlanChatPrompt, "efficient", "You are the Plan Chat agent."],
    ["getPlanExpanderPrompt", getPlanExpanderPrompt, "efficient", "You are the Plan Expander agent."],
    [
      "getPlanStepGeneratorPrompt",
      getPlanStepGeneratorPrompt,
      "efficient",
      "You are the Plan Step Generator agent.",
    ],
    [
      "getPlanSynthesizerPrompt",
      getPlanSynthesizerPrompt,
      "efficient",
      "You are the Plan Synthesizer agent.",
    ],
    ["getTestTesterPrompt", getTestTesterPrompt, "efficient", "You are the Test agent."],
  ])(
    "returns the personality and task system prompts for %s",
    (_getterName, getter, expectedPersonalitySnippet, expectedTaskSnippet) => {
      initializeGlobalPromptStore(process.cwd());
      setGlobalReplState(createReplStateFixture());

      expect(getter()).toEqual([
        {
          role: "system",
          content: expect.stringContaining(expectedPersonalitySnippet),
        },
        {
          role: "system",
          content: expect.stringContaining(expectedTaskSnippet),
        },
      ]);
    },
  );

  it("uses the settings default personality when the agent personality is default", () => {
    initializeGlobalPromptStore(process.cwd());
    const settings = createSettingsFixture({ defaultPersonality: "pirate" });
    setGlobalReplState(createReplStateFixture({ settings }));

    expect(getAskChatPrompt()[0]).toEqual({
      role: "system",
      content: expect.stringContaining("speak and act like a pirate"),
    });
  });

  it("uses the agent-specific personality when one is configured", () => {
    initializeGlobalPromptStore(process.cwd());
    const agentSettings = structuredClone(createSettingsFixture().agentSettings) as AgentSettings;
    agentSettings.code.executor.personality = "sarcastic";
    const settings = createSettingsFixture({ agentSettings });
    setGlobalReplState(createReplStateFixture({ settings }));

    expect(getCodeExecutorPrompt()[0]).toEqual({
      role: "system",
      content: expect.stringContaining("You are a sarcastic assistant."),
    });
  });

  it.each([
    ["ask.chat", getAskChatPrompt],
    ["code.executor", getCodeExecutorPrompt],
    ["code.orchestrator", getCodeOrchestratorPrompt],
    ["code.planner", getCodePlannerPrompt],
    ["document.chat", getDocumentChatPrompt],
    ["document.documenter", getDocumentDocumenterPrompt],
    ["plan.chat", getPlanChatPrompt],
    ["plan.expander", getPlanExpanderPrompt],
    ["plan.step_generator", getPlanStepGeneratorPrompt],
    ["plan.synthesizer", getPlanSynthesizerPrompt],
    ["test.tester", getTestTesterPrompt],
  ])("returns the same prompt pair as the existing getter for %s", (agentFullName, getter) => {
    initializeGlobalPromptStore(process.cwd());
    setGlobalReplState(createReplStateFixture());

    expect(getPrompt(agentFullName)).toEqual(getter());
  });

  it("throws when the agent full name does not map to a prompt getter", () => {
    initializeGlobalPromptStore(process.cwd());
    setGlobalReplState(createReplStateFixture());

    expect(() => getPrompt("code.unknown")).toThrow(
      'Prompt getter for agent "code.unknown" was not found.',
    );
  });
});
