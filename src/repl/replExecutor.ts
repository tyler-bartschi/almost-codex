import * as fs from "fs";
import * as path from "path";
import {
  FileSystemObject,
  type AddRemoveOperation,
  type AgentMode,
  type OpenAIModel,
  type OpenAIReasoningMode,
  type Personalities,
  Settings,
} from "../global/Settings";
import type { ParsedCommand } from "./replParser";

type SafetyMode = "safe" | "unsafe";
type PermissionToken = "read" | "write" | "scripts" | "spawn_agent";

interface RawAgentSetting {
  description: string;
  personality: Personalities | "default";
  reasoning: OpenAIReasoningMode | "default";
  model: OpenAIModel | "default";
  permissions: PermissionToken[];
}

interface RawSettingsFile {
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

export interface ReplState {
  currentMode: AgentMode;
  settings: Settings;
}

const MODES: AgentMode[] = ["ask", "code", "plan", "test", "document"];
const PERSONALITIES: Personalities[] = [
  "efficient",
  "friendly",
  "pirate",
  "sarcastic",
];
const REASONING: OpenAIReasoningMode[] = ["minimal", "low", "medium", "high"];
const MODELS: OpenAIModel[] = [
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
const SAFETY_MODES: SafetyMode[] = ["safe", "unsafe"];
const FILE_TYPES: Array<"file" | "directory"> = ["file", "directory"];
const PERMISSIONS: PermissionToken[] = ["read", "write", "scripts", "spawn_agent"];

const COMMAND_SUMMARIES: Record<string, string> = {
  help: "List all supported slash commands.",
  describe: "Show detailed usage for a command.",
  agents: "List configured agents and effective runtime settings.",
  model: "Set default model or per-agent model override.",
  reasoning: "Set default reasoning or per-agent reasoning override.",
  personality: "Set default personality or per-agent personality override.",
  config: "Manage config profiles and set/revert config fields.",
  chat: "Switch interactive mode to ask.",
  plan: "Switch interactive mode to plan.",
  code: "Switch interactive mode to code.",
  test: "Trigger one-off test workflow command.",
  document: "Switch interactive mode to document.",
  git: "Set git safety mode.",
  script: "Set script safety mode.",
  protect: "Manage protected filesystem objects.",
  conceal: "Manage concealed filesystem objects.",
};

const COMMAND_DETAILS: Record<string, string> = {
  help: "/help\nLists all supported commands.",
  describe:
    "/describe <command>\nShows syntax, accepted values, and examples for a command.\nExample: /describe config",
  agents:
    "/agents\n/agents <mode>\nModes: ask|code|plan|test|document\nLists agents with effective personality/reasoning/model values.",
  model:
    "/model <model>\n/model <agent_id> <model>\n--profile <name> optional.\nModels: gpt-5, gpt-5-mini, gpt-5-nano, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, o3, o3-mini, o4-mini",
  reasoning:
    "/reasoning <reasoning>\n/reasoning <agent_id> <reasoning>\n--profile <name> optional.\nReasoning: minimal|low|medium|high",
  personality:
    "/personality --list\n/personality <personality>\n/personality <agent_id> <personality>\n--profile <name> optional.\nPersonalities: efficient|friendly|pirate|sarcastic",
  config:
    "/config list\n/config show [default|named <name>]\n/config use <name>\n/config create named <name> [--from default|<source_name>]\n/config delete named <name>\n/config set <type> [<name>] --field <field> --value <value>\n/config revert <type> [<name>] [--field <field>]",
  chat: "/chat\nSwitches mode to ask.",
  plan: "/plan\nSwitches mode to plan.",
  code: "/code\nSwitches mode to code.",
  test:
    "/test [<prompt>] [--non-interactive]\nRuns one-off test workflow and returns results (placeholder behavior for now).",
  document: "/document\nSwitches mode to document.",
  git: "/git --safe\n/git --unsafe\nSets git_mode on active profile.",
  script: "/script --safe\n/script --unsafe\nSets script_mode on active profile.",
  protect:
    "/protect <path> [--type file|directory]\n/protect --remove <path> [--type file|directory]\n/protect --list",
  conceal:
    "/conceal <path> [--type file|directory]\n/conceal --remove <path> [--type file|directory]\n/conceal --list",
};

const SETTINGS_DIR = process.env.SETTINGS_DIR
  ? path.resolve(process.env.SETTINGS_DIR)
  : path.resolve(__dirname, "..", "settings");

export class ReplExecutor {
  public execute(command: ParsedCommand, state: ReplState): string {
    try {
      switch (command.name) {
        case "help":
          return this.executeHelp();
        case "describe":
          return this.executeDescribe(command);
        case "agents":
          return this.executeAgents(command, state);
        case "model":
          return this.executeModel(command, state);
        case "reasoning":
          return this.executeReasoning(command, state);
        case "personality":
          return this.executePersonality(command, state);
        case "config":
          return this.executeConfig(command, state);
        case "chat":
          state.currentMode = "ask";
          return "Switched mode to ask.";
        case "plan":
          state.currentMode = "plan";
          return "Switched mode to plan.";
        case "code":
          state.currentMode = "code";
          return "Switched mode to code.";
        case "test":
          return this.executeTest(command);
        case "document":
          state.currentMode = "document";
          return "Switched mode to document.";
        case "git":
          return this.executeGit(command, state);
        case "script":
          return this.executeScript(command, state);
        case "protect":
          return this.executeProtect(command, state);
        case "conceal":
          return this.executeConceal(command, state);
        default:
          return "Unknown command. Use /help.";
      }
    } catch (error) {
      return `Error: ${this.toErrorMessage(error)}`;
    }
  }

  private executeHelp(): string {
    const lines = Object.keys(COMMAND_SUMMARIES).map(
      (name) => `/${name} - ${COMMAND_SUMMARIES[name]}`,
    );
    return lines.join("\n");
  }

  private executeDescribe(command: ParsedCommand): string {
    if (command.args.length !== 1 || command.flags.size > 0) {
      return "Usage: /describe <command>";
    }

    const requestedArg = command.args[0];
    if (requestedArg === undefined) {
      return "Usage: /describe <command>";
    }
    const requested = requestedArg.replace(/^\//, "");
    const detail = COMMAND_DETAILS[requested];
    if (!detail) {
      return `Unknown command "${requested}". Use /help.`;
    }
    return detail;
  }

  private executeAgents(command: ParsedCommand, state: ReplState): string {
    if (command.flags.size > 0) {
      return "Usage: /agents [<mode>]";
    }

    if (command.args.length > 1) {
      return "Usage: /agents [<mode>]";
    }

    const filterMode = command.args[0];
    if (filterMode !== undefined && !this.isMode(filterMode)) {
      return `Invalid mode "${filterMode}". Accepted values: ${MODES.join(", ")}`;
    }

    const modes = filterMode !== undefined ? [filterMode] : MODES;
    const lines: string[] = [];
    for (const mode of modes) {
      const agents = state.settings.agentSettings[mode];
      lines.push(`Mode: ${mode}`);
      for (const [agentName, agentSetting] of Object.entries(agents)) {
        const effectivePersonality =
          agentSetting.personality === "default"
            ? state.settings.defaultPersonality
            : agentSetting.personality;
        const effectiveReasoning =
          agentSetting.reasoning === "default"
            ? state.settings.defaultReasoning
            : agentSetting.reasoning;
        const effectiveModel =
          agentSetting.model === "default"
            ? state.settings.defaultModel
            : agentSetting.model;
        lines.push(
          `${mode}.${agentName} | personality=${effectivePersonality} reasoning=${effectiveReasoning} model=${effectiveModel}`,
        );
        lines.push(`description: ${agentSetting.description}`);
      }
    }
    return lines.join("\n");
  }

  private executeModel(command: ParsedCommand, state: ReplState): string {
    const parsedProfile = this.readOptionalProfileFlag(command, "Usage: /model <model> | /model <agent_id> <model>");
    if ("error" in parsedProfile) {
      return parsedProfile.error;
    }

    if (command.args.length !== 1 && command.args.length !== 2) {
      return "Usage: /model <model> | /model <agent_id> <model>";
    }

    const target = this.resolveTargetSettings(state, parsedProfile.profileName);
    if ("error" in target) {
      return target.error;
    }

    if (command.args.length === 1) {
      const model = command.args[0];
      if (model === undefined) {
        return "Usage: /model <model> | /model <agent_id> <model>";
      }
      if (!this.isModel(model)) {
        return `Invalid model "${model}". Accepted values: ${MODELS.join(", ")}`;
      }
      target.settings.defaultModel = model;
      this.reloadActiveSettingsIfNeeded(target.name, state);
      return `Set default model to ${model} on profile "${target.name}".`;
    }

    const agentId = command.args[0];
    const model = command.args[1];
    if (agentId === undefined || model === undefined) {
      return "Usage: /model <model> | /model <agent_id> <model>";
    }
    if (!this.isModel(model)) {
      return `Invalid model "${model}". Accepted values: ${MODELS.join(", ")}`;
    }

    const resolvedAgent = this.resolveAgentIdentifier(agentId, target.settings);
    if ("error" in resolvedAgent) {
      return resolvedAgent.error;
    }

    target.settings.setAgentSetting(
      resolvedAgent.mode,
      resolvedAgent.agentName,
      "model",
      model,
    );
    this.reloadActiveSettingsIfNeeded(target.name, state);
    return `Set model for ${resolvedAgent.mode}.${resolvedAgent.agentName} to ${model} on profile "${target.name}".`;
  }

  private executeReasoning(command: ParsedCommand, state: ReplState): string {
    const parsedProfile = this.readOptionalProfileFlag(
      command,
      "Usage: /reasoning <reasoning> | /reasoning <agent_id> <reasoning>",
    );
    if ("error" in parsedProfile) {
      return parsedProfile.error;
    }

    if (command.args.length !== 1 && command.args.length !== 2) {
      return "Usage: /reasoning <reasoning> | /reasoning <agent_id> <reasoning>";
    }

    const target = this.resolveTargetSettings(state, parsedProfile.profileName);
    if ("error" in target) {
      return target.error;
    }

    if (command.args.length === 1) {
      const reasoning = command.args[0];
      if (reasoning === undefined) {
        return "Usage: /reasoning <reasoning> | /reasoning <agent_id> <reasoning>";
      }
      if (!this.isReasoning(reasoning)) {
        return `Invalid reasoning "${reasoning}". Accepted values: ${REASONING.join(", ")}`;
      }
      target.settings.defaultReasoning = reasoning;
      this.reloadActiveSettingsIfNeeded(target.name, state);
      return `Set default reasoning to ${reasoning} on profile "${target.name}".`;
    }

    const agentId = command.args[0];
    const reasoning = command.args[1];
    if (agentId === undefined || reasoning === undefined) {
      return "Usage: /reasoning <reasoning> | /reasoning <agent_id> <reasoning>";
    }
    if (!this.isReasoning(reasoning)) {
      return `Invalid reasoning "${reasoning}". Accepted values: ${REASONING.join(", ")}`;
    }

    const resolvedAgent = this.resolveAgentIdentifier(agentId, target.settings);
    if ("error" in resolvedAgent) {
      return resolvedAgent.error;
    }

    target.settings.setAgentSetting(
      resolvedAgent.mode,
      resolvedAgent.agentName,
      "reasoning",
      reasoning,
    );
    this.reloadActiveSettingsIfNeeded(target.name, state);
    return `Set reasoning for ${resolvedAgent.mode}.${resolvedAgent.agentName} to ${reasoning} on profile "${target.name}".`;
  }

  private executePersonality(command: ParsedCommand, state: ReplState): string {
    const allowedFlags = new Set(["profile", "list"]);
    for (const flagName of command.flags.keys()) {
      if (!allowedFlags.has(flagName)) {
        return "Usage: /personality --list | /personality <personality> | /personality <agent_id> <personality>";
      }
    }

    const listFlag = command.flags.get("list") === true;
    if (listFlag) {
      if (command.args.length > 0 || command.flags.has("profile")) {
        return "Usage: /personality --list";
      }
      return PERSONALITIES.join("\n");
    }

    const parsedProfile = this.readOptionalProfileFlag(
      command,
      "Usage: /personality --list | /personality <personality> | /personality <agent_id> <personality>",
    );
    if ("error" in parsedProfile) {
      return parsedProfile.error;
    }

    if (command.args.length !== 1 && command.args.length !== 2) {
      return "Usage: /personality <personality> | /personality <agent_id> <personality>";
    }

    const target = this.resolveTargetSettings(state, parsedProfile.profileName);
    if ("error" in target) {
      return target.error;
    }

    if (command.args.length === 1) {
      const personality = command.args[0];
      if (personality === undefined) {
        return "Usage: /personality <personality> | /personality <agent_id> <personality>";
      }
      if (!this.isPersonality(personality)) {
        return `Invalid personality "${personality}". Accepted values: ${PERSONALITIES.join(", ")}`;
      }
      target.settings.defaultPersonality = personality;
      this.reloadActiveSettingsIfNeeded(target.name, state);
      return `Set default personality to ${personality} on profile "${target.name}".`;
    }

    const agentId = command.args[0];
    const personality = command.args[1];
    if (agentId === undefined || personality === undefined) {
      return "Usage: /personality <personality> | /personality <agent_id> <personality>";
    }
    if (!this.isPersonality(personality)) {
      return `Invalid personality "${personality}". Accepted values: ${PERSONALITIES.join(", ")}`;
    }

    const resolvedAgent = this.resolveAgentIdentifier(agentId, target.settings);
    if ("error" in resolvedAgent) {
      return resolvedAgent.error;
    }

    target.settings.setAgentSetting(
      resolvedAgent.mode,
      resolvedAgent.agentName,
      "personality",
      personality,
    );
    this.reloadActiveSettingsIfNeeded(target.name, state);
    return `Set personality for ${resolvedAgent.mode}.${resolvedAgent.agentName} to ${personality} on profile "${target.name}".`;
  }

  private executeConfig(command: ParsedCommand, state: ReplState): string {
    if (command.args.length === 0) {
      return "Usage: /config <list|show|use|create|delete|set|revert> ...";
    }

    const subcommand = command.args[0];
    switch (subcommand) {
      case "list":
        return this.configList(command, state);
      case "show":
        return this.configShow(command, state);
      case "use":
        return this.configUse(command, state);
      case "create":
        return this.configCreate(command);
      case "delete":
        return this.configDelete(command, state);
      case "set":
        return this.configSet(command, state);
      case "revert":
        return this.configRevert(command, state);
      default:
        return `Unknown config subcommand "${subcommand}".`;
    }
  }

  private executeTest(command: ParsedCommand): string {
    if (command.flags.size > 0) {
      for (const [flagName, flagValue] of command.flags.entries()) {
        if (flagName !== "non-interactive" || flagValue !== true) {
          return "Usage: /test [<prompt>] [--non-interactive]";
        }
      }
    }

    const prompt = command.args.join(" ").trim();
    if (prompt.length > 0) {
      return `Test workflow triggered (placeholder). Prompt: ${prompt}`;
    }
    return "Test workflow triggered (placeholder).";
  }

  private executeGit(command: ParsedCommand, state: ReplState): string {
    if (command.args.length > 0) {
      return "Usage: /git --safe | /git --unsafe";
    }

    const safe = command.flags.get("safe") === true;
    const unsafe = command.flags.get("unsafe") === true;
    if ((safe && unsafe) || (!safe && !unsafe) || command.flags.size !== 1) {
      return "Usage: /git --safe | /git --unsafe";
    }

    state.settings.gitMode = safe ? "safe" : "unsafe";
    return `Set git_mode=${state.settings.gitMode} on profile "${state.settings.configName}".`;
  }

  private executeScript(command: ParsedCommand, state: ReplState): string {
    if (command.args.length > 0) {
      return "Usage: /script --safe | /script --unsafe";
    }

    const safe = command.flags.get("safe") === true;
    const unsafe = command.flags.get("unsafe") === true;
    if ((safe && unsafe) || (!safe && !unsafe) || command.flags.size !== 1) {
      return "Usage: /script --safe | /script --unsafe";
    }

    state.settings.scriptMode = safe ? "safe" : "unsafe";
    return `Set script_mode=${state.settings.scriptMode} on profile "${state.settings.configName}".`;
  }

  private executeProtect(command: ParsedCommand, state: ReplState): string {
    return this.executeObjectListCommand(command, state, "protected");
  }

  private executeConceal(command: ParsedCommand, state: ReplState): string {
    return this.executeObjectListCommand(command, state, "concealed");
  }

  private executeObjectListCommand(
    command: ParsedCommand,
    state: ReplState,
    target: "protected" | "concealed",
  ): string {
    const allowedFlags = new Set(["remove", "list", "type"]);
    for (const flagName of command.flags.keys()) {
      if (!allowedFlags.has(flagName)) {
        return target === "protected"
          ? "Usage: /protect <path> [--type file|directory] | /protect --remove <path> [--type file|directory] | /protect --list"
          : "Usage: /conceal <path> [--type file|directory] | /conceal --remove <path> [--type file|directory] | /conceal --list";
      }
    }

    const listFlag = command.flags.get("list") === true;
    const removeFlag = command.flags.get("remove") === true;
    const typeFlag = command.flags.get("type");

    if (listFlag) {
      if (command.args.length > 0 || removeFlag || typeFlag !== undefined) {
        return target === "protected"
          ? "Usage: /protect --list"
          : "Usage: /conceal --list";
      }

      const objects =
        target === "protected"
          ? state.settings.protectedObjects
          : state.settings.concealedObjects;
      if (objects.length === 0) {
        return "(none)";
      }
      return objects.map((object) => `${object.path} (${object.type})`).join("\n");
    }

    if (command.args.length !== 1) {
      return target === "protected"
        ? "Usage: /protect <path> [--type file|directory] | /protect --remove <path> [--type file|directory]"
        : "Usage: /conceal <path> [--type file|directory] | /conceal --remove <path> [--type file|directory]";
    }

    const pathValue = command.args[0];
    if (pathValue === undefined) {
      return target === "protected"
        ? "Usage: /protect <path> [--type file|directory] | /protect --remove <path> [--type file|directory]"
        : "Usage: /conceal <path> [--type file|directory] | /conceal --remove <path> [--type file|directory]";
    }
    let fileObjectType: "file" | "directory" | undefined;
    if (typeFlag !== undefined) {
      if (typeFlag === true || !this.isFileType(typeFlag)) {
        return `Invalid type "${String(typeFlag)}". Accepted values: ${FILE_TYPES.join(", ")}`;
      }
      fileObjectType = typeFlag;
    }

    const pathOrObject =
      fileObjectType === undefined
        ? pathValue
        : new FileSystemObject(pathValue, fileObjectType);
    const operation: AddRemoveOperation = removeFlag ? "remove" : "add";

    if (target === "protected") {
      state.settings.setProtectedObjects(operation, pathOrObject);
    } else {
      state.settings.setConcealedObjects(operation, pathOrObject);
    }

    const verb = operation === "add" ? "Added" : "Removed";
    return `${verb} ${target} object: ${pathValue}`;
  }

  private configList(command: ParsedCommand, state: ReplState): string {
    if (command.args.length !== 1 || command.flags.size > 0) {
      return "Usage: /config list";
    }

    const names = this.listConfigNames();
    const lines = names.map((name) => {
      const activeMarker = name === state.settings.configName ? " (active)" : "";
      return `${name}${activeMarker}`;
    });
    return lines.join("\n");
  }

  private configShow(command: ParsedCommand, state: ReplState): string {
    if (command.flags.size > 0) {
      return "Usage: /config show [default|named <name>]";
    }

    if (command.args.length === 1) {
      const raw = this.readRawSettings(state.settings.configName);
      if ("error" in raw) {
        return raw.error;
      }
      return JSON.stringify(raw.data, null, 2);
    }

    if (command.args[1] === "default" && command.args.length === 2) {
      const raw = this.readRawSettings("user_default");
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
      const raw = this.readRawSettings(profileName);
      if ("error" in raw) {
        return raw.error;
      }
      return JSON.stringify(raw.data, null, 2);
    }

    return "Usage: /config show [default|named <name>]";
  }

  private configUse(command: ParsedCommand, state: ReplState): string {
    if (command.args.length !== 2 || command.flags.size > 0) {
      return "Usage: /config use <name>";
    }

    const profileName = command.args[1];
    if (profileName === "system_default") {
      return "Error: cannot use system_default as active profile.";
    }

    try {
      state.settings.loadSettings(profileName);
      return `Active profile set to "${profileName}".`;
    } catch (error) {
      return `Profile not found: ${profileName}`;
    }
  }

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

    const existing = this.readRawSettings(profileName);
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

    const source = this.readRawSettings(sourceName);
    if ("error" in source) {
      return `Profile not found: ${sourceName}`;
    }

    const created: RawSettingsFile = {
      ...source.data,
      name: profileName,
    };
    this.writeRawSettings(created);
    return `Created profile "${profileName}" from "${sourceName}".`;
  }

  private configDelete(command: ParsedCommand, state: ReplState): string {
    if (command.args.length !== 3 || command.args[1] !== "named" || command.flags.size > 0) {
      return "Usage: /config delete named <name>";
    }

    const profileName = command.args[2];
    if (profileName === undefined) {
      return "Usage: /config delete named <name>";
    }
    if (profileName === "user_default" || profileName === "system_default") {
      return "Error: protected-resource error. Cannot delete reserved profile.";
    }

    const configPath = this.configPath(profileName);
    if (!fs.existsSync(configPath)) {
      return `Profile not found: ${profileName}`;
    }

    fs.unlinkSync(configPath);

    if (state.settings.configName === profileName) {
      state.settings.loadSettings("user_default");
    }
    return `Deleted profile "${profileName}".`;
  }

  private configSet(command: ParsedCommand, state: ReplState): string {
    const parseTarget = this.parseConfigTypeAndName(command.args, 1);
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

    const targetSettingsLoad = this.loadSettingsProfile(parseTarget.profileName);
    if ("error" in targetSettingsLoad) {
      return targetSettingsLoad.error;
    }
    const targetSettings = targetSettingsLoad.settings;

    const field = fieldFlag;
    const value = valueFlag;
    const operation = this.getAddRemoveOperation(command.flags);
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

    this.reloadActiveSettingsIfNeeded(parseTarget.profileName, state);
    return `Updated "${field}" on profile "${parseTarget.profileName}".`;
  }

  private configRevert(command: ParsedCommand, state: ReplState): string {
    const parseTarget = this.parseConfigTypeAndName(command.args, 1);
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

    const systemRaw = this.readRawSettings("system_default");
    if ("error" in systemRaw) {
      return systemRaw.error;
    }
    const targetRawResult = this.readRawSettings(parseTarget.profileName);
    if ("error" in targetRawResult) {
      return targetRawResult.error;
    }

    let targetRaw = targetRawResult.data;
    if (fieldFlag === undefined) {
      targetRaw = {
        ...systemRaw.data,
        name: parseTarget.profileName,
      };
      this.writeRawSettings(targetRaw);
      this.reloadActiveSettingsIfNeeded(parseTarget.profileName, state);
      return `Reverted entire profile "${parseTarget.profileName}" from system_default.`;
    }

    const revertedField = this.copyFieldFromSource(targetRaw, systemRaw.data, fieldFlag);
    if ("error" in revertedField) {
      return revertedField.error;
    }

    this.writeRawSettings(targetRaw);
    this.reloadActiveSettingsIfNeeded(parseTarget.profileName, state);
    return `Reverted field "${fieldFlag}" on profile "${parseTarget.profileName}" from system_default.`;
  }

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
      if (!this.isPersonality(value)) {
        return { error: `Invalid value "${value}". Accepted: ${PERSONALITIES.join(", ")}` };
      }
      settings.defaultPersonality = value;
      return { ok: true };
    }

    if (field === "default_reasoning") {
      if (operation !== undefined) {
        return { error: "Flag mismatch: --add/--remove not allowed for default_reasoning." };
      }
      if (!this.isReasoning(value)) {
        return { error: `Invalid value "${value}". Accepted: ${REASONING.join(", ")}` };
      }
      settings.defaultReasoning = value;
      return { ok: true };
    }

    if (field === "default_model") {
      if (operation !== undefined) {
        return { error: "Flag mismatch: --add/--remove not allowed for default_model." };
      }
      if (!this.isModel(value)) {
        return { error: `Invalid value "${value}". Accepted: ${MODELS.join(", ")}` };
      }
      settings.defaultModel = value;
      return { ok: true };
    }

    if (field === "git_mode") {
      if (operation !== undefined) {
        return { error: "Flag mismatch: --add/--remove not allowed for git_mode." };
      }
      if (!this.isSafetyMode(value)) {
        return { error: `Invalid value "${value}". Accepted: ${SAFETY_MODES.join(", ")}` };
      }
      settings.gitMode = value;
      return { ok: true };
    }

    if (field === "script_mode") {
      if (operation !== undefined) {
        return { error: "Flag mismatch: --add/--remove not allowed for script_mode." };
      }
      if (!this.isSafetyMode(value)) {
        return { error: `Invalid value "${value}". Accepted: ${SAFETY_MODES.join(", ")}` };
      }
      settings.scriptMode = value;
      return { ok: true };
    }

    if (field === "protected" || field === "concealed") {
      if (operation === undefined) {
        return { error: `Missing required flag for "${field}". Use --add or --remove.` };
      }
      const parsed = this.parsePathOrObjectValue(value);
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

    const parsedAgentField = this.parseAgentField(field);
    if (!("error" in parsedAgentField)) {
      if (parsedAgentField.setting === "permissions") {
        if (operation === undefined) {
          return { error: `Missing required flag for "${field}". Use --add or --remove.` };
        }
        if (!this.isPermission(value)) {
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
        if (!this.isPersonality(value) && value !== "default") {
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
        if (!this.isReasoning(value) && value !== "default") {
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

      if (!this.isModel(value) && value !== "default") {
        return {
          error: `Invalid value "${value}". Accepted: ${MODELS.join(", ")}, default`,
        };
      }
      settings.setAgentSetting(parsedAgentField.mode, parsedAgentField.agentName, "model", value);
      return { ok: true };
    }

    return { error: `Invalid field "${field}". Use /describe config for supported fields.` };
  }

  private parsePathOrObjectValue(
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
        return { error: `Invalid type "${String(parsedJson.type)}". Accepted: ${FILE_TYPES.join(", ")}` };
      }
      return { value: new FileSystemObject(parsedJson.path, parsedJson.type) };
    }

    return { value: parsedJson.path };
  }

  private parseAgentField(field: string):
    | {
        mode: AgentMode;
        agentName: string;
        setting: "personality" | "reasoning" | "model" | "permissions";
      }
    | { error: string } {
    const match = /^agents\.(ask|code|plan|test|document)\.([^.]+)\.(personality|reasoning|model|permissions)$/.exec(
      field,
    );
    if (!match) {
      return { error: "invalid agent field" };
    }
    return {
      mode: match[1] as AgentMode,
      agentName: match[2] as string,
      setting: match[3] as "personality" | "reasoning" | "model" | "permissions",
    };
  }

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

    const agentField = this.parseAgentField(field);
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

  private resolveAgentIdentifier(
    identifier: string,
    settings: Settings,
  ): { mode: AgentMode; agentName: string } | { error: string } {
    if (identifier.includes(".")) {
      const [modeCandidate, agentName] = identifier.split(".", 2);
      if (modeCandidate === undefined || !this.isMode(modeCandidate) || !agentName) {
        return { error: `Invalid agent identifier "${identifier}". Use <mode>.<agent>.` };
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

  private readOptionalProfileFlag(
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
      return { error: "Error: protected-resource error. Cannot modify system_default." };
    }

    return { profileName: profileFlag };
  }

  private resolveTargetSettings(
    state: ReplState,
    profileName?: string,
  ): { name: string; settings: Settings } | { error: string } {
    if (!profileName || profileName === state.settings.configName) {
      return { name: state.settings.configName, settings: state.settings };
    }

    const loaded = this.loadSettingsProfile(profileName);
    if ("error" in loaded) {
      return { error: loaded.error };
    }
    return { name: profileName, settings: loaded.settings };
  }

  private loadSettingsProfile(profileName: string): { settings: Settings } | { error: string } {
    try {
      return { settings: Settings.fromSettingsFile(profileName) };
    } catch {
      return { error: `Profile not found: ${profileName}` };
    }
  }

  private parseConfigTypeAndName(
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

    return { error: `Invalid config type "${String(configType)}". Accepted values: default, named` };
  }

  private getAddRemoveOperation(
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

  private listConfigNames(): string[] {
    if (!fs.existsSync(SETTINGS_DIR)) {
      return [];
    }
    const files = fs
      .readdirSync(SETTINGS_DIR)
      .filter((fileName) => fileName.endsWith(".config.json"))
      .sort();

    return files.map((fileName) => fileName.replace(/\.config\.json$/, ""));
  }

  private readRawSettings(configName: string): { data: RawSettingsFile } | { error: string } {
    const configPath = this.configPath(configName);
    if (!fs.existsSync(configPath)) {
      return { error: `Profile not found: ${configName}` };
    }
    const raw = fs.readFileSync(configPath, "utf-8");
    return { data: JSON.parse(raw) as RawSettingsFile };
  }

  private writeRawSettings(settings: RawSettingsFile): void {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    fs.writeFileSync(
      this.configPath(settings.name),
      `${JSON.stringify(settings, null, 2)}\n`,
      "utf-8",
    );
  }

  private configPath(configName: string): string {
    return path.join(SETTINGS_DIR, `${configName}.config.json`);
  }

  private reloadActiveSettingsIfNeeded(profileName: string, state: ReplState): void {
    if (state.settings.configName === profileName) {
      state.settings.loadSettings(profileName);
    }
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private isMode(value: string): value is AgentMode {
    return MODES.includes(value as AgentMode);
  }

  private isModel(value: string): value is OpenAIModel {
    return MODELS.includes(value as OpenAIModel);
  }

  private isReasoning(value: string): value is OpenAIReasoningMode {
    return REASONING.includes(value as OpenAIReasoningMode);
  }

  private isPersonality(value: string): value is Personalities {
    return PERSONALITIES.includes(value as Personalities);
  }

  private isSafetyMode(value: string): value is SafetyMode {
    return SAFETY_MODES.includes(value as SafetyMode);
  }

  private isFileType(value: string): value is "file" | "directory" {
    return FILE_TYPES.includes(value as "file" | "directory");
  }

  private isPermission(value: string): value is PermissionToken {
    return PERMISSIONS.includes(value as PermissionToken);
  }
}
