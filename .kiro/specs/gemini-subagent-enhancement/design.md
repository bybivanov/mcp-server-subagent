# Design Document: Gemini Subagent Enhancement

## Overview

This design document outlines the enhancement of the MCP Subagent Server to focus exclusively on Gemini CLI-based subagents with support for custom system prompts and enhanced descriptions. The design builds upon the existing modular architecture while streamlining the subagent configuration to use only the Gemini CLI as the underlying LLM backend.

## Architecture

### Current Architecture Analysis

The existing system uses a `SUBAGENTS` configuration object in `src/index.ts` that defines different CLI-based agents (Amazon Q, Claude CLI). Each subagent has:
- `name`: Identifier for the subagent
- `command`: CLI command to execute
- `getArgs()`: Function returning command arguments
- `description`: Basic description of the subagent

The system spawns child processes using these configurations and manages their lifecycle through the existing tools in `src/tools/`.

### Enhanced Architecture

The enhanced architecture will:
1. Replace all existing subagent configurations with Gemini CLI-based ones
2. Extend the `SubagentConfig` interface to support custom system prompts
3. Implement system prompt loading and injection into Gemini CLI commands
4. Enhance descriptions to provide better agent selection guidance

## Components and Interfaces

### Enhanced SubagentConfig Interface

```typescript
export interface SubagentConfig {
  name: string;
  command: string; // Will always be "gemini" for all subagents
  getArgs: () => string[];
  description: string; // Enhanced with detailed capabilities
  subagentDirectory: string; // Path to the subagent's directory containing GEMINI.md
  specialization: string; // Brief specialization summary for agent selection
}
```

### Subagent Directory Structure

Each subagent will have its own dedicated directory containing a GEMINI.md file:

```
subagents/
├── code-assistant/
│   └── GEMINI.md
├── test-specialist/
│   └── GEMINI.md
└── documentation-writer/
    └── GEMINI.md
```

### Directory Management Component

A new utility function will be created to handle subagent directory operations:

```typescript
// src/tools/subagentDirectory.ts
export async function ensureSubagentDirectory(subagentName: string): Promise<string>
export async function validateGeminiPromptFile(subagentDir: string): Promise<boolean>
```

This component will:
- Create subagent directories if they don't exist
- Validate that GEMINI.md files exist in subagent directories
- Handle directory creation errors gracefully
- Log warnings for missing GEMINI.md files

### Gemini CLI Integration

The Gemini CLI integration will be designed to:
- Execute from within the subagent's dedicated directory
- Automatically read the GEMINI.md file from the current working directory
- Support the existing bi-directional communication tools
- Maintain compatibility with the current logging and status management system

The Gemini CLI will be spawned with the subagent directory as the working directory, ensuring it automatically loads the GEMINI.md system prompt file.

## Data Models

### Updated SUBAGENTS Configuration

```typescript
export const SUBAGENTS: Record<string, SubagentConfig> = {
  "code-assistant": {
    name: "code-assistant",
    command: "gemini",
    getArgs: () => ["chat", "--interactive"],
    description: "A general-purpose coding assistant powered by Gemini. Excels at code generation, debugging, refactoring, and explaining complex programming concepts. Ideal for general development tasks, code reviews, and technical problem-solving.",
    subagentDirectory: "subagents/code-assistant",
    specialization: "General coding and development tasks"
  },
  "test-specialist": {
    name: "test-specialist", 
    command: "gemini",
    getArgs: () => ["chat", "--interactive"],
    description: "A testing specialist powered by Gemini. Focuses on writing comprehensive test suites, test-driven development, mocking strategies, and testing best practices. Perfect for creating unit tests, integration tests, and test automation.",
    subagentDirectory: "subagents/test-specialist",
    specialization: "Testing and test automation"
  },
  "documentation-writer": {
    name: "documentation-writer",
    command: "gemini",
    getArgs: () => ["chat", "--interactive"],
    description: "A documentation specialist powered by Gemini. Specializes in creating clear, comprehensive documentation, API docs, README files, and technical writing. Excellent for improving code documentation and creating user guides.",
    subagentDirectory: "subagents/documentation-writer",
    specialization: "Documentation and technical writing"
  }
};
```

### Subagent Directory Structure

Each subagent will have its own directory with a GEMINI.md file:
- `subagents/code-assistant/GEMINI.md` - General coding assistant prompt
- `subagents/test-specialist/GEMINI.md` - Testing specialist prompt  
- `subagents/documentation-writer/GEMINI.md` - Documentation writer prompt

Each GEMINI.md file will contain specialized instructions for the Gemini model to behave as the specific type of assistant. The Gemini CLI will automatically read this file when executed from within the subagent's directory.

## Error Handling

### Directory and File Management Errors

1. **Directory Creation Failures**: Log error and attempt to create in fallback locations
2. **Missing GEMINI.md Files**: Log warning and continue with default Gemini behavior
3. **Directory Permission Errors**: Provide clear error messages about directory access

### Gemini CLI Errors

1. **Command Not Found**: Provide clear error message about Gemini CLI installation
2. **Invalid Arguments**: Validate system prompt content before passing to CLI
3. **Process Spawn Failures**: Use existing error handling in `src/tools/run.ts`

### Backward Compatibility

1. **Existing Configurations**: Remove non-Gemini configurations cleanly
2. **Working Directory Changes**: Update process spawning to use subagent directories
3. **API Compatibility**: Maintain existing MCP tool interfaces

## Testing Strategy

### Unit Tests

1. **Directory Management**:
   - Test subagent directory creation
   - Test GEMINI.md file validation
   - Test directory permission handling
   - Test fallback directory creation

2. **Subagent Configuration**:
   - Test Gemini CLI argument generation
   - Test configuration validation
   - Test specialization descriptions
   - Test working directory setup

3. **Integration Tests**:
   - Test complete subagent execution from subagent directories
   - Test fallback behavior when GEMINI.md files are missing
   - Test bi-directional communication with Gemini CLI

### Test Data

Create test subagent directories:
- `test-subagents/test-assistant/GEMINI.md` - Simple test prompt
- `test-subagents/empty-assistant/` - Directory without GEMINI.md
- Missing directories for error testing

### Existing Test Compatibility

Ensure all existing tests in `src/*.spec.ts` continue to pass by:
- Updating test configurations to use Gemini CLI
- Mocking Gemini CLI responses appropriately
- Maintaining existing test patterns and assertions

## Implementation Considerations

### Gemini CLI Working Directory Approach

The Gemini CLI will be executed from within each subagent's directory, allowing it to automatically discover and load the GEMINI.md file:

```bash
# Execute from subagent directory
cd subagents/code-assistant
gemini chat --interactive

# The Gemini CLI will automatically read GEMINI.md from the current directory
```

### Performance Considerations

1. **Directory Validation**: Cache directory existence checks to avoid repeated filesystem operations
2. **File Watching**: Consider watching GEMINI.md files for changes during development
3. **Lazy Directory Creation**: Create subagent directories only when subagents are first executed

### Security Considerations

1. **Path Validation**: Validate subagent directory paths to prevent directory traversal
2. **Directory Permissions**: Ensure appropriate permissions for subagent directories
3. **Working Directory Isolation**: Each subagent runs in its own isolated directory

## Migration Strategy

### Phase 1: Interface Extension
- Extend `SubagentConfig` interface with new fields
- Update schema validation in `src/tools/schemas.ts`
- Maintain backward compatibility

### Phase 2: Directory Management Implementation
- Implement subagent directory management utility
- Update subagent execution to use dedicated directories
- Add error handling and logging for directory operations

### Phase 3: Configuration Migration
- Replace existing subagent configurations with Gemini-based ones
- Create example subagent directories with GEMINI.md files
- Update documentation and examples

### Phase 4: Testing and Validation
- Update all test suites
- Validate bi-directional communication works with Gemini CLI
- Performance testing and optimization