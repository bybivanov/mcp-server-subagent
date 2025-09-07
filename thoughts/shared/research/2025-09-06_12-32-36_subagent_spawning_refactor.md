---
date: 2025-09-06T12:32:36+00:00
researcher: Boryan Ivanov
git_commit: bc89529b5566d26eb2e334e6a56ca147a860a35e
branch: feature/gemini-subagents-with-prompts
repository: mcp-server-subagent
topic: "Subagent Spawning Logic Refactoring for Project-Specific Context"
tags: [research, codebase, subagent, spawning, architecture, refactoring, mcp, gemini]
status: complete
last_updated: 2025-09-06
last_updated_by: Boryan Ivanov
last_updated_note: "Added follow-up research with simplified approach removing backward compatibility"
---

# Research: Subagent Spawning Logic Refactoring for Project-Specific Context

**Date**: 2025-09-06T12:32:36+00:00
**Researcher**: Boryan Ivanov
**Git Commit**: bc89529b5566d26eb2e334e6a56ca147a860a35e
**Branch**: feature/gemini-subagents-with-prompts
**Repository**: mcp-server-subagent

## Research Question
Research subagent spawning logic within this project and how we can refactor it to cover the wanted behavior of enabling project-specific subagent configurations instead of hardcoded ones within the MCP server project.

## Summary
The current MCP subagent server has a fundamental architectural limitation: subagents are spawned in directories within the mcp-server-subagent project itself, preventing them from accessing the main agent's actual project context. This research identifies the current implementation, analyzes the technical barriers, and proposes a comprehensive refactoring approach to enable project-specific subagent configurations with flexible directory resolution and model selection.

## Detailed Findings

### Current Architecture Analysis

#### Core Spawning Implementation
- **Entry Point**: `src/index.ts:315` - Main runSubagent call in MCP tool handler
- **Core Logic**: `src/tools/run.ts:10-232` - Process spawning using Node.js child_process.spawn()
- **Command Pattern**: Uses shell pipeline `cat <promptFile> | <command> <args...>` 
- **Cross-Platform Support**: Windows (`cmd /c "type <file> | <command>"`) and Unix (`sh -c "cat <file> | <command>"`)

#### Directory Management System
- **Primary Resolution**: `src/tools/run.ts:25-48` - Uses `subagentDirectory` from SubagentConfig if specified
- **Fallback Strategy**: Falls back to user-provided `cwd` parameter
- **Directory Creation**: `src/tools/subagentDirectory.ts:11-95` - Automatic recursive directory creation via `fs-extra.ensureDir()`
- **Path Resolution**: Converts relative paths to absolute using `join(process.cwd(), subagentDirectory)`

#### Current Subagent Configurations
- **Hardcoded Definitions**: `src/index.ts:65-91` - Fixed SUBAGENTS object with 3 production subagents
- **Directory Structure**: All subagents located in `subagents/` within MCP server project
- **Context Files**: Each subagent has dedicated `GEMINI.md` file in its directory
- **Model Configuration**: All subagents use fixed `gemini chat --interactive` command

### Key Architectural Issues

#### Project Scoping Problem
The fundamental issue is that subagents execute in the MCP server's project context rather than the main agent's project:

```typescript
// Current hardcoded structure in src/index.ts:65-91
const SUBAGENTS: Record<string, SubagentConfig> = {
  "code-assistant": {
    name: "code-assistant",
    command: "gemini",
    getArgs: () => ["chat", "--interactive"],
    subagentDirectory: "subagents/code-assistant", // ← Problem: relative to MCP server
    // ...
  }
};
```

#### Directory Resolution Limitations
- **Fixed Base Directory**: All paths resolved relative to `process.cwd()` of MCP server process
- **No Dynamic Discovery**: Cannot search for subagents in user project directories  
- **Hardcoded Mappings**: Subagent definitions are compile-time fixed, not runtime dynamic

#### Context Loading Constraints
- **GEMINI.md Discovery**: `src/tools/subagentDirectory.ts:62-95` - Validates GEMINI.md in subagent directories
- **Single File Per Subagent**: No hierarchical or multi-file context loading
- **Working Directory Dependency**: Relies on Gemini CLI's automatic file discovery in working directory

### MCP Tool Handler Analysis

#### Current Parameter Structure
```typescript
// From src/tools/schemas.ts:21-24
export const RunSubagentArgumentsSchema = z.object({
  input: z.string().min(1, "Input cannot be empty"),
  cwd: z.string().min(1, "Working directory path cannot be empty"),
});
```

#### Tool Registration Pattern
- **Dynamic Generation**: `src/index.ts:110-136` - Iterates through SUBAGENTS to create `run_subagent_<name>` tools
- **Tool Exclusion**: Test agents filtered from production tool list
- **Parameter Requirements**: Both `input` and `cwd` marked as required

#### Command Construction Flow
1. Pattern matching with `name.startsWith("run_subagent_")` at `src/index.ts:306`
2. Subagent name extraction via `name.replace("run_subagent_", "")` at line 307
3. Configuration validation against SUBAGENTS object at line 309-311
4. Argument parsing using RunSubagentArgumentsSchema at line 312

## Code References

### Primary Implementation Files
- `src/index.ts:65-91` - SUBAGENTS configuration object
- `src/index.ts:110-136` - Dynamic MCP tool registration
- `src/index.ts:301-542` - Tool execution routing and handling
- `src/tools/run.ts:10-232` - Core subagent execution logic
- `src/tools/schemas.ts:21-24` - Parameter validation schemas
- `src/tools/subagentDirectory.ts:11-95` - Directory management and validation

### Configuration Files
- `subagents/code-assistant/GEMINI.md` - General coding assistant context
- `subagents/test-specialist/GEMINI.md` - Testing specialist context  
- `subagents/documentation-writer/GEMINI.md` - Documentation writer context

### Test Coverage
- `src/test.spec.ts:1-200` - Unit tests with test-only SubagentConfig objects
- `src/integration.spec.ts:1-300` - End-to-end integration tests
- `src/communication.spec.ts:1-400` - Bi-directional communication tests
- `src/tools/subagentDirectory.spec.ts:1-150` - Directory validation tests

## Architecture Insights

### Design Patterns Identified
- **Factory Pattern**: SubagentConfig objects with `getArgs()` functions for command construction
- **Command Pipeline Pattern**: Shell pipeline `cat prompt | command` for input delivery
- **Process Isolation**: Separate child processes with custom environment variables
- **Async Execution Model**: Immediate runId return with separate status checking

### Key Implementation Decisions
- **Shell Command Abstraction**: Cross-platform shell handling abstracted behind single interface
- **Metadata-Driven Tracking**: Comprehensive `.meta.json` files for run tracking and communication
- **Directory Fallback Strategy**: Graceful degradation when subagent directories unavailable
- **Context File Validation**: Non-blocking validation with warnings for missing GEMINI.md files

## Historical Context (from thoughts/)

### Documented Architectural Issues
- `thoughts/boryan/tickets/refactor_subagent_spawning_logic.md` - Critical ticket identifying the project scoping problem
- `thoughts/boryan/notes/gemini_cli_commands.md` - Gemini CLI reference documentation for implementation context

### Identified Solutions from Ticket
The ticket proposes two potential approaches:

**Solution 1**: Directory + Model Parameters
- Add `directory` and `model` parameters to MCP command
- Main agent maintains internal subagent directory mappings
- Fewer parameters but requires client-side mapping logic

**Solution 2**: Project Directory + Subagent Name + Model  
- Add `main_agent_project_directory`, `subagent_name`, and `model` parameters
- Server searches `[project_directory]/.gemini/subagents/[subagent_name]`
- More parameters but delegates directory resolution to server

## Proposed Refactoring Approach

### Recommended Solution: Enhanced Parameter-Based Discovery

Based on the analysis, I recommend **Solution 2** with enhancements for backward compatibility:

#### Enhanced Tool Parameters
```typescript
// Proposed schema enhancement
export const RunSubagentArgumentsSchema = z.object({
  input: z.string().min(1, "Input cannot be empty"),
  project_directory: z.string().min(1, "Main agent project directory path"),
  subagent_name: z.string().min(1, "Name of the subagent to execute"),
  model: z.string().optional().default("gemini-2.5-flash"), // Allow model selection
  // Optional backward compatibility
  cwd: z.string().optional(), // For fallback compatibility
});
```

#### Directory Resolution Algorithm
```typescript
// Proposed implementation in src/tools/run.ts
async function resolveSubagentDirectory(
  projectDirectory: string,
  subagentName: string,
  fallbackCwd?: string
): Promise<string> {
  // 1. Primary: Check project-specific location
  const projectSubagentDir = join(projectDirectory, '.gemini', 'subagents', subagentName);
  if (await validateGeminiPromptFile(projectSubagentDir)) {
    return projectSubagentDir;
  }
  
  // 2. Secondary: Check hardcoded subagents (backward compatibility)
  const hardcodedSubagent = SUBAGENTS[subagentName];
  if (hardcodedSubagent?.subagentDirectory) {
    return join(process.cwd(), hardcodedSubagent.subagentDirectory);
  }
  
  // 3. Fallback: Use provided cwd or create in project
  return fallbackCwd || join(projectDirectory, '.gemini', 'subagents', subagentName);
}
```

#### Enhanced SubagentConfig Interface
```typescript
// Proposed enhancement to src/tools/schemas.ts
interface SubagentConfig {
  name: string;
  command: string;
  getArgs: (model?: string) => string[];
  description: string;
  specialization: string;
  subagentDirectory?: string; // Optional for backward compatibility
  supportedModels?: string[]; // Model validation
  projectSpecific?: boolean;  // Flag for discovery mode
}
```

### Implementation Strategy

#### Phase 1: Enhanced Parameter Support
1. **Update Tool Schema**: Add new parameters while keeping `cwd` optional for backward compatibility
2. **Enhance Directory Resolution**: Implement multi-stage directory resolution algorithm
3. **Add Model Support**: Allow dynamic model selection in command construction

#### Phase 2: Dynamic Subagent Discovery
1. **Project-Specific Search**: Implement `.gemini/subagents/` directory scanning
2. **Context Validation**: Extend GEMINI.md validation for project-specific contexts
3. **Tool Registration**: Update tool registration to support dynamic subagents

#### Phase 3: Backward Compatibility
1. **Fallback Mechanisms**: Ensure existing hardcoded subagents continue working
2. **Migration Utilities**: Provide tooling to migrate existing configurations
3. **Documentation Updates**: Update examples and documentation

### Benefits of Proposed Approach

#### Architectural Advantages
- **Project Scoping**: Subagents execute in correct project context with access to project files
- **Flexible Configuration**: Each project can define its own specialized subagents
- **Model Selection**: Dynamic model selection based on subagent requirements
- **Backward Compatibility**: Existing configurations continue working during migration

#### Developer Experience
- **Context Relevance**: Subagents have access to project-specific code, docs, and configurations  
- **Team Collaboration**: Subagent configurations can be version-controlled with project
- **Specialization**: Project-specific subagents can be tailored to project architecture and standards
- **Reduced Bloat**: Prevents MCP server from becoming a repository of all possible subagent configurations

## Open Questions

### Implementation Considerations
1. **Error Handling**: How to handle cases where project directories don't exist or aren't accessible?
2. **Security**: Should there be restrictions on which directories can be accessed?
3. **Performance**: Impact of directory scanning on tool registration performance?
4. **Migration**: Automated migration path for existing hardcoded configurations?

### Design Decisions
1. **Directory Structure**: Should we enforce `.gemini/subagents/` or allow flexibility?
2. **Model Validation**: Should we validate that requested models are available?
3. **Fallback Behavior**: Should missing project-specific subagents create default ones?
4. **Tool Naming**: Should project-specific tools have different naming conventions?

The proposed refactoring addresses the core architectural limitation while maintaining backward compatibility and providing a clear migration path for existing implementations.

## Follow-up Research 2025-09-06T12:45:00+00:00

### Updated Requirements and Refactoring Plan

Based on further discussion, the requirements have been clarified:

1. **No Backward Compatibility Needed**: Remove all hardcoded SUBAGENTS and `run_subagent_*` tools
2. **Non-Interactive Mode**: Remove `--interactive` argument and use standard prompt mode
3. **Non-existing Argument**: Remove non-existing argument `chat` from the args
4. **Project Access**: Add `--include-directories` to give subagents access to project root
5. **Simplified Architecture**: Only support project-specific subagents

### Revised Implementation Plan

#### 1. Remove Hardcoded Infrastructure
- **Delete**: `run_subagent_*` tool generation in `src/index.ts:110-136`
- **Delete**: Hardcoded SUBAGENTS object in `src/index.ts:65-91`
- **Simplify**: Tool registration to only include utility tools (status, logs, etc.)

#### 2. Create Single Generic Tool: `run_subagent`

```typescript
// New single tool schema in src/tools/schemas.ts
export const RunSubagentArgumentsSchema = z.object({
  input: z.string().min(1, "Input cannot be empty"),
  project_directory: z.string().min(1, "Main agent project directory path"),
  subagent_name: z.string().min(1, "Name of the subagent to execute"),
  model: z.string().optional().default("gemini-2.5-flash")
});
```

#### 3. Updated Command Construction

```typescript
// Revised getArgs function for non-interactive mode with project access
function buildGeminiCommand(
  model: string, 
  projectDirectory: string
): string[] {
  return [
    "--model", model,
    "--include-directories", projectDirectory
  ];
}
```

#### 4. Directory Resolution Algorithm

```typescript
// Simplified directory resolution without backward compatibility
async function resolveSubagentDirectory(
  projectDirectory: string,
  subagentName: string
): Promise<string> {
  const subagentDir = join(projectDirectory, '.gemini', 'subagents', subagentName);
  await ensureDir(subagentDir);
  
  // Create default GEMINI.md if missing
  const geminiFile = join(subagentDir, 'GEMINI.md');
  if (!await pathExists(geminiFile)) {
    await createDefaultGeminiMd(geminiFile, subagentName);
  }
  
  return subagentDir;
}
```

#### 5. Test Updates Required

Update all test files to use new schema and remove hardcoded subagent references:

- **`src/test.spec.ts`**: Remove test SUBAGENTS, update to use new parameter structure
- **`src/integration.spec.ts`**: Update integration tests to use `run_subagent` tool
- **`src/communication.spec.ts`**: Update communication tests for new tool structure
- **`src/tools/subagentDirectory.spec.ts`**: Update directory validation tests

#### 6. Key Technical Changes

**Command Pipeline Update**:
```bash
# Old: cat prompt.md | gemini chat --interactive
# New: cat prompt.md | gemini --model gemini-2.5-flash --include-directories ../../../
```

**Working Directory Structure**:
```
/user/project/
├── .gemini/
│   └── subagents/
│       ├── code-assistant/
│       │   └── GEMINI.md
│       └── test-specialist/
│           └── GEMINI.md
├── src/
└── package.json
```

**Environment Variables**:
- Keep `NO_COLOR=1` and `TERM=dumb` for consistent output

### Benefits of Simplified Approach

1. **Cleaner Architecture**: No hardcoded configurations to maintain
2. **Project-Specific Only**: All subagents are defined within user projects
3. **Proper Project Access**: `--include-directories` gives subagents full project context
4. **Non-Interactive Mode**: More suitable for MCP tool execution
5. **Dynamic Configuration**: Each project can define any number of specialized subagents
6. **Model Flexibility**: Easy to specify different models per execution

### Migration Impact

- **Breaking Change**: Existing MCP tool users need to update from `run_subagent_*` to `run_subagent`
- **Configuration Migration**: Projects need to create `.gemini/subagents/` structure
- **Test Updates**: All tests need updates for new parameter structure
- **Documentation**: Update all examples and documentation to reflect new approach
