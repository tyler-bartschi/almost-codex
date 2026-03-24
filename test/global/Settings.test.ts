import * as fs from "fs";
import * as path from "path";
import { anything, reset, spy, when } from "ts-mockito";
import { FileSystemObject, Settings } from "../../src/global/Settings";

const nodeFs = jest.requireActual("fs") as typeof import("fs");

interface RawSettingsFixture {
  name: string;
  default_personality: string;
  default_reasoning: string;
  default_model: string;
  git_mode: "safe" | "unsafe";
  script_mode: "safe" | "unsafe";
  agents: Record<string, Record<string, unknown>>;
  protected: Array<{ path: string; type?: "directory" | "file" }>;
  concealed: Array<{ path: string; type?: "directory" | "file" }>;
}

const SETTINGS_DIR = path.resolve(process.cwd(), "src", "settings");
const USER_CONFIG_PATH = path.join(SETTINGS_DIR, "user_default.config.json");
const SYSTEM_CONFIG_PATH = path.join(SETTINGS_DIR, "system_default.config.json");
const BACKUP_SYSTEM_CONFIG_PATH = path.resolve(
  process.cwd(),
  "backup",
  "system_default.config.json",
);
const PROTECTED_CONFIG_PATHS = new Set(
  [USER_CONFIG_PATH, SYSTEM_CONFIG_PATH, BACKUP_SYSTEM_CONFIG_PATH].map((filePath) =>
    path.resolve(filePath),
  ),
);

const assertNotProtectedConfigPath = (filePath: string): void => {
  const resolvedPath = path.resolve(filePath);
  if (PROTECTED_CONFIG_PATHS.has(resolvedPath)) {
    throw new Error(`refusing to delete protected settings file: ${resolvedPath}`);
  }
};

const readUtf8 = (filePath: string): string => fs.readFileSync(filePath, "utf-8");
const toPrettyJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const uniqueConfigName = (): string =>
  `test_settings_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

const writeConfig = (configName: string, config: RawSettingsFixture): string => {
  const configPath = path.join(SETTINGS_DIR, `${configName}.config.json`);
  fs.writeFileSync(configPath, toPrettyJson(config), "utf-8");
  return configPath;
};

const removeIfExists = (filePath: string): void => {
  assertNotProtectedConfigPath(filePath);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

describe("FileSystemObject", () => {
  it("sets explicit type from constructor", () => {
    const fso = new FileSystemObject("notes.txt", "directory");

    expect(fso.type).toBe("directory");
    expect(fso.path).toBe("notes.txt");
  });

  it("infers directory type when path starts with slash", () => {
    const fso = new FileSystemObject("/etc/config");

    expect(fso.type).toBe("directory");
    expect(fso.path).toBe("/etc/config");
  });

  it("infers file type when path does not start with slash", () => {
    const fso = new FileSystemObject("relative/path.txt");

    expect(fso.type).toBe("file");
    expect(fso.path).toBe("relative/path.txt");
  });

  it("returns true for equals when type and path match", () => {
    const a = new FileSystemObject("/same/path", "directory");
    const b = new FileSystemObject("/same/path", "directory");

    expect(a.equals(b)).toBe(true);
  });

  it("returns false for equals when compared with non FileSystemObject", () => {
    const a = new FileSystemObject("/same/path", "directory");

    expect(a.equals("/same/path")).toBe(false);
    expect(a.equals({ path: "/same/path", type: "directory" })).toBe(false);
    expect(a.equals(null)).toBe(false);
  });

  it("returns false for equals when path differs", () => {
    const a = new FileSystemObject("/path/a", "directory");
    const b = new FileSystemObject("/path/b", "directory");

    expect(a.equals(b)).toBe(false);
  });

  it("returns false for equals when type differs", () => {
    const a = new FileSystemObject("same", "file");
    const b = new FileSystemObject("same", "directory");

    expect(a.equals(b)).toBe(false);
  });
});

describe("Settings", () => {
  const createdConfigPaths = new Set<string>();
  const initialUserRaw = readUtf8(USER_CONFIG_PATH);
  const initialUserParsed = JSON.parse(initialUserRaw) as RawSettingsFixture;
  const canonicalSystemParsed: RawSettingsFixture = {
    ...initialUserParsed,
    name: "system_default",
  };
  const canonicalUserFromSystem: RawSettingsFixture = {
    ...canonicalSystemParsed,
    name: "user_default",
  };
  const canonicalSystemRaw = toPrettyJson(canonicalSystemParsed);

  const trackConfig = (configName: string, config: RawSettingsFixture): string => {
    const configPath = writeConfig(configName, config);
    assertNotProtectedConfigPath(configPath);
    createdConfigPaths.add(configPath);
    return configPath;
  };

  const newConfigFromUser = (
    overrides: Partial<RawSettingsFixture> = {},
    configName: string = uniqueConfigName(),
  ): { configName: string; configPath: string; config: RawSettingsFixture } => {
    const config: RawSettingsFixture = {
      ...initialUserParsed,
      ...overrides,
      name: configName,
    };
    const configPath = trackConfig(configName, config);
    return { configName, configPath, config };
  };

  beforeEach(() => {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    fs.writeFileSync(USER_CONFIG_PATH, initialUserRaw, "utf-8");
  });

  afterEach(() => {
    for (const configPath of createdConfigPaths) {
      removeIfExists(configPath);
    }
    createdConfigPaths.clear();
    fs.writeFileSync(USER_CONFIG_PATH, initialUserRaw, "utf-8");
  });

  afterAll(() => {
    fs.writeFileSync(USER_CONFIG_PATH, initialUserRaw, "utf-8");
  });

  it("loads user defaults via fromUserDefault", () => {
    const settings = Settings.fromUserDefault();

    expect(settings.configName).toBe("user_default");
    expect(settings.defaultPersonality).toBe(canonicalUserFromSystem.default_personality);
    expect(settings.defaultReasoning).toBe(canonicalUserFromSystem.default_reasoning);
    expect(settings.defaultModel).toBe(canonicalUserFromSystem.default_model);
    expect(settings.gitMode).toBe(canonicalUserFromSystem.git_mode);
    expect(settings.scriptMode).toBe(canonicalUserFromSystem.script_mode);
  });

  it("throws when trying to load a missing settings file", () => {
    expect(() => Settings.fromSettingsFile("does_not_exist")).toThrow(
      /Settings file not found:/,
    );
  });

  it("maps raw settings to runtime settings and infers object type when omitted", () => {
    const { configName } = newConfigFromUser({
      default_personality: "pirate",
      protected: [{ path: "/tmp/protected-dir" }],
      concealed: [{ path: "relative/secret.txt" }],
    });

    const settings = Settings.fromSettingsFile(configName);

    expect(settings.defaultPersonality).toBe("pirate");
    expect(settings.protectedObjects[0]).toEqual(
      new FileSystemObject("/tmp/protected-dir", "directory"),
    );
    expect(settings.concealedObjects[0]).toEqual(
      new FileSystemObject("relative/secret.txt", "file"),
    );
  });

  it("returns defensive copies for protected/concealed arrays", () => {
    const settings = Settings.fromUserDefault();
    const protectedCopy = settings.protectedObjects;
    const concealedCopy = settings.concealedObjects;

    protectedCopy.push(new FileSystemObject("/outside", "directory"));
    concealedCopy.push(new FileSystemObject("outside.txt", "file"));

    expect(settings.protectedObjects).toHaveLength(0);
    expect(settings.concealedObjects).toHaveLength(0);
  });

  it("returns a shallow copy for agentSettings", () => {
    const settings = Settings.fromUserDefault();
    const copiedAgentSettings = settings.agentSettings;

    copiedAgentSettings.ask.chat.permissions.push("write");

    expect(settings.agentSettings.ask.chat.permissions).toContain("write");
  });

  it("updates settings file when top-level defaults are changed", () => {
    const { configName } = newConfigFromUser();
    const settings = Settings.fromSettingsFile(configName);

    settings.defaultPersonality = "friendly";
    settings.defaultReasoning = "high";
    settings.defaultModel = "o3-mini";
    settings.gitMode = "unsafe";
    settings.scriptMode = "unsafe";

    const persisted = JSON.parse(
      readUtf8(path.join(SETTINGS_DIR, `${configName}.config.json`)),
    ) as RawSettingsFixture;

    expect(persisted.default_personality).toBe("friendly");
    expect(persisted.default_reasoning).toBe("high");
    expect(persisted.default_model).toBe("o3-mini");
    expect(persisted.git_mode).toBe("unsafe");
    expect(persisted.script_mode).toBe("unsafe");
  });

  it("supports adding/removing protected and concealed objects including no-op edge cases", () => {
    const { configName } = newConfigFromUser();
    const settings = Settings.fromSettingsFile(configName);
    const explicitProtected = new FileSystemObject("notes.txt", "file");
    const explicitConcealed = new FileSystemObject("/etc/secrets", "directory");

    settings.setProtectedObjects("add", "/tmp/project");
    settings.setProtectedObjects("add", "/tmp/project");
    settings.setProtectedObjects("add", explicitProtected);
    settings.setProtectedObjects("remove", "not-present");
    settings.setProtectedObjects("remove", "/tmp/project");
    settings.setProtectedObjects("add");
    settings.setProtectedObjects("remove");

    settings.setConcealedObjects("add", "local.env");
    settings.setConcealedObjects("add", explicitConcealed);
    settings.setConcealedObjects("add", "local.env");
    settings.setConcealedObjects("remove", explicitConcealed);
    settings.setConcealedObjects("remove", "/missing");
    settings.setConcealedObjects("add");
    settings.setConcealedObjects("remove");

    expect(settings.protectedObjects).toEqual([explicitProtected]);
    expect(settings.concealedObjects).toEqual([new FileSystemObject("local.env", "file")]);
  });

  it("updates agent settings and handles permissions edge cases", () => {
    const { configName } = newConfigFromUser();
    const settings = Settings.fromSettingsFile(configName);

    expect(() =>
      settings.setAgentSetting("ask", "chat", "permissions", "write"),
    ).toThrow(/operation is required/);
    expect(() =>
      settings.setAgentSetting("ask", "missing_agent", "model", "gpt-5"),
    ).toThrow(/does not exist/);
    expect(() =>
      settings.setAgentSetting("invalid_mode" as any, "chat", "model", "gpt-5"),
    ).toThrow(/unknown agent mode/);

    settings.setAgentSetting("ask", "chat", "permissions", "write", "add");
    settings.setAgentSetting("ask", "chat", "permissions", "write", "add");
    settings.setAgentSetting("ask", "chat", "permissions", "write", "remove");
    settings.setAgentSetting("ask", "chat", "personality", "sarcastic");
    settings.setAgentSetting("ask", "chat", "reasoning", "low");
    settings.setAgentSetting("ask", "chat", "model", "gpt-4.1-mini");

    const chatSettings = settings.agentSettings.ask.chat;
    expect(chatSettings.permissions).not.toContain("write");
    expect(chatSettings.personality).toBe("sarcastic");
    expect(chatSettings.reasoning).toBe("low");
    expect(chatSettings.model).toBe("gpt-4.1-mini");
  });

  it("loads existing config on configName change, saves when target config does not exist, and no-ops for same name", () => {
    const { configName } = newConfigFromUser();
    const existingTarget = newConfigFromUser({
      default_model: "o3",
    });
    const missingTargetName = uniqueConfigName();
    const settings = Settings.fromSettingsFile(configName);
    const originalModel = settings.defaultModel;

    settings.configName = configName;
    expect(settings.defaultModel).toBe(originalModel);

    settings.configName = existingTarget.configName;
    expect(settings.defaultModel).toBe("o3");

    settings.configName = missingTargetName;
    const createdPath = path.join(SETTINGS_DIR, `${missingTargetName}.config.json`);
    assertNotProtectedConfigPath(createdPath);
    createdConfigPaths.add(createdPath);
    expect(fs.existsSync(path.join(SETTINGS_DIR, `${missingTargetName}.config.json`))).toBe(
      true,
    );
  });

  it("rejects system_default as configName and save target", () => {
    const settings = Settings.fromUserDefault();
    expect(() => {
      settings.configName = "system_default";
    }).toThrow(/cannot change system_default settings/);

    (settings as unknown as { _configName: string })._configName = "system_default";
    expect(() => settings.saveSettings()).toThrow(/cannot save system_default settings/);
  });

  it("loadSettings uses explicit configName and throws for missing files", () => {
    const first = newConfigFromUser({ default_personality: "friendly" });
    const second = newConfigFromUser({ default_personality: "efficient" });
    const settings = Settings.fromSettingsFile(first.configName);

    settings.loadSettings(second.configName);
    expect(settings.defaultPersonality).toBe("efficient");
    expect(() => settings.loadSettings(uniqueConfigName())).toThrow(/Settings file not found:/);
  });

  it("saves using snake_case keys in persisted config", () => {
    const { configName } = newConfigFromUser();
    const settings = Settings.fromSettingsFile(configName);
    settings.setProtectedObjects("add", "/tmp/visible");
    settings.setConcealedObjects("add", "hide.me");

    const persistedRaw = readUtf8(path.join(SETTINGS_DIR, `${configName}.config.json`));
    const persisted = JSON.parse(persistedRaw) as Record<string, unknown>;

    expect(persisted).toHaveProperty("default_personality");
    expect(persisted).toHaveProperty("default_reasoning");
    expect(persisted).toHaveProperty("default_model");
    expect(persisted).toHaveProperty("git_mode");
    expect(persisted).toHaveProperty("script_mode");
    expect(persisted).toHaveProperty("protected");
    expect(persisted).toHaveProperty("concealed");
  });

  it("revertToDefaults restores user_default from system_default and throws when system default is missing", () => {
    const realExistsSync = fs.existsSync.bind(fs);
    const realReadFileSync = fs.readFileSync.bind(fs) as typeof fs.readFileSync;
    const fsSpy = spy(nodeFs);

    when(fsSpy.existsSync(anything())).thenCall((targetPath: fs.PathLike) => {
      if (targetPath.toString() === SYSTEM_CONFIG_PATH) {
        return true;
      }
      return realExistsSync(targetPath);
    });
    when(fsSpy.readFileSync(anything(), anything())).thenCall(
      (targetPath: fs.PathOrFileDescriptor, options?: unknown) => {
        if (targetPath.toString() === SYSTEM_CONFIG_PATH) {
          return canonicalSystemRaw;
        }
        return realReadFileSync(targetPath, options as never);
      },
    );

    const { configName } = newConfigFromUser({
      default_personality: "sarcastic",
    });
    const settings = Settings.fromSettingsFile(configName);
    settings.revertToDefaults();
    expect(settings.configName).toBe("user_default");

    const revertedUser = JSON.parse(readUtf8(USER_CONFIG_PATH)) as RawSettingsFixture;
    expect(revertedUser.default_personality).toBe(canonicalSystemParsed.default_personality);
    expect(revertedUser.default_reasoning).toBe(canonicalSystemParsed.default_reasoning);
    expect(revertedUser.default_model).toBe(canonicalSystemParsed.default_model);

    when(fsSpy.existsSync(anything())).thenCall((targetPath: fs.PathLike) => {
        if (targetPath.toString() === SYSTEM_CONFIG_PATH) {
          return false;
        }
        return realExistsSync(targetPath);
      });
    expect(() => settings.revertToDefaults()).toThrow(/Settings file not found:/);

    reset(fsSpy);
  });

  it("never writes to system_default.config.json", () => {
    const realExistsSync = fs.existsSync.bind(fs);
    const realReadFileSync = fs.readFileSync.bind(fs) as typeof fs.readFileSync;
    const realWriteFileSync = fs.writeFileSync.bind(fs) as typeof fs.writeFileSync;
    const fsSpy = spy(nodeFs);
    let systemWriteCount = 0;

    when(fsSpy.existsSync(anything())).thenCall((targetPath: fs.PathLike) => {
      if (targetPath.toString() === SYSTEM_CONFIG_PATH) {
        return true;
      }
      return realExistsSync(targetPath);
    });
    when(fsSpy.readFileSync(anything(), anything())).thenCall(
      (targetPath: fs.PathOrFileDescriptor, options?: unknown) => {
        if (targetPath.toString() === SYSTEM_CONFIG_PATH) {
          return canonicalSystemRaw;
        }
        return realReadFileSync(targetPath, options as never);
      },
    );
    when(fsSpy.writeFileSync(anything(), anything(), anything())).thenCall(
      (targetPath: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, options?: unknown) => {
        if (targetPath.toString() === SYSTEM_CONFIG_PATH) {
          systemWriteCount += 1;
        }
        return realWriteFileSync(targetPath, data, options as never);
      },
    );

    const activeConfig = newConfigFromUser({ default_model: "o4-mini" });
    const existingConfig = newConfigFromUser({ default_model: "o3-mini" });
    const missingConfigName = uniqueConfigName();
    const settings = Settings.fromSettingsFile(activeConfig.configName);

    settings.defaultPersonality = "friendly";
    settings.defaultReasoning = "minimal";
    settings.defaultModel = "gpt-4.1";
    settings.gitMode = "unsafe";
    settings.scriptMode = "unsafe";
    settings.setProtectedObjects("add", "/tmp/never-system");
    settings.setConcealedObjects("add", "secret.file");
    settings.setAgentSetting("ask", "chat", "permissions", "write", "add");
    settings.setAgentSetting("ask", "chat", "permissions", "write", "remove");
    settings.setAgentSetting("ask", "chat", "personality", "friendly");
    settings.setAgentSetting("ask", "chat", "reasoning", "high");
    settings.setAgentSetting("ask", "chat", "model", "gpt-5");
    settings.configName = existingConfig.configName;
    settings.configName = missingConfigName;
    const createdPath = path.join(SETTINGS_DIR, `${missingConfigName}.config.json`);
    assertNotProtectedConfigPath(createdPath);
    createdConfigPaths.add(createdPath);
    settings.revertToDefaults();

    (settings as unknown as { _configName: string })._configName = "system_default";
    expect(() => settings.saveSettings()).toThrow();

    expect(systemWriteCount).toBe(0);

    reset(fsSpy);
  });
});
