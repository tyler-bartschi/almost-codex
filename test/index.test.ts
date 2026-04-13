import * as path from "path";
import { resolveInitialRootDir } from "../src/index";

/**
 * Manages environment variable overrides used while resolving the REPL root directory.
 */
class EnvironmentOverrideManager {
  private readonly originalAlmostCodexRootDir = process.env.ALMOST_CODEX_ROOT_DIR;
  private readonly originalInitCwd = process.env.INIT_CWD;

  /**
   * Restores the original environment variable values captured at construction time.
   * @returns {void} Does not return a value.
   */
  public restore(): void {
    this.setEnvironmentValue("ALMOST_CODEX_ROOT_DIR", this.originalAlmostCodexRootDir);
    this.setEnvironmentValue("INIT_CWD", this.originalInitCwd);
  }

  /**
   * Sets or clears an environment variable using an optional string value.
   * @param {string} key Environment variable name to update.
   * @param {string | undefined} value Value to assign, or `undefined` to delete it.
   * @returns {void} Does not return a value.
   */
  public setEnvironmentValue(key: string, value: string | undefined): void {
    if (value === undefined) {
      delete process.env[key];
      return;
    }

    process.env[key] = value;
  }
}

describe("resolveInitialRootDir", () => {
  const environmentOverrideManager = new EnvironmentOverrideManager();

  afterEach(() => {
    environmentOverrideManager.restore();
  });

  it("prefers an explicit root directory override when provided", () => {
    const explicitRootDir = path.join(process.cwd(), "custom-root");
    environmentOverrideManager.setEnvironmentValue("ALMOST_CODEX_ROOT_DIR", explicitRootDir);
    environmentOverrideManager.setEnvironmentValue("INIT_CWD", path.join(process.cwd(), "init-cwd"));

    expect(resolveInitialRootDir()).toBe(path.resolve(explicitRootDir));
  });

  it("uses INIT_CWD when npm preserves the original invocation directory", () => {
    environmentOverrideManager.setEnvironmentValue("ALMOST_CODEX_ROOT_DIR", undefined);
    environmentOverrideManager.setEnvironmentValue("INIT_CWD", "/workspace/experiment");

    expect(resolveInitialRootDir()).toBe("/workspace/experiment");
  });

  it("falls back to the process working directory when no overrides are present", () => {
    environmentOverrideManager.setEnvironmentValue("ALMOST_CODEX_ROOT_DIR", undefined);
    environmentOverrideManager.setEnvironmentValue("INIT_CWD", undefined);

    expect(resolveInitialRootDir()).toBe(process.cwd());
  });
});
