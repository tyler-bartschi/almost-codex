import type { ParsedCommand } from "./replParser";
import { ReplConfigCommands } from "./replConfigCommands";
import { ReplDisplayCommands } from "./replDisplayCommands";
import { ReplObjectListCommands } from "./replObjectListCommands";
import { ReplProfileCommands } from "./replProfileCommands";
import { ReplExecutorSupport } from "./replExecutorSupport";
import type { ReplState } from "./replExecutorTypes";

export type { ReplState } from "./replExecutorTypes";

/**
 * Executes parsed REPL slash commands and applies validated changes to
 * interactive mode state and persisted settings profiles.
 */
export class ReplExecutor {
  private readonly support = new ReplExecutorSupport();

  private readonly displayCommands = new ReplDisplayCommands(this.support);

  private readonly profileCommands = new ReplProfileCommands(this.support);

  private readonly configCommands = new ReplConfigCommands(this.support);

  private readonly objectListCommands = new ReplObjectListCommands(this.support);

  /**
   * Executes a parsed slash command against the current REPL state.
   * @param command Parsed command name, positional arguments, and flags.
   * @param state Mutable REPL runtime state, including active mode and settings.
   * @returns A user-facing status or error message for the command result.
   */
  public execute(command: ParsedCommand, state: ReplState): string {
    try {
      switch (command.name) {
        case "help":
          return this.displayCommands.executeHelp();
        case "describe":
          return this.displayCommands.executeDescribe(command);
        case "agents":
          return this.displayCommands.executeAgents(command, state);
        case "model":
          return this.profileCommands.executeModel(command, state);
        case "reasoning":
          return this.profileCommands.executeReasoning(command, state);
        case "personality":
          return this.profileCommands.executePersonality(command, state);
        case "config":
          return this.configCommands.executeConfig(command, state);
        case "ask":
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
          return this.profileCommands.executeGit(command, state);
        case "script":
          return this.profileCommands.executeScript(command, state);
        case "status":
          return this.displayCommands.executeStatus(command, state);
        case "protect":
          return this.objectListCommands.executeProtect(command, state);
        case "conceal":
          return this.objectListCommands.executeConceal(command, state);
        case "clear":
          state.shouldClear = true;
          return "";
        case "quit":
        case "exit":
          state.shouldExit = true;
          return "Exiting REPL.";
        default:
          return "Unknown command. Use /help.";
      }
    } catch (error) {
      return `Error: ${this.support.toErrorMessage(error)}`;
    }
  }

  /**
   * Triggers the one-off test workflow placeholder command.
   * @param command Parsed `/test` command, optional prompt, and flags.
   * @returns A placeholder execution message or usage error.
   */
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
}
