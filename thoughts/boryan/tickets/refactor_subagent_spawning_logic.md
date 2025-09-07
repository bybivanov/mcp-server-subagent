# Currrent issue
We're spawning gemini cli subagents in their respective directories inside this project, meaning the agents will not have access to the project of the main agent that's calling this mcp server for subagents for task delegation.
Subagents are created in the this (mcp-server-subagent) project in the subagents folder with their respective GEMINI.md for context that's going to be used to give specific instructions and personas to the subagents. This is also an issue as the subagents are scoped to this project - not the one the main agent runs in. 

# Thoughts
I'm thinking maybe we should abstract the agent logic in the project and have only one mcp command that's being used for spawning the subagents.
The first solution I'm thinking of is to have two more parameters received with the subagent mcp command - the directory of the subagent (where the mcp server should spawn the subagent), and the model (gemini-2.5-flash, gemini-2.5-pro, etc.). The main agent will have knowledge of its project specific subagents and have a mapping with their respective directories.
The second solution would be to again receive three more parameters for the subagent mcp command but they would be - main agent project directory, subagent name, and model. The mcp server would then search for the [project_directory]/.gemini/subagents/[subagent_name] and spawn the subagent there.

The first solution introduces fewer new parameters but we have to create internal mappings for the main agent to understand and send the correct subagent directory within its project.
The second solution introduces three new parameters but the logic for finding the subagent directory is delegated to the mcp server.

# Wanted behavior
Subagents should be configured in the main agent project's directory and the mcp server should spawn subagents from their respective directories.

## Advantages
- Subagents will be project specific with tailored context, rules, and commands for it, allowing the developers to focus their attention in the project they are working on.
- Preventing constant modification and bloating of the mcp server with subagent configurations.
