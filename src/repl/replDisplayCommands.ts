import { getGlobalReplCurrentMode, getGlobalReplSettings } from "../global/ReplStateStore";
import type { AgentMode } from "../global/Settings";
import {
  ANSI_BOLD,
  ANSI_LIGHT_GRAY,
  ANSI_PURPLE,
  ANSI_RESET,
  ANSI_WHITE,
  COMMAND_DETAILS,
  COMMAND_SUMMARIES,
  MODES,
} from "./replExecutorConstants";
import { ReplExecutorSupport } from "./replExecutorSupport";
import type { ParsedCommand } from "./replParser";

/**
 * Handles read-only REPL commands that render help and runtime status output.
 */
export class ReplDisplayCommands {
  /**
   * Creates display command handlers with shared utility support.
   * @param support Shared validation and profile utility helper.
   */
  public constructor(private readonly support: ReplExecutorSupport) {}

  /**
   * Builds a summary list of all supported slash commands.
   * @returns Newline-delimited help text with ANSI styling.
   */
  public executeHelp(): string {
    const lines = Object.keys(COMMAND_SUMMARIES).map(
      (name) =>
        `${ANSI_WHITE}${ANSI_PURPLE}/${name}${ANSI_WHITE} - ${COMMAND_SUMMARIES[name]}${ANSI_RESET}`,
    );
    return lines.join("\n");
  }

  /**
   * Shows detailed usage text for a specific command.
   * @param command Parsed `/describe` command and arguments.
   * @returns Detailed command help or a usage/validation message.
   */
  public executeDescribe(command: ParsedCommand): string {
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
    return this.colorizeCommandText(detail);
  }

  /**
   * Lists configured agents and their effective runtime settings.
   * @param command Parsed `/agents` command and optional mode filter.
   * @returns Formatted agent listing or a usage/validation message.
   */
  public executeAgents(command: ParsedCommand): string {
    if (command.flags.size > 0) {
      return "Usage: /agents [<mode>]";
    }

    if (command.args.length > 1) {
      return "Usage: /agents [<mode>]";
    }

    const filterMode = command.args[0];
    if (filterMode !== undefined && !this.support.isMode(filterMode)) {
      return `Invalid mode "${filterMode}". Accepted values: ${MODES.join(", ")}`;
    }

    const modes = filterMode !== undefined ? [filterMode] : MODES;
    const settings = getGlobalReplSettings();
    const lines: string[] = [];
    for (const [index, mode] of modes.entries()) {
      if (index > 0) {
        lines.push("");
      }
      const agents = settings.agentSettings[mode];
      lines.push(`${ANSI_BOLD}Mode: ${this.displayModeName(mode)}${ANSI_RESET}`);
      for (const [agentName, agentSetting] of Object.entries(agents)) {
        const effectivePersonality =
          agentSetting.personality === "default"
            ? settings.defaultPersonality
            : agentSetting.personality;
        const effectiveReasoning =
          agentSetting.reasoning === "default"
            ? settings.defaultReasoning
            : agentSetting.reasoning;
        const effectiveModel =
          agentSetting.model === "default"
            ? settings.defaultModel
            : agentSetting.model;
        lines.push(`  ${ANSI_PURPLE}${agentName}${ANSI_RESET}`);
        lines.push(`    Description: ${agentSetting.description}`);
        lines.push(`    Personality: ${effectivePersonality}`);
        lines.push(`    Model: ${effectiveModel}`);
        lines.push(`    Reasoning: ${effectiveReasoning}`);
      }
    }
    return lines.join("\n");
  }

  /**
   * Prints current runtime status rows for the REPL session.
   * @param command Parsed `/status` command.
   * @returns ANSI-formatted status output or usage text.
   */
  public executeStatus(command: ParsedCommand): string {
    if (command.args.length !== 0 || command.flags.size > 0) {
      return "Usage: /status";
    }

    const rows: Array<[string, string]> = [
      ["Mode:", getGlobalReplCurrentMode()],
      ["Context window:", "yes"],
      ["Weekly limit:", "however much you're willing to pay, it's your api key"],
    ];
    const labelWidth = rows.reduce(
      (max, [label]) => Math.max(max, label.length),
      0,
    );

    return rows
      .map(
        ([label, value]) =>
          `${ANSI_LIGHT_GRAY}${label.padEnd(labelWidth + 2)}${ANSI_RESET} ${ANSI_WHITE}${value}${ANSI_RESET}`,
      )
      .join("\n");
  }

  /**
   * Converts internal mode values into user-facing labels.
   * @param mode Internal mode identifier.
   * @returns Display name for the mode.
   */
  private displayModeName(mode: AgentMode): string {
    if (mode === "ask") {
      return "Chat";
    }
    return `${mode.charAt(0).toUpperCase()}${mode.slice(1)}`;
  }

  /**
   * Colors slash-command tokens while preserving surrounding text.
   * @param text Text that may include command tokens.
   * @returns ANSI-colored text for terminal output.
   */
  private colorizeCommandText(text: string): string {
    const commandTokenPattern = /\/[a-z][a-z0-9_-]*/gi;
    const colored = text.replace(
      commandTokenPattern,
      (token) => `${ANSI_PURPLE}${token}${ANSI_WHITE}`,
    );
    return `${ANSI_WHITE}${colored}${ANSI_RESET}`;
  }
}
