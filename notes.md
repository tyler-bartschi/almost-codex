SpawnAgent
- spawnAgent will need the ability to call the ToolExecutor
- spawnAgent should get and inject the necessary system prompts from the prompt store
- do I want spawned agents to get a history? Do they need to know outside context, or should they just ask for it? Maybe have a compressedHistory parameter
  that the calling agent could write if necessary. that way it can get some context?
- work on the spawnAgent tool, it has no functionality yet
- it will then need to be updated in the ToolRegistry.json
- SpawnAgent should keep track of its agent name as well, global state will keep track of the main agent name

ToolExecutor
- ToolExecutor needs to take the following arguments: the agent name (to verify permissions), the tool to run and the tool arguments. Does it need anything else?

Main Loop and Experimentation
- Implement the main loop in index.ts to actually start up the agent and switch between modes
- Set up a docker container so that I can experiment with this thing without messing anything up

Far Future
- script-safe mode is going to be a future thing. Potentially enables turning off the human-in-the-loop, but for now changing script mode will not change anything