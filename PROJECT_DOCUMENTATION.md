# MCP Subagent Server - Complete Project Documentation

## Overview

The **MCP Subagent Server** is a Model Context Protocol (MCP) server that enables a "planning" agent to delegate tasks to CLI-based "executor" sub-agents. It provides a sophisticated task delegation system with bi-directional communication, real-time logging, and comprehensive status tracking.

**Key Features:**
- Task delegation to CLI-based sub-agents (Amazon Q, Claude CLI)
- Bi-directional communication between parent and sub-agents
- Real-time streaming logs and status monitoring
- Comprehensive error handling and status management
- Modular TypeScript architecture with full test coverage

## Project Structure

### Root Directory Files

#### Configuration Files
- **`package.json`** - Project metadata, dependencies, and npm scripts
  - Main entry point: `./build/index.js`
  - Key dependencies: `@modelcontextprotocol/sdk`, `uuid`, `zod`
  - Scripts: `build`, `start`, `dev`, `test`
  - License: AGPL-3.0-only

- **`tsconfig.json`** - TypeScript compiler configuration
  - Target: ES2022, Module: Node16
  - Output directory: `./build`
  - Strict mode enabled

- **`vitest.config.ts`** - Vitest testing framework configuration
  - Global test functions enabled
  - Node.js environment for testing

- **`.gitignore`** - Git ignore patterns for dependencies, build output, logs, and environment files

- **`.npmignore`** - NPM publish ignore patterns (excludes source, only includes build)

#### Documentation Files
- **`README.md`** - User-facing documentation with installation and usage instructions
- **`LICENSE`** - GNU Affero General Public License v3.0
- **`CLAUDE.md`** - Technical handover document for developers
- **`DESIGN_BI_DIRECTIONAL_COMMUNICATION.md`** - Design specification for the communication system
- **`claude_desktop_config.json.example`** - Example MCP configuration for Claude Desktop

#### Media
- **`screenshot.png`** - Visual demonstration of the project functionality

### Source Code Structure (`src/`)

#### Main Entry Point
- **`src/index.ts`** - Primary server implementation
  - MCP server setup and configuration
  - Tool registration and request handling
  - Sub-agent configuration definitions
  - Log directory management with fallback paths
  - Error handling and validation

#### Tools Module (`src/tools/`)
The project uses a modular architecture with specialized tool handlers:

- **`src/tools/schemas.ts`** - Zod schemas and TypeScript interfaces
  - `SubagentConfig` interface for sub-agent definitions
  - `MetaFileContent` schema for run metadata
  - `CommunicationMessage` schema for bi-directional messaging
  - Input/output validation schemas for all tools

- **`src/tools/run.ts`** - Sub-agent execution logic
  - Process spawning and management
  - Real-time log streaming
  - Working directory handling
  - Process lifecycle management

- **`src/tools/status.ts`** - Status checking and updating
  - Metadata file reading/writing
  - Status transitions and validation
  - Summary management
  - Error state handling

- **`src/tools/logs.ts`** - Log file management
  - Log file reading and formatting
  - Error handling for missing logs
  - File system operations

#### Bi-directional Communication Tools
- **`src/tools/askParent.ts`** - Sub-agent question handling
  - Message creation with unique IDs
  - Status updates to "waiting_parent_reply"
  - Metadata persistence

- **`src/tools/replySubagent.ts`** - Parent response handling
  - Message lookup and validation
  - Answer recording with timestamps
  - Status transitions to "parent_replied"

- **`src/tools/checkMessage.ts`** - Message status checking
  - Reply retrieval for sub-agents
  - Automatic message acknowledgment
  - Status transitions back to "running"

#### Test Files
- **`src/test.spec.ts`** - Core functionality tests
  - Sub-agent execution testing
  - Status management validation
  - Error handling verification
  - Log retrieval testing

- **`src/communication.spec.ts`** - Bi-directional communication tests
  - Complete ask→reply→check workflow testing
  - Message state transition validation
  - Edge case handling
  - Output format validation

- **`src/mcp-handler.spec.ts`** - MCP tool handler output formatting tests
  - Status output formatting validation
  - Communication message display testing
  - Edge case handling for missing data

- **`src/mcp-output-format.spec.ts`** - MCP output format validation
- **`src/status-integration.spec.ts`** - Status integration testing

### Build Output (`build/`)
Contains compiled JavaScript files from TypeScript source code. This directory is created during the build process and contains the executable server code.

### Logs Directory (`logs/`)
Runtime-generated directory containing:
- `<run-id>.log` - Real-time execution logs
- `<run-id>.prompt.md` - Input prompts sent to sub-agents
- `<run-id>.meta.json` - Run metadata including status, timing, and communication messages

## Core Functionality

### Sub-agent Management

The server supports multiple sub-agent types defined in the `SUBAGENTS` configuration:

#### Amazon Q Sub-agent (`q`)
- **Command:** `q chat --trust-all-tools --no-interactive`
- **Purpose:** Execute queries through Amazon Q CLI
- **Use Case:** AI-powered development assistance

#### Claude Sub-agent (`claude`)
- **Command:** `claude --print --verbose --output-format stream-json --allowedTools <tools> --mcp-config <config>`
- **Purpose:** Execute queries through Claude CLI
- **Use Case:** AI-powered code generation and analysis
- **Special Features:** Includes MCP configuration for recursive sub-agent calls

### MCP Tools Exposed

#### Execution Tools
1. **`run_subagent_<name>`** - Start a sub-agent execution
   - Parameters: `input` (string), `cwd` (string)
   - Returns: Run ID for status tracking
   - Creates asynchronous sub-task with independent execution

2. **`check_subagent_status`** - Monitor sub-agent execution
   - Parameters: `runId` (string)
   - Returns: Comprehensive status including timing, exit codes, and communication state
   - Includes formatted output for pending questions and recent interactions

3. **`get_subagent_logs`** - Retrieve execution logs
   - Parameters: `runId` (string)
   - Returns: Complete log output from sub-agent execution
   - Warning: Can be very long, use judiciously

4. **`update_subagent_status`** - Update execution status (for sub-agents)
   - Parameters: `runId` (string), `status` (enum), `summary` (optional string)
   - Returns: Updated status metadata
   - Used by sub-agents to report completion or progress

#### Bi-directional Communication Tools
5. **`ask_parent`** - Sub-agent question submission
   - Parameters: `runId` (string), `question` (string)
   - Returns: Message ID and polling instructions
   - Changes status to "waiting_parent_reply"

6. **`reply_subagent`** - Parent response to sub-agent questions
   - Parameters: `runId` (string), `messageId` (string), `answer` (string)
   - Returns: Confirmation of reply recording
   - Changes status to "parent_replied"

7. **`check_message_status`** - Message status and reply retrieval
   - Parameters: `runId` (string), `messageId` (string)
   - Returns: Message details and answer if available
   - Automatically acknowledges received answers

### Status Management System

The system tracks detailed execution states:

#### Primary Statuses
- **`running`** - Sub-agent is actively executing
- **`success`** - Execution completed successfully (exit code 0)
- **`error`** - Execution failed (non-zero exit code)
- **`completed`** - Manually marked as completed
- **`waiting_parent_reply`** - Sub-agent waiting for parent response
- **`parent_replied`** - Parent has responded, sub-agent can retrieve answer

#### Message States
- **`pending_parent_reply`** - Question submitted, awaiting parent response
- **`parent_replied`** - Parent has provided an answer
- **`acknowledged_by_subagent`** - Sub-agent has retrieved the answer

### Logging System

#### Log Directory Management
The system uses a fallback approach for log directory creation:
1. `~/.config/mcp-server-subagent/logs` (preferred)
2. `./logs` (current working directory)
3. `<temp>/mcp-server-subagent/logs` (system temp directory)

#### Log Files Per Execution
- **`.log`** - Real-time stdout/stderr capture
- **`.prompt.md`** - Original input prompt
- **`.meta.json`** - Structured metadata with timing, status, and messages

### Error Handling

#### Process-Level Errors
- Non-zero exit codes automatically set status to "error"
- Last 50 lines of logs captured in error summary
- Process spawn failures handled gracefully

#### Validation Errors
- Zod schema validation for all inputs/outputs
- Detailed error messages for invalid parameters
- Graceful handling of missing files or invalid run IDs

#### Communication Errors
- Invalid message IDs handled with descriptive errors
- State validation prevents invalid transitions
- Automatic cleanup of orphaned messages

## Development Workflow

### Building and Running
```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Run the server
npm start

# Development mode with auto-rebuild
npm run dev
```

### Testing
```bash
# Run all tests
npm test

# Tests must pass before any development task is considered complete
```

### Adding New Sub-agents
Modify the `SUBAGENTS` object in `src/index.ts`:

```typescript
const SUBAGENTS = {
  // ... existing agents
  newagent: {
    name: "newagent",
    command: "your-command",
    getArgs: () => ["--flag1", "--flag2"],
    description: "Description of your new agent",
  },
};
```

## Installation and Usage

### NPM Installation
```bash
# Global installation
npm install -g mcp-server-subagent

# Or use directly with npx
npx -y mcp-server-subagent
```

### MCP Configuration

#### For Amazon Q
Add to `~/.aws/amazonq/mcp.json`:
```json
{
  "mcpServers": {
    "subagent": {
      "command": "npx",
      "args": ["-y", "mcp-server-subagent"]
    }
  }
}
```

#### For Claude Desktop
Add to configuration file:
```json
{
  "mcpServers": {
    "subagent": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcp-server-subagent/build/index.js"]
    }
  }
}
```

## Communication Workflow Example

### Complete Interaction Cycle

1. **Sub-agent asks question:**
   ```json
   {
     "tool": "ask_parent",
     "arguments": {
       "runId": "abc-123-def",
       "question": "Should I modify config.json or settings.yaml?"
     }
   }
   ```

2. **Parent checks status and sees question:**
   ```
   Status: waiting_parent_reply
   Question awaiting reply (Message ID: msg-456-789):
     Should I modify config.json or settings.yaml?
     (Asked at: 2025-01-15T10:30:00.000Z)
     To reply, use the 'reply_subagent' tool.
   ```

3. **Parent provides answer:**
   ```json
   {
     "tool": "reply_subagent",
     "arguments": {
       "runId": "abc-123-def",
       "messageId": "msg-456-789",
       "answer": "Please modify config.json - it's the main configuration file."
     }
   }
   ```

4. **Sub-agent retrieves answer:**
   ```json
   {
     "tool": "check_message_status",
     "arguments": {
       "runId": "abc-123-def",
       "messageId": "msg-456-789"
     }
   }
   ```

### Best Practices
- Use `sleep 30` between status checks to avoid overwhelming the system
- Ask specific, actionable questions that help guide task execution
- Parents should monitor sub-agent status regularly for timely guidance
- Messages are automatically acknowledged when answers are retrieved

## Technical Architecture

### Dependencies
- **`@modelcontextprotocol/sdk`** - MCP protocol implementation
- **`uuid`** - Unique identifier generation
- **`zod`** - Runtime type validation and schema definition

### Development Dependencies
- **`typescript`** - TypeScript compiler
- **`vitest`** - Testing framework
- **`@types/*`** - Type definitions
- **`fs-extra`** - Enhanced file system operations

### Module System
- ES Modules throughout
- Node.js 16+ module resolution
- Strict TypeScript configuration

### Testing Strategy
- Comprehensive unit tests for all functionality
- Integration tests for complete workflows
- Mock sub-agents for testing without external dependencies
- Output format validation for MCP compliance

## License and Contributing

- **License:** GNU Affero General Public License v3.0 (AGPL-3.0-only)
- **Repository:** https://github.com/dvcrn/mcp-server-subagent
- **Author:** David Mohl <git@d.sh>

The AGPL license ensures that any network-based usage of this software requires making the source code available to users, promoting open-source collaboration in the AI agent ecosystem.

## Future Enhancements

- Support for additional sub-agent types
- Enhanced error recovery mechanisms
- Performance monitoring and metrics
- Advanced message routing and filtering
- Integration with more AI development tools

This documentation provides a complete overview of the MCP Subagent Server project, covering its architecture, functionality, and usage patterns for both users and developers.