import * as fs from "fs";
import * as path from "path";

export type FileSystemObjectType = "directory" | "file";
export type Personalities = "efficient" | "friendly" | "pirate" | "sarcastic";
export type OpenAIReasoningMode = "minimal" | "low" | "medium" | "high";
export type OpenAIModel =
  | "gpt-5"
  | "gpt-5-mini"
  | "gpt-5-nano"
  | "gpt-4.1"
  | "gpt-4.1-mini"
  | "gpt-4.1-nano"
  | "o3"
  | "o3-mini"
  | "o4-mini";

export type AgentMode = "ask" | "code" | "plan" | "test" | "document";
export type AgentEditableSetting =
  | "personality"
  | "reasoning"
  | "model"
  | "permissions";
export type AddRemoveOperation = "add" | "remove";

export interface AgentSetting {
  description: string;
  personality: Personalities | "default";
  reasoning: OpenAIReasoningMode | "default";
  model: OpenAIModel | "default";
  permissions: string[];
}

export type AgentSettings = Record<AgentMode, Record<string, AgentSetting>>;

interface RawSettingsFile {
  name: string;
  default_personality: Personalities;
  default_reasoning: OpenAIReasoningMode;
  default_model: OpenAIModel;
  git_mode: "safe" | "unsafe";
  script_mode: "safe" | "unsafe";
  agents: AgentSettings;
  protected: Array<{ path: string; type?: FileSystemObjectType }>;
  concealed: Array<{ path: string; type?: FileSystemObjectType }>;
}

interface SettingsFile {
  name: string;
  defaultPersonality: Personalities;
  defaultReasoning: OpenAIReasoningMode;
  defaultModel: OpenAIModel;
  gitMode: "safe" | "unsafe";
  scriptMode: "safe" | "unsafe";
  agents: AgentSettings;
  protectedObjects: Array<{ path: string; type?: FileSystemObjectType }>;
  concealedObjects: Array<{ path: string; type?: FileSystemObjectType }>;
}

/**
 * Represents a filesystem object reference (file or directory) used in settings.
 */
export class FileSystemObject {
  private _type: FileSystemObjectType;
  private _path: string;

  /**
   * Creates a filesystem object and infers its type when not explicitly provided.
   * @param {string} pathValue Path value for the filesystem object.
   * @param {FileSystemObjectType} [type] Explicit object type (`file` or `directory`).
   * @returns {FileSystemObject} A new filesystem object instance.
   */
  public constructor(pathValue: string, type?: FileSystemObjectType) {
    this._path = pathValue;

    if (type !== undefined) {
      this._type = type;
    } else {
      this._type = FileSystemObject.inferType(pathValue);
    }
  }

  /**
   * Infers whether a path should be treated as a file or directory.
   * @param {string} pathValue Raw path string to inspect.
   * @returns {FileSystemObjectType} The inferred filesystem object type.
   */
  private static inferType(pathValue: string): FileSystemObjectType {
    const trimmedPath = pathValue.trim();

    if (trimmedPath.length === 0) {
      return "file";
    }

    if (/[\\/]$/.test(trimmedPath)) {
      return "directory";
    }

    const existingType = FileSystemObject.getExistingPathType(trimmedPath);
    if (existingType) {
      return existingType;
    }

    const baseName = path.basename(trimmedPath);
    if (baseName === "." || baseName === "..") {
      return "directory";
    }

    if (baseName.startsWith(".") && !baseName.slice(1).includes(".")) {
      return "file";
    }

    if (path.extname(baseName) !== "") {
      return "file";
    }

    if (trimmedPath.includes("/") || trimmedPath.includes("\\")) {
      return "directory";
    }

    return "file";
  }

  /**
   * Detects the type of an existing path on disk.
   * @param {string} pathValue Path to check, relative or absolute.
   * @returns {FileSystemObjectType | undefined} Existing type, or `undefined` when the path does not exist.
   */
  private static getExistingPathType(pathValue: string): FileSystemObjectType | undefined {
    const candidates = [pathValue, path.resolve(pathValue)];

    for (const candidate of candidates) {
      try {
        const stats = fs.statSync(candidate);
        return stats.isDirectory() ? "directory" : "file";
      } catch {
        continue;
      }
    }

    return undefined;
  }

  /**
   * Gets this object's filesystem type.
   * @returns {FileSystemObjectType} The object type.
   */
  public get type(): FileSystemObjectType {
    return this._type;
  }

  /**
   * Gets this object's raw path value.
   * @returns {string} The stored path.
   */
  public get path(): string {
    return this._path;
  }

  /**
   * Compares this object to another filesystem object by type and path.
   * @param {any} other Value to compare against.
   * @returns {boolean} `true` when both objects are equivalent; otherwise `false`.
   */
  public equals(other: any): boolean {
    if (!(other instanceof FileSystemObject)) {
      return false;
    }

    return this.type === other.type && this.path === other.path;
  }
}

/**
 * Encapsulates loading, editing, and persisting application settings files.
 */
export class Settings {
  private static readonly settingsDir = process.env.SETTINGS_DIR
    ? path.resolve(process.env.SETTINGS_DIR)
    : path.resolve(__dirname, "..", "settings");

  private _configName: string;
  private _defaultPersonality: Personalities;
  private _defaultReasoning: OpenAIReasoningMode;
  private _defaultModel: OpenAIModel;
  private _gitMode: "safe" | "unsafe";
  private _scriptMode: "safe" | "unsafe";
  private _protectedObjects: FileSystemObject[];
  private _concealedObjects: FileSystemObject[];
  private _agentSettings: AgentSettings;

  /**
   * Creates a settings instance from a normalized settings object.
   * @param {SettingsFile} config Parsed settings configuration.
   * @returns {Settings} A new settings instance.
   */
  private constructor(config: SettingsFile) {
    this._configName = config.name;
    this._defaultPersonality = config.defaultPersonality;
    this._defaultReasoning = config.defaultReasoning;
    this._defaultModel = config.defaultModel;
    this._gitMode = config.gitMode;
    this._scriptMode = config.scriptMode;
    this._protectedObjects = config.protectedObjects.map(
      (obj) => new FileSystemObject(obj.path, obj.type),
    );
    this._concealedObjects = config.concealedObjects.map(
      (obj) => new FileSystemObject(obj.path, obj.type),
    );
    this._agentSettings = config.agents;
  }

  /**
   * Loads a named settings file and returns a settings instance.
   * @param {string} [configName="user_default"] Settings profile name to load.
   * @returns {Settings} The loaded settings instance.
   */
  public static fromSettingsFile(configName: string = "user_default"): Settings {
    const configPath = this.getConfigPath(configName);

    if (!fs.existsSync(configPath)) {
      throw new Error(`Settings file not found: ${configPath}`);
    }

    const config = this.readSettingsFile(configPath);
    return new Settings(config);
  }

  /**
   * Loads and returns the default user settings profile.
   * @returns {Settings} The loaded `user_default` settings.
   */
  public static fromUserDefault(): Settings {
    return this.fromSettingsFile("user_default");
  }

  /**
   * Gets the active configuration profile name.
   * @returns {string} Current configuration name.
   */
  public get configName(): string {
    return this._configName;
  }

  /**
   * Gets the default personality used by agents.
   * @returns {Personalities} Default personality value.
   */
  public get defaultPersonality(): Personalities {
    return this._defaultPersonality;
  }

  /**
   * Gets the default reasoning mode used by agents.
   * @returns {OpenAIReasoningMode} Default reasoning mode.
   */
  public get defaultReasoning(): OpenAIReasoningMode {
    return this._defaultReasoning;
  }

  /**
   * Gets the default model used by agents.
   * @returns {OpenAIModel} Default OpenAI model.
   */
  public get defaultModel(): OpenAIModel {
    return this._defaultModel;
  }

  /**
   * Gets the configured git safety mode.
   * @returns {"safe" | "unsafe"} Git mode value.
   */
  public get gitMode(): "safe" | "unsafe" {
    return this._gitMode;
  }

  /**
   * Gets the configured script execution safety mode.
   * @returns {"safe" | "unsafe"} Script mode value.
   */
  public get scriptMode(): "safe" | "unsafe" {
    return this._scriptMode;
  }

  /**
   * Gets a copy of protected filesystem objects.
   * @returns {FileSystemObject[]} Protected objects list.
   */
  public get protectedObjects(): FileSystemObject[] {
    return [...this._protectedObjects];
  }

  /**
   * Gets a copy of concealed filesystem objects.
   * @returns {FileSystemObject[]} Concealed objects list.
   */
  public get concealedObjects(): FileSystemObject[] {
    return [...this._concealedObjects];
  }

  /**
   * Gets a shallow copy of all agent settings grouped by mode.
   * @returns {AgentSettings} Agent settings map.
   */
  public get agentSettings(): AgentSettings {
    return { ...this._agentSettings };
  }

  /**
   * Sets the active configuration profile and persists or loads profile data as needed.
   * @param {string} configName New configuration profile name.
   * @returns {void} No return value.
   */
  public set configName(configName: string) {
    if (configName === "system_default") {
      throw new Error("cannot change system_default settings");
    }

    if (configName === this._configName) {
      return;
    }

    this._configName = configName;
    const configPath = Settings.getConfigPath(configName);

    if (fs.existsSync(configPath)) {
      this.loadSettings(configName);
      return;
    }

    this.saveSettings();
  }

  /**
   * Sets and persists the default personality.
   * @param {Personalities} personality New default personality.
   * @returns {void} No return value.
   */
  public set defaultPersonality(personality: Personalities) {
    this._defaultPersonality = personality;
    this.saveSettings();
  }

  /**
   * Sets and persists the default reasoning mode.
   * @param {OpenAIReasoningMode} reasoning New default reasoning mode.
   * @returns {void} No return value.
   */
  public set defaultReasoning(reasoning: OpenAIReasoningMode) {
    this._defaultReasoning = reasoning;
    this.saveSettings();
  }

  /**
   * Sets and persists the default model.
   * @param {OpenAIModel} model New default model.
   * @returns {void} No return value.
   */
  public set defaultModel(model: OpenAIModel) {
    this._defaultModel = model;
    this.saveSettings();
  }

  /**
   * Sets and persists the git safety mode.
   * @param {"safe" | "unsafe"} mode New git mode.
   * @returns {void} No return value.
   */
  public set gitMode(mode: "safe" | "unsafe") {
    this._gitMode = mode;
    this.saveSettings();
  }

  /**
   * Sets and persists the script execution safety mode.
   * @param {"safe" | "unsafe"} mode New script mode.
   * @returns {void} No return value.
   */
  public set scriptMode(mode: "safe" | "unsafe") {
    this._scriptMode = mode;
    this.saveSettings();
  }

  /**
   * Reloads settings values from disk for the requested profile.
   * @param {string} [configName=this._configName] Settings profile name to load.
   * @returns {void} No return value.
   */
  public loadSettings(configName: string = this._configName): void {
    const configPath = Settings.getConfigPath(configName);

    if (!fs.existsSync(configPath)) {
      throw new Error(`Settings file not found: ${configPath}`);
    }

    const config = Settings.readSettingsFile(configPath);
    this._configName = config.name;
    this._defaultPersonality = config.defaultPersonality;
    this._defaultReasoning = config.defaultReasoning;
    this._defaultModel = config.defaultModel;
    this._gitMode = config.gitMode;
    this._scriptMode = config.scriptMode;
    this._protectedObjects = config.protectedObjects.map(
      (obj) => new FileSystemObject(obj.path, obj.type),
    );
    this._concealedObjects = config.concealedObjects.map(
      (obj) => new FileSystemObject(obj.path, obj.type),
    );
    this._agentSettings = config.agents;
  }

  /**
   * Persists the current in-memory settings to the active profile file.
   * @returns {void} No return value.
   */
  public saveSettings(): void {
    if (this._configName === "system_default") {
      throw new Error("cannot save system_default settings");
    }

    const configPath = Settings.getConfigPath(this._configName);
    const config: SettingsFile = {
      name: this._configName,
      defaultPersonality: this._defaultPersonality,
      defaultReasoning: this._defaultReasoning,
      defaultModel: this._defaultModel,
      gitMode: this._gitMode,
      scriptMode: this._scriptMode,
      agents: this._agentSettings,
      protectedObjects: this._protectedObjects.map((obj) => ({
        path: obj.path,
        type: obj.type,
      })),
      concealedObjects: this._concealedObjects.map((obj) => ({
        path: obj.path,
        type: obj.type,
      })),
    };

    const rawConfig = Settings.toRawSettingsFile(config);

    fs.mkdirSync(Settings.settingsDir, { recursive: true });
    fs.writeFileSync(
      configPath,
      `${JSON.stringify(rawConfig, null, 2)}\n`,
      "utf-8",
    );
  }

  /**
   * Restores `user_default` settings from `system_default` values and reloads them.
   * @returns {void} No return value.
   */
  public revertToDefaults(): void {
    const systemConfigPath = Settings.getConfigPath("system_default");
    const userConfigPath = Settings.getConfigPath("user_default");

    if (!fs.existsSync(systemConfigPath)) {
      throw new Error(`Settings file not found: ${systemConfigPath}`);
    }

    const systemRaw = fs.readFileSync(systemConfigPath, "utf-8");
    const systemConfig = JSON.parse(systemRaw) as RawSettingsFile;
    const userConfig: RawSettingsFile = {
      ...systemConfig,
      name: "user_default",
    };

    fs.mkdirSync(Settings.settingsDir, { recursive: true });
    fs.writeFileSync(
      userConfigPath,
      `${JSON.stringify(userConfig, null, 2)}\n`,
      "utf-8",
    );

    this.loadSettings("user_default");
  }

  /**
   * Adds or removes an entry from the protected object list and persists settings.
   * @param {AddRemoveOperation} operation Change operation (`add` or `remove`).
   * @param {string | FileSystemObject} [pathOrObject] Path or object entry to change.
   * @returns {void} No return value.
   */
  public setProtectedObjects(
    operation: AddRemoveOperation,
    pathOrObject?: string | FileSystemObject,
  ): void {
    this.updateObjectList(this._protectedObjects, operation, pathOrObject);
    this.saveSettings();
  }

  /**
   * Adds or removes an entry from the concealed object list and persists settings.
   * @param {AddRemoveOperation} operation Change operation (`add` or `remove`).
   * @param {string | FileSystemObject} [pathOrObject] Path or object entry to change.
   * @returns {void} No return value.
   */
  public setConcealedObjects(
    operation: AddRemoveOperation,
    pathOrObject?: string | FileSystemObject,
  ): void {
    this.updateObjectList(this._concealedObjects, operation, pathOrObject);
    this.saveSettings();
  }

  /**
   * Updates one editable agent setting for a mode/agent pair and persists settings.
   * @param {AgentMode} mode Agent mode group containing the target agent.
   * @param {string} agentName Agent key within the mode group.
   * @param {AgentEditableSetting} setting Setting field to update.
   * @param {Personalities | OpenAIReasoningMode | OpenAIModel | string} value New setting value.
   * @param {AddRemoveOperation} [operation] Required for permission list edits.
   * @returns {void} No return value.
   */
  public setAgentSetting(
    mode: AgentMode,
    agentName: string,
    setting: AgentEditableSetting,
    value: Personalities | OpenAIReasoningMode | OpenAIModel | string,
    operation?: AddRemoveOperation,
  ): void {
    const modeSettings = this._agentSettings[mode];
    if (!modeSettings) {
      throw new Error(`unknown agent mode: ${mode}`);
    }

    const agent = modeSettings[agentName];
    if (!agent) {
      throw new Error(
        `agent \"${agentName}\" does not exist for mode \"${mode}\"`,
      );
    }

    if (setting === "permissions") {
      if (!operation) {
        throw new Error("operation is required for permissions changes");
      }

      if (operation === "add") {
        if (!agent.permissions.includes(value)) {
          agent.permissions.push(value);
        }
      } else {
        agent.permissions = agent.permissions.filter(
          (permission) => permission !== value,
        );
      }

      this.saveSettings();
      return;
    }

    if (setting === "personality") {
      agent.personality = value as Personalities;
    } else if (setting === "reasoning") {
      agent.reasoning = value as OpenAIReasoningMode;
    } else if (setting === "model") {
      agent.model = value as OpenAIModel;
    }

    this.saveSettings();
  }

  /**
   * Builds the absolute path to a settings file for a profile name.
   * @param {string} configName Settings profile name.
   * @returns {string} Absolute path to the profile file.
   */
  private static getConfigPath(configName: string): string {
    return path.join(this.settingsDir, `${configName}.config.json`);
  }

  /**
   * Reads and normalizes a raw settings JSON file into internal camelCase shape.
   * @param {string} configPath Absolute path to the settings file.
   * @returns {SettingsFile} Normalized settings object.
   */
  private static readSettingsFile(configPath: string): SettingsFile {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as RawSettingsFile;

    return {
      name: parsed.name,
      defaultPersonality: parsed.default_personality,
      defaultReasoning: parsed.default_reasoning,
      defaultModel: parsed.default_model,
      gitMode: parsed.git_mode,
      scriptMode: parsed.script_mode,
      agents: parsed.agents,
      protectedObjects: parsed.protected,
      concealedObjects: parsed.concealed,
    };
  }

  /**
   * Converts internal settings shape into the raw persisted snake_case structure.
   * @param {SettingsFile} config Internal settings object.
   * @returns {RawSettingsFile} Raw JSON-serializable settings payload.
   */
  private static toRawSettingsFile(config: SettingsFile): RawSettingsFile {
    return {
      name: config.name,
      default_personality: config.defaultPersonality,
      default_reasoning: config.defaultReasoning,
      default_model: config.defaultModel,
      git_mode: config.gitMode,
      script_mode: config.scriptMode,
      agents: config.agents,
      protected: config.protectedObjects,
      concealed: config.concealedObjects,
    };
  }

  /**
   * Mutates an object list by adding or removing a path/object entry.
   * @param {FileSystemObject[]} target Target list to update.
   * @param {AddRemoveOperation} operation Change operation (`add` or `remove`).
   * @param {string | FileSystemObject} [pathOrObject] Path string or object entry to update.
   * @returns {void} No return value.
   */
  private updateObjectList(
    target: FileSystemObject[],
    operation: AddRemoveOperation,
    pathOrObject?: string | FileSystemObject,
  ): void {
    if (!pathOrObject) {
      return;
    }

    const objectToChange =
      typeof pathOrObject === "string"
        ? new FileSystemObject(pathOrObject)
        : pathOrObject;

    if (operation === "add") {
      if (!target.some((existing) => existing.equals(objectToChange))) {
        target.push(objectToChange);
      }
      return;
    }

    const objectIndex = target.findIndex((existing) =>
      existing.equals(objectToChange),
    );
    if (objectIndex >= 0) {
      target.splice(objectIndex, 1);
    }
  }
}
