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

export interface AgentExampleParams {
  client: OpenAI;
  model: string;
  reasoning: Exclude<ReasoningEffort, null>;
  // Example: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: "Hi" }, { role: "assistant", content: "Hello!" }]
  history: ResponseInput;
  tools: Tool[];
}

export interface RunToolParams {
  toolName: string;
  toolArguments: unknown;
  toolCall: ResponseFunctionToolCall;
  tools: Tool[];
}

/**
 * Executes a model-requested function tool call.
 *
 * @param {RunToolParams} params Tool execution inputs.
 * @param {string} params.toolName Name of the function tool to execute.
 * @param {unknown} params.toolArguments Parsed JSON arguments for the tool call.
 * @param {ResponseFunctionToolCall} params.toolCall Original tool call item returned by the model.
 * @param {Tool[]} params.tools Complete tool definitions available to the model.
 * @returns {Promise<string>} Tool output text to send back as a `function_call_output` item.
 */
declare function runTool(params: RunToolParams): Promise<string>;

/**
 * Narrows a generic response output item to a function-tool call item.
 *
 * @param {ResponseOutputItem} item A single output item from the Responses API.
 * @returns {item is ResponseFunctionToolCall} `true` when the item is a function call.
 */
function isFunctionToolCall(item: ResponseOutputItem): item is ResponseFunctionToolCall {
  return item.type === "function_call";
}

export interface RunAgentParams {
  client: OpenAI;
  model: string;
  reasoning: Exclude<ReasoningEffort, null>;
  history: ResponseInput;
  tools: Tool[];
}

/**
 * Runs a tool-capable agent loop using the Responses API.
 *
 * The loop continues until the model returns final text without pending function
 * calls. Function calls are executed via `runTool`, then their outputs are fed
 * back into `history` for the next iteration.
 *
 * @param {RunAgentParams} params Agent execution inputs.
 * @param {OpenAI} params.client OpenAI client instance used for API requests.
 * @param {string} params.model Model name to call.
 * @param {Exclude<ReasoningEffort, null>} params.reasoning Reasoning effort sent to the model.
 * @param {ResponseInput} params.history Mutable conversation history used as model input.
 * @param {Tool[]} params.tools Available function/tool definitions.
 * @returns {Promise<string>} The final assistant text response.
 */
export async function runAgent({
  client,
  model,
  reasoning,
  history,
  tools,
}: RunAgentParams): Promise<string> {
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

        const toolOutput = await runTool({
          toolName: call.name,
          toolArguments: parsedArguments,
          toolCall: call,
          tools,
        });

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
