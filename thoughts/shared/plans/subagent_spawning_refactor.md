# Subagent Spawning Logic Refactoring Implementation Plan

## Overview

We are refactoring the MCP subagent server to eliminate hardcoded subagent configurations and enable project-specific subagent execution. This removes the architectural limitation where subagents execute within the MCP server's project context instead of the user's actual project context.

## Current State Analysis

The current implementation has several key limitations:
- **Hardcoded SUBAGENTS object** in `src/index.ts:65-91` with 3 fixed subagent configurations
- **Multiple `run_subagent_*` tools** dynamically generated at server startup
- **Invalid Gemini CLI usage** with non-existing `chat` argument and `--interactive` mode
- **Wrong project context** - subagents execute in MCP server's `subagents/` directory instead of user's project
- **No project access** - subagents cannot see user's project files and context

### Key Discoveries:
- All current subagents use `["chat", "--interactive"]` arguments, but `chat` is not a valid Gemini CLI command  
- Tests are well-isolated and create their own SubagentConfig objects, so won't need major changes
- Directory validation is Gemini-specific and needs to be made generic
- Command construction uses shell pipeline `cat prompt | gemini <args>`

## Desired End State

After this refactoring:
- **Single `run_subagent` tool** that accepts project directory and subagent name parameters
- **Project-specific subagents** located in `{project}/.gemini/subagents/{name}/` directories
- **Correct Gemini CLI usage** with `gemini --model <model> --include-directories <project>`
- **Full project access** via `--include-directories` argument
- **Dynamic subagent creation** - server creates missing subagent directories and default GEMINI.md files
- **Model flexibility** - configurable model per execution (defaults to gemini-2.5-flash)

### Verification:
The implementation is complete when:
1. All hardcoded SUBAGENTS references are removed
2. Single `run_subagent` tool works with project-specific subagents  
3. Subagents can access project files via `--include-directories`
4. Tests pass with the new architecture

## What We're NOT Doing

- **No backward compatibility** - existing `run_subagent_*` tools will be removed entirely
- **No hardcoded fallbacks** - all subagents must be project-specific
- **No interactive mode** - subagents run in non-interactive mode only
- **No complex directory scanning** - simple `.gemini/subagents/{name}/` pattern only
- **No model validation** - assume all requested models are available
- **No migration utilities** - clean break from old approach

## Implementation Approach

**Clean Slate Strategy**: Remove all hardcoded infrastructure first, then build the new project-specific system. This avoids confusion and ensures a clean implementation.

**Non-Interactive Focus**: Use Gemini CLI in standard mode with piped input, suitable for MCP tool execution.

**Project-Centric Design**: All subagent configurations live within user projects, not the MCP server.

## Phase 1: Remove Hardcoded Infrastructure

### Overview
Clean removal of all hardcoded SUBAGENTS and `run_subagent_*` tools to create a clean slate for the new implementation.

### Changes Required:

#### 1. Remove SUBAGENTS Object and References
**File**: `src/index.ts`
**Changes**: Remove hardcoded configurations and tool generation

```typescript
// REMOVE: Lines 65-91 - Entire SUBAGENTS object
export const SUBAGENTS: Record<string, SubagentConfig> = {
  "code-assistant": { /* ... */ },
  "test-specialist": { /* ... */ }, 
  "documentation-writer": { /* ... */ }
};

// REMOVE: Lines 111-136 - Dynamic tool generation loop
for (const subagent of Object.values(SUBAGENTS)) {
  if (subagent.name === "test") continue;
  tools.push({
    name: `run_subagent_${subagent.name}`,
    // ...
  });
}

// REMOVE: Lines 305-325 - Pattern matching and routing
if (name.startsWith("run_subagent_")) {
  const subagentName = name.replace("run_subagent_", "");
  const subagentConfig = SUBAGENTS[subagentName];
  // ...
}
```

#### 2. Clean Up Imports
**File**: `src/index.ts`
**Changes**: Remove unused imports

```typescript
// REMOVE: Line 14 - RunSubagentArgumentsSchema import (will be updated)
// REMOVE: Any unused SubagentConfig references
```

#### 3. Remove Physical Subagent Directories
**Files**: `subagents/` directory
**Changes**: Remove entire directory structure

```bash
# These directories will be removed:
subagents/code-assistant/GEMINI.md
subagents/test-specialist/GEMINI.md
subagents/documentation-writer/GEMINI.md
```

### Success Criteria:

#### Automated Verification:
- [x] Code compiles successfully: `npm run build`
- [x] No references to `SUBAGENTS` object remain
- [x] No `run_subagent_*` tool registration code exists
- [x] Pattern matching for `run_subagent_` is removed

#### Manual Verification:
- [x] MCP server starts without errors
- [x] No hardcoded subagent tools are listed in tool inventory
- [x] Server only exposes utility tools (status, logs, etc.)

---

## Phase 2: Update Schema and Tool Registration

### Overview
Create the new single `run_subagent` tool with updated parameter schema for project-specific subagent execution.

### Changes Required:

#### 1. Update Schema Definition
**File**: `src/tools/schemas.ts`
**Changes**: Replace current schema with new project-specific parameters

```typescript
// REPLACE: Lines 21-24
export const RunSubagentArgumentsSchema = z.object({
  input: z.string().min(1, "Input cannot be empty"),
  project_directory: z.string().min(1, "Main agent project directory path"),
  subagent_name: z.string().min(1, "Name of the subagent to execute"),
  model: z.string().optional().default("gemini-2.5-flash")
});
```

#### 2. Register Single Tool
**File**: `src/index.ts`
**Changes**: Add single `run_subagent` tool registration

```typescript
// ADD: In ListToolsRequestSchema handler around line 110
tools.push({
  name: "run_subagent",
  description: "Execute a project-specific subagent. The subagent will be created in {project_directory}/.gemini/subagents/{subagent_name}/ if it doesn't exist. The subagent runs from its own directory but has access to the full project via --include-directories.",
  inputSchema: {
    type: "object",
    properties: {
      input: {
        type: "string",
        description: "Task or prompt to send to the subagent"
      },
      project_directory: {
        type: "string", 
        description: "Absolute path to the main project root directory where .gemini/subagents/ should be located"
      },
      subagent_name: {
        type: "string",
        description: "Name of the subagent to execute (e.g., 'code-assistant', 'test-specialist')"
      },
      model: {
        type: "string",
        description: "Gemini model to use (defaults to 'gemini-2.5-flash')"
      }
    },
    required: ["input", "project_directory", "subagent_name"]
  }
});
```

#### 3. Add Tool Handler
**File**: `src/index.ts`
**Changes**: Add handler for new tool

```typescript
// ADD: In CallToolRequestSchema handler around line 305
if (name === "run_subagent") {
  const { input, project_directory, subagent_name, model } = RunSubagentArgumentsSchema.parse(args);
  
  await ensureLogDir();
  const runId = await runSubagent(input, project_directory, subagent_name, model || "gemini-2.5-flash", LOG_DIR);
  
  return {
    content: [
      {
        type: "text",
        text: `Subagent ${subagent_name} started in project ${project_directory} with run ID: ${runId}.\n\nUse check_subagent_status to check the status. As this task can take a while, periodically check status in 30 second intervals or similar (use "sleep 30").`,
      },
    ],
  };
}
```

### Success Criteria:

#### Automated Verification:
- [x] Schema validation works: `npm run build`
- [x] Tool registration creates single `run_subagent` tool
- [x] All required parameters are validated by Zod schema

#### Manual Verification:
- [x] MCP server lists single `run_subagent` tool
- [x] Tool accepts all required parameters correctly
- [x] Error handling works for invalid parameters

---

## Phase 3: Fix Command Construction

### Overview
Update Gemini CLI command building to use correct arguments without invalid `chat` command and with project access via `--include-directories`.

### Changes Required:

#### 1. Update runSubagent Function Signature
**File**: `src/tools/run.ts`
**Changes**: Replace SubagentConfig parameter with individual parameters

```typescript
// REPLACE: Line 10 function signature
export async function runSubagent(
  input: string,
  projectDirectory: string, 
  subagentName: string,
  model: string,
  logDir: string
): Promise<string> {
```

#### 2. Fix Command Construction
**File**: `src/tools/run.ts`
**Changes**: Replace getArgs() calls with correct Gemini CLI arguments

```typescript
// REPLACE: Lines 70-82 - Command construction
const command = "gemini";
const args = [
  "--model", model,
  "--include-directories", projectDirectory
];

// Rest of shell pipeline construction remains the same
const isWindows = process.platform === 'win32';
const shellCommand = isWindows ? "cmd" : "sh";
const catCommand = isWindows ? "type" : "cat";
const shellArgs = isWindows 
  ? ["/c", `${catCommand} "${promptFile}" | ${command} ${args.join(" ")}`]
  : ["-c", `${catCommand} "${promptFile}" | ${command} ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`];
```

#### 3. Update Metadata Tracking
**File**: `src/tools/run.ts`
**Changes**: Update metadata to track subagent name instead of config

```typescript
// UPDATE: Around line 85 - Metadata creation
const metadata: MetaFileContent = {
  runId,
  agentName: subagentName,  // Use subagentName instead of subagent.name
  command: `${command} ${args.join(" ")}`,
  input,
  cwd: subagentWorkingDir,
  status: "running",
  startTime: new Date().toISOString(),
  endTime: null,
  exitCode: null,
  summary: null,
  messages: []
};
```

### Success Criteria:

#### Automated Verification:
- [ ] Function compiles with new signature: `npm run build`
- [ ] No references to SubagentConfig or getArgs() remain
- [ ] Metadata creation uses correct subagentName field

#### Manual Verification:
- [ ] Command construction produces valid Gemini CLI command
- [ ] `--include-directories` argument points to correct project directory
- [ ] Shell pipeline works with new argument structure

---

## Phase 4: Implement Dynamic Directory Resolution

### Overview
Add project-specific subagent directory discovery, creation, and GEMINI.md file management.

### Changes Required:

#### 1. Create Directory Resolution Function
**File**: `src/tools/run.ts` 
**Changes**: Add new function for project-specific directory setup

```typescript
// ADD: New function around line 20
async function resolveSubagentDirectory(
  projectDirectory: string,
  subagentName: string
): Promise<string> {
  const subagentDir = path.join(projectDirectory, '.gemini', 'subagents', subagentName);
  
  // Ensure directory exists
  await ensureDir(subagentDir);
  
  // Create default GEMINI.md if missing
  const geminiFile = path.join(subagentDir, 'GEMINI.md');
  if (!await pathExists(geminiFile)) {
    await createDefaultGeminiMd(geminiFile, subagentName);
  }
  
  return subagentDir;
}
```

#### 2. Create Default GEMINI.md Generator
**File**: `src/tools/run.ts`
**Changes**: Add function to create default specialized prompts

```typescript
// ADD: New function
async function createDefaultGeminiMd(
  filePath: string,
  subagentName: string
): Promise<void> {
  const defaultContent = `# ${subagentName} Subagent

You are a specialized AI assistant focused on ${subagentName.replace(/-/g, ' ')} tasks.

## Your Role
- Provide expert assistance with ${subagentName.replace(/-/g, ' ')}-related tasks
- Follow best practices and industry standards
- Give clear, actionable guidance
- Be concise but comprehensive

## Approach
1. Understand the specific requirements
2. Analyze the current context and codebase
3. Provide targeted solutions
4. Include examples where helpful
5. Suggest next steps or improvements

Focus on delivering high-quality results that align with the project's goals and conventions.
`;

  await fs.writeFile(filePath, defaultContent, 'utf8');
  console.error(`Created default GEMINI.md for ${subagentName} at ${filePath}`);
}
```

#### 3. Update Working Directory Logic
**File**: `src/tools/run.ts`
**Changes**: Replace current directory setup with project-specific resolution

```typescript
// REPLACE: Lines 25-48 - Directory determination logic
const subagentWorkingDir = await resolveSubagentDirectory(projectDirectory, subagentName);
console.error(`Subagent ${subagentName} will execute from directory: ${subagentWorkingDir}`);
```

#### 4. Add Required Imports
**File**: `src/tools/run.ts`
**Changes**: Add necessary imports

```typescript
// ADD: Additional imports at top
import { ensureDir, pathExists, writeFile } from 'fs-extra';
import * as fs from 'fs-extra';
```

#### 5. Update Generic Validation Function
**File**: `src/tools/subagentDirectory.ts`
**Changes**: Make GEMINI.md validation generic (optional)

```typescript
// UPDATE: validateGeminiPromptFile to be generic
export async function validatePromptFile(
  subagentDirectory: string,
  promptFileName: string = 'GEMINI.md'
): Promise<boolean> {
  try {
    const promptFilePath = join(subagentDirectory, promptFileName);
    const stats = await stat(promptFilePath);
    
    if (!stats.isFile()) {
      console.error(`Warning: ${promptFilePath} exists but is not a file.`);
      return false;
    }
    
    // Check if file is readable
    await access(promptFilePath, constants.R_OK);
    return true;
  } catch (error) {
    console.error(`Warning: Could not access ${promptFileName} in ${subagentDirectory}: ${error}`);
    return false;
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Directory creation works: `npm run build`
- [ ] Default GEMINI.md generation functions correctly
- [ ] Path resolution handles nested directory creation
- [ ] No hardcoded directory references remain

#### Manual Verification:
- [ ] Subagent directories are created in correct project location
- [ ] Default GEMINI.md files have appropriate content for subagent type
- [ ] Working directory is set to subagent-specific path
- [ ] Project files are accessible via `--include-directories`

---

## Phase 5: Update Documentation

### Overview
Update all documentation, examples, and README files to reflect the new project-specific approach.

### Changes Required:

#### 1. Update Main README
**File**: `README.md`
**Changes**: Replace hardcoded tool examples

```markdown
<!-- REPLACE: Around lines 53, 58 -->
## Usage

The server exposes a single MCP tool:

- `run_subagent`: Execute a project-specific subagent with custom configuration

Example usage:
```json
{
  "name": "run_subagent",
  "arguments": {
    "input": "Help me write unit tests for the UserService class",
    "project_directory": "/path/to/your/project",
    "subagent_name": "test-specialist", 
    "model": "gemini-2.5-flash"
  }
}
```
```

#### 2. Update Project Documentation
**File**: `CLAUDE.md`
**Changes**: Update tool references

```markdown
<!-- REPLACE: Line 21 -->
- `run_subagent`: Delegates tasks to project-specific subagents
```

**File**: `PROJECT_DOCUMENTATION.md`
**Changes**: Update architecture documentation

```markdown
<!-- REPLACE: Line 150 -->
The MCP server provides a `run_subagent` tool that creates and manages project-specific subagents in `.gemini/subagents/` directories.
```

#### 3. Add Setup Guide
**File**: `README.md`
**Changes**: Add section on project setup

```markdown
<!-- ADD: New section -->
## Project Setup

To use subagents in your project:

1. Create a `.gemini/subagents/` directory in your project root
2. For each subagent, create a subdirectory with a `GEMINI.md` file:
   ```
   your-project/
   ├── .gemini/
   │   └── subagents/
   │       ├── code-assistant/
   │       │   └── GEMINI.md
   │       └── test-specialist/
   │           └── GEMINI.md
   └── src/
   ```
3. Customize each `GEMINI.md` file with specialized instructions for that subagent
4. Use the `run_subagent` tool with your project directory path

The server will automatically create missing directories and default `GEMINI.md` files as needed.
```

### Success Criteria:

#### Automated Verification:
- [ ] Documentation builds without errors
- [ ] All old tool references are updated
- [ ] Examples use correct new parameters

#### Manual Verification:
- [ ] Documentation accurately describes new workflow
- [ ] Examples are clear and actionable
- [ ] Setup instructions are comprehensive

---

## Testing Strategy

### Unit Tests:
Since tests create their own SubagentConfig objects and don't depend on the hardcoded SUBAGENTS export, most tests should continue working without modification. Key areas to verify:
- Directory resolution functions work correctly
- Default GEMINI.md generation creates valid files
- Schema validation handles new parameters properly

### Integration Tests:
- End-to-end workflow from tool call to subagent execution
- Project directory access via `--include-directories` 
- Error handling for invalid project paths or subagent names

### Manual Testing Steps:
1. Create a test project with `.gemini/subagents/test-agent/GEMINI.md`
2. Call `run_subagent` tool with project path and subagent name
3. Verify subagent executes in correct directory with project access
4. Test automatic directory/file creation for missing subagents
5. Verify different models work correctly

## Performance Considerations

- **Directory Creation**: Multiple concurrent subagent executions might create race conditions during directory setup
- **File System Access**: Project directory validation should be lightweight  
- **Model Selection**: No performance impact expected from model parameter

## Migration Notes

This is a **breaking change**. Existing users will need to:
1. Update MCP tool calls from `run_subagent_*` to `run_subagent`
2. Provide `project_directory` and `subagent_name` parameters
3. Move any custom configurations to project-specific `.gemini/subagents/` directories
4. Update any automation or scripts using the old tool names

## References

- Original research: `thoughts/shared/research/2025-09-06_12-32-36_subagent_spawning_refactor.md`
- Requirements ticket: `thoughts/boryan/tickets/refactor_subagent_spawning_logic.md`
- Gemini CLI arguments: `thoughts/boryan/notes/gemini_cli_arguments.md`