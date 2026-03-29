import OpenAI from "openai";
import dotenv from "dotenv";
import * as readline from "readline";
import { Settings, type AgentMode } from "./global/Settings";
import { ReplExecutor, type ReplState } from "./repl/replExecutor";
import { ReplParser } from "./repl/replParser";

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
    rootDir,
    settings,
    shouldExit: false,
    shouldClear: false,
  };
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
      stdout.write(`${ANSI_WHITE}${promptLabel}${colorizeLiveInput(buffer)}${ANSI_RESET}`);
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
 * Starts the interactive REPL loop.
 *
 * Uses `ReplParser` to parse user input into commands and `ReplExecutor` to
 * execute parsed commands against the shared `ReplState`.
 *
 * @returns {Promise<void>} Resolves when the REPL exits.
 */
export async function main(): Promise<void> {
  const client = createOpenAIClient();
  // void client;

  const parser = new ReplParser();
  const executor = new ReplExecutor();
  const state = createInitialState(process.cwd());

  while (true) {
    // note to agents: this console.log is intentional to provide a new line before every prompt. do not remove
    console.log();
    let input: string;
    try {
      input = await readPromptLine(`[${state.currentMode}]> `);
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
