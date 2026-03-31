import type { ReplState } from "../repl/replExecutorTypes";

let globalReplState: ReplState | undefined;

/**
 * Stores the active REPL state for later retrieval across the current process.
 * @param {ReplState} state The REPL state instance to store globally.
 * @returns {void} Does not return a value.
 */
export function setGlobalReplState(state: ReplState): void {
  globalReplState = state;
}

/**
 * Returns the active global REPL state when one has been stored.
 * @returns {ReplState | undefined} The stored REPL state, or `undefined` when none is set.
 */
export function getGlobalReplState(): ReplState | undefined {
  return globalReplState;
}

/**
 * Returns the active global REPL state and throws when it has not been initialized.
 * @returns {ReplState} The stored REPL state.
 * @throws {Error} Thrown when no global REPL state has been stored.
 */
export function requireGlobalReplState(): ReplState {
  if (globalReplState === undefined) {
    throw new Error("Global REPL state has not been initialized.");
  }

  return globalReplState;
}

/**
 * Returns the current mode from the active global REPL state.
 * @returns {ReplState["currentMode"]} The active REPL mode.
 * @throws {Error} Thrown when no global REPL state has been stored.
 */
export function getGlobalReplCurrentMode(): ReplState["currentMode"] {
  return requireGlobalReplState().currentMode;
}

/**
 * Returns the root directory from the active global REPL state.
 * @returns {ReplState["rootDir"]} The active REPL root directory.
 * @throws {Error} Thrown when no global REPL state has been stored.
 */
export function getGlobalReplRootDir(): ReplState["rootDir"] {
  return requireGlobalReplState().rootDir;
}

/**
 * Returns the settings instance from the active global REPL state.
 * @returns {ReplState["settings"]} The active REPL settings instance.
 * @throws {Error} Thrown when no global REPL state has been stored.
 */
export function getGlobalReplSettings(): ReplState["settings"] {
  return requireGlobalReplState().settings;
}

/**
 * Returns the exit flag from the active global REPL state.
 * @returns {ReplState["shouldExit"]} The active REPL exit flag.
 * @throws {Error} Thrown when no global REPL state has been stored.
 */
export function getGlobalReplShouldExit(): ReplState["shouldExit"] {
  return requireGlobalReplState().shouldExit;
}

/**
 * Returns the clear-screen flag from the active global REPL state.
 * @returns {ReplState["shouldClear"]} The active REPL clear-screen flag.
 * @throws {Error} Thrown when no global REPL state has been stored.
 */
export function getGlobalReplShouldClear(): ReplState["shouldClear"] {
  return requireGlobalReplState().shouldClear;
}

/**
 * Indicates whether a global REPL state is currently stored.
 * @returns {boolean} `true` when a REPL state is available; otherwise `false`.
 */
export function hasGlobalReplState(): boolean {
  return globalReplState !== undefined;
}

/**
 * Removes any stored global REPL state.
 * @returns {void} Does not return a value.
 */
export function clearGlobalReplState(): void {
  globalReplState = undefined;
}
