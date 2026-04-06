import * as path from "path";
import type {
  AgentMode,
  OpenAIModel,
  OpenAIReasoningMode,
  Personalities,
} from "../global/Settings";
import type { PermissionToken, SafetyMode } from "./ReplExecutorTypes";

/**
 * Supported runtime agent modes exposed by REPL commands.
 */
export const MODES: AgentMode[] = ["ask", "code", "plan", "test", "document"];
/**
 * Supported personality choices for defaults and agent overrides.
 */
export const PERSONALITIES: Personalities[] = [
  "efficient",
  "friendly",
  "pirate",
  "sarcastic",
];
/**
 * Supported reasoning levels for defaults and agent overrides.
 */
export const REASONING: OpenAIReasoningMode[] = [
  "minimal",
  "low",
  "medium",
  "high",
];
/**
 * Supported model identifiers for defaults and agent overrides.
 */
export const MODELS: OpenAIModel[] = [
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "o3",
  "o3-mini",
  "o4-mini",
];
/**
 * Supported safety modes for git/script settings.
 */
export const SAFETY_MODES: SafetyMode[] = ["safe", "unsafe"];
/**
 * Supported filesystem object kinds for protected/concealed values.
 */
export const FILE_TYPES: Array<"file" | "directory"> = ["file", "directory"];
/**
 * Supported agent permission tokens for config mutation commands.
 */
export const PERMISSIONS: PermissionToken[] = [
  "read",
  "write",
  "scripts",
  "spawn_agent",
  "read_plan",
  "save_plan",
];

/**
 * One-line help text per slash command.
 */
export const COMMAND_SUMMARIES: Record<string, string> = {
  help: "List all supported slash commands.",
  describe: "Show detailed usage for a command.",
  agents: "List configured agents and effective runtime settings.",
  model: "Set default model or per-agent model override.",
  reasoning: "Set default reasoning or per-agent reasoning override.",
  personality: "Set default personality or per-agent personality override.",
  config: "Manage config profiles and set/revert config fields.",
  ask: "Switch interactive mode to ask. Alias: /chat.",
  chat: "Switch interactive mode to ask.",
  plan: "Switch interactive mode to plan.",
  code: "Switch interactive mode to code.",
  test: "Trigger one-off test workflow command.",
  document: "Switch interactive mode to document.",
  git: "Set git safety mode.",
  script: "Set script safety mode.",
  status: "Show current mode, context-window status, and weekly limit note.",
  protect: "Manage protected filesystem objects.",
  conceal: "Manage concealed filesystem objects.",
  clear: "Clear terminal output and redraw the prompt.",
  quit: "Exit the REPL loop. Alias: /exit.",
};

/**
 * Detailed usage/help text per slash command.
 */
export const COMMAND_DETAILS: Record<string, string> = {
  help: "/help\nLists all supported commands.",
  describe:
    "/describe <command>\nShows syntax, accepted values, and examples for a command.\nExample: /describe config",
  agents:
    "/agents\n/agents <mode>\nModes: ask|code|plan|test|document\nLists agents with effective personality, reasoning, model values.",
  model:
    "/model <model>\n/model <agent_id> <model>\n--profile <name> optional.\nModels: gpt-5, gpt-5-mini, gpt-5-nano, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, o3, o3-mini, o4-mini",
  reasoning:
    "/reasoning <reasoning>\n/reasoning <agent_id> <reasoning>\n--profile <name> optional.\nReasoning: minimal|low|medium|high",
  personality:
    "/personality --list\n/personality <personality>\n/personality <agent_id> <personality>\n--profile <name> optional.\nPersonalities: efficient|friendly|pirate|sarcastic",
  config:
    "/config list\n/config show [default|named <name>]\n/config use <name>\n/config create named <name> [--from default|<source_name>]\n/config delete named <name>\n/config set <type> [<name>] --field <field> --value <value>\n/config revert <type> [<name>] [--field <field>]\n\nParameters:\n<type>: config target type; one of default|named.\ndefault: targets user_default profile.\nnamed: targets a named profile and requires <name>.\n<name>: named profile identifier (for example, dev_profile).\n<source_name>: existing profile name used with --from when creating a new profile.\n<field>: setting key to change or revert (for example, default_model, git_mode, agents.code.executor.model).\n<value>: new value for <field> when using /config set (type depends on the field).\n--from: optional source profile for /config create; defaults to user_default when omitted.\n--field: required for /config set; optional for /config revert.\n--value: required for /config set.",
  ask: "/ask\n/chat\nSwitches mode to ask.",
  chat: "/chat\nSwitches mode to ask.",
  plan: "/plan\nSwitches mode to plan.",
  code: "/code\nSwitches mode to code.",
  test: "/test [<prompt>] [--non-interactive]\nRuns one-off test workflow and returns results (placeholder behavior for now).",
  document: "/document\nSwitches mode to document.",
  git: "/git --safe\n/git --unsafe\nSets git_mode on active profile.\nSafe (recommended): commits all uncommitted changes before working, when possible.\nUnsafe: does not perform this pre-work commit.",
  script:
    "/script --safe\n/script --unsafe\nSets script_mode on active profile.\nSafe (recommended): asks permission before running any bash script requested by the agent.\nUnsafe: runs requested bash scripts without asking permission.",
  status:
    "/status\nPrints runtime status:\nMode: <current mode>\nContext window: yes\nWeekly limit: however much you're willing to pay, it's your api key",
  protect:
    "/protect <path> [--type file|directory]\n/protect --remove <path> [--type file|directory]\n/protect --list\nProtected files or folders can be read by the agent, but cannot be written.",
  conceal:
    "/conceal <path> [--type file|directory]\n/conceal --remove <path> [--type file|directory]\n/conceal --list\nConcealed files or folders are known to exist, but cannot be read or written by the agent.",
  clear: "/clear\nClears terminal output and redraws the prompt.",
  quit: "/quit\n/exit\nExits the REPL.",
};

/**
 * Absolute directory path containing settings profiles.
 */
export const SETTINGS_DIR = process.env.SETTINGS_DIR
  ? path.resolve(process.env.SETTINGS_DIR)
  : path.resolve(__dirname, "..", "settings");

/**
 * ANSI color/style codes used for terminal rendering.
 */
export const ANSI_WHITE = "\u001b[37m";
export const ANSI_PURPLE = "\u001b[35m";
export const ANSI_BOLD = "\u001b[1m";
export const ANSI_LIGHT_GRAY = "\u001b[90m";
export const ANSI_RESET = "\u001b[0m";
