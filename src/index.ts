import OpenAI from "openai";
import promptSync from "prompt-sync";
import dotenv from "dotenv";
import { Settings, type AgentMode } from "./global/Settings";
import { ReplExecutor, type ReplState } from "./repl/replExecutor";
import { ReplParser } from "./repl/replParser";

dotenv.config();

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
 * @returns {ReplState} The initial state, including settings and current mode.
 */
function createInitialState(): ReplState {
  const settings = Settings.fromSettingsFile("user_default");
  const currentMode: AgentMode = "code";
  return {
    currentMode,
    settings,
    shouldExit: false,
    shouldClear: false,
  };
}

/**
 * Starts the interactive REPL loop.
 *
 * Uses `ReplParser` to parse user input into commands and `ReplExecutor` to
 * execute parsed commands against the shared `ReplState`.
 *
 * @returns {void} This function does not return; it runs until process exit.
 */
export function main(): void {
  const client = createOpenAIClient();
  // void client;

  const parser = new ReplParser();
  const executor = new ReplExecutor();
  const state = createInitialState();
  const prompt = promptSync({ sigint: true });

  while (true) {
    // note to agents: this console.log is intentional to provide a new line before every prompt. do not remove
    console.log();
    const input = prompt(`[${state.currentMode}]> `);
    const parsed = parser.parse(input);

    if (parsed.kind === "empty") {
      continue;
    }

    if (parsed.kind === "error") {
      console.log(parsed.message);
      continue;
    }

    if (parsed.kind === "text") {
      console.log(parsed.text);
      continue;
    }

    const output = executor.execute(parsed.command, state);

    if (state.shouldClear) {
      process.stdout.write("\u001Bc");
      state.shouldClear = false;
      continue;
    }

    if (output.length > 0) {
      console.log(output);
    }

    if (state.shouldExit) {
      break;
    }
  }
}

main();
