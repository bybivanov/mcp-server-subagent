# Structured Result Delivery Implementation Plan

## Overview

This plan addresses critical issues in the MCP Subagent Server where sub-agents return null summaries or raw debugging logs instead of clean, structured results. We will implement a comprehensive structured result delivery system that eliminates context pollution, resolves race conditions, and provides efficient async result delivery.

## Current State Analysis

### Critical Issues Identified:
- **Race Condition**: Process completion handlers overwrite sub-agent summaries (`src/tools/run.ts:175-226`)
- **Context Pollution**: Raw debugging logs (50 lines) become summaries instead of structured results (`src/tools/run.ts:194-203`)  
- **Polling Inefficiencies**: Forced 30-60 second delays with file I/O overhead on each status check
- **Missing Result Extraction**: Sub-agents provide structured findings but system captures execution noise

### Key Discoveries:
- Current system has robust MCP tool architecture with Zod validation (`src/tools/schemas.ts`)
- Bi-directional communication infrastructure already exists for async messaging (`src/tools/askParent.ts`, `src/tools/replySubagent.ts`)
- File-based metadata system supports extension through optional schema fields (`MetaFileContentSchema`)
- Comprehensive test patterns established for mocking, file operations, and race conditions

## Desired End State

### Primary Goals:
1. **Clean Result Delivery**: Sub-agents return structured, actionable results instead of raw logs
2. **Eliminated Race Conditions**: Proper coordination between MCP calls and process completion
3. **Async Result Notifications**: Push-based delivery eliminating polling delays
4. **Context Isolation**: Parent agents receive clean results without debugging noise

### Verification Criteria:
- Sub-agent summaries are never null on successful completion
- Parent agents receive structured JSON results, not raw logs
- Result delivery occurs within 2-3 seconds of sub-agent completion
- Existing polling clients continue to work (backwards compatibility)
- All tests pass including new race condition and result extraction tests

## What We're NOT Doing

- Breaking existing MCP tool compatibility
- Implementing WebSocket or HTTP servers (constrained by StdioServerTransport)
- Changing core sub-agent execution model (still child processes)
- Modifying existing log file structure (maintaining debugging capability)
- Removing bi-directional communication (ask_parent/reply_subagent stays)

## Implementation Approach

**Multi-Strategy Result Extraction**: Implement layered fallback system with structured markers, smart parsing, and enhanced metadata. Use existing bi-directional communication for async delivery while maintaining polling compatibility.

## Phase 1: Result Extraction Infrastructure

### Overview
Implement core result parsing and storage without breaking existing functionality. Focus on eliminating context pollution and establishing structured result formats.

### Changes Required:

#### 1. Enhanced Schema Definition
**File**: `src/tools/schemas.ts`
**Changes**: Add structured result fields to metadata and status update schemas

```typescript
// Add to MetaFileContentSchema (line 59-82)
structuredResults: z.object({
  success: z.boolean(),
  summary: z.string(),
  details: z.string().optional(),
  artifacts: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  limitations: z.array(z.string()).optional()
}).optional(),

// Add to UpdateSubagentStatusArgumentsSchema (line 36-40)  
structuredResults: z.object({
  success: z.boolean(),
  summary: z.string(),
  details: z.string().optional(),
  artifacts: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  limitations: z.array(z.string()).optional()
}).optional(),
```

#### 2. Result Extraction Utility
**File**: `src/tools/resultExtraction.ts` (new)
**Changes**: Create comprehensive result parsing functions

```typescript
export interface StructuredResult {
  success: boolean;
  summary: string;
  details?: string;
  artifacts?: string[];
  metadata?: Record<string, any>;
  confidence?: number;
  limitations?: string[];
}

export async function extractStructuredResults(
  logContent: string,
  runId: string
): Promise<StructuredResult | null> {
  // Strategy 1: Parse result markers
  const markerResult = parseResultMarkers(logContent);
  if (markerResult) return markerResult;
  
  // Strategy 2: Parse common patterns
  const patternResult = parseCommonPatterns(logContent);
  if (patternResult) return patternResult;
  
  // Strategy 3: Smart extraction from conversation
  return parseConversationResults(logContent, runId);
}

function parseResultMarkers(content: string): StructuredResult | null {
  const markerRegex = /=== RESULT START ===\s*([\s\S]*?)\s*=== RESULT END ===/;
  const match = content.match(markerRegex);
  
  if (!match) return null;
  
  try {
    const parsed = JSON.parse(match[1]);
    return validateStructuredResult(parsed);
  } catch (error) {
    console.warn('Failed to parse marker results:', error);
    return null;
  }
}

function parseCommonPatterns(content: string): StructuredResult | null {
  // Look for ## Summary, ## Results, ## Findings patterns
  const patterns = [
    /## Results?\s*\n(.*?)(?=\n##|\n\[|\Z)/s,
    /## Summary\s*\n(.*?)(?=\n##|\n\[|\Z)/s,  
    /## Findings?\s*\n(.*?)(?=\n##|\n\[|\Z)/s,
    /Final result[s]?:\s*(.*?)(?=\n\[|\Z)/s
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return {
        success: true,
        summary: match[1].trim(),
        details: match[1].trim()
      };
    }
  }
  
  return null;
}

function parseConversationResults(content: string, runId: string): StructuredResult | null {
  // Extract last meaningful response from conversation
  const lines = content.split('\n')
    .filter(line => !line.match(/^\[[\d-T:.]+Z\]/)) // Remove timestamps
    .filter(line => line.trim().length > 0);
    
  if (lines.length === 0) return null;
  
  const lastMeaningfulContent = lines.slice(-10).join('\n');
  
  return {
    success: true,
    summary: lastMeaningfulContent.substring(0, 500), // Limit length
    details: lastMeaningfulContent
  };
}
```

#### 3. Enhanced Prompt Template
**File**: `src/tools/run.ts`  
**Changes**: Add structured result format requirements to prompt (lines 79-91)

```typescript
const resultFormatInstructions = `

IMPORTANT: When you complete your task, provide your final results in this structured format:

=== RESULT START ===
{
  "success": true|false,
  "summary": "Brief description of what was accomplished",
  "details": "Detailed results, files created, actions taken",
  "artifacts": ["file1.txt", "file2.js"],
  "metadata": {"key": "value"},
  "confidence": 0.95,
  "limitations": ["Could not access X", "Y requires manual verification"]
}
=== RESULT END ===

This structured format ensures your results are properly extracted and delivered to the parent agent.

`;

// Insert before "Instructions are the following:" (line 89)
const fullInput = `
This is a sub-task executed by an automated agent.
Your unique run ID for this task is: ${runId}.
You MUST report your final status and results using the MCP tool: ${toolName}.
Ensure all necessary information is included in your update via this tool.

You are able to ask the commander/manager for clarification if something is unclear using the 'ask_parent' tool.

${resultFormatInstructions}

If you are unable to complete the task, please provide a detailed error as summary in the tool call ${toolName} and set the status to 'error'.

Instructions are the following:
---
${input}
`;
```

#### 4. Process Completion Handler Enhancement  
**File**: `src/tools/run.ts`
**Changes**: Integrate result extraction in process completion (lines 175-226)

```typescript
childProcess.on("close", async (code, signal) => {
  // Close log stream first
  await new Promise<void>((resolve) => logStream.end(resolve));
  
  // Extract structured results before metadata finalization
  let extractedResults: StructuredResult | null = null;
  try {
    const logContent = await fs.readFile(logFile, "utf-8");
    extractedResults = await extractStructuredResults(logContent, runId);
  } catch (error) {
    console.error(`Result extraction failed for ${runId}:`, error);
  }

  // Read current metadata (may have been updated by MCP calls)
  let currentMetadata: any = {};
  try {
    const metaRaw = await fs.readFile(metaPath, "utf-8");
    currentMetadata = JSON.parse(metaRaw);
  } catch (err) {
    // Fallback to original metadata if read fails
    currentMetadata = metadata;
  }

  // Determine final status and results
  let finalStatus = currentMetadata.status || "running";
  let finalSummary = currentMetadata.summary;
  let finalResults = currentMetadata.structuredResults || extractedResults;

  // Handle process completion based on exit code
  if (code !== 0) {
    // Process failed
    if (finalStatus !== "success" && finalStatus !== "error") {
      finalStatus = "error";
    }
    
    // Use extracted results even for errors, fallback to log tail only if no results
    if (!finalResults && !finalSummary) {
      const logContent = await fs.readFile(logFile, "utf-8");
      finalSummary = logContent.split("\n").slice(-50).join("\n");
    }
  } else {
    // Process succeeded
    if (finalStatus === "running") {
      finalStatus = "success";
    }
  }

  // Update metadata with final state
  const finalMetadata = {
    ...currentMetadata,
    status: finalStatus,
    endTime: new Date().toISOString(),
    exitCode: code,
    summary: finalSummary,
    structuredResults: finalResults,
    lastUpdated: new Date().toISOString(),
  };

  await fs.writeFile(metaPath, JSON.stringify(finalMetadata, null, 2));
  
  console.log(`Subagent ${runId} completed with status: ${finalStatus}`);
});
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests are passing: `npm test`
- [ ] Build passes: `npm run build`
- [ ] Schema validation works: New fields validate correctly
- [ ] Result extraction tests pass: Structured results parsed from logs

#### Manual Verification:  
- [ ] Sub-agents with structured markers return clean results
- [ ] Sub-agents without markers fallback to smart parsing
- [ ] Race condition eliminated: No more null summaries
- [ ] Context pollution eliminated: No raw logs in summaries

---

## Phase 2: Enhanced Status and Result Delivery

### Overview
Update status update mechanism and response formatting to include structured results, improving parent agent experience.

### Changes Required:

#### 1. Enhanced Status Update Handler
**File**: `src/tools/status.ts`
**Changes**: Support structured results in update mechanism (lines 53-125)

```typescript
export async function updateSubagentStatus(
  runId: string,
  status: string,
  logDir: string,
  summary?: string,
  structuredResults?: StructuredResult
): Promise<any> {
  // ... existing metadata reading logic ...

  const updatedMetadata = {
    ...metadata,
    status,
    summary: summary !== undefined ? summary : metadata.summary,
    structuredResults: structuredResults !== undefined ? structuredResults : metadata.structuredResults,
    lastUpdated: new Date().toISOString(),
    // Handle endTime for terminal statuses
    ...(["success", "error", "completed"].includes(status) && !metadata.endTime
      ? { endTime: new Date().toISOString() }
      : {}),
  };

  // ... existing file writing logic ...
  
  return {
    ...updatedMetadata,
    logFile: logFile,
    logDirectory: logDir,
  };
}
```

#### 2. Enhanced Status Check Response
**File**: `src/index.ts`
**Changes**: Include structured results in status responses (lines 301-401)

```typescript
if (name === "check_subagent_status") {
  const { runId } = CheckSubagentStatusArgumentsSchema.parse(args);
  const statusObject = await checkSubagentStatus(runId, LOG_DIR);

  if (statusObject.status === "not_found") {
    return {
      content: [{ type: "text", text: `Run ${runId} not found.` }],
    };
  }

  const outputParts = [];
  outputParts.push(`Run ID: ${statusObject.runId || "N/A"}`);
  outputParts.push(`Agent Name: ${statusObject.agentName || "N/A"}`);
  outputParts.push(`Status: ${statusObject.status || "N/A"}`);
  outputParts.push(`Exit Code: ${statusObject.exitCode ?? "N/A"}`);
  outputParts.push(`Start Time: ${statusObject.startTime || "N/A"}`);
  outputParts.push(`End Time: ${statusObject.endTime || "N/A"}`);
  
  // Add structured results section
  if (statusObject.structuredResults) {
    outputParts.push(`\n=== STRUCTURED RESULTS ===`);
    outputParts.push(`Success: ${statusObject.structuredResults.success}`);
    outputParts.push(`Summary: ${statusObject.structuredResults.summary}`);
    
    if (statusObject.structuredResults.details) {
      outputParts.push(`Details: ${statusObject.structuredResults.details}`);
    }
    
    if (statusObject.structuredResults.artifacts?.length) {
      outputParts.push(`Artifacts: ${statusObject.structuredResults.artifacts.join(', ')}`);
    }
    
    if (statusObject.structuredResults.confidence !== undefined) {
      outputParts.push(`Confidence: ${(statusObject.structuredResults.confidence * 100).toFixed(1)}%`);
    }
    
    if (statusObject.structuredResults.limitations?.length) {
      outputParts.push(`Limitations: ${statusObject.structuredResults.limitations.join('; ')}`);
    }
  }
  
  // Legacy summary for backwards compatibility
  outputParts.push(`\n=== LEGACY SUMMARY ===`);
  outputParts.push(`Summary: ${statusObject.summary || "N/A"}`);

  // ... rest of bi-directional communication handling ...

  return {
    content: [{ type: "text", text: outputParts.join("\n") }],
  };
}
```

#### 3. New Get Results Tool
**File**: `src/tools/getResults.ts` (new)
**Changes**: Create dedicated tool for clean result retrieval

```typescript
import { z } from "zod";
import { checkSubagentStatus } from "./status.js";

export const GetResultsArgumentsSchema = z.object({
  runId: z.string().uuid("Run ID must be a valid UUID"),
});

export const GetResultsOutputSchema = z.object({
  runId: z.string(),
  status: z.string(),
  structuredResults: z.object({
    success: z.boolean(),
    summary: z.string(),
    details: z.string().optional(),
    artifacts: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional(),
    confidence: z.number().optional(),
    limitations: z.array(z.string()).optional()
  }).optional(),
  completed: z.boolean(),
  timestamp: z.string()
});

export async function getSubagentResults(runId: string, logDir: string) {
  const statusObject = await checkSubagentStatus(runId, logDir);
  
  if (statusObject.status === "not_found") {
    throw new Error(`Run ${runId} not found`);
  }

  const completed = ["success", "error", "completed"].includes(statusObject.status || "");
  
  return {
    runId,
    status: statusObject.status,
    structuredResults: statusObject.structuredResults || null,
    completed,
    timestamp: new Date().toISOString()
  };
}
```

#### 4. MCP Tool Registration
**File**: `src/index.ts`
**Changes**: Register new get_results tool (lines 180-245)

```typescript
tools.push({
  name: "get_subagent_results",
  description: "Get clean, structured results from a completed subagent run. Returns structured data without debugging information.",
  inputSchema: {
    type: "object",
    properties: {
      runId: {
        type: "string",
        description: "Run ID to get results for",
      },
    },
    required: ["runId"],
  },
});

// Add handler in CallToolRequestSchema handler (lines 420-515)
if (name === "get_subagent_results") {
  const { runId } = GetResultsArgumentsSchema.parse(args);
  const result = await getSubagentResults(runId, LOG_DIR);
  GetResultsOutputSchema.parse(result); // Validate output

  return {
    content: [
      {
        type: "text", 
        text: JSON.stringify(result, null, 2)
      }
    ],
  };
}
```

### Success Criteria:

#### Automated Verification:
- [ ] All existing tests pass: `npm test`
- [ ] New get_results tool validates correctly
- [ ] Status responses include structured results
- [ ] Backwards compatibility maintained

#### Manual Verification:
- [ ] Parent agents can retrieve clean structured results
- [ ] Status responses clearly separate structured results from legacy summaries  
- [ ] Tool provides clean JSON output without debugging noise
- [ ] Results include confidence levels and limitations when available

---

## Phase 3: Async Result Notifications

### Overview  
Implement push-based result delivery using existing bi-directional communication infrastructure to eliminate polling delays.

### Changes Required:

#### 1. Result Notification Tool
**File**: `src/tools/resultNotification.ts` (new)
**Changes**: Create async result notification system

```typescript
import { v4 as uuidv4 } from "uuid";
import { CommunicationMessage } from "./schemas.js";

export async function sendResultNotification(
  runId: string,
  logDir: string,
  structuredResults: StructuredResult
): Promise<string> {
  const metaPath = join(logDir, `${runId}.meta.json`);
  
  // Read current metadata
  const metaRaw = await fs.readFile(metaPath, "utf-8");
  const metadata = JSON.parse(metaRaw);
  
  // Create result notification message
  const messageId = uuidv4();
  const resultMessage: CommunicationMessage = {
    messageId,
    questionContent: `RESULT_NOTIFICATION:${JSON.stringify(structuredResults)}`,
    questionTimestamp: new Date().toISOString(),
    messageStatus: "pending_parent_reply"
  };
  
  // Add to messages array
  if (!Array.isArray(metadata.messages)) {
    metadata.messages = [];
  }
  metadata.messages.push(resultMessage);
  
  // Update status to indicate result available
  metadata.status = "results_available";
  
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
  
  return messageId;
}
```

#### 2. Enhanced Process Completion with Notification
**File**: `src/tools/run.ts`
**Changes**: Send async notifications when results are extracted (lines 175-226)

```typescript
// After result extraction and metadata update (in process completion handler)
if (finalResults && finalStatus === "success") {
  try {
    await sendResultNotification(runId, logDir, finalResults);
    console.log(`Result notification sent for ${runId}`);
  } catch (notificationError) {
    console.error(`Failed to send result notification for ${runId}:`, notificationError);
    // Continue execution - notification failure shouldn't break the process
  }
}
```

#### 3. Result Acknowledgment Tool
**File**: `src/tools/acknowledgeResults.ts` (new) 
**Changes**: Allow parents to acknowledge result receipt

```typescript
export const AcknowledgeResultsArgumentsSchema = z.object({
  runId: z.string().uuid("Run ID must be a valid UUID"),
  messageId: z.string().uuid("Message ID must be a valid UUID"),
});

export async function acknowledgeResults(
  runId: string,
  messageId: string,
  logDir: string
): Promise<{ success: boolean; message: string }> {
  const metaPath = join(logDir, `${runId}.meta.json`);
  
  const metaRaw = await fs.readFile(metaPath, "utf-8");
  const metadata = JSON.parse(metaRaw);
  
  // Find the result notification message
  const message = metadata.messages?.find((m: any) => m.messageId === messageId);
  if (!message) {
    throw new Error(`Message with ID ${messageId} not found`);
  }
  
  if (!message.questionContent.startsWith('RESULT_NOTIFICATION:')) {
    throw new Error(`Message ${messageId} is not a result notification`);
  }
  
  // Mark as acknowledged
  message.messageStatus = "acknowledged_by_subagent";
  message.answerContent = "Results received and acknowledged";
  message.answerTimestamp = new Date().toISOString();
  
  // Update run status back to completed
  metadata.status = "completed";
  
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
  
  return {
    success: true,
    message: "Results acknowledged successfully"
  };
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Result notifications are created in metadata
- [ ] Message state transitions work correctly
- [ ] Acknowledgment updates status properly
- [ ] Integration tests pass for async flow

#### Manual Verification:
- [ ] Result notifications appear immediately upon completion
- [ ] Parents can acknowledge results and clear notification state
- [ ] System performance improves with reduced polling
- [ ] Multiple concurrent results handled correctly

---

## Phase 4: Performance Optimization and Cleanup

### Overview
Remove unnecessary overhead, implement file watching for efficient notifications, and clean up technical debt.

### Changes Required:

#### 1. Remove Prompt File Creation
**File**: `src/tools/run.ts`
**Changes**: Eliminate unnecessary prompt file creation (lines 70-95, 254-257)

```typescript
// REMOVE these lines:
// const promptFile = join(logDir, `${runId}.prompt.md`);
// await fs.writeFile(promptFile, fullInput);

// REMOVE from error cleanup:
// try {
//   await fs.unlink(promptFile);
// } catch (unlinkError) {
//   console.error(`Failed to clean up prompt file: ${unlinkError}`);
// }
```

#### 2. File System Watcher Implementation
**File**: `src/tools/fileWatcher.ts` (new)
**Changes**: Efficient result monitoring

```typescript
import { watch } from 'fs';
import { EventEmitter } from 'events';

export class ResultWatcher extends EventEmitter {
  private watchers: Map<string, any> = new Map();
  
  watchForResults(runId: string, logDir: string): Promise<StructuredResult> {
    return new Promise((resolve, reject) => {
      const metaPath = join(logDir, `${runId}.meta.json`);
      
      const watcher = watch(metaPath, (eventType) => {
        if (eventType === 'change') {
          this.checkForResults(runId, logDir)
            .then(result => {
              if (result) {
                this.cleanup(runId);
                resolve(result);
              }
            })
            .catch(reject);
        }
      });
      
      this.watchers.set(runId, watcher);
      
      // Cleanup after 5 minutes to prevent memory leaks
      setTimeout(() => {
        this.cleanup(runId);
        reject(new Error(`Result watching timed out for ${runId}`));
      }, 5 * 60 * 1000);
    });
  }
  
  private async checkForResults(runId: string, logDir: string): Promise<StructuredResult | null> {
    try {
      const metaPath = join(logDir, `${runId}.meta.json`);
      const metaRaw = await fs.readFile(metaPath, "utf-8");
      const metadata = JSON.parse(metaRaw);
      
      if (metadata.structuredResults && metadata.status !== "running") {
        return metadata.structuredResults;
      }
    } catch (error) {
      // File may not exist yet or be in process of writing
    }
    
    return null;
  }
  
  private cleanup(runId: string): void {
    const watcher = this.watchers.get(runId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(runId);
    }
  }
}
```

#### 3. Enhanced Wait for Results Tool
**File**: `src/tools/waitForResults.ts` (new)
**Changes**: Efficient waiting alternative to polling

```typescript
export const WaitForResultsArgumentsSchema = z.object({
  runId: z.string().uuid("Run ID must be a valid UUID"),
  timeout: z.number().min(1).max(300).optional().default(60) // 1-300 seconds, default 60
});

export async function waitForResults(
  runId: string,
  timeout: number,
  logDir: string
): Promise<{ success: boolean; results?: StructuredResult; status: string }> {
  
  // First check if results already available
  const currentStatus = await checkSubagentStatus(runId, logDir);
  if (currentStatus.status === "not_found") {
    throw new Error(`Run ${runId} not found`);
  }
  
  if (currentStatus.structuredResults && currentStatus.status !== "running") {
    return {
      success: true,
      results: currentStatus.structuredResults,
      status: currentStatus.status
    };
  }
  
  // Use file watcher for efficient waiting
  const watcher = new ResultWatcher();
  
  try {
    const results = await watcher.watchForResults(runId, logDir);
    const finalStatus = await checkSubagentStatus(runId, logDir);
    
    return {
      success: true,
      results,
      status: finalStatus.status || "completed"
    };
  } catch (error) {
    return {
      success: false,
      status: "timeout"
    };
  }
}
```

#### 4. Status Response Optimization
**File**: `src/index.ts`  
**Changes**: Reduce response payload size (lines 301-401)

```typescript
// Add compact response option
tools.push({
  name: "check_subagent_status_compact",
  description: "Get minimal status information for efficient polling. Returns only essential fields.",
  inputSchema: {
    type: "object", 
    properties: {
      runId: { type: "string", description: "Run ID to check status for" },
    },
    required: ["runId"],
  },
});

// Handler for compact status
if (name === "check_subagent_status_compact") {
  const { runId } = CheckSubagentStatusArgumentsSchema.parse(args);
  const statusObject = await checkSubagentStatus(runId, LOG_DIR);

  if (statusObject.status === "not_found") {
    return { content: [{ type: "text", text: `{"status": "not_found", "runId": "${runId}"}` }] };
  }

  const compactResponse = {
    runId,
    status: statusObject.status,
    hasResults: !!statusObject.structuredResults,
    completed: ["success", "error", "completed"].includes(statusObject.status || ""),
    timestamp: new Date().toISOString()
  };

  return {
    content: [{ type: "text", text: JSON.stringify(compactResponse) }],
  };
}
```

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `npm test`  
- [ ] Build completes: `npm run build`
- [ ] File watchers don't leak memory: Load testing passes
- [ ] Performance benchmarks show improvement

#### Manual Verification:
- [ ] Reduced disk space usage (no prompt files)
- [ ] Faster result delivery (< 3 seconds)
- [ ] Efficient CPU usage (no polling overhead)  
- [ ] Backwards compatibility maintained

---

## Testing Strategy

### Unit Tests:
- **Result Extraction**: Test all parsing strategies with mock log content
- **Schema Validation**: Test new structured result fields and backwards compatibility
- **File Operations**: Test metadata updates and concurrent access scenarios
- **Error Handling**: Test fallback mechanisms and partial failures

### Integration Tests:
- **End-to-End Flow**: Test complete sub-agent execution with result extraction
- **Race Condition Scenarios**: Test concurrent MCP calls and process completion
- **Async Notification Flow**: Test result notifications and acknowledgments
- **File Watcher Performance**: Test memory usage and cleanup

### Manual Testing Steps:
1. **Basic Result Extraction**: Run sub-agents with structured markers, verify clean results
2. **Fallback Parsing**: Run sub-agents without markers, verify smart parsing works
3. **Race Condition Fix**: Run multiple concurrent sub-agents, verify no null summaries
4. **Performance Testing**: Compare polling vs file watching response times
5. **Backwards Compatibility**: Verify existing clients continue working

## Performance Considerations

### Memory Management:
- File watchers automatically cleanup after 5 minutes
- Structured results stored efficiently in JSON
- Log files remain unchanged for debugging

### Disk I/O Optimization:
- Eliminated prompt file creation saves 1 write per execution
- File watchers reduce polling frequency from every 30-60 seconds to event-driven
- Compact status responses reduce network overhead

### Concurrency:
- Atomic metadata updates prevent race conditions
- File locking through read-modify-write patterns
- Proper cleanup prevents resource leaks

## Migration Notes

### Backwards Compatibility:
- All existing MCP tools continue working unchanged
- Legacy summary field preserved alongside structured results
- Polling clients work normally while gaining access to enhanced data

### Deployment Strategy:
- Deploy Phase 1-2 together for immediate race condition fixes
- Phase 3-4 can be deployed incrementally
- No database migrations required (file-based system)
- Monitoring recommended for file watcher performance

### Rollback Plan:
- New optional fields can be removed without breaking existing data
- File watchers can be disabled, falling back to polling
- Prompt file creation can be re-enabled if needed

## References

- Original research: `thoughts/shared/research/2025-09-08_13-05-11_subagent_response_issues.md`
- Related architecture: `thoughts/shared/plans/subagent_spawning_refactor.md`
- Issue tickets: `thoughts/boryan/tickets/investigate_subagent_reponse.md`