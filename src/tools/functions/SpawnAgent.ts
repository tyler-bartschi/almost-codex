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
import { getGlobalReplCurrentMode } from "../../global/ReplStateStore";
import { runTool } from "../ToolExecutor";
import {
  buildAgentExecutionContext,
  createLogPreview,
  getAvailableAgentNames,
  logToolCall,
  logToolReturn,
} from "../utils/ToolUtils";

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
export async function runAgentLoop({
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
  logToolCall("spawnAgent", {
    agentName,
    prompt: createLogPreview(prompt),
  });
  const currentMode = getGlobalReplCurrentMode();
  const availableAgentNames = getAvailableAgentNames(currentMode);

  if (!availableAgentNames.includes(agentName)) {
    throw new Error(
      `Agent "${agentName}" does not exist in mode "${currentMode}". Available agents: ${availableAgentNames.join(", ")}`,
    );
  }

  const fullAgentName = `${currentMode}.${agentName}`;
  const { history, tools, model, reasoning } = buildAgentExecutionContext(fullAgentName);
  history.push({ role: "user", content: prompt });
  const openAIClient = client ?? new OpenAI();

  const response = await runAgentLoop({
    fullAgentName,
    client: openAIClient,
    model,
    reasoning,
    history,
    tools,
  });
  logToolReturn("spawnAgent");
  return response;
}
