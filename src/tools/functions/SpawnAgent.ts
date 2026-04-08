import OpenAI from "openai";
import type {
  ResponseInput,
  ResponseInputItem,
  ResponseOutputItem,
  ResponseFunctionToolCall,
  ResponseFunctionToolCallOutputItem,
  Tool,
} from "openai/resources/responses/responses";
import type { ReasoningEffort } from "openai/resources/shared";
import { getPrompt } from "../../global/PromptStore";
import {
  getGlobalReplCurrentMode,
  getGlobalReplSettings,
} from "../../global/ReplStateStore";
import { getGlobalToolRegistry } from "../../global/ToolRegistryStore";
import type { AgentMode, OpenAIModel, OpenAIReasoningMode } from "../../global/Settings";
import type { ToolCategory } from "../registry/ToolRegistry";
import { runTool } from "../ToolExecutor";

export interface AgentExampleParams {
  client: OpenAI;
  model: string;
  reasoning: Exclude<ReasoningEffort, null>;
  // Example: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: "Hi" }, { role: "assistant", content: "Hello!" }]
  history: ResponseInput;
  tools: Tool[];
}

/**
 * Narrows a generic response output item to a function-tool call item.
 *
 * @param {ResponseOutputItem} item A single output item from the Responses API.
 * @returns {item is ResponseFunctionToolCall} `true` when the item is a function call.
 */
function isFunctionToolCall(
  item: ResponseOutputItem,
): item is ResponseFunctionToolCall {
  return item.type === "function_call";
}

export interface SpawnAgentParams {
  fullAgentName: string;
  client: OpenAI;
  model: string;
  reasoning: Exclude<ReasoningEffort, null>;
  history: ResponseInput;
  tools: Tool[];
}

export type SpawnableAgentName =
  | "executor"
  | "planner"
  | "documenter"
  | "expander"
  | "step_generator"
  | "synthesizer";

/**
 * Normalizes an agent permission token into a tool registry category.
 *
 * @param {string} permission Permission token from agent settings.
 * @returns {ToolCategory | undefined} Matching registry category, or `undefined` when unsupported.
 */
function normalizePermissionToCategory(permission: string): ToolCategory | undefined {
  if (
    permission === "read" ||
    permission === "write" ||
    permission === "scripts" ||
    permission === "savePlan" ||
    permission === "readPlan" ||
    permission === "spawnAgent"
  ) {
    return permission;
  }

  return undefined;
}

/**
 * Returns the available short agent names for a mode.
 *
 * @param {AgentMode} mode Active mode whose agent names should be listed.
 * @returns {string[]} Sorted short agent names available in that mode.
 */
function getAvailableAgentNames(mode: AgentMode): string[] {
  const settings = getGlobalReplSettings();

  return Object.keys(settings.agentSettings[mode] ?? {}).sort();
}

/**
 * Resolves the effective model for an agent by applying default fallbacks.
 *
 * @param {OpenAIModel | "default"} agentModel Agent-specific model setting.
 * @returns {OpenAIModel} Concrete model name to use for the agent.
 */
function resolveAgentModel(agentModel: OpenAIModel | "default"): OpenAIModel {
  const settings = getGlobalReplSettings();

  return agentModel === "default" ? settings.defaultModel : agentModel;
}

/**
 * Resolves the effective reasoning effort for an agent by applying default fallbacks.
 *
 * @param {OpenAIReasoningMode | "default"} agentReasoning Agent-specific reasoning setting.
 * @returns {Exclude<ReasoningEffort, null>} Concrete reasoning effort for the agent.
 */
function resolveAgentReasoning(
  agentReasoning: OpenAIReasoningMode | "default",
): Exclude<ReasoningEffort, null> {
  const settings = getGlobalReplSettings();
  const reasoning = agentReasoning === "default" ? settings.defaultReasoning : agentReasoning;

  return reasoning as Exclude<ReasoningEffort, null>;
}

/**
 * Converts agent permission tokens into tool registry categories.
 *
 * @param {string[]} permissions Permission tokens configured for the agent.
 * @returns {ToolCategory[]} Registry categories exposed to the spawned agent.
 */
function normalizePermissionsToCategories(permissions: string[]): ToolCategory[] {
  return permissions.reduce<ToolCategory[]>((categories, permission) => {
    const category = normalizePermissionToCategory(permission);

    if (category !== undefined) {
      categories.push(category);
    }

    return categories;
  }, []);
}

/**
 * Runs a tool-capable agent loop using the Responses API.
 *
 * The loop continues until the model returns final text without pending function
 * calls. Function calls are executed via `runTool`, then their outputs are fed
 * back into `history` for the next iteration.
 *
 * @param {SpawnAgentParams} params Agent execution inputs.
 * @param {string} params.fullAgentName Full agent identifier used for tool permission checks.
 * @param {OpenAI} params.client OpenAI client instance used for API requests.
 * @param {string} params.model Model name to call.
 * @param {Exclude<ReasoningEffort, null>} params.reasoning Reasoning effort sent to the model.
 * @param {ResponseInput} params.history Mutable conversation history used as model input.
 * @param {Tool[]} params.tools Available function/tool definitions.
 * @returns {Promise<string>} The final assistant text response.
 */
async function _spawnAgent({
  fullAgentName,
  client,
  model,
  reasoning,
  history,
  tools,
}: SpawnAgentParams): Promise<string> {
  while (true) {
    const response = await client.responses.create({
      model,
      reasoning: { effort: reasoning },
      input: history,
      tools,
    });

    history.push(...(response.output as ResponseInputItem[]));

    const toolCalls = response.output.filter(isFunctionToolCall);

    if (toolCalls.length > 0) {
      const toolOutputs: ResponseFunctionToolCallOutputItem[] = [];
      const parseFailureMessages: ResponseInputItem[] = [];

      for (const call of toolCalls) {
        let parsedArguments: unknown;

        try {
          parsedArguments = JSON.parse(call.arguments);
        } catch {
          parseFailureMessages.push({
            role: "user",
            content: `Unable to parse JSON arguments for function call "${call.name}" (call_id: ${call.call_id}). Please retry the function call with valid JSON arguments.`,
          });
          continue;
        }

        const toolOutput = await runTool(
          fullAgentName,
          call.name,
          parsedArguments as Record<string, unknown>,
        );

        toolOutputs.push({
          id: `fco_${call.call_id}`,
          type: "function_call_output",
          call_id: call.call_id,
          output: toolOutput,
        });
      }

      history.push(...parseFailureMessages);
      history.push(...toolOutputs);
      continue;
    }

    if (response.output_text.trim().length > 0) {
      return response.output_text;
    }
  }
}

/**
 * Starts a named agent with the provided prompt.
 *
 * @param {SpawnableAgentName} agentName The agent variant to run.
 * @param {string} prompt The prompt text to send to the selected agent.
 * @param {OpenAI} [client] Optional OpenAI client instance to reuse for the agent run.
 * @returns {Promise<string>} The eventual agent response.
 */
export async function spawnAgent(
  agentName: SpawnableAgentName,
  prompt: string,
  client?: OpenAI,
): Promise<string> {
  const currentMode = getGlobalReplCurrentMode();
  const availableAgentNames = getAvailableAgentNames(currentMode);

  if (!availableAgentNames.includes(agentName)) {
    throw new Error(
      `Agent "${agentName}" does not exist in mode "${currentMode}". Available agents: ${availableAgentNames.join(", ")}`,
    );
  }

  const settings = getGlobalReplSettings();
  const agentSettings = settings.agentSettings[currentMode][agentName];

  if (agentSettings === undefined) {
    throw new Error(`Agent "${agentName}" does not exist in mode "${currentMode}".`);
  }

  const fullAgentName = `${currentMode}.${agentName}`;
  const history: ResponseInput = [
    ...getPrompt(fullAgentName),
    { role: "user", content: prompt },
  ];
  const toolRegistry = getGlobalToolRegistry();
  const categories = normalizePermissionsToCategories(agentSettings.permissions);
  const tools = toolRegistry.getToolsForCategories(categories) as Tool[];
  const model = resolveAgentModel(agentSettings.model);
  const reasoning = resolveAgentReasoning(agentSettings.reasoning);
  const openAIClient = client ?? new OpenAI();

  return _spawnAgent({
    fullAgentName,
    client: openAIClient,
    model,
    reasoning,
    history,
    tools,
  });
}
