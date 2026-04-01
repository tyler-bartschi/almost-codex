import * as fs from "fs";
import { requireGlobalReplState } from "../global/ReplStateStore";
import {
  type AddRemoveOperation,
  type Settings,
} from "../global/Settings";
import {
  MODELS,
  PERMISSIONS,
  PERSONALITIES,
  REASONING,
  SAFETY_MODES,
} from "./replExecutorConstants";
import { ReplExecutorSupport } from "./replExecutorSupport";
import type { RawSettingsFile } from "./replExecutorTypes";
import type { ParsedCommand } from "./replParser";

/**
 * Handles `/config` subcommands for profile listing, CRUD, and field mutation.
 */
export class ReplConfigCommands {
  /**
   * Creates config command handlers with shared utility support.
   * @param support Shared validation and profile utility helper.
   */
  public constructor(private readonly support: ReplExecutorSupport) {}

  /**
   * Dispatches `/config` subcommands.
   * @param command Parsed `/config` command.
   * @returns Subcommand result text or validation errors.
   */
  public executeConfig(command: ParsedCommand): string {
    if (command.args.length === 0) {
      return "Usage: /config <list|show|use|create|delete|set|revert> ...";
    }

    const subcommand = command.args[0];
    switch (subcommand) {
      case "list":
        return this.configList(command);
      case "show":
        return this.configShow(command);
      case "use":
        return this.configUse(command);
      case "create":
        return this.configCreate(command);
      case "delete":
        return this.configDelete(command);
      case "set":
        return this.configSet(command);
      case "revert":
        return this.configRevert(command);
      default:
        return `Unknown config subcommand "${subcommand}".`;
    }
  }

  /**
   * Lists available profile names and marks the active profile.
   * @param command Parsed `/config list` command.
   * @returns Newline-delimited profile list or usage text.
   */
  private configList(command: ParsedCommand): string {
    if (command.args.length !== 1 || command.flags.size > 0) {
      return "Usage: /config list";
    }

    const state = requireGlobalReplState();
    const names = this.support.listConfigNames().filter((name) => name !== "system_default");
    const lines = names.map((name) => {
      const activeMarker = name === state.settings.configName ? " (active)" : "";
      return `${name}${activeMarker}`;
    });
    return lines.join("\n");
  }

  /**
   * Displays raw JSON for the active, default, or named profile.
   * @param command Parsed `/config show` command.
   * @returns Pretty-printed JSON or a usage/profile error.
   */
  private configShow(command: ParsedCommand): string {
    if (command.flags.size > 0) {
      return "Usage: /config show [default|named <name>]";
    }

    const state = requireGlobalReplState();
    if (command.args.length === 1) {
      const raw = this.support.readRawSettings(state.settings.configName);
      if ("error" in raw) {
        return raw.error;
      }
      return JSON.stringify(raw.data, null, 2);
    }

    if (command.args[1] === "default" && command.args.length === 2) {
      const raw = this.support.readRawSettings("user_default");
      if ("error" in raw) {
        return raw.error;
      }
      return JSON.stringify(raw.data, null, 2);
    }

    if (command.args[1] === "named" && command.args.length === 3) {
      const profileName = command.args[2];
      if (profileName === undefined) {
        return "Usage: /config show [default|named <name>]";
      }
      const raw = this.support.readRawSettings(profileName);
      if ("error" in raw) {
        return raw.error;
      }
      return JSON.stringify(raw.data, null, 2);
    }

    return "Usage: /config show [default|named <name>]";
  }

  /**
   * Switches active runtime settings to a named profile.
   * @param command Parsed `/config use` command.
   * @returns Success or usage/profile validation message.
   */
  private configUse(command: ParsedCommand): string {
    if (command.args.length !== 2 || command.flags.size > 0) {
      return "Usage: /config use <name>";
    }

    const state = requireGlobalReplState();
    const profileName = command.args[1];
    if (profileName === "system_default") {
      return "Error: cannot use system_default as active profile.";
    }

    try {
      state.settings.loadSettings(profileName);
      return `Active profile set to "${profileName}".`;
    } catch {
      return `Profile not found: ${profileName}`;
    }
  }

  /**
   * Creates a named profile from `user_default` or another source profile.
   * @param command Parsed `/config create` command.
   * @returns Success or usage/profile validation message.
   */
  private configCreate(command: ParsedCommand): string {
    if (command.args.length !== 3 || command.args[1] !== "named") {
      return "Usage: /config create named <name> [--from default|<source_name>]";
    }

    const profileName = command.args[2];
    if (profileName === undefined) {
      return "Usage: /config create named <name> [--from default|<source_name>]";
    }
    if (profileName === "user_default" || profileName === "system_default") {
      return "Error: protected-resource error. Cannot create a named profile with reserved name.";
    }

    const existing = this.support.readRawSettings(profileName);
    if (!("error" in existing)) {
      return `Error: profile "${profileName}" already exists.`;
    }

    if (command.flags.size > 1 || (command.flags.size === 1 && !command.flags.has("from"))) {
      return "Usage: /config create named <name> [--from default|<source_name>]";
    }

    const fromFlag = command.flags.get("from");
    let sourceName = "user_default";
    if (fromFlag !== undefined) {
      if (fromFlag === true) {
        return "Usage: /config create named <name> [--from default|<source_name>]";
      }
      sourceName = fromFlag === "default" ? "user_default" : fromFlag;
    }

    const source = this.support.readRawSettings(sourceName);
    if ("error" in source) {
      return `Profile not found: ${sourceName}`;
    }

    const created: RawSettingsFile = {
      ...source.data,
      name: profileName,
    };
    this.support.writeRawSettings(created);
    return `Created profile "${profileName}" from "${sourceName}".`;
  }

  /**
   * Deletes a named profile, reverting active profile to user default if needed.
   * @param command Parsed `/config delete` command.
   * @returns Success or usage/profile validation message.
   */
  private configDelete(command: ParsedCommand): string {
    if (command.args.length !== 3 || command.args[1] !== "named" || command.flags.size > 0) {
      return "Usage: /config delete named <name>";
    }

    const state = requireGlobalReplState();
    const profileName = command.args[2];
    if (profileName === undefined) {
      return "Usage: /config delete named <name>";
    }
    if (profileName === "user_default" || profileName === "system_default") {
      return "Error: protected-resource error. Cannot delete reserved profile.";
    }

    const configPath = this.support.configPath(profileName);
    if (!fs.existsSync(configPath)) {
      return `Profile not found: ${profileName}`;
    }

    fs.unlinkSync(configPath);

    if (state.settings.configName === profileName) {
      state.settings.loadSettings("user_default");
    }
    return `Deleted profile "${profileName}".`;
  }

  /**
   * Applies a targeted field mutation to a default or named profile.
   * @param command Parsed `/config set` command.
   * @returns Success or usage/validation message.
   */
  private configSet(command: ParsedCommand): string {
    const parseTarget = this.support.parseConfigTypeAndName(command.args, 1);
    if ("error" in parseTarget) {
      return `${parseTarget.error}\nUsage: /config set <type> [<name>] --field <field> --value <value>`;
    }

    const allowedFlags = new Set(["field", "value", "add", "remove"]);
    for (const flag of command.flags.keys()) {
      if (!allowedFlags.has(flag)) {
        return "Usage: /config set <type> [<name>] --field <field> --value <value>";
      }
    }

    if (command.args.length !== parseTarget.nextIndex) {
      return "Usage: /config set <type> [<name>] --field <field> --value <value>";
    }

    const fieldFlag = command.flags.get("field");
    const valueFlag = command.flags.get("value");
    if (fieldFlag === undefined || valueFlag === undefined || fieldFlag === true || valueFlag === true) {
      return "Usage: /config set <type> [<name>] --field <field> --value <value>";
    }

    if (parseTarget.profileName === "system_default") {
      return "Error: protected-resource error. Cannot modify system_default.";
    }

    const targetSettingsLoad = this.support.loadSettingsProfile(parseTarget.profileName);
    if ("error" in targetSettingsLoad) {
      return targetSettingsLoad.error;
    }
    const targetSettings = targetSettingsLoad.settings;

    const field = fieldFlag;
    const value = valueFlag;
    const operation = this.support.getAddRemoveOperation(command.flags);
    if ("error" in operation) {
      return operation.error;
    }

    const applyResult = this.applyConfigSetField(
      targetSettings,
      field,
      value,
      operation.operation,
    );
    if ("error" in applyResult) {
      return applyResult.error;
    }

    this.support.reloadActiveSettingsIfNeeded(parseTarget.profileName);
    return `Updated "${field}" on profile "${parseTarget.profileName}".`;
  }

  /**
   * Reverts an entire profile or one field from `system_default`.
   * @param command Parsed `/config revert` command.
   * @returns Success or usage/validation message.
   */
  private configRevert(command: ParsedCommand): string {
    const parseTarget = this.support.parseConfigTypeAndName(command.args, 1);
    if ("error" in parseTarget) {
      return `${parseTarget.error}\nUsage: /config revert <type> [<name>] [--field <field>]`;
    }

    if (command.args.length !== parseTarget.nextIndex) {
      return "Usage: /config revert <type> [<name>] [--field <field>]";
    }

    for (const flagName of command.flags.keys()) {
      if (flagName !== "field") {
        return "Usage: /config revert <type> [<name>] [--field <field>]";
      }
    }

    if (parseTarget.profileName === "system_default") {
      return "Error: protected-resource error. Cannot modify system_default.";
    }

    const fieldFlag = command.flags.get("field");
    if (fieldFlag === true) {
      return "Usage: /config revert <type> [<name>] [--field <field>]";
    }

    const systemRaw = this.support.readRawSettings("system_default");
    if ("error" in systemRaw) {
      return systemRaw.error;
    }
    const targetRawResult = this.support.readRawSettings(parseTarget.profileName);
    if ("error" in targetRawResult) {
      return targetRawResult.error;
    }

    let targetRaw = targetRawResult.data;
    if (fieldFlag === undefined) {
      targetRaw = {
        ...systemRaw.data,
        name: parseTarget.profileName,
      };
      this.support.writeRawSettings(targetRaw);
      this.support.reloadActiveSettingsIfNeeded(parseTarget.profileName);
      return `Reverted entire profile "${parseTarget.profileName}" from system_default.`;
    }

    const revertedField = this.copyFieldFromSource(targetRaw, systemRaw.data, fieldFlag);
    if ("error" in revertedField) {
      return revertedField.error;
    }

    this.support.writeRawSettings(targetRaw);
    this.support.reloadActiveSettingsIfNeeded(parseTarget.profileName);
    return `Reverted field "${fieldFlag}" on profile "${parseTarget.profileName}" from system_default.`;
  }

  /**
   * Applies one `config set` field mutation to a settings instance.
   * @param settings Target settings instance to mutate.
   * @param field Canonical field path to modify.
   * @param value Input value for the field.
   * @param operation Optional add/remove operation for list-like fields.
   * @returns `{ ok: true }` on success or `{ error }` on failure.
   */
  private applyConfigSetField(
    settings: Settings,
    field: string,
    value: string,
    operation: AddRemoveOperation | undefined,
  ): { ok: true } | { error: string } {
    if (field === "default_personality") {
      if (operation !== undefined) {
        return { error: "Flag mismatch: --add/--remove not allowed for default_personality." };
      }
      if (!this.support.isPersonality(value)) {
        return { error: `Invalid value "${value}". Accepted: ${PERSONALITIES.join(", ")}` };
      }
      settings.defaultPersonality = value;
      return { ok: true };
    }

    if (field === "default_reasoning") {
      if (operation !== undefined) {
        return { error: "Flag mismatch: --add/--remove not allowed for default_reasoning." };
      }
      if (!this.support.isReasoning(value)) {
        return { error: `Invalid value "${value}". Accepted: ${REASONING.join(", ")}` };
      }
      settings.defaultReasoning = value;
      return { ok: true };
    }

    if (field === "default_model") {
      if (operation !== undefined) {
        return { error: "Flag mismatch: --add/--remove not allowed for default_model." };
      }
      if (!this.support.isModel(value)) {
        return { error: `Invalid value "${value}". Accepted: ${MODELS.join(", ")}` };
      }
      settings.defaultModel = value;
      return { ok: true };
    }

    if (field === "git_mode") {
      if (operation !== undefined) {
        return { error: "Flag mismatch: --add/--remove not allowed for git_mode." };
      }
      if (!this.support.isSafetyMode(value)) {
        return { error: `Invalid value "${value}". Accepted: ${SAFETY_MODES.join(", ")}` };
      }
      settings.gitMode = value;
      return { ok: true };
    }

    if (field === "script_mode") {
      if (operation !== undefined) {
        return { error: "Flag mismatch: --add/--remove not allowed for script_mode." };
      }
      if (!this.support.isSafetyMode(value)) {
        return { error: `Invalid value "${value}". Accepted: ${SAFETY_MODES.join(", ")}` };
      }
      settings.scriptMode = value;
      return { ok: true };
    }

    if (field === "protected" || field === "concealed") {
      if (operation === undefined) {
        return { error: `Missing required flag for "${field}". Use --add or --remove.` };
      }
      const parsed = this.support.parsePathOrObjectValue(value);
      if ("error" in parsed) {
        return { error: parsed.error };
      }
      if (field === "protected") {
        settings.setProtectedObjects(operation, parsed.value);
      } else {
        settings.setConcealedObjects(operation, parsed.value);
      }
      return { ok: true };
    }

    const parsedAgentField = this.support.parseAgentField(field);
    if (!("error" in parsedAgentField)) {
      if (parsedAgentField.setting === "permissions") {
        if (operation === undefined) {
          return { error: `Missing required flag for "${field}". Use --add or --remove.` };
        }
        if (!this.support.isPermission(value)) {
          return { error: `Invalid permission "${value}". Accepted: ${PERMISSIONS.join(", ")}` };
        }
        settings.setAgentSetting(
          parsedAgentField.mode,
          parsedAgentField.agentName,
          "permissions",
          value,
          operation,
        );
        return { ok: true };
      }

      if (operation !== undefined) {
        return {
          error: `Flag mismatch: --add/--remove not allowed for "${field}".`,
        };
      }

      if (parsedAgentField.setting === "personality") {
        if (!this.support.isPersonality(value) && value !== "default") {
          return {
            error: `Invalid value "${value}". Accepted: ${PERSONALITIES.join(", ")}, default`,
          };
        }
        settings.setAgentSetting(
          parsedAgentField.mode,
          parsedAgentField.agentName,
          "personality",
          value,
        );
        return { ok: true };
      }

      if (parsedAgentField.setting === "reasoning") {
        if (!this.support.isReasoning(value) && value !== "default") {
          return {
            error: `Invalid value "${value}". Accepted: ${REASONING.join(", ")}, default`,
          };
        }
        settings.setAgentSetting(
          parsedAgentField.mode,
          parsedAgentField.agentName,
          "reasoning",
          value,
        );
        return { ok: true };
      }

      if (!this.support.isModel(value) && value !== "default") {
        return {
          error: `Invalid value "${value}". Accepted: ${MODELS.join(", ")}, default`,
        };
      }
      settings.setAgentSetting(parsedAgentField.mode, parsedAgentField.agentName, "model", value);
      return { ok: true };
    }

    return { error: `Invalid field "${field}". Use /describe config for supported fields.` };
  }

  /**
   * Copies a supported field value from one raw profile payload to another.
   * @param target Destination raw profile to mutate.
   * @param source Source raw profile to copy from.
   * @param field Field path/name to copy.
   * @returns `{ ok: true }` on success or `{ error }` on failure.
   */
  private copyFieldFromSource(
    target: RawSettingsFile,
    source: RawSettingsFile,
    field: string,
  ): { ok: true } | { error: string } {
    if (field === "default_personality") {
      target.default_personality = source.default_personality;
      return { ok: true };
    }
    if (field === "default_reasoning") {
      target.default_reasoning = source.default_reasoning;
      return { ok: true };
    }
    if (field === "default_model") {
      target.default_model = source.default_model;
      return { ok: true };
    }
    if (field === "git_mode") {
      target.git_mode = source.git_mode;
      return { ok: true };
    }
    if (field === "script_mode") {
      target.script_mode = source.script_mode;
      return { ok: true };
    }
    if (field === "protected") {
      target.protected = source.protected;
      return { ok: true };
    }
    if (field === "concealed") {
      target.concealed = source.concealed;
      return { ok: true };
    }

    const agentField = this.support.parseAgentField(field);
    if ("error" in agentField) {
      return { error: `Invalid field "${field}". Use /describe config for supported fields.` };
    }

    const sourceAgentMode = source.agents[agentField.mode];
    const targetAgentMode = target.agents[agentField.mode];
    const sourceAgent = sourceAgentMode[agentField.agentName];
    const targetAgent = targetAgentMode[agentField.agentName];
    if (!sourceAgent || !targetAgent) {
      return { error: `Unknown agent in field "${field}".` };
    }

    if (agentField.setting === "permissions") {
      targetAgent.permissions = [...sourceAgent.permissions];
      return { ok: true };
    }
    if (agentField.setting === "personality") {
      targetAgent.personality = sourceAgent.personality;
      return { ok: true };
    }
    if (agentField.setting === "reasoning") {
      targetAgent.reasoning = sourceAgent.reasoning;
      return { ok: true };
    }
    targetAgent.model = sourceAgent.model;
    return { ok: true };
  }
}
