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

export class FileSystemObject {
  private _type: FileSystemObjectType;
  private _path: string;

  public constructor(path: string, type?: FileSystemObjectType) {
    this._path = path;

    if (type !== undefined) {
      this._type = type;
    } else {
      this._type = path.startsWith("/") ? "directory" : "file";
    }
  }

  public get type(): FileSystemObjectType {
    return this._type;
  }

  public get path(): string {
    return this._path;
  }

  public equals(other: any): boolean {
    if (!(other instanceof FileSystemObject)) {
      return false;
    }

    return this.type === other.type && this.path === other.path;
  }
}

export class Settings {
  private static readonly settingsDir = path.resolve(
    process.cwd(),
    "src",
    "settings",
  );

  private _configName: string;
  private _defaultPersonality: Personalities;
  private _defaultReasoning: OpenAIReasoningMode;
  private _defaultModel: OpenAIModel;
  private _gitMode: "safe" | "unsafe";
  private _scriptMode: "safe" | "unsafe";
  private _protectedObjects: FileSystemObject[];
  private _concealedObjects: FileSystemObject[];
  private _agentSettings: AgentSettings;

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

  public static fromSettingsFile(configName: string = "user_default"): Settings {
    const configPath = this.getConfigPath(configName);

    if (!fs.existsSync(configPath)) {
      throw new Error(`Settings file not found: ${configPath}`);
    }

    const config = this.readSettingsFile(configPath);
    return new Settings(config);
  }

  public static fromUserDefault(): Settings {
    return this.fromSettingsFile("user_default");
  }

  public get configName(): string {
    return this._configName;
  }

  public get defaultPersonality(): Personalities {
    return this._defaultPersonality;
  }

  public get defaultReasoning(): OpenAIReasoningMode {
    return this._defaultReasoning;
  }

  public get defaultModel(): OpenAIModel {
    return this._defaultModel;
  }

  public get gitMode(): "safe" | "unsafe" {
    return this._gitMode;
  }

  public get scriptMode(): "safe" | "unsafe" {
    return this._scriptMode;
  }

  public get protectedObjects(): FileSystemObject[] {
    return [...this._protectedObjects];
  }

  public get concealedObjects(): FileSystemObject[] {
    return [...this._concealedObjects];
  }

  public get agentSettings(): AgentSettings {
    return { ...this._agentSettings };
  }

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

  public set defaultPersonality(personality: Personalities) {
    this._defaultPersonality = personality;
    this.saveSettings();
  }

  public set defaultReasoning(reasoning: OpenAIReasoningMode) {
    this._defaultReasoning = reasoning;
    this.saveSettings();
  }

  public set defaultModel(model: OpenAIModel) {
    this._defaultModel = model;
    this.saveSettings();
  }

  public set gitMode(mode: "safe" | "unsafe") {
    this._gitMode = mode;
    this.saveSettings();
  }

  public set scriptMode(mode: "safe" | "unsafe") {
    this._scriptMode = mode;
    this.saveSettings();
  }

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

  public setProtectedObjects(
    operation: AddRemoveOperation,
    pathOrObject?: string | FileSystemObject,
  ): void {
    this.updateObjectList(this._protectedObjects, operation, pathOrObject);
    this.saveSettings();
  }

  public setConcealedObjects(
    operation: AddRemoveOperation,
    pathOrObject?: string | FileSystemObject,
  ): void {
    this.updateObjectList(this._concealedObjects, operation, pathOrObject);
    this.saveSettings();
  }

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

  private static getConfigPath(configName: string): string {
    return path.join(this.settingsDir, `${configName}.config.json`);
  }

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
