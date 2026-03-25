import OpenAI from "openai";
import promptSync from "prompt-sync";
import dotenv from "dotenv";
import { Settings, type AgentMode } from "./global/Settings";
import { ReplExecutor, type ReplState } from "./repl/replExecutor";
import { ReplParser } from "./repl/replParser";

dotenv.config();

function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set.");
  }

  return new OpenAI({ apiKey });
}

function createInitialState(): ReplState {
  const settings = Settings.fromSettingsFile("user_default");
  const currentMode: AgentMode = "code";
  return {
    currentMode,
    settings,
  };
}

export function main(): void {
  const client = createOpenAIClient();
  // void client;

  const parser = new ReplParser();
  const executor = new ReplExecutor();
  const state = createInitialState();
  const prompt = promptSync({ sigint: true });

  while (true) {
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
    console.log(output);
  }
}

main();
