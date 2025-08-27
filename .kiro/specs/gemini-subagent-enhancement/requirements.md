# Requirements Document

## Introduction

This feature enhances the MCP Subagent Server to focus exclusively on Gemini-based subagents while adding support for custom system prompts and improved agent selection through enhanced descriptions. The enhancement will streamline the subagent architecture by removing non-Gemini agents and providing a more flexible configuration system that allows each subagent to have its own GEMINI.md system prompt file and detailed descriptions to help the main coding agent make better delegation decisions.

## Requirements

### Requirement 1

**User Story:** As a developer using the MCP Subagent Server, I want to use only Gemini CLI-based subagents so that I have a consistent LLM backend across all my subagents.

#### Acceptance Criteria

1. WHEN the system starts THEN it SHALL only expose Gemini CLI-based subagents
2. WHEN listing available tools THEN the system SHALL NOT include any non-Gemini subagent tools (like Amazon Q or Claude CLI)
3. WHEN the SUBAGENTS configuration is loaded THEN it SHALL only contain subagent configurations that use the Gemini CLI command
4. WHEN a subagent is executed THEN it SHALL use the `gemini` CLI command as the underlying process

### Requirement 2

**User Story:** As a subagent developer, I want each subagent to have its own GEMINI.md system prompt file so that I can customize the behavior and expertise of each subagent independently.

#### Acceptance Criteria

1. WHEN a subagent is configured THEN it SHALL support an optional systemPromptFile property pointing to a GEMINI.md file
2. WHEN a subagent with a systemPromptFile is executed THEN the system SHALL read the contents of the specified GEMINI.md file
3. WHEN the system prompt content is available THEN it SHALL be passed to the Gemini CLI as part of the command arguments or input
4. IF a systemPromptFile is specified but the file does not exist THEN the system SHALL log a warning and continue without the custom prompt
5. WHEN no systemPromptFile is specified THEN the subagent SHALL run with default Gemini CLI behavior

### Requirement 3

**User Story:** As a main coding agent, I want detailed descriptions for each subagent so that I can make better decisions about which subagent to delegate tasks to based on their specific capabilities and expertise.

#### Acceptance Criteria

1. WHEN subagents are configured THEN each SHALL have an enhanced description that clearly explains its purpose, capabilities, and ideal use cases
2. WHEN the main agent requests available tools THEN the system SHALL return descriptions that help identify the most appropriate subagent for specific tasks
3. WHEN multiple subagents are available THEN their descriptions SHALL clearly differentiate their specializations and strengths
4. WHEN a subagent description is displayed THEN it SHALL include information about the types of tasks it excels at

### Requirement 4

**User Story:** As a system administrator, I want the subagent configuration to be easily extensible so that I can add new Gemini-based subagents with custom prompts and descriptions without modifying core system code.

#### Acceptance Criteria

1. WHEN adding a new subagent THEN it SHALL only require updating the SUBAGENTS configuration object
2. WHEN a new subagent is added with a systemPromptFile THEN the system SHALL automatically handle loading and using the custom prompt with the Gemini CLI
3. WHEN the SubagentConfig interface is extended THEN it SHALL maintain backward compatibility with existing configurations
4. WHEN subagents are configured THEN the system SHALL validate that all required properties are present and properly formatted