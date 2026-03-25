# CLI Agent Tool Brainstorm (`maybe_tools.md`)

Below is a practical baseline set of tools for Codex-like functionality in a CLI agent.

## 1) `list_files`
- **Description**: List files/directories (optionally recursive) so the agent can discover workspace structure.
- **Parameters**:
  - `path: string` (required)
  - `recursive?: boolean`
  - `include_hidden?: boolean`
  - `max_entries?: number`
- **Returns**:
  - `entries: Array<{ path: string; type: "file" | "dir" | "symlink"; size_bytes?: number; modified_at?: string }>`
  - `truncated: boolean`

## 2) `read_file`
- **Description**: Read file contents with optional line ranges to keep context windows small.
- **Parameters**:
  - `path: string` (required)
  - `start_line?: number`
  - `end_line?: number`
  - `encoding?: "utf-8" | "base64"`
- **Returns**:
  - `path: string`
  - `content: string`
  - `total_lines?: number`

## 3) `write_file`
- **Description**: Create or overwrite a file atomically.
- **Parameters**:
  - `path: string` (required)
  - `content: string` (required)
  - `create_dirs?: boolean`
  - `if_exists?: "overwrite" | "error" | "append"`
- **Returns**:
  - `path: string`
  - `bytes_written: number`
  - `created: boolean`

## 4) `patch_file`
- **Description**: Apply structured edits (diff/patch hunks) for precise code changes.
- **Parameters**:
  - `path: string` (required)
  - `patch: string` (required)
  - `dry_run?: boolean`
- **Returns**:
  - `path: string`
  - `applied: boolean`
  - `hunks_applied: number`
  - `errors?: string[]`

## 5) `delete_path`
- **Description**: Delete a file or directory (usually guarded by approval).
- **Parameters**:
  - `path: string` (required)
  - `recursive?: boolean`
  - `force?: boolean`
- **Returns**:
  - `deleted: boolean`
  - `path: string`

## 6) `search_text`
- **Description**: Fast repo search (like `rg`) to find symbols, TODOs, errors, and references.
- **Parameters**:
  - `pattern: string` (required)
  - `path?: string`
  - `glob?: string[]`
  - `case_sensitive?: boolean`
  - `max_matches?: number`
- **Returns**:
  - `matches: Array<{ file: string; line: number; column: number; text: string }>`
  - `truncated: boolean`

## 7) `stat_path`
- **Description**: Get metadata for one path (exists/type/permissions/timestamps).
- **Parameters**:
  - `path: string` (required)
- **Returns**:
  - `exists: boolean`
  - `type?: "file" | "dir" | "symlink"`
  - `size_bytes?: number`
  - `mode?: string`
  - `modified_at?: string`

## 8) `run_command`
- **Description**: Execute a non-interactive shell command and return stdout/stderr + exit code.
- **Parameters**:
  - `cmd: string` (required)
  - `cwd?: string`
  - `env?: Record<string, string>`
  - `timeout_ms?: number`
  - `max_output_chars?: number`
- **Returns**:
  - `exit_code: number`
  - `stdout: string`
  - `stderr: string`
  - `timed_out: boolean`

## 9) `start_process`
- **Description**: Start a long-running/interactive process (pty) and return a session id.
- **Parameters**:
  - `cmd: string` (required)
  - `cwd?: string`
  - `env?: Record<string, string>`
  - `tty?: boolean`
- **Returns**:
  - `session_id: string`
  - `pid: number`
  - `started: boolean`

## 10) `process_io`
- **Description**: Send input to and/or read output from an active process session.
- **Parameters**:
  - `session_id: string` (required)
  - `stdin?: string`
  - `read_only?: boolean`
  - `max_output_chars?: number`
  - `wait_ms?: number`
- **Returns**:
  - `stdout_chunk: string`
  - `stderr_chunk: string`
  - `exit_code?: number`
  - `running: boolean`

## 11) `stop_process`
- **Description**: Gracefully stop or force-kill a running process.
- **Parameters**:
  - `session_id: string` (required)
  - `signal?: "SIGINT" | "SIGTERM" | "SIGKILL"`
- **Returns**:
  - `stopped: boolean`
  - `exit_code?: number`

## 12) `request_approval`
- **Description**: Ask human approval before sensitive/destructive/escalated actions.
- **Parameters**:
  - `action: string` (required)
  - `reason: string` (required)
  - `risk_level?: "low" | "medium" | "high"`
  - `timeout_ms?: number`
- **Returns**:
  - `approved: boolean`
  - `approver?: string`
  - `note?: string`

## 13) `ask_user`
- **Description**: Request missing requirements/choices from the user.
- **Parameters**:
  - `prompt: string` (required)
  - `choices?: Array<{ id: string; label: string }>`
  - `allow_free_text?: boolean`
- **Returns**:
  - `selected_choice_id?: string`
  - `text_response?: string`

## 14) `update_plan`
- **Description**: Persist and surface current plan/step status for transparency.
- **Parameters**:
  - `steps: Array<{ id: string; text: string; status: "pending" | "in_progress" | "done" | "blocked" }>`
  - `summary?: string`
- **Returns**:
  - `ok: boolean`
  - `active_step_id?: string`

## 15) `git_status` / `git_diff` (optional but highly useful)
- **Description**: Inspect repo state and show changes without manually shelling out each time.
- **Parameters**:
  - `path?: string`
  - `staged?: boolean` (for diff)
  - `base_ref?: string` (for diff)
- **Returns**:
  - `status?: Array<{ path: string; index_status: string; worktree_status: string }>`
  - `diff_text?: string`

## 16) `run_tests` (optional convenience wrapper)
- **Description**: Standardized test execution with normalized result payload.
- **Parameters**:
  - `target?: string` (file, package, or test name)
  - `cmd?: string` (fallback explicit test command)
  - `timeout_ms?: number`
- **Returns**:
  - `passed: boolean`
  - `exit_code: number`
  - `summary: { passed: number; failed: number; skipped?: number }`
  - `stdout: string`
  - `stderr: string`

## 17) `fetch_url` (optional, if internet access is allowed)
- **Description**: Retrieve external docs/specs/APIs with controlled network policy.
- **Parameters**:
  - `url: string` (required)
  - `method?: "GET" | "POST"`
  - `headers?: Record<string, string>`
  - `body?: string`
  - `timeout_ms?: number`
- **Returns**:
  - `status: number`
  - `headers: Record<string, string>`
  - `body: string`

## Suggested Minimum Viable Set
If you want a lean first version, start with:
1. `list_files`
2. `read_file`
3. `write_file`
4. `patch_file`
5. `search_text`
6. `run_command`
7. `start_process`
8. `process_io`
9. `request_approval`
10. `ask_user`

This gives enough power for edit-run-debug workflows while preserving human control points.
