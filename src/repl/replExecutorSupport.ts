import * as fs from "fs";
import * as path from "path";
import { requireGlobalReplState } from "../global/ReplStateStore";
import {
  FileSystemObject,
  type AddRemoveOperation,
  type AgentMode,
  type OpenAIModel,
  type OpenAIReasoningMode,
  type Personalities,
  Settings,
} from "../global/Settings";
import type { ParsedCommand } from "./ReplParser";
import {
  FILE_TYPES,
  MODELS,
  MODES,
  PERMISSIONS,
  PERSONALITIES,
  REASONING,
  SAFETY_MODES,
  SETTINGS_DIR,
} from "./ReplExecutorConstants";
import type {
  PermissionToken,
  RawSettingsFile,
  SafetyMode,
} from "./ReplExecutorTypes";

/**
 * Shared validation, parsing, and settings-profile utility operations used by
 * REPL command handlers.
 */
export class ReplExecutorSupport {
  /**
   * Converts an unknown thrown value into a displayable error string.
   * @param error Unknown error value thrown from command execution.
   * @returns A normalized message string for user-facing output.
   */
  public toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Checks whether a string is a supported agent mode.
   * @param value Candidate mode string.
   * @returns `true` when the value is a valid `AgentMode`.
   */
  public isMode(value: string): value is AgentMode {
    return MODES.includes(value as AgentMode);
  }

  /**
   * Checks whether a string is a supported model identifier.
   * @param value Candidate model string.
   * @returns `true` when the value is a valid `OpenAIModel`.
   */
  public isModel(value: string): value is OpenAIModel {
    return MODELS.includes(value as OpenAIModel);
  }

  /**
   * Checks whether a string is a supported reasoning level.
   * @param value Candidate reasoning string.
   * @returns `true` when the value is a valid `OpenAIReasoningMode`.
   */
  public isReasoning(value: string): value is OpenAIReasoningMode {
    return REASONING.includes(value as OpenAIReasoningMode);
  }

  /**
   * Checks whether a string is a supported personality identifier.
   * @param value Candidate personality string.
   * @returns `true` when the value is a valid `Personalities`.
   */
  public isPersonality(value: string): value is Personalities {
    return PERSONALITIES.includes(value as Personalities);
  }

  /**
   * Checks whether a string is a supported safety mode.
   * @param value Candidate safety mode string.
   * @returns `true` when the value is `safe` or `unsafe`.
   */
  public isSafetyMode(value: string): value is SafetyMode {
    return SAFETY_MODES.includes(value as SafetyMode);
  }

  /**
   * Checks whether a string is a valid filesystem object type.
   * @param value Candidate type string.
   * @returns `true` when the value is `file` or `directory`.
   */
  public isFileType(value: string): value is "file" | "directory" {
    return FILE_TYPES.includes(value as "file" | "directory");
  }

  /**
   * Checks whether a string is a supported agent permission token.
   * @param value Candidate permission string.
   * @returns `true` when the value is a valid permission token.
   */
  public isPermission(value: string): value is PermissionToken {
    return PERMISSIONS.includes(value as PermissionToken);
  }

  /**
   * Parses an `agents.<mode>.<agent>.<setting>` field selector.
   * @param field Dot-delimited field path from config commands.
   * @returns Parsed agent-field metadata or an error result.
   */
  public parseAgentField(field: string):
    | {
        mode: AgentMode;
        agentName: string;
        setting: "personality" | "reasoning" | "model" | "permissions";
      }
    | { error: string } {
    const match =
      /^agents\.(ask|code|plan|test|document)\.([^.]+)\.(personality|reasoning|model|permissions)$/.exec(
        field,
      );
    if (!match) {
      return { error: "invalid agent field" };
    }
    return {
      mode: match[1] as AgentMode,
      agentName: match[2] as string,
      setting: match[3] as
        | "personality"
        | "reasoning"
        | "model"
        | "permissions",
    };
  }

  /**
   * Parses a protected/concealed value as either a raw path or object-like JSON.
   * @param value String value from command flags.
   * @returns Parsed string/object value or a validation error.
   */
  public parsePathOrObjectValue(
    value: string,
  ): { value: string | FileSystemObject } | { error: string } {
    if (!value.startsWith("{")) {
      return { value };
    }

    if (!value.endsWith("}")) {
      return { error: "Invalid object-like value for protected/concealed." };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(value);
    } catch {
      return { error: "Invalid object-like value for protected/concealed." };
    }

    if (
      typeof parsedJson !== "object" ||
      parsedJson === null ||
      !("path" in parsedJson) ||
      typeof parsedJson.path !== "string"
    ) {
      return { error: "Invalid object-like value for protected/concealed." };
    }

    if ("type" in parsedJson) {
      if (parsedJson.type !== "file" && parsedJson.type !== "directory") {
        return {
          error: `Invalid type "${String(parsedJson.type)}". Accepted: ${FILE_TYPES.join(", ")}`,
        };
      }
      return { value: new FileSystemObject(parsedJson.path, parsedJson.type) };
    }

    return { value: parsedJson.path };
  }

  /**
   * Resolves an agent identifier in `<agent>` or `<mode>.<agent>` form.
   * @param identifier Agent selector string supplied by the user.
   * @param settings Settings instance used for existence checks.
   * @returns Resolved mode and agent name, or an error.
   */
  public resolveAgentIdentifier(
    identifier: string,
    settings: Settings,
  ): { mode: AgentMode; agentName: string } | { error: string } {
    if (identifier.includes(".")) {
      const [modeCandidate, agentName] = identifier.split(".", 2);
      if (
        modeCandidate === undefined ||
        !this.isMode(modeCandidate) ||
        !agentName
      ) {
        return {
          error: `Invalid agent identifier "${identifier}". Use <mode>.<agent>.`,
        };
      }

      const agent = settings.agentSettings[modeCandidate][agentName];
      if (!agent) {
        return { error: `Unknown agent identifier "${identifier}".` };
      }
      return { mode: modeCandidate, agentName };
    }

    const matches: Array<{ mode: AgentMode; agentName: string }> = [];
    for (const mode of MODES) {
      if (settings.agentSettings[mode][identifier]) {
        matches.push({ mode, agentName: identifier });
      }
    }

    if (matches.length === 0) {
      return { error: `Unknown agent identifier "${identifier}".` };
    }
    if (matches.length > 1) {
      return {
        error: `Ambiguous agent identifier "${identifier}". Use <mode>.<agent>.`,
      };
    }
    const uniqueMatch = matches[0];
    if (!uniqueMatch) {
      return { error: `Unknown agent identifier "${identifier}".` };
    }
    return uniqueMatch;
  }

  /**
   * Reads and validates optional `--profile <name>` usage.
   * @param command Parsed command containing flags to inspect.
   * @param usage Usage text returned when validation fails.
   * @returns Optional profile name or a validation error.
   */
  public readOptionalProfileFlag(
    command: ParsedCommand,
    usage: string,
  ): { profileName?: string } | { error: string } {
    for (const flagName of command.flags.keys()) {
      if (flagName !== "profile" && flagName !== "list") {
        return { error: usage };
      }
    }

    if (!command.flags.has("profile")) {
      return {};
    }

    const profileFlag = command.flags.get("profile");
    if (profileFlag === true || profileFlag === undefined) {
      return { error: usage };
    }

    if (profileFlag === "system_default") {
      return {
        error: "Error: protected-resource error. Cannot modify system_default.",
      };
    }

    return { profileName: profileFlag };
  }

  /**
   * Resolves which settings object should be mutated for a command.
   * @param profileName Optional explicit profile override.
   * @returns Active/loaded settings target or an error.
   */
  public resolveTargetSettings(
    profileName?: string,
  ): { name: string; settings: Settings } | { error: string } {
    const state = requireGlobalReplState();

    if (!profileName || profileName === state.settings.configName) {
      return { name: state.settings.configName, settings: state.settings };
    }

    const loaded = this.loadSettingsProfile(profileName);
    if ("error" in loaded) {
      return { error: loaded.error };
    }
    return { name: profileName, settings: loaded.settings };
  }

  /**
   * Loads a named profile into a new settings instance.
   * @param profileName Profile name to load from disk.
   * @returns Loaded settings or a profile-not-found error.
   */
  public loadSettingsProfile(
    profileName: string,
  ): { settings: Settings } | { error: string } {
    try {
      return { settings: Settings.fromSettingsFile(profileName) };
    } catch {
      return { error: `Profile not found: ${profileName}` };
    }
  }

  /**
   * Parses `<type> [<name>]` syntax for config set/revert commands.
   * @param args Full command argument list.
   * @param startIndex Index where target type is expected.
   * @returns Parsed profile target and next argument index, or an error.
   */
  public parseConfigTypeAndName(
    args: string[],
    startIndex: number,
  ): { profileName: string; nextIndex: number } | { error: string } {
    const configType = args[startIndex];
    if (configType === "default") {
      return { profileName: "user_default", nextIndex: startIndex + 1 };
    }

    if (configType === "named") {
      const profileName = args[startIndex + 1];
      if (!profileName) {
        return { error: "Named config requires <name>." };
      }
      return { profileName, nextIndex: startIndex + 2 };
    }

    return {
      error: `Invalid config type "${String(configType)}". Accepted values: default, named`,
    };
  }

  /**
   * Parses mutually exclusive `--add` and `--remove` flags.
   * @param flags Parsed command flags map.
   * @returns Optional add/remove operation or a validation error.
   */
  public getAddRemoveOperation(
    flags: Map<string, string | true>,
  ): { operation?: AddRemoveOperation } | { error: string } {
    const addFlag = flags.get("add") === true;
    const removeFlag = flags.get("remove") === true;

    if (addFlag && removeFlag) {
      return { error: "Cannot use both --add and --remove." };
    }
    if (flags.has("add") && flags.get("add") !== true) {
      return { error: "--add does not take a value." };
    }
    if (flags.has("remove") && flags.get("remove") !== true) {
      return { error: "--remove does not take a value." };
    }

    if (addFlag) {
      return { operation: "add" };
    }
    if (removeFlag) {
      return { operation: "remove" };
    }
    return {};
  }

  /**
   * Enumerates available settings profile names from disk.
   * @returns Sorted profile names with `.config.json` removed.
   */
  public listConfigNames(): string[] {
    if (!fs.existsSync(SETTINGS_DIR)) {
      return [];
    }
    const files = fs
      .readdirSync(SETTINGS_DIR)
      .filter((fileName) => fileName.endsWith(".config.json"))
      .sort();

    return files.map((fileName) => fileName.replace(/\.config\.json$/, ""));
  }

  /**
   * Reads and parses a raw settings profile JSON file.
   * @param configName Profile name to read.
   * @returns Parsed raw settings data or a not-found error.
   */
  public readRawSettings(
    configName: string,
  ): { data: RawSettingsFile } | { error: string } {
    const configPath = this.configPath(configName);
    if (!fs.existsSync(configPath)) {
      return { error: `Profile not found: ${configName}` };
    }
    const raw = fs.readFileSync(configPath, "utf-8");
    return { data: JSON.parse(raw) as RawSettingsFile };
  }

  /**
   * Persists raw settings data to `<name>.config.json`.
   * @param settings Raw settings payload to write.
   * @returns Nothing.
   */
  public writeRawSettings(settings: RawSettingsFile): void {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    fs.writeFileSync(
      this.configPath(settings.name),
      `${JSON.stringify(settings, null, 2)}\n`,
      "utf-8",
    );
  }

  /**
   * Builds the absolute path for a settings profile JSON file.
   * @param configName Profile name without file extension.
   * @returns Absolute path to the profile JSON file.
   */
  public configPath(configName: string): string {
    return path.join(SETTINGS_DIR, `${configName}.config.json`);
  }

  /**
   * Reloads active runtime settings if the edited profile is currently active.
   * @param profileName Profile name that was modified.
   * @returns Nothing.
   */
  public reloadActiveSettingsIfNeeded(profileName: string): void {
    const state = requireGlobalReplState();

    if (state.settings.configName === profileName) {
      state.settings.loadSettings(profileName);
    }
  }
}
