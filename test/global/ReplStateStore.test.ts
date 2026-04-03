import { FileSystemObject } from "../../src/global/Settings";
import type { Settings } from "../../src/global/Settings";
import {
  clearGlobalReplState,
  getGlobalReplConcealedObjects,
  getGlobalReplCurrentMode,
  getGlobalReplProtectedObjects,
  getGlobalReplRootDir,
  getGlobalReplSettings,
  getGlobalReplShouldClear,
  getGlobalReplShouldExit,
  getGlobalReplState,
  hasGlobalReplState,
  requireGlobalReplState,
  setGlobalReplState,
} from "../../src/global/ReplStateStore";
import type { ReplState } from "../../src/repl/replExecutorTypes";

/**
 * Builds a REPL state fixture for store tests.
 * @param {Partial<ReplState>} [overrides={}] Field overrides to apply to the default fixture.
 * @returns {ReplState} A mutable REPL state fixture.
 */
function createReplStateFixture(overrides: Partial<ReplState> = {}): ReplState {
  return {
    currentMode: "code",
    rootDir: "/tmp/project",
    settings: {} as Settings,
    shouldExit: false,
    shouldClear: false,
    ...overrides,
  };
}

describe("ReplStateStore", () => {
  beforeEach(() => {
    clearGlobalReplState();
  });

  afterEach(() => {
    clearGlobalReplState();
  });

  it("stores and returns the active repl state", () => {
    const state = createReplStateFixture();

    setGlobalReplState(state);

    expect(hasGlobalReplState()).toBe(true);
    expect(getGlobalReplState()).toBe(state);
    expect(requireGlobalReplState()).toBe(state);
  });

  it("reflects mutations made through the shared stored state object", () => {
    const state = createReplStateFixture();

    setGlobalReplState(state);
    const storedState = requireGlobalReplState();
    storedState.currentMode = "plan";
    storedState.shouldClear = true;

    expect(getGlobalReplState()).toEqual(
      expect.objectContaining({
        currentMode: "plan",
        shouldClear: true,
      }),
    );
  });

  it("returns the current mode from the stored repl state", () => {
    setGlobalReplState(createReplStateFixture({ currentMode: "document" }));

    expect(getGlobalReplCurrentMode()).toBe("document");
  });

  it("returns the root directory from the stored repl state", () => {
    setGlobalReplState(createReplStateFixture({ rootDir: "/tmp/alternate-project" }));

    expect(getGlobalReplRootDir()).toBe("/tmp/alternate-project");
  });

  it("returns the settings object from the stored repl state", () => {
    const settings = {} as Settings;
    setGlobalReplState(createReplStateFixture({ settings }));

    expect(getGlobalReplSettings()).toBe(settings);
  });

  it("returns the protected objects from the stored repl settings", () => {
    const settings: Pick<Settings, "protectedObjects" | "concealedObjects"> = {
      protectedObjects: [new FileSystemObject("protected.txt", "file")],
      concealedObjects: [],
    };
    setGlobalReplState(createReplStateFixture({ settings: settings as Settings }));

    expect(getGlobalReplProtectedObjects()).toBe(settings.protectedObjects);
  });

  it("returns the concealed objects from the stored repl settings", () => {
    const settings: Pick<Settings, "protectedObjects" | "concealedObjects"> = {
      protectedObjects: [],
      concealedObjects: [new FileSystemObject("secret", "directory")],
    };
    setGlobalReplState(createReplStateFixture({ settings: settings as Settings }));

    expect(getGlobalReplConcealedObjects()).toBe(settings.concealedObjects);
  });

  it("returns the shouldExit flag from the stored repl state", () => {
    setGlobalReplState(createReplStateFixture({ shouldExit: true }));

    expect(getGlobalReplShouldExit()).toBe(true);
  });

  it("returns the shouldClear flag from the stored repl state", () => {
    setGlobalReplState(createReplStateFixture({ shouldClear: true }));

    expect(getGlobalReplShouldClear()).toBe(true);
  });

  it("clears the stored repl state", () => {
    setGlobalReplState(createReplStateFixture());

    clearGlobalReplState();

    expect(hasGlobalReplState()).toBe(false);
    expect(getGlobalReplState()).toBeUndefined();
  });

  it("throws when requiring state before initialization", () => {
    expect(() => requireGlobalReplState()).toThrow(
      "Global REPL state has not been initialized.",
    );
  });
});
