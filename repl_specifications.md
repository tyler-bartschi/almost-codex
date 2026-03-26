# REPL Command Specifications

This document defines the `/` commands for the CLI REPL, including arguments, accepted values, flags, and behavior.

## 1. Global Rules

- Commands begin with `/`.
- Tokens are space-delimited.
- Values containing spaces must be quoted (`"..."`).
- Invalid argument type/value should return a validation error and show command usage.
- Unless otherwise stated, commands operate on the currently active config profile.

## 2. Canonical Value Sets

### Modes
- `ask`
- `code` (default)
- `plan`
- `test`
- `document`

Aliases:
- `/chat` switches to `ask` mode.
- `/ask` switches to `ask` mode.

### Personalities
- `efficient`
- `friendly`
- `pirate`
- `sarcastic`

### Reasoning
- `minimal`
- `low`
- `medium`
- `high`

### Models
- `gpt-5`
- `gpt-5-mini`
- `gpt-5-nano`
- `gpt-4.1`
- `gpt-4.1-mini`
- `gpt-4.1-nano`
- `o3`
- `o3-mini`
- `o4-mini`

### Safety Modes
- `safe`
- `unsafe`

### File Object Types
- `file`
- `directory`

### Config Types (for `/config`)
- `default` -> `user_default.config.json`
- `named` -> `<name>.config.json` (user-created profile)

## 3. Agent Identifier Rules

Agent-targeting commands accept either:
- `<agent>` when unique across modes (e.g., `orchestrator`), or
- `<mode>.<agent>` for explicit targeting (e.g., `ask.chat`, `document.chat`).

If a bare `<agent>` is ambiguous, command must fail and ask for `<mode>.<agent>`.

## 4. Command List

## `/help`
- Syntax: `/help`
- Args: none
- Flags: none
- Behavior: list all supported commands with one-line descriptions.

## `/describe`
- Syntax: `/describe <command>`
- Args:
- `<command>`: string; must match a supported command name (e.g., `model`, `config`, `protect`)
- Flags: none
- Behavior: show detailed usage, accepted values, examples, and error cases for that command.

## `/clear`
- Syntax: `/clear`
- Args: none
- Flags: none
- Behavior: clear terminal output and redraw the interactive prompt at the top.

## `/quit` (`/exit`)
- Syntax:
- `/quit`
- `/exit`
- Behavior: end the interactive REPL loop and terminate the CLI process.

## `/agents`
- Syntax:
- `/agents`
- `/agents <mode>`
- Args:
- `<mode>`: enum (`ask|code|plan|test|document`)
- Flags: none
- Behavior:
- No args: list all agents grouped by mode with description and effective model/reasoning/personality.
- With mode: list only agents in that mode.

## `/model`
- Syntax:
- `/model <model>`
- `/model <agent_id> <model>`
- Args:
- `<agent_id>`: agent identifier (see Section 3)
- `<model>`: enum (see Models)
- Flags:
- `--profile <name>` optional; apply change to a specific named profile instead of active profile
- Behavior:
- One value: set `default_model`.
- Agent + value: set target agent `model` override.

## `/reasoning`
- Syntax:
- `/reasoning <reasoning>`
- `/reasoning <agent_id> <reasoning>`
- Args:
- `<agent_id>`: agent identifier
- `<reasoning>`: enum (`minimal|low|medium|high`)
- Flags:
- `--profile <name>` optional
- Behavior:
- One value: set `default_reasoning`.
- Agent + value: set target agent `reasoning` override.

## `/status`
- Syntax: `/status`
- Args: none
- Flags: none
- Behavior:
- Prints:
- `Mode: <current mode>`
- `Context window: yes`
- `Weekly limit: however much you're willing to pay, its your api key`

## `/personality`
- Syntax:
- `/personality --list`
- `/personality <personality>`
- `/personality <agent_id> <personality>`
- Args:
- `<personality>`: enum (`efficient|friendly|pirate|sarcastic`)
- `<agent_id>`: agent identifier
- Flags:
- `--list` list all available personalities
- `--profile <name>` optional
- Behavior:
- `<personality>`: set `default_personality`.
- `<agent_id> <personality>`: set target agent personality override.

## `/config`
- Purpose: mutate profile settings generically, including profile lifecycle.

### Syntax
- `/config list`
- `/config show [default|named <name>]`
- `/config use <name>`
- `/config create named <name> [--from default|<source_name>]`
- `/config delete named <name>`
- `/config set <type> [<name>] --field <field> --value <value>`
- `/config revert <type> [<name>] [--field <field>]`

### Args
- `<type>`: `default|named`
- `<name>`: profile name (for `named`)
- `<field>`: one of:
- `default_personality`
- `default_reasoning`
- `default_model`
- `git_mode`
- `script_mode`
- `agents.<mode>.<agent>.personality`
- `agents.<mode>.<agent>.reasoning`
- `agents.<mode>.<agent>.model`
- `agents.<mode>.<agent>.permissions`
- `protected`
- `concealed`
- `<value>` type by field:
- `default_personality` -> personality enum
- `default_reasoning` -> reasoning enum
- `default_model` -> model enum
- `git_mode|script_mode` -> `safe|unsafe`
- agent personality/reasoning/model -> corresponding enum or `default`
- agent permissions -> permission token string (`read|write|scripts|spawn_agent`)
- `protected|concealed` -> path string or object-like string with optional type (`{"path":"...","type":"file|directory"}`)

### Flags
- `--add|--remove` required when field is `agents...permissions`, `protected`, or `concealed`
- `--field` required for `set`; optional for `revert`
- `--value` required for `set`

### Behavior / Constraints
- `create`/`delete` only allowed for `named` configs.
- `delete named <name>` must reject `user_default` and `system_default`.
- `revert default` with no field restores entire `user_default` from `system_default`.
- `revert named <name>` with no field restores whole named profile from `system_default` while preserving profile `name`.
- `revert ... --field <field>` restores only that field from `system_default`.
- `set default ...` mutates `user_default`.
- `use <name>` switches active profile context for subsequent commands.

## Mode Switch Commands

## `/chat`
- Syntax: `/chat`
- Behavior: switch interactive mode to `ask`.

## `/ask` (alias of `/chat`)
- Syntax: `/ask`
- Behavior: switch interactive mode to `ask`.

## `/plan`
- Syntax: `/plan`
- Behavior: switch interactive mode to `plan`.

## `/code`
- Syntax: `/code`
- Behavior: switch interactive mode to `code`.

## `/test`
- Syntax: `/test [<prompt>]`
- Flags:
- `--non-interactive` default behavior; execute immediately
- Behavior:
- Trigger test workflow once and return results. Not a back-and-forth mode.

## `/document`
- Syntax: `/document`
- Behavior: switch interactive mode to `document`.

## `/git`
- Syntax:
- `/git --safe`
- `/git --unsafe`
- Args: none
- Flags:
- `--safe` set `git_mode=safe`
- `--unsafe` set `git_mode=unsafe`
- Behavior:
- `safe`: before file edits, commit workspace and create work branch for agent execution.
- `unsafe`: allow direct workspace edits without pre-branch/commit workflow.

## `/script`
- Syntax:
- `/script --safe`
- `/script --unsafe`
- Flags:
- `--safe` set `script_mode=safe`
- `--unsafe` set `script_mode=unsafe`
- Behavior: controls script execution safety policy using `script_mode`.

## `/protect`
- Syntax:
- `/protect <path>`
- `/protect --remove <path>`
- `/protect --list`
- Args:
- `<path>`: file or directory path
- Flags:
- `--remove` remove from protected set
- `--list` list protected objects
- `--type <file|directory>` optional explicit object type; default inference: FileSystemObject will handle classification
- Behavior:
- Add/remove/list entries in `protected`.
- Protected objects are read-only to agents.

## `/conceal`
- Syntax:
- `/conceal <path>`
- `/conceal --remove <path>`
- `/conceal --list`
- Args:
- `<path>`: file or directory path
- Flags:
- `--remove` remove from concealed set
- `--list` list concealed objects
- `--type <file|directory>` optional explicit object type; same inference as `/protect`
- Behavior:
- Add/remove/list entries in `concealed`.
- Concealed objects are hidden from agent context and should not be read or referenced.

## 5. Error Handling Requirements

- Unknown command: show `Unknown command` + suggest `/help`.
- Enum mismatch: print accepted values.
- Ambiguous agent id: require `<mode>.<agent>`.
- Missing required args/flags: print exact usage string.
- Profile not found on `named` operations: fail with not-found error.
- Attempt to modify/delete `system_default`: fail with explicit protected-resource error.

## 6. Examples

- `/help`
- `/describe config`
- `/agents`
- `/agents code`
- `/model gpt-5-mini`
- `/model ask.chat gpt-4.1-mini`
- `/reasoning high`
- `/reasoning executor low`
- `/personality --list`
- `/personality pirate`
- `/personality document.chat friendly`
- `/config list`
- `/config create named my_profile --from default`
- `/config set named my_profile --field git_mode --value unsafe`
- `/config set named my_profile --field agents.code.executor.model --value gpt-5`
- `/config set named my_profile --field agents.code.executor.permissions --value scripts --add`
- `/config revert named my_profile --field default_model`
- `/config revert default`
- `/git --safe`
- `/script --unsafe`
- `/protect src/secrets.ts --type file`
- `/protect --remove src/secrets.ts`
- `/conceal .env`
- `/conceal --list`
