import type {
  AgentMode,
  OpenAIModel,
  OpenAIReasoningMode,
  Personalities,
  Settings,
} from "../global/Settings";

/**
 * Safety setting used for git/script execution modes.
 */
export type SafetyMode = "safe" | "unsafe";
/**
 * Permission token values accepted in agent settings.
 */
export type PermissionToken =
  | "read"
  | "write"
  | "scripts"
  | "spawn_agent"
  | "read_plan"
  | "save_plan";

/**
 * Raw per-agent settings shape as persisted in JSON profiles.
 */
export interface RawAgentSetting {
  description: string;
  personality: Personalities | "default";
  reasoning: OpenAIReasoningMode | "default";
  model: OpenAIModel | "default";
  permissions: PermissionToken[];
}

/**
 * Raw settings profile shape as stored on disk.
 */
export interface RawSettingsFile {
  name: string;
  default_personality: Personalities;
  default_reasoning: OpenAIReasoningMode;
  default_model: OpenAIModel;
  git_mode: SafetyMode;
  script_mode: SafetyMode;
  agents: Record<AgentMode, Record<string, RawAgentSetting>>;
  protected: Array<{ path: string; type?: "file" | "directory" }>;
  concealed: Array<{ path: string; type?: "file" | "directory" }>;
}

/**
 * Mutable runtime state shared across REPL command execution.
 */
export interface ReplState {
  currentMode: AgentMode;
  rootDir: string;
  settings: Settings;
  shouldExit: boolean;
  shouldClear: boolean;
}
