---
date: 2025-09-08T13:05:11+00:00
researcher: Claude Code
git_commit: d2ae5b9
branch: feature/gemini-subagents-with-prompts
repository: mcp-server-subagent
topic: "Sub-agent Response Issues and Async Delivery Alternatives"
tags: [research, codebase, subagent, communication, performance, async, context-pollution, result-extraction]
status: complete
last_updated: 2025-09-08
last_updated_by: Claude Code
last_updated_note: "Added critical context pollution analysis and structured result extraction architecture"
---

# Research: Sub-agent Response Issues and Async Delivery Alternatives

**Date**: 2025-09-08T13:05:11+00:00
**Researcher**: Claude Code
**Git Commit**: d2ae5b9
**Branch**: feature/gemini-subagents-with-prompts
**Repository**: mcp-server-subagent

## Research Question
Why are sub-agent summaries null despite successful completion, and what are better alternatives to the current polling-based result retrieval system? Additionally, how can we prevent context pollution when the summary field contains raw debugging logs instead of clean, structured results?

## Summary
The research reveals a critical race condition where sub-agent summaries are nullified by process completion handlers that fire before MCP tool calls complete. More importantly, when summaries do exist, they contain raw debugging logs (timestamps, commands, file paths) instead of clean, structured results - completely defeating the purpose of sub-agents for context isolation. The current polling mechanism creates additional inefficiencies through repeated file I/O operations and forced 30-60 second delays. A multi-strategy structured result extraction architecture is needed to deliver clean, actionable results while maintaining async delivery capabilities.

## Detailed Findings

### Root Cause of Null Summaries

#### Critical Race Condition in Process Completion
- Sub-agents call `update_subagent_status` to set summaries via MCP tool (`src/tools/status.ts:79`)
- Process completion handler fires concurrently when sub-agent exits (`src/tools/run.ts:175`)  
- **Race condition**: Process `close` event can occur before MCP call completes
- Completion handler overwrites summary based on exit code, ignoring sub-agent's manual updates

#### Logic Flaw for Successful Processes (`src/tools/run.ts:192-220`)
- Summary population only occurs for failed processes (`code !== 0`)
- Successful processes rely entirely on `currentMetadata.summary` being set by sub-agent
- No fallback or preservation logic when race condition occurs
- Test evidence shows this mirrors real-world null summary behavior

#### File-Based IPC Coordination Gap
- Sub-agent MCP calls and process lifecycle events are not synchronized
- No atomic update mechanism for metadata files
- File-based communication lacks coordination primitives

### Polling Mechanism Inefficiencies

#### Performance Pain Points
- **File I/O per Poll**: Each status check requires disk read of JSON metadata (`src/tools/status.ts:15`)
- **No Caching**: Identical requests repeatedly parse same JSON files
- **Large Payloads**: Status responses include extensive formatting and guidance text
- **Forced Delays**: System explicitly recommends 30-60 second intervals to avoid overwhelming

#### Scalability Issues
- **Linear Growth**: Each concurrent sub-agent adds more files to poll
- **No Batch Operations**: Cannot check multiple sub-agent statuses efficiently
- **Resource Contention**: Multiple agents polling creates filesystem bottlenecks
- **Pull-Only Model**: No push notifications when sub-agents complete

#### User Experience Impact
- **Sluggish Response**: Forced delays create poor user experiences
- **Uncertainty**: No indication when sub-agents will complete
- **Manual Rate Limiting**: Relies on client cooperation to avoid system strain

### Alternative Async Patterns Analysis

#### Existing Communication Architecture
The codebase provides several patterns that could be leveraged:

**Bi-directional Communication System** (`src/tools/askParent.ts`, `src/tools/replySubagent.ts`)
- Message state machine: `pending_parent_reply` → `parent_replied` → `acknowledged_by_subagent`
- File-based message queue with unique UUID identifiers
- Polling pattern with state synchronization

**File-Based State Management** (`src/tools/status.ts`)
- JSON metadata persistence with atomic updates
- Process lifecycle tracking through status transitions
- Error recovery and graceful degradation

**MCP Protocol Integration** (`src/index.ts`)
- Request-response pattern through StdioServerTransport
- Tool registration and validation infrastructure
- Structured JSON responses with content validation

#### Extension Opportunities
1. **Result Notification Tool**: Extend message schema to support result delivery
2. **File System Watchers**: Monitor metadata changes to reduce polling
3. **Callback Mechanisms**: Implement completion notifications through MCP tools
4. **Event-Driven Architecture**: Use existing status transitions for push notifications

### Critical Context Pollution Issue

#### Summary Content Contamination (`src/tools/run.ts:194-203`)
The most severe architectural flaw is that raw debugging logs automatically become summaries for failed sub-agent executions:

- **Log Tail Injection**: Last 50 lines of raw logs become the "summary" when sub-agents fail without explicit summary
- **Context Violation**: Parents receive debugging noise instead of clean, actionable results
- **Information Leakage**: Summaries expose internal paths, command arguments, timestamps, stderr output

#### What Gets Polluted
Log content that ends up as "summaries" includes:
```
[2024-01-01T12:00:00Z] Starting test-agent with input: analyze codebase
[2024-01-01T12:00:00Z] Working directory: /path/to/.gemini/subagents/test-agent  
[2024-01-01T12:00:00Z] Command: gemini --yolo --model gemini-1.5-pro --include-directories
[2024-01-01T12:00:00Z] [stdout] Analyzing codebase structure...
[2024-01-01T12:00:00Z] [stderr] Warning: Large directory detected
[2024-01-01T12:00:00Z] Process exited with code 1
```

#### Architectural Impact
- **Design Intent Violated**: Sub-agents should provide clean, distilled results for context isolation
- **Signal-to-Noise Destruction**: 50 lines of debugging noise vs clean structured findings
- **Parent Context Pollution**: Main agents receive technical details not intended for consumption

### Structured Result Extraction Architecture

#### Current Result Instructions (`src/tools/run.ts:77-92`)
Sub-agents receive minimal formatting guidance:
- Must use `update_subagent_status` tool to report final results
- Instructed to "be concise but comprehensive" 
- No specific result formatting requirements or markers

#### Proposed Multi-Strategy Solution

**Strategy 1: Enhanced Prompt + Pattern Extraction**
- Modify prompt template to require specific result markers:
  ```
  ## FINAL RESULTS
  [Your structured findings/conclusions here]
  ## END RESULTS
  ```
- Parse log content to extract only sections between markers
- Fallback gracefully to manual summary if no markers found

**Strategy 2: Dual-Field Metadata Structure**  
- Add `results` field to metadata schema alongside `summary` (`src/tools/schemas.ts:36-40`)
- Update sub-agent instructions to use new `results` parameter in `update_subagent_status`
- Keep `summary` for full context, use `results` for clean parent consumption

**Strategy 3: Smart Log Parsing**
- Identify common patterns in sub-agent output (## Summary, ## Findings, Final Analysis:)
- Extract structured sections using regex patterns that match formatting conventions
- Clean up timestamps and execution noise from extracted content

#### Implementation Points
- **Enhanced Status Schema**: Add `results` field with structured output validation
- **Result Extraction Utility**: Parse logs for structured sections before fallback to log tail
- **Backwards Compatibility**: Existing `summary` field preserved, new `results` field optional

### Prompt File Analysis

#### Unnecessary Resource Usage  
- Prompt files (`.prompt.md`) are created but never consumed (`src/tools/run.ts:70-95`)
- Actual prompt content passed via `--prompt` CLI argument, not file
- Files accumulate in logs directory with no cleanup on success
- Adds disk I/O overhead and storage waste to every sub-agent execution

#### Removal Impact
- **No Functional Dependencies**: No code paths read prompt files after creation
- **Redundant Information**: Command logging already captures prompt content
- **Performance Benefit**: Eliminating file creation would reduce I/O overhead
- **Storage Benefit**: Fewer files in logs directory

## Code References
- `src/tools/run.ts:175-226` - Process completion handler with race condition
- `src/tools/run.ts:192` - Summary preservation logic flaw for successful processes
- `src/tools/run.ts:194-203` - Critical context pollution via log tail injection
- `src/tools/status.ts:79` - Sub-agent summary setting mechanism
- `src/tools/status.ts:15` - Polling file read operation  
- `src/index.ts:117` - Polling interval recommendations
- `src/tools/schemas.ts:36-40` - Status update schema requiring enhancement for results field
- `src/tools/run.ts:70-95` - Unnecessary prompt file creation
- `src/tools/run.ts:77-92` - Current minimal result formatting instructions

## Architecture Insights

### Current System Patterns
- **Async Process Model**: Immediate runId return with separate completion tracking
- **File-Based IPC**: JSON metadata files as persistence and communication layer  
- **State Machine Design**: Status transitions with validation and error handling
- **Modular Tool Architecture**: Separate files for each MCP tool with shared schemas

### Design Constraints Identified
- **MCP Protocol Limitations**: StdioServerTransport doesn't support WebSocket/HTTP callbacks
- **File System Dependency**: All state management relies on disk-based JSON files
- **Schema Inconsistencies**: Different status enums between update and metadata schemas
- **Timing Dependencies**: Race conditions between async operations and process lifecycle

## Historical Context (from thoughts/)
- `thoughts/boryan/tickets/investigate_subagent_reponse.md` - Original issue report identifying null summaries and polling inefficiency
- `thoughts/shared/research/2025-09-06_12-32-36_subagent_spawning_refactor.md` - Previous architectural analysis of MCP server design
- `thoughts/shared/plans/subagent_spawning_refactor.md` - Existing refactoring plans for project-specific execution

## Related Research
- `thoughts/shared/research/2025-09-06_12-32-36_subagent_spawning_refactor.md` - MCP server architecture analysis

## Follow-up Research 2025-09-08T13:15:00+00:00

### Enhanced Analysis: Context Pollution and Structured Result Extraction

The initial research focused on null summaries and polling inefficiencies. Additional analysis reveals the more critical issue of **context pollution** where raw debugging logs contaminate parent agent context, completely defeating the purpose of sub-agent isolation.

### Resolved Open Questions

1. **Coordination Strategy**: Use **result markers + timeout mechanism**
   - Sub-agents must complete with structured markers before process exit
   - Add coordination timeout (2-3 seconds) before process completion overwrites
   - Implement proper synchronization between MCP calls and process lifecycle

2. **Notification Timing**: **Immediate async delivery** on clean result extraction  
   - Send notification when structured results are extracted/parsed
   - Don't wait for status polling - push results to parent immediately
   - Use existing bi-directional message system for result delivery

3. **Backwards Compatibility**: **Graceful degradation**
   - New `results` field alongside existing `summary` 
   - Parents can check for structured results first, fall back to summary
   - Existing polling still works, but enhanced with clean results

4. **Error Recovery**: **Multi-layer fallback**
   - Primary: Structured result markers in output
   - Secondary: Manual `update_subagent_status` with results field  
   - Tertiary: Smart parsing of common patterns (## Summary, etc.)
   - Final: Current behavior (but extract clean portions, not raw logs)

5. **Resource Management**: **Hybrid approach**
   - File watchers for immediate result delivery (low overhead)
   - Polling as fallback for compatibility
   - Clean up prompt files entirely
   - Cache parsed results to avoid repeated parsing

### New Critical Questions

6. **Result Format Standardization**: Should sub-agents use a standardized JSON schema for results, or allow markdown with specific markers?

7. **Context Length Management**: How should large sub-agent results be truncated or summarized to prevent parent context overflow?

8. **Multi-Result Scenarios**: Should sub-agents be able to deliver multiple intermediate results during execution, or only final results?