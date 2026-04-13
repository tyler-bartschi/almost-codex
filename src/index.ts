import OpenAI from "openai";
import dotenv from "dotenv";
import * as readline from "readline";
import type {
  ResponseFunctionToolCall,
  ResponseFunctionToolCallOutputItem,
  ResponseInput,
  ResponseInputItem,
  ResponseOutputItem,
  Tool,
} from "openai/resources/responses/responses";
import type { ReasoningEffort } from "openai/resources/shared";
import { initializeGlobalPromptStore } from "./global/PromptStore";
import { initializeGlobalToolRegistry } from "./global/ToolRegistryStore";
import {
  getGlobalReplCurrentAgent,
  getGlobalReplCurrentMode,
  getGlobalReplShouldClear,
  getGlobalReplShouldExit,
  requireGlobalReplState,
  setGlobalReplState,
} from "./global/ReplStateStore";
import { Settings, type AgentMode, type OpenAIModel } from "./global/Settings";
import { ReplExecutor, type ReplState } from "./repl/ReplExecutor";
import { runReplGitSafeCheck } from "./repl/ReplGitSafeCheck";
import { ReplParser } from "./repl/ReplParser";
import { runTool } from "./tools/ToolExecutor";
import { buildAgentExecutionContext } from "./tools/utils/ToolUtils";

dotenv.config({ quiet: true });

const ANSI_WHITE = "\u001b[37m";
const ANSI_PURPLE = "\u001b[35m";
const ANSI_RESET = "\u001b[0m";

/**
 * Creates a configured OpenAI client from environment variables.
 *
 * @returns {OpenAI} An initialized OpenAI API client.
 * @throws {Error} Thrown when `OPENAI_API_KEY` is not defined.
 */
function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set.");
  }

  return new OpenAI({ apiKey });
}

/**
 * Builds the initial REPL runtime state used by the CLI loop.
 *
 * @param {string} rootDir The working directory from which the REPL was launched.
 * @returns {ReplState} The initial state, including settings and current mode.
 */
function createInitialState(rootDir: string): ReplState {
  const settings = Settings.fromSettingsFile("user_default");
  const currentMode: AgentMode = "code";
  return {
    currentMode,
    currentAgent: getDefaultAgentForMode(currentMode),
    rootDir,
    settings,
    shouldExit: false,
    shouldClear: false,
  };
}

/**
 * Returns the default top-level agent identifier for a REPL mode.
 *
 * @param {AgentMode} mode REPL mode whose primary chat agent should be used.
 * @returns {string} Full agent identifier in `<mode>.<agent>` form.
 */
function getDefaultAgentForMode(mode: AgentMode): string {
  switch (mode) {
    case "ask":
      return "ask.chat";
    case "code":
      return "code.orchestrator";
    case "plan":
      return "plan.chat";
    case "test":
      return "test.tester";
    case "document":
      return "document.chat";
  }
}

/**
 * Colors live user input in purple only while the first character is `/`
 * and no space has been entered yet.
 *
 * @param line Current in-progress line buffer.
 * @returns ANSI-colored line text for terminal rendering.
 */
function colorizeLiveInput(line: string): string {
  if (!line.startsWith("/")) {
    return line;
  }

  const firstWhitespaceIndex = line.search(/\s/);
  if (firstWhitespaceIndex === -1) {
    return `${ANSI_PURPLE}${line}${ANSI_WHITE}`;
  }

  const commandPart = line.slice(0, firstWhitespaceIndex);
  const remainder = line.slice(firstWhitespaceIndex);
  return `${ANSI_PURPLE}${commandPart}${ANSI_WHITE}${remainder}`;
}

/**
 * Reads one input line from the terminal with live-rendered input color.
 * @param promptLabel Prompt text shown before the editable input.
 * @returns The complete line entered by the user.
 */
function readPromptLine(promptLabel: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY || !stdout.isTTY) {
      const rl = readline.createInterface({ input: stdin, output: stdout });
      rl.question(promptLabel, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    readline.emitKeypressEvents(stdin);
    const previouslyRaw = stdin.isRaw;
    stdin.setRawMode(true);

    let buffer = "";

    const render = (): void => {
      readline.cursorTo(stdout, 0);
      readline.clearLine(stdout, 0);
      stdout.write(
        `${ANSI_WHITE}${promptLabel}${colorizeLiveInput(buffer)}${ANSI_RESET}`,
      );
    };

    const cleanup = (): void => {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode(Boolean(previouslyRaw));
    };

    const onKeypress = (str: string, key?: readline.Key): void => {
      if (key?.ctrl && key.name === "c") {
        cleanup();
        stdout.write("\n");
        reject(new Error("SIGINT"));
        return;
      }

      if (key?.name === "return" || key?.name === "enter") {
        cleanup();
        stdout.write("\n");
        resolve(buffer);
        return;
      }

      if (key?.name === "backspace") {
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          render();
        }
        return;
      }

      if (key?.ctrl || key?.meta) {
        return;
      }

      if (typeof str === "string" && str.length > 0) {
        buffer += str;
        render();
      }
    };

    stdin.on("keypress", onKeypress);
    render();
  });
}

/**
 * Restores stdin terminal state so the process can exit cleanly.
 */
function shutdownInput(): void {
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
}

/**
 * Narrows a response output item to a function tool call.
 *
 * @param {ResponseOutputItem} item Raw output item returned by the Responses API.
 * @returns {item is ResponseFunctionToolCall} `true` when the item is a function call.
 */
function isFunctionToolCall(
  item: ResponseOutputItem,
): item is ResponseFunctionToolCall {
  return item.type === "function_call";
}

/**
 * Rebuilds the active model context when the selected top-level agent changes.
 *
 * @param {string} fullAgentName Full agent identifier to activate.
 * @returns {{ model: OpenAIModel; reasoning: Exclude<ReasoningEffort, null>; history: ResponseInput; tools: Tool[] }} Fresh execution context for the selected agent.
 */
function createAgentRuntimeContext(
  fullAgentName: string,
): {
  model: OpenAIModel;
  reasoning: Exclude<ReasoningEffort, null>;
  history: ResponseInput;
  tools: Tool[];
} {
  const agentContext = buildAgentExecutionContext(fullAgentName);
  return {
    model: agentContext.model,
    reasoning: agentContext.reasoning,
    history: agentContext.history,
    tools: agentContext.tools,
  };
}

/**
 * Synchronizes global REPL agent state with the currently selected mode.
 *
 * When the mode changes, this resets the active agent identifier along with the
 * in-memory prompt history and available tool list for the new mode.
 *
 * @param {OpenAIModel} model Current model value to replace when needed.
 * @param {Exclude<ReasoningEffort, null>} reasoning Current reasoning value to replace when needed.
 * @param {ResponseInput} history Current mutable history array to replace when needed.
 * @param {Tool[]} tools Current tool list to replace when needed.
 * @returns {{ model: OpenAIModel; reasoning: Exclude<ReasoningEffort, null>; history: ResponseInput; tools: Tool[] }} Either the original runtime values or a freshly rebuilt agent context.
 */
function syncMainAgentContext(
  model: OpenAIModel,
  reasoning: Exclude<ReasoningEffort, null>,
  history: ResponseInput,
  tools: Tool[],
): {
  model: OpenAIModel;
  reasoning: Exclude<ReasoningEffort, null>;
  history: ResponseInput;
  tools: Tool[];
} {
  const state = requireGlobalReplState();
  const nextAgent = getDefaultAgentForMode(state.currentMode);

  if (state.currentAgent === nextAgent) {
    return { model, reasoning, history, tools };
  }

  state.currentAgent = nextAgent;
  return createAgentRuntimeContext(nextAgent);
}

/**
 * Runs one top-level agent turn for the interactive REPL.
 *
 * The main loop keeps executing model-requested tools until the model returns
 * user-facing text. Tool call outputs and assistant items are appended to the
 * shared history so the next user turn continues the same conversation.
 *
 * @param {Object} params Turn execution parameters.
 * @param {OpenAI} params.client OpenAI client instance used for model calls.
 * @param {string} params.fullAgentName Active top-level agent identifier.
 * @param {OpenAIModel} params.model Model name to execute.
 * @param {Exclude<ReasoningEffort, null>} params.reasoning Reasoning effort for the response call.
 * @param {ResponseInput} params.history Mutable conversation history for the active agent.
 * @param {Tool[]} params.tools Tools exposed to the active agent.
 * @returns {Promise<string>} Assistant text returned to the REPL user for this turn.
 */
async function runMainAgentTurn({
  client,
  fullAgentName,
  model,
  reasoning,
  history,
  tools,
}: {
  client: OpenAI;
  fullAgentName: string;
  model: OpenAIModel;
  reasoning: Exclude<ReasoningEffort, null>;
  history: ResponseInput;
  tools: Tool[];
}): Promise<string> {
  while (true) {
    const response = await client.responses.create({
      model,
      reasoning: { effort: reasoning },
      input: history,
      tools,
    });

    history.push(...(response.output as ResponseInputItem[]));

    const toolCalls = response.output.filter(isFunctionToolCall);

    if (toolCalls.length === 0) {
      return response.output_text;
    }

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
  }
}

/**
 * Runs the startup git-safe guard and handles any startup failure gracefully.
 *
 * @param {ReplState} initialState Initial REPL state containing settings and root directory.
 * @returns {boolean} `true` when startup can continue; otherwise `false`.
 */
function runStartupChecks(initialState: ReplState): boolean {
  try {
    if (runReplGitSafeCheck(initialState.settings, initialState.rootDir)) {
      return true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
  }

  shutdownInput();
  process.exitCode = 1;
  return false;
}

/**
 * Starts the interactive REPL loop.
 *
 * Uses `ReplParser` to parse user input into commands and `ReplExecutor` to
 * execute parsed commands against the shared `ReplState`.
 *
 * @returns {Promise<void>} Resolves when the REPL exits.
 */
export async function main(): Promise<void> {
  const client = createOpenAIClient();
  const parser = new ReplParser();
  const executor = new ReplExecutor();
  const initialState = createInitialState(process.cwd());
  setGlobalReplState(initialState);
  if (!runStartupChecks(initialState)) {
    return;
  }
  initializeGlobalPromptStore(process.cwd());
  initializeGlobalToolRegistry();
  let { model, reasoning, history, tools } = createAgentRuntimeContext(
    requireGlobalReplState().currentAgent,
  );

  while (true) {
    // note to agents: this console.log is intentional to provide a new line before every prompt. do not remove
    console.log();
    let input: string;
    try {
      input = await readPromptLine(`[${getGlobalReplCurrentMode()}]> `);
    } catch (error) {
      if (error instanceof Error && error.message === "SIGINT") {
        shutdownInput();
        break;
      }
      throw error;
    }
    const parsed = parser.parse(input);

    if (parsed.kind === "empty") {
      continue;
    }

    if (parsed.kind === "error") {
      console.log(parsed.message);
      continue;
    }

    if (parsed.kind === "text") {
      ({ model, reasoning, history, tools } = syncMainAgentContext(
        model,
        reasoning,
        history,
        tools,
      ));
      history.push({ role: "user", content: parsed.text });
      const output = await runMainAgentTurn({
        fullAgentName: getGlobalReplCurrentAgent(),
        client,
        model,
        reasoning,
        history,
        tools,
      });
      if (output.length > 0) {
        console.log(output);
      }
      continue;
    }

    const output = executor.execute(parsed.command);
    ({ model, reasoning, history, tools } = syncMainAgentContext(
      model,
      reasoning,
      history,
      tools,
    ));

    if (getGlobalReplShouldClear()) {
      process.stdout.write("\u001Bc");
      requireGlobalReplState().shouldClear = false;
      continue;
    }

    if (output.length > 0) {
      console.log(output);
    }

    if (getGlobalReplShouldExit()) {
      shutdownInput();
      return;
    }
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
