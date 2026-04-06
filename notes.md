- spawnAgent will need the ability to call the ToolExecutor
- spawnAgent should get and inject the necessary system prompts from the prompt store
- do I want spawned agents to get a history? Do they need to know outside context, or should they just ask for it? Maybe have a compressedHistory parameter
  that the calling agent could write if necessary. that way it can get some context?
- ToolExecutor needs to take the following arguments: the agent name (to verify permissions), the tool to run and the tool arguments. Does it need anything else?
- what other tools are needed? bash scripts basically. Already has the listing and finding commands as part of the read tools, so maybe that's enough? do i worry about the
  context window? nah probably not.
- bash script tools should always be human-in-the-loop, but the agent can provide the bash script it wants run
- implement git-safe mode: where should this happen? Probably in the index.ts upon first startup. Should it prompt the user to commit or should it just commit itself?
- script-safe mode is going to be a future thing. Potentially enables turning off the human-in-the-loop, but for now changing script mode will not change anything
- Implement the main loop in index.ts to actually start up the agent and switch between modes
- Set up a docker container so that I can experiment with this thing without messing anything up