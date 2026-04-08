import fs from "fs";
import path from "path";
import YAML from "yaml";
import { getGlobalReplSettings } from "./ReplStateStore";
import type { AgentMode, Personalities } from "./Settings";

export type PersonalityPromptMap = Record<string, string>;
export type PromptCategoryMap = Record<string, string>;
export type PromptMap = Record<string, PromptCategoryMap>;

export type PromptStore = {
  personalities: PersonalityPromptMap;
  prompts: PromptMap;
};

export type SystemPromptMessage = {
  role: "system";
  content: string;
};

type RawPromptFile = {
  prompt?: string;
};

let globalPromptStore: PromptStore | undefined;

/**
 * Parses a YAML prompt file and returns only its prompt text.
 * @param {string} filePath The file path to parse.
 * @returns {string} The prompt text stored in the file.
 * @throws {Error} Thrown when the file does not contain a string `prompt` field.
 */
function readPromptText(filePath: string): string {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = YAML.parse(raw) as RawPromptFile | null;

  if (typeof parsed?.prompt !== "string") {
    throw new Error(`Prompt file "${filePath}" must contain a string "prompt" property.`);
  }

  return parsed.prompt;
}

/**
 * Reads all personality prompt files from disk and maps filename to prompt text.
 * @param {string} personalitiesDir The directory that contains personality YAML files.
 * @returns {PersonalityPromptMap} A map of personality name to prompt text.
 */
function loadPersonalities(personalitiesDir: string): PersonalityPromptMap {
  const personalities: PersonalityPromptMap = {};
  const entries = fs.readdirSync(personalitiesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) !== ".yaml") {
      continue;
    }

    const personalityName = path.basename(entry.name, ".yaml");
    const filePath = path.join(personalitiesDir, entry.name);
    personalities[personalityName] = readPromptText(filePath);
  }

  return personalities;
}

/**
 * Reads grouped prompt files from disk and maps directory/file names to prompt text.
 * @param {string} promptsDir The directory that contains prompt category subdirectories.
 * @returns {PromptMap} A map of category names to per-file prompt text.
 */
function loadPrompts(promptsDir: string): PromptMap {
  const prompts: PromptMap = {};
  const categoryEntries = fs.readdirSync(promptsDir, { withFileTypes: true });

  for (const categoryEntry of categoryEntries) {
    if (!categoryEntry.isDirectory()) {
      continue;
    }

    const categoryDir = path.join(promptsDir, categoryEntry.name);
    const promptEntries = fs.readdirSync(categoryDir, { withFileTypes: true });
    const categoryPrompts: PromptCategoryMap = {};

    for (const promptEntry of promptEntries) {
      if (!promptEntry.isFile() || path.extname(promptEntry.name) !== ".yaml") {
        continue;
      }

      const promptName = path.basename(promptEntry.name, ".yaml");
      const filePath = path.join(categoryDir, promptEntry.name);
      categoryPrompts[promptName] = readPromptText(filePath);
    }

    prompts[categoryEntry.name] = categoryPrompts;
  }

  return prompts;
}

/**
 * Initializes the global prompt store from the repository prompt directories.
 * @param {string} rootDir The project root directory that contains the `src` folder.
 * @returns {PromptStore} The initialized prompt store contents.
 */
export function initializeGlobalPromptStore(rootDir: string = process.cwd()): PromptStore {
  const promptsRootDir = path.join(rootDir, "src");
  const personalitiesDir = path.join(promptsRootDir, "personalities");
  const promptsDir = path.join(promptsRootDir, "prompts");

  globalPromptStore = {
    personalities: loadPersonalities(personalitiesDir),
    prompts: loadPrompts(promptsDir),
  };

  return globalPromptStore;
}

/**
 * Returns the initialized personalities prompt map.
 * @returns {PersonalityPromptMap} The stored personality-to-prompt mapping.
 * @throws {Error} Thrown when the global prompt store has not been initialized.
 */
export function getPersonalities(): PersonalityPromptMap {
  if (globalPromptStore === undefined) {
    throw new Error("Global prompt store has not been initialized.");
  }

  return globalPromptStore.personalities;
}

/**
 * Returns the initialized grouped prompt map.
 * @returns {PromptMap} The stored prompt-category mapping.
 * @throws {Error} Thrown when the global prompt store has not been initialized.
 */
export function getPrompts(): PromptMap {
  if (globalPromptStore === undefined) {
    throw new Error("Global prompt store has not been initialized.");
  }

  return globalPromptStore.prompts;
}

/**
 * Returns the initialized global prompt store.
 * @returns {PromptStore} The initialized prompt store.
 * @throws {Error} Thrown when the global prompt store has not been initialized.
 */
function requireGlobalPromptStore(): PromptStore {
  if (globalPromptStore === undefined) {
    throw new Error("Global prompt store has not been initialized.");
  }

  return globalPromptStore;
}

/**
 * Resolves the configured personality prompt content for a specific agent.
 * @param {AgentMode} mode The agent mode group that contains the target agent.
 * @param {string} agentName The configured agent name within the mode group.
 * @returns {string} The resolved personality prompt content.
 * @throws {Error} Thrown when the agent or personality prompt cannot be found.
 */
function getPersonalityPromptContent(mode: AgentMode, agentName: string): string {
  const settings = getGlobalReplSettings();
  const agent = settings.agentSettings[mode]?.[agentName];

  if (agent === undefined) {
    throw new Error(`Agent "${agentName}" does not exist for mode "${mode}".`);
  }

  const personalityName: Personalities =
    agent.personality === "default" ? settings.defaultPersonality : agent.personality;
  const personalityPrompt = requireGlobalPromptStore().personalities[personalityName];

  if (personalityPrompt === undefined) {
    throw new Error(`Personality prompt "${personalityName}" was not found.`);
  }

  return personalityPrompt;
}

/**
 * Resolves the stored task prompt content for a specific mode/category and prompt name.
 * @param {string} categoryName The prompt category name.
 * @param {string} promptName The prompt key within the category.
 * @returns {string} The resolved task prompt content.
 * @throws {Error} Thrown when the prompt category or prompt cannot be found.
 */
function getTaskPromptContent(categoryName: string, promptName: string): string {
  const category = requireGlobalPromptStore().prompts[categoryName];

  if (category === undefined) {
    throw new Error(`Prompt category "${categoryName}" was not found.`);
  }

  const prompt = category[promptName];

  if (prompt === undefined) {
    throw new Error(`Prompt "${categoryName}.${promptName}" was not found.`);
  }

  return prompt;
}

/**
 * Builds the two required system prompts for a specific agent.
 * @param {AgentMode} mode The agent mode group that contains the target agent.
 * @param {string} agentName The configured agent name within the mode group.
 * @param {string} categoryName The prompt category name.
 * @param {string} promptName The prompt key within the category.
 * @returns {SystemPromptMessage[]} The personality prompt followed by the task prompt.
 */
function buildAgentPromptPair(
  mode: AgentMode,
  agentName: string,
  categoryName: string,
  promptName: string,
): SystemPromptMessage[] {
  return [
    {
      role: "system",
      content: getPersonalityPromptContent(mode, agentName),
    },
    {
      role: "system",
      content: getTaskPromptContent(categoryName, promptName),
    },
  ];
}

/**
 * Returns the system prompt pair for the ask chat agent.
 * @param {void} No parameters are accepted.
 * @returns {SystemPromptMessage[]} The personality prompt and ask chat prompt.
 */
export function getAskChatPrompt(): SystemPromptMessage[] {
  return buildAgentPromptPair("ask", "chat", "ask", "chat");
}

/**
 * Returns the system prompt pair for the code executor agent.
 * @param {void} No parameters are accepted.
 * @returns {SystemPromptMessage[]} The personality prompt and code executor prompt.
 */
export function getCodeExecutorPrompt(): SystemPromptMessage[] {
  return buildAgentPromptPair("code", "executor", "code", "executor");
}

/**
 * Returns the system prompt pair for the code orchestrator agent.
 * @param {void} No parameters are accepted.
 * @returns {SystemPromptMessage[]} The personality prompt and code orchestrator prompt.
 */
export function getCodeOrchestratorPrompt(): SystemPromptMessage[] {
  return buildAgentPromptPair("code", "orchestrator", "code", "orchestrator");
}

/**
 * Returns the system prompt pair for the code planner agent.
 * @param {void} No parameters are accepted.
 * @returns {SystemPromptMessage[]} The personality prompt and code planner prompt.
 */
export function getCodePlannerPrompt(): SystemPromptMessage[] {
  return buildAgentPromptPair("code", "planner", "code", "planner");
}

/**
 * Returns the system prompt pair for the document chat agent.
 * @param {void} No parameters are accepted.
 * @returns {SystemPromptMessage[]} The personality prompt and document chat prompt.
 */
export function getDocumentChatPrompt(): SystemPromptMessage[] {
  return buildAgentPromptPair("document", "chat", "document", "chat");
}

/**
 * Returns the system prompt pair for the documenter agent.
 * @param {void} No parameters are accepted.
 * @returns {SystemPromptMessage[]} The personality prompt and documenter prompt.
 */
export function getDocumentDocumenterPrompt(): SystemPromptMessage[] {
  return buildAgentPromptPair("document", "documenter", "document", "documenter");
}

/**
 * Returns the system prompt pair for the plan chat agent.
 * @param {void} No parameters are accepted.
 * @returns {SystemPromptMessage[]} The personality prompt and plan chat prompt.
 */
export function getPlanChatPrompt(): SystemPromptMessage[] {
  return buildAgentPromptPair("plan", "chat", "plan", "chat");
}

/**
 * Returns the system prompt pair for the plan expander agent.
 * @param {void} No parameters are accepted.
 * @returns {SystemPromptMessage[]} The personality prompt and plan expander prompt.
 */
export function getPlanExpanderPrompt(): SystemPromptMessage[] {
  return buildAgentPromptPair("plan", "expander", "plan", "expander");
}

/**
 * Returns the system prompt pair for the plan step generator agent.
 * @param {void} No parameters are accepted.
 * @returns {SystemPromptMessage[]} The personality prompt and plan step generator prompt.
 */
export function getPlanStepGeneratorPrompt(): SystemPromptMessage[] {
  return buildAgentPromptPair("plan", "step_generator", "plan", "step_generator");
}

/**
 * Returns the system prompt pair for the plan synthesizer agent.
 * @param {void} No parameters are accepted.
 * @returns {SystemPromptMessage[]} The personality prompt and plan synthesizer prompt.
 */
export function getPlanSynthesizerPrompt(): SystemPromptMessage[] {
  return buildAgentPromptPair("plan", "synthesizer", "plan", "synthesizer");
}

/**
 * Returns the system prompt pair for the test tester agent.
 * @param {void} No parameters are accepted.
 * @returns {SystemPromptMessage[]} The personality prompt and test tester prompt.
 */
export function getTestTesterPrompt(): SystemPromptMessage[] {
  return buildAgentPromptPair("test", "tester", "test", "tester");
}

/**
 * Returns the system prompt pair for a specific agent full name.
 * @param {string} agentFullName The full agent name in `<mode>.<agent>` format.
 * @returns {SystemPromptMessage[]} The personality prompt and task prompt for the agent.
 * @throws {Error} Thrown when the agent full name does not map to a known prompt getter.
 */
export function getPrompt(agentFullName: string): SystemPromptMessage[] {
  const promptGetters: Record<string, () => SystemPromptMessage[]> = {
    "ask.chat": getAskChatPrompt,
    "code.executor": getCodeExecutorPrompt,
    "code.orchestrator": getCodeOrchestratorPrompt,
    "code.planner": getCodePlannerPrompt,
    "document.chat": getDocumentChatPrompt,
    "document.documenter": getDocumentDocumenterPrompt,
    "plan.chat": getPlanChatPrompt,
    "plan.expander": getPlanExpanderPrompt,
    "plan.step_generator": getPlanStepGeneratorPrompt,
    "plan.synthesizer": getPlanSynthesizerPrompt,
    "test.tester": getTestTesterPrompt,
  };
  const getPromptPair = promptGetters[agentFullName];

  if (getPromptPair === undefined) {
    throw new Error(`Prompt getter for agent "${agentFullName}" was not found.`);
  }

  return getPromptPair();
}
