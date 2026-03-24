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

// `runTool` contract (implementation intentionally omitted):
// - Input:
//   - `toolName`: name of the function tool to run
//   - `toolArguments`: parsed JSON arguments
//   - `toolCall`: original tool call item from the model
//   - `tools`: full list of tool definitions provided to the model
// - Return:
//   - The tool output as a string, which will be sent as a `function_call_output` item.
export interface RunToolParams {
  toolName: string;
  toolArguments: unknown;
  toolCall: ResponseFunctionToolCall;
  tools: Tool[];
}

declare function runTool(params: RunToolParams): Promise<string>;

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
