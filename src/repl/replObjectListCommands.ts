import { getGlobalReplSettings } from "../global/ReplStateStore";
import { FileSystemObject, type AddRemoveOperation } from "../global/Settings";
import { FILE_TYPES } from "./ReplExecutorConstants";
import { ReplExecutorSupport } from "./ReplExecutorSupport";
import type { ParsedCommand } from "./ReplParser";

/**
 * Handles `/protect` and `/conceal` commands for filesystem object lists.
 */
export class ReplObjectListCommands {
  /**
   * Creates object-list command handlers with shared utility support.
   * @param support Shared validation and profile utility helper.
   */
  public constructor(private readonly support: ReplExecutorSupport) {}

  /**
   * Executes `/protect` command operations.
   * @param command Parsed `/protect` command.
   * @returns Success, listing, or validation message.
   */
  public executeProtect(command: ParsedCommand): string {
    return this.executeObjectListCommand(command, "protected");
  }

  /**
   * Executes `/conceal` command operations.
   * @param command Parsed `/conceal` command.
   * @returns Success, listing, or validation message.
   */
  public executeConceal(command: ParsedCommand): string {
    return this.executeObjectListCommand(command, "concealed");
  }

  /**
   * Adds, removes, or lists protected/concealed objects in settings.
   * @param command Parsed command with args and flags.
   * @param target Whether to mutate `protected` or `concealed` objects.
   * @returns Success, listing, or validation message.
   */
  private executeObjectListCommand(
    command: ParsedCommand,
    target: "protected" | "concealed",
  ): string {
    const usageAll =
      target === "protected"
        ? "Usage: /protect <path> [--type file|directory] | /protect --remove <path> [--type file|directory] | /protect --list"
        : "Usage: /conceal <path> [--type file|directory] | /conceal --remove <path> [--type file|directory] | /conceal --list";
    const usageMutate =
      target === "protected"
        ? "Usage: /protect <path> [--type file|directory] | /protect --remove <path> [--type file|directory]"
        : "Usage: /conceal <path> [--type file|directory] | /conceal --remove <path> [--type file|directory]";

    const allowedFlags = new Set(["remove", "list", "type"]);
    for (const flagName of command.flags.keys()) {
      if (!allowedFlags.has(flagName)) {
        return usageAll;
      }
    }

    const listFlag = command.flags.get("list") === true;
    const removeFlagValue = command.flags.get("remove");
    const removeFlag = removeFlagValue !== undefined;
    const typeFlag = command.flags.get("type");

    if (listFlag) {
      if (command.args.length > 0 || removeFlag || typeFlag !== undefined) {
        return target === "protected"
          ? "Usage: /protect --list"
          : "Usage: /conceal --list";
      }

      const settings = getGlobalReplSettings();
      const objects =
        target === "protected"
          ? settings.protectedObjects
          : settings.concealedObjects;
      if (objects.length === 0) {
        return "(none)";
      }
      return objects
        .map((object) => `${object.path} (${object.type})`)
        .join("\n");
    }

    if (
      removeFlagValue !== undefined &&
      removeFlagValue !== true &&
      command.args.length > 0
    ) {
      return usageMutate;
    }

    let pathValue: string | undefined;
    if (removeFlagValue !== undefined && removeFlagValue !== true) {
      pathValue = removeFlagValue;
    } else {
      if (command.args.length !== 1) {
        return usageMutate;
      }
      pathValue = command.args[0];
    }

    if (pathValue === undefined) {
      return usageMutate;
    }

    let fileObjectType: "file" | "directory" | undefined;
    if (typeFlag !== undefined) {
      if (typeFlag === true || !this.support.isFileType(typeFlag)) {
        return `Invalid type "${String(typeFlag)}". Accepted values: ${FILE_TYPES.join(", ")}`;
      }
      fileObjectType = typeFlag;
    }

    const pathOrObject =
      fileObjectType === undefined
        ? pathValue
        : new FileSystemObject(pathValue, fileObjectType);
    const operation: AddRemoveOperation = removeFlag ? "remove" : "add";

    const settings = getGlobalReplSettings();
    if (target === "protected") {
      settings.setProtectedObjects(operation, pathOrObject);
    } else {
      settings.setConcealedObjects(operation, pathOrObject);
    }

    const verb = operation === "add" ? "Added" : "Removed";
    return `${verb} ${target} object: ${pathValue}`;
  }
}
