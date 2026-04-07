import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  getGlobalToolRegistry,
  initializeGlobalToolRegistry,
} from "../../src/global/ToolRegistryStore";
import { ToolRegistry } from "../../src/tools/registry/ToolRegistry";

/**
 * Creates a temporary directory for tool registry store tests.
 * @param {string} prefix Prefix used for the temp directory name.
 * @returns {string} The created temporary directory path.
 */
function createTempDirectory(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Writes a minimal valid tool registry file for tests.
 * @param {string} registryPath Absolute path where the registry JSON should be written.
 * @returns {void} Does not return a value.
 */
function writeToolRegistryFixture(registryPath: string): void {
  fs.writeFileSync(
    registryPath,
    JSON.stringify({
      read: {},
      write: {},
      scripts: {},
      savePlan: {},
      readPlan: {},
      spawnAgent: {},
    }),
    "utf-8",
  );
}

describe("ToolRegistryStore", () => {
  it("initializes and returns the global tool registry", () => {
    const tempDirectory = createTempDirectory("tool-registry-store-");
    const registryPath = path.join(tempDirectory, "ToolRegistry.json");
    writeToolRegistryFixture(registryPath);

    const registry = initializeGlobalToolRegistry(registryPath);

    expect(registry).toBeInstanceOf(ToolRegistry);
    expect(getGlobalToolRegistry()).toBe(registry);

    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });
});
