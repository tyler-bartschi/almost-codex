import * as readline from "readline";
import promptSync from "prompt-sync";

const ANSI_WHITE = "\u001b[37m";
const ANSI_PURPLE = "\u001b[35m";
const ANSI_RESET = "\u001b[0m";

/**
 * Colors live user input in purple only while the first character is `/`
 * and no space has been entered yet.
 *
 * @param {string} line Current in-progress line buffer.
 * @returns {string} ANSI-colored line text for terminal rendering.
 */
function colorizeLiveInput(line: string): string {
  if (!line.startsWith("/")) {
    return line;
  }

  const firstWhitespaceIndex = line.search(/\s/);
  if (firstWhitespaceIndex === -1) {
    return `${ANSI_PURPLE}${line}${ANSI_WHITE}`;
  }

  const commandPart = line.slice(0, firstWhitespaceIndex);
  const remainder = line.slice(firstWhitespaceIndex);
  return `${ANSI_PURPLE}${commandPart}${ANSI_WHITE}${remainder}`;
}

/**
 * Calculates how many terminal rows a plain-text prompt and input buffer occupy.
 *
 * @param {string} text Plain-text terminal content to measure.
 * @param {number} terminalColumns Current terminal width in columns.
 * @returns {number} Number of visible terminal rows required to render the text.
 */
export function calculateTerminalRows(text: string, terminalColumns: number): number {
  if (terminalColumns <= 0) {
    return 1;
  }

  return Math.max(1, Math.floor(Math.max(text.length - 1, 0) / terminalColumns) + 1);
}

/**
 * Calculates the zero-based row offset of the terminal cursor after writing plain text.
 *
 * @param {string} text Plain-text terminal content to measure.
 * @param {number} terminalColumns Current terminal width in columns.
 * @returns {number} The number of rows below the starting row where the cursor ends.
 */
export function calculateTerminalCursorRowOffset(
  text: string,
  terminalColumns: number,
): number {
  if (terminalColumns <= 0) {
    return 0;
  }

  return Math.floor(text.length / terminalColumns);
}

/**
 * Ensures a prompt label starts on a fresh line.
 *
 * @param {string} promptLabel Prompt text shown to the user.
 * @returns {string} Prompt text prefixed with a leading newline when needed.
 */
export function formatPromptLabel(promptLabel: string): string {
  return promptLabel.startsWith("\n") ? promptLabel : `\n${promptLabel}`;
}

/**
 * Clears the previously rendered prompt area, including any wrapped terminal rows.
 *
 * @param {readline.Interface["output"]} stdout Terminal output stream to manipulate.
 * @param {number} renderedRows Number of prompt rows that were previously visible.
 * @returns {void} Does not return a value.
 */
function clearRenderedPromptRows(
  stdout: NodeJS.WriteStream,
  renderedRows: number,
): void {
  for (let rowIndex = 0; rowIndex < renderedRows; rowIndex += 1) {
    readline.clearLine(stdout, 0);

    if (rowIndex < renderedRows - 1) {
      readline.moveCursor(stdout, 0, 1);
    }
  }

  if (renderedRows > 1) {
    readline.moveCursor(stdout, 0, -(renderedRows - 1));
  }
  readline.cursorTo(stdout, 0);
}

/**
 * Reads one input line from the terminal with live-rendered input color.
 *
 * @param {string} promptLabel Prompt text shown before the editable input.
 * @returns {Promise<string>} The complete line entered by the user.
 */
export function readPromptLine(promptLabel: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY || !stdout.isTTY) {
      const rl = readline.createInterface({ input: stdin, output: stdout });
      rl.question(formatPromptLabel(promptLabel), (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    stdout.write("\n");
    readline.emitKeypressEvents(stdin);
    const previouslyRaw = stdin.isRaw;
    stdin.setRawMode(true);

    let buffer = "";
    let previousRenderedRows = 1;
    let previousCursorRowOffset = 0;

    /**
     * Renders the current prompt label and editable input buffer.
     *
     * @returns {void} Does not return a value.
     */
    function render(): void {
      const plainPromptText = `${promptLabel}${buffer}`;
      const terminalColumns = stdout.columns ?? 80;

      if (previousCursorRowOffset > 0) {
        readline.moveCursor(stdout, 0, -previousCursorRowOffset);
      }
      readline.cursorTo(stdout, 0);
      clearRenderedPromptRows(stdout, previousRenderedRows);
      stdout.write(`${ANSI_WHITE}${promptLabel}${colorizeLiveInput(buffer)}${ANSI_RESET}`);
      previousRenderedRows = calculateTerminalRows(plainPromptText, terminalColumns);
      previousCursorRowOffset = calculateTerminalCursorRowOffset(
        plainPromptText,
        terminalColumns,
      );
    }

    /**
     * Restores the stdin listener and raw-mode state after prompt completion.
     *
     * @returns {void} Does not return a value.
     */
    function cleanup(): void {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode(Boolean(previouslyRaw));
    }

    /**
     * Applies one keypress to the editable prompt buffer.
     *
     * @param {string} str Raw string emitted for the keypress.
     * @param {readline.Key | undefined} key Parsed key metadata when available.
     * @returns {void} Does not return a value.
     */
    function onKeypress(str: string, key?: readline.Key): void {
      if (key?.ctrl && key.name === "c") {
        cleanup();
        stdout.write("\n");
        reject(new Error("SIGINT"));
        return;
      }

      if (key?.name === "return" || key?.name === "enter") {
        cleanup();
        stdout.write("\n");
        resolve(buffer);
        return;
      }

      if (key?.name === "backspace") {
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          render();
        }
        return;
      }

      if (key?.ctrl || key?.meta) {
        return;
      }

      if (typeof str === "string" && str.length > 0) {
        buffer += str;
        render();
      }
    }

    stdin.on("keypress", onKeypress);
    render();
  });
}

/**
 * Prints prompt context above a short editable prompt and returns the typed line.
 *
 * This keeps the live prompt itself short so wrapped informational text does not
 * interfere with terminal editing behavior.
 *
 * @param {string} promptMessage Informational prompt message shown above the input.
 * @param {string} inputPrompt Short editable prompt label.
 * @returns {string} The line entered by the user.
 */
export function readInlinePrompt(promptMessage: string, inputPrompt: string): string {
  const prompt = promptSync({ sigint: true });
  process.stdout.write(`${formatPromptLabel(promptMessage)}\n`);
  return prompt(inputPrompt);
}
