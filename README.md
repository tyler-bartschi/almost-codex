# almost-codex

This repo includes a Dev Container that runs the built CLI in an isolated Docker container without bind-mounting your host files into the container.

## How it works

- The container image copies `dist/` plus `package.json` and `package-lock.json` into `/workspace`.
- The CLI lives at `/workspace/dist`.
- A disposable scratch folder is mounted at `/workspace/experiment`.
- VS Code opens `/workspace` inside the container, so you can see both `dist/` and `experiment/`.
- `OPENAI_API_KEY` is passed through from the host environment into the container at startup.

## First-time setup

1. In a host terminal, set your API key:

   ```sh
   export OPENAI_API_KEY="your-key-here"
   ```

2. From the repo root on the host, build the CLI:

   ```sh
   npm run build
   ```

3. Launch VS Code from that same terminal so the Dev Container can inherit `OPENAI_API_KEY`:

   ```sh
   code .
   ```

4. In VS Code, run `Dev Containers: Reopen in Container`.

VS Code will build the Docker image automatically. You do not need to run `docker build` yourself for the normal workflow.

## Daily workflow

1. Make any source changes on the host.
2. Run `npm run build` on the host.
3. In VS Code, run `Dev Containers: Rebuild and Reopen in Container`.
4. Inside the container terminal:

   ```sh
   cd /workspace/experiment
   ```

5. Run the CLI while staying in `/workspace/experiment` so tool paths resolve against the scratch workspace:

   ```sh
   node /workspace/dist/index.js
   ```

## Notes

- Files created in `/workspace/experiment` stay inside the running container only.
- When the container stops, the scratch folder is discarded.
- The running container cannot modify files in your host checkout because the repo is not mounted into it.
