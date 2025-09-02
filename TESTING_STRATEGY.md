# Testing Strategy for MCP Server Subagent

## Executive Summary

This document outlines a comprehensive testing strategy for the MCP Server Subagent project that addresses current issues with test isolation, external file dependencies, and directory cleanup interference. The strategy focuses on creating self-contained, mock-based tests that are reliable, maintainable, and isolated from each other.

---

## Current Testing Strategy Analysis

### Current Test Suite Overview

The existing test suite consists of 7 test files with varying approaches:

**Test Files Overview:**
- `src/test.spec.ts` - Main functionality tests with mocked `runSubagent`
- `src/integration.spec.ts` - End-to-end integration tests
- `src/communication.spec.ts` - Bi-directional communication tests (well-isolated)
- `src/mcp-handler.spec.ts` - MCP output formatting tests (well-isolated)
- `src/mcp-output-format.spec.ts` - MCP protocol validation tests (well-isolated) 
- `src/status-integration.spec.ts` - Status handling integration tests (well-isolated)
- `src/tools/subagentDirectory.spec.ts` - Directory management tests (problematic)

### Coverage Analysis

**Well-tested areas:**
- Bi-directional communication system (ask/reply/check cycle)
- MCP output formatting and protocol compliance
- Status handling and metadata management
- Error handling for communication tools

**Problematic areas:**
- Subagent execution relies on external `test-script.js` files
- Directory cleanup interference between tests
- Inconsistent mocking strategies across test files
- File system operations not properly isolated

### Methodology Assessment

**Current Strengths:**
1. **Good separation of concerns** - Each tool has dedicated tests
2. **Comprehensive communication testing** - Full ask→reply→check workflows tested
3. **Schema validation** - Zod schemas are properly tested
4. **Mock-based approach** - Some tests use effective mocking

**Current Problems:**
1. **External file dependencies** - References to non-existent `test-script.js` files
2. **Directory cleanup races** - `subagentDirectory.spec.ts` interferes with other tests
3. **Inconsistent test isolation** - Some tests modify shared file system state
4. **Mock inconsistencies** - Different mocking approaches across files

---

## Specific Issues Identified

### Test Script Dependencies

**Problem:** References to `test-script.js` files that don't exist

**Locations:**
- `src/test.spec.ts:205` - `getArgs: () => ["test-script.js"]`
- `src/integration.spec.ts:376` - `getArgs: () => ["test-script.js"]`

**Impact:**
- Tests fail when external scripts are missing
- Creates dependency on file system state outside the test
- Makes tests non-portable and environment-dependent

### Directory Cleanup Interference

**Problem:** `subagentDirectory.spec.ts` performs aggressive cleanup

**Issues:**
- `beforeEach` and `afterEach` both call `fs.remove(testBaseDir)`
- Creates race conditions with other tests using same directories
- May interfere with parallel test execution
- Clean up operations are not atomic or properly isolated

**Code Example:**
```typescript
beforeEach(async () => {
  await fs.remove(testBaseDir); // Too aggressive - affects other tests
});

afterEach(async () => {
  await fs.remove(testBaseDir); // Potential race condition
});
```

### Test Isolation Failures

**Problems:**
1. **Shared log directory** - Multiple tests write to `logs/` directory simultaneously
2. **Global state mutations** - Some tests modify process working directory
3. **Async cleanup races** - `afterEach` hooks run concurrently causing conflicts
4. **Mock leakage** - Some mocks not properly restored between tests

---

## New Testing Strategy Plan

### Self-Contained Approach

**Core Principle: Zero External Dependencies**

All tests should be completely self-contained with no reliance on:
- External script files
- Shared directories between test files  
- Global file system state
- Network dependencies
- System commands

**Implementation:**
```typescript
// Instead of referencing external files
getArgs: () => ["test-script.js"]  // ❌ BAD

// Use inline mock responses
getArgs: () => ["--help"]  // ✅ GOOD - system command that always exists
// OR mock the entire execution
```

### Mock-Based Testing Strategy

**Strategy: Comprehensive Mocking Architecture**

1. **Process Execution Mocking**
   - Mock `child_process.spawn()` at the lowest level
   - Create predictable mock responses for different scenarios
   - Simulate various exit codes and output patterns

2. **File System Mocking**
   - Use `memfs` or similar for file system operations
   - Create isolated virtual file systems per test
   - Mock `fs` operations that don't need real file system

3. **Time and UUID Mocking**
   - Mock `Date.now()` for predictable timestamps
   - Mock `uuid.v4()` for deterministic test IDs
   - Enable time-based test scenarios

### Isolated Temporary Directories

**Strategy: Unique Temporary Directories Per Test**

```typescript
// Create unique temp directories
const testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
const tempDir = path.join(os.tmpdir(), 'mcp-subagent-tests', testId);

beforeEach(async () => {
  await fs.ensureDir(tempDir);
});

afterEach(async () => {
  await fs.remove(tempDir);
});
```

**Benefits:**
- True test isolation
- No conflicts between parallel tests
- Automatic cleanup with OS temp directory management
- Predictable test environment

### Testing Utilities and Helpers

**Strategy: Centralized Test Utilities**

Create `src/test-utils/` directory with:

1. **Mock Factory (`mockFactory.ts`)**
   ```typescript
   export class MockFactory {
     createSubagentConfig(overrides?: Partial<SubagentConfig>): SubagentConfig
     createMetadata(overrides?: Partial<Metadata>): Metadata
     createMockRunSubagent(): MockedFunction<typeof runSubagent>
   }
   ```

2. **Test Fixtures (`fixtures.ts`)**
   ```typescript
   export const testFixtures = {
     validMetadata: { /* ... */ },
     invalidMetadata: { /* ... */ },
     sampleLogOutput: "Sample log content...",
   }
   ```

3. **Test Helpers (`helpers.ts`)**
   ```typescript
   export async function createIsolatedLogDir(): Promise<string>
   export async function cleanupTestDir(dir: string): Promise<void>
   export function mockProcessExecution(exitCode: number, output: string): void
   ```

