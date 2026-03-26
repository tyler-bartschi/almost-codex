import type { ParsedCommand } from "./replParser";
import type { ReplState } from "./replExecutorTypes";
import { MODELS, PERSONALITIES, REASONING } from "./replExecutorConstants";
import { ReplExecutorSupport } from "./replExecutorSupport";

/**
 * Handles REPL commands that edit default and per-agent runtime profile values.
 */
export class ReplProfileCommands {
  /**
   * Creates profile command handlers with shared utility support.
   * @param support Shared validation and profile utility helper.
   */
  public constructor(private readonly support: ReplExecutorSupport) {}

  /**
   * Updates the default model or a specific agent model override.
   * @param command Parsed `/model` command with args/flags.
   * @param state Current REPL state used for settings updates.
   * @returns Success or validation message.
   */
  public executeModel(command: ParsedCommand, state: ReplState): string {
    const parsedProfile = this.support.readOptionalProfileFlag(
      command,
      "Usage: /model <model> | /model <agent_id> <model>",
    );
    if ("error" in parsedProfile) {
      return parsedProfile.error;
    }

    if (command.args.length !== 1 && command.args.length !== 2) {
      return "Usage: /model <model> | /model <agent_id> <model>";
    }

    const target = this.support.resolveTargetSettings(state, parsedProfile.profileName);
    if ("error" in target) {
      return target.error;
    }

    if (command.args.length === 1) {
      const model = command.args[0];
      if (model === undefined) {
        return "Usage: /model <model> | /model <agent_id> <model>";
      }
      if (!this.support.isModel(model)) {
        return `Invalid model "${model}". Accepted values: ${MODELS.join(", ")}`;
      }
      target.settings.defaultModel = model;
      this.support.reloadActiveSettingsIfNeeded(target.name, state);
      return `Set default model to ${model} on profile "${target.name}".`;
    }

    const agentId = command.args[0];
    const model = command.args[1];
    if (agentId === undefined || model === undefined) {
      return "Usage: /model <model> | /model <agent_id> <model>";
    }
    if (!this.support.isModel(model)) {
      return `Invalid model "${model}". Accepted values: ${MODELS.join(", ")}`;
    }

    const resolvedAgent = this.support.resolveAgentIdentifier(agentId, target.settings);
    if ("error" in resolvedAgent) {
      return resolvedAgent.error;
    }

    target.settings.setAgentSetting(
      resolvedAgent.mode,
      resolvedAgent.agentName,
      "model",
      model,
    );
    this.support.reloadActiveSettingsIfNeeded(target.name, state);
    return `Set model for ${resolvedAgent.mode}.${resolvedAgent.agentName} to ${model} on profile "${target.name}".`;
  }

  /**
   * Updates the default reasoning level or an agent reasoning override.
   * @param command Parsed `/reasoning` command with args/flags.
   * @param state Current REPL state used for settings updates.
   * @returns Success or validation message.
   */
  public executeReasoning(command: ParsedCommand, state: ReplState): string {
    const parsedProfile = this.support.readOptionalProfileFlag(
      command,
      "Usage: /reasoning <reasoning> | /reasoning <agent_id> <reasoning>",
    );
    if ("error" in parsedProfile) {
      return parsedProfile.error;
    }

    if (command.args.length !== 1 && command.args.length !== 2) {
      return "Usage: /reasoning <reasoning> | /reasoning <agent_id> <reasoning>";
    }

    const target = this.support.resolveTargetSettings(state, parsedProfile.profileName);
    if ("error" in target) {
      return target.error;
    }

    if (command.args.length === 1) {
      const reasoning = command.args[0];
      if (reasoning === undefined) {
        return "Usage: /reasoning <reasoning> | /reasoning <agent_id> <reasoning>";
      }
      if (!this.support.isReasoning(reasoning)) {
        return `Invalid reasoning "${reasoning}". Accepted values: ${REASONING.join(", ")}`;
      }
      target.settings.defaultReasoning = reasoning;
      this.support.reloadActiveSettingsIfNeeded(target.name, state);
      return `Set default reasoning to ${reasoning} on profile "${target.name}".`;
    }

    const agentId = command.args[0];
    const reasoning = command.args[1];
    if (agentId === undefined || reasoning === undefined) {
      return "Usage: /reasoning <reasoning> | /reasoning <agent_id> <reasoning>";
    }
    if (!this.support.isReasoning(reasoning)) {
      return `Invalid reasoning "${reasoning}". Accepted values: ${REASONING.join(", ")}`;
    }

    const resolvedAgent = this.support.resolveAgentIdentifier(agentId, target.settings);
    if ("error" in resolvedAgent) {
      return resolvedAgent.error;
    }

    target.settings.setAgentSetting(
      resolvedAgent.mode,
      resolvedAgent.agentName,
      "reasoning",
      reasoning,
    );
    this.support.reloadActiveSettingsIfNeeded(target.name, state);
    return `Set reasoning for ${resolvedAgent.mode}.${resolvedAgent.agentName} to ${reasoning} on profile "${target.name}".`;
  }

  /**
   * Lists available personalities or updates default/agent personality values.
   * @param command Parsed `/personality` command with args/flags.
   * @param state Current REPL state used for settings updates.
   * @returns Personality list, success message, or validation message.
   */
  public executePersonality(command: ParsedCommand, state: ReplState): string {
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

    const parsedProfile = this.support.readOptionalProfileFlag(
      command,
      "Usage: /personality --list | /personality <personality> | /personality <agent_id> <personality>",
    );
    if ("error" in parsedProfile) {
      return parsedProfile.error;
    }

    if (command.args.length !== 1 && command.args.length !== 2) {
      return "Usage: /personality <personality> | /personality <agent_id> <personality>";
    }

    const target = this.support.resolveTargetSettings(state, parsedProfile.profileName);
    if ("error" in target) {
      return target.error;
    }

    if (command.args.length === 1) {
      const personality = command.args[0];
      if (personality === undefined) {
        return "Usage: /personality <personality> | /personality <agent_id> <personality>";
      }
      if (!this.support.isPersonality(personality)) {
        return `Invalid personality "${personality}". Accepted values: ${PERSONALITIES.join(", ")}`;
      }
      target.settings.defaultPersonality = personality;
      this.support.reloadActiveSettingsIfNeeded(target.name, state);
      return `Set default personality to ${personality} on profile "${target.name}".`;
    }

    const agentId = command.args[0];
    const personality = command.args[1];
    if (agentId === undefined || personality === undefined) {
      return "Usage: /personality <personality> | /personality <agent_id> <personality>";
    }
    if (!this.support.isPersonality(personality)) {
      return `Invalid personality "${personality}". Accepted values: ${PERSONALITIES.join(", ")}`;
    }

    const resolvedAgent = this.support.resolveAgentIdentifier(agentId, target.settings);
    if ("error" in resolvedAgent) {
      return resolvedAgent.error;
    }

    target.settings.setAgentSetting(
      resolvedAgent.mode,
      resolvedAgent.agentName,
      "personality",
      personality,
    );
    this.support.reloadActiveSettingsIfNeeded(target.name, state);
    return `Set personality for ${resolvedAgent.mode}.${resolvedAgent.agentName} to ${personality} on profile "${target.name}".`;
  }

  /**
   * Sets git safety mode on the active profile.
   * @param command Parsed `/git` command flags.
   * @param state Current REPL state containing active settings.
   * @returns Success or usage message.
   */
  public executeGit(command: ParsedCommand, state: ReplState): string {
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

  /**
   * Sets script safety mode on the active profile.
   * @param command Parsed `/script` command flags.
   * @param state Current REPL state containing active settings.
   * @returns Success or usage message.
   */
  public executeScript(command: ParsedCommand, state: ReplState): string {
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
}
