import * as fs from "fs";
import * as path from "path";
import {
  clearGlobalReplState,
  setGlobalReplState,
} from "../../src/global/ReplStateStore";
import { Settings } from "../../src/global/Settings";
import { ReplConfigCommands } from "../../src/repl/ReplConfigCommands";
import { ReplExecutorSupport } from "../../src/repl/ReplExecutorSupport";
import { ReplParser } from "../../src/repl/ReplParser";

const SETTINGS_DIR = path.resolve(process.cwd(), "src", "settings");
const USER_CONFIG_PATH = path.join(SETTINGS_DIR, "user_default.config.json");

/**
 * Reads a UTF-8 text file from disk.
 * @param {string} filePath Absolute file path to read.
 * @returns {string} File contents as UTF-8 text.
 */
function readUtf8(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

describe("ReplConfigCommands", () => {
  const initialUserRaw = readUtf8(USER_CONFIG_PATH);

  beforeEach(() => {
    fs.writeFileSync(USER_CONFIG_PATH, initialUserRaw, "utf-8");
    setGlobalReplState({
      currentMode: "code",
      currentAgent: "code.orchestrator",
      rootDir: process.cwd(),
      settings: Settings.fromUserDefault(),
      shouldExit: false,
      shouldClear: false,
    });
  });

  afterEach(() => {
    clearGlobalReplState();
    fs.writeFileSync(USER_CONFIG_PATH, initialUserRaw, "utf-8");
  });

  it("accepts readPlan and savePlan in config permission mutations", () => {
    const parser = new ReplParser();
    const commands = new ReplConfigCommands(new ReplExecutorSupport());

    const plannerParsed = parser.parse(
      "/config set default --field agents.code.planner.permissions --value savePlan --add",
    );
    if (plannerParsed.kind !== "command") {
      throw new Error("Expected planner command to parse successfully.");
    }

    const plannerResult = commands.executeConfig(plannerParsed.command);
    expect(plannerResult).toBe(
      'Updated "agents.code.planner.permissions" on profile "user_default".',
    );

    const executorParsed = parser.parse(
      "/config set default --field agents.code.executor.permissions --value readPlan --add",
    );
    if (executorParsed.kind !== "command") {
      throw new Error("Expected executor command to parse successfully.");
    }

    const executorResult = commands.executeConfig(executorParsed.command);
    expect(executorResult).toBe(
      'Updated "agents.code.executor.permissions" on profile "user_default".',
    );

    const settings = Settings.fromUserDefault();
    expect(settings.agentSettings.code.planner.permissions).toContain("savePlan");
    expect(settings.agentSettings.code.executor.permissions).toContain("readPlan");
  });
});
