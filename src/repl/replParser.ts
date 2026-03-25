export interface ParsedCommand {
  name: string;
  args: string[];
  flags: Map<string, string | true>;
  raw: string;
}

export type ReplParseResult =
  | { kind: "empty" }
  | { kind: "text"; text: string }
  | { kind: "command"; command: ParsedCommand }
  | { kind: "error"; message: string };

export class ReplParser {
  public parse(line: string): ReplParseResult {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return { kind: "empty" };
    }

    if (!trimmed.startsWith("/")) {
      return { kind: "text", text: line };
    }

    const tokenResult = this.tokenize(trimmed);
    if ("error" in tokenResult) {
      return { kind: "error", message: tokenResult.error };
    }

    const tokens = tokenResult.tokens;
    if (tokens.length === 0) {
      return { kind: "error", message: "Unknown command. Use /help." };
    }

    const commandToken = tokens[0];
    if (commandToken === undefined) {
      return { kind: "error", message: "Unknown command. Use /help." };
    }
    if (!commandToken.startsWith("/")) {
      return { kind: "error", message: "Unknown command. Use /help." };
    }

    const name = commandToken.slice(1);
    if (name.length === 0) {
      return { kind: "error", message: "Unknown command. Use /help." };
    }

    const parseFlagsResult = this.parseFlags(tokens.slice(1));
    if ("error" in parseFlagsResult) {
      return { kind: "error", message: parseFlagsResult.error };
    }

    return {
      kind: "command",
      command: {
        name,
        args: parseFlagsResult.args,
        flags: parseFlagsResult.flags,
        raw: trimmed,
      },
    };
  }

  private parseFlags(tokens: string[]): { args: string[]; flags: Map<string, string | true> } | { error: string } {
    const args: string[] = [];
    const flags = new Map<string, string | true>();

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === undefined) {
        continue;
      }
      if (!token.startsWith("--")) {
        args.push(token);
        continue;
      }

      const flagName = token.slice(2);
      if (flagName.length === 0) {
        return { error: "Invalid flag format." };
      }

      const nextToken = tokens[i + 1];
      if (nextToken !== undefined && !nextToken.startsWith("--")) {
        flags.set(flagName, nextToken);
        i += 1;
      } else {
        flags.set(flagName, true);
      }
    }

    return { args, flags };
  }

  private tokenize(input: string): { tokens: string[] } | { error: string } {
    const tokens: string[] = [];
    let current = "";
    let inQuotes = false;
    let escaping = false;

    for (const char of input) {
      if (escaping) {
        current += char;
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (!inQuotes && /\s/.test(char)) {
        if (current.length > 0) {
          tokens.push(current);
          current = "";
        }
        continue;
      }

      current += char;
    }

    if (escaping) {
      current += "\\";
    }

    if (inQuotes) {
      return { error: "Unterminated quoted value." };
    }

    if (current.length > 0) {
      tokens.push(current);
    }

    return { tokens };
  }
}
