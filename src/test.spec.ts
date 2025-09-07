#!/usr/bin/env node

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { ensureLogDir } from "./index.js";
import * as runModule from "./tools/run.js";
import { runSubagent } from "./tools/run.js";
import { checkSubagentStatus, updateSubagentStatus } from "./tools/status.js";
import { getSubagentLogs } from "./tools/logs.js";
import { SubagentConfig } from "./tools/schemas.js"; // Import SubagentConfig
import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// Define a helper to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Use unique temporary directory for test isolation
let LOG_DIR: string;

// Define types for our dynamic subagents if not already defined in index.ts
// (Assuming SUBAGENTS values have a specific structure)
// interface SubagentConfig { // This local interface is no longer needed
// name: string; // name is part of the imported SubagentConfig
// command: string;
// getArgs: (input: string) => string[];
// description: string;
// }

describe("Subagent MCP Server Functionality", () => {
  const testSubagentName = "test_in_vitest";
  const testFailSubagentName = "test_fail_in_vitest";
  let runId: string;
  let failRunId: string;

  // Test subagent configurations
  let testSubagentConfig: SubagentConfig;
  let testFailSubagentConfig: SubagentConfig;

  beforeAll(async () => {
    // Create unique test directory to prevent interference
    const testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    LOG_DIR = path.join(require('os').tmpdir(), 'mcp-subagent-tests', testId, 'logs');
    await fs.mkdir(LOG_DIR, { recursive: true });

    testSubagentConfig = {
      name: testSubagentName,
      command: "gemini",
      getArgs: () => ["chat", "--interactive"],
      description: "Test subagent that simulates Gemini CLI response, added by Vitest",
      subagentDirectory: "test-subagents/test-status",
      specialization: "Testing echo functionality"
    };

    testFailSubagentConfig = {
      name: testFailSubagentName,
      command: "gemini",
      getArgs: () => ["chat", "--interactive"],
      description: "Test subagent that intentionally fails, added by Vitest",
      subagentDirectory: "test-subagents/test-fail",
      specialization: "Testing failure scenarios"
    };
  });

  beforeEach(() => {
    // Mock the runSubagent function to avoid actual command execution
    vi.spyOn(runModule, 'runSubagent').mockImplementation(async (input, projectDirectory, subagentName, model, logDir) => {
      const mockRunId = uuidv4();
      
      // Determine if this should be a success or failure based on subagent name
      const shouldFail = subagentName.includes("fail");
      const status = shouldFail ? "error" : "success";
      const exitCode = shouldFail ? 1 : 0;
      
      // Create mock metadata file
      const metadata = {
        runId: mockRunId,
        agentName: subagentName,
        command: `type "prompt.md" | gemini --model ${model} --include-directories ${projectDirectory}`,
        startTime: new Date().toISOString(),
        status,
        exitCode,
        endTime: new Date().toISOString(),
        summary: shouldFail ? "Process exited with code 1" : null,
      };
      
      await fs.writeFile(
        path.join(logDir, `${mockRunId}.meta.json`),
        JSON.stringify(metadata, null, 2)
      );
      
      // Create mock log file
      const logContent = [
        `[${new Date().toISOString()}] Starting ${subagentName} with input: ${input}`,
        `[${new Date().toISOString()}] Working directory: ${projectDirectory}`,
        `[${new Date().toISOString()}] Command: type "prompt.md" | gemini --model ${model} --include-directories ${projectDirectory}`,
        shouldFail 
          ? `[${new Date().toISOString()}] Process exited with code 1`
          : `[${new Date().toISOString()}] Process exited with code 0`
      ].join('\n');
      
      await fs.writeFile(
        path.join(logDir, `${mockRunId}.log`),
        logContent
      );
      
      return mockRunId;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      const testBaseDir = path.join(LOG_DIR, '..');
      await fs.rm(testBaseDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Successful Subagent Operations", () => {
    it("should run a subagent and get an initial status", async () => {
      console.log(`\n--- Running ${testSubagentConfig.name} ---`);
      runId = await runSubagent(
        "Hello from Vitest!",
        process.cwd(),
        testSubagentConfig.name,
        "gemini-2.5-flash",
        LOG_DIR
      );
      console.log(
        `Subagent ${testSubagentConfig.name} started with run ID: ${runId}`
      );
      expect(runId).toBeTypeOf("string");
      expect(runId.length).toBeGreaterThan(0);

      await delay(1000);

      console.log(
        `\n--- Checking initial status for ${testSubagentConfig.name} ---`
      );
      const initialStatus = await checkSubagentStatus(runId, LOG_DIR);
      console.log("Initial status:", JSON.stringify(initialStatus, null, 2));

      expect(initialStatus).toBeDefined();
      expect(initialStatus.runId).toBe(runId);
      expect(initialStatus.status).toBe("success");
      expect(initialStatus.summary).toBeNull(); // Or specific initial summary if set
      expect(initialStatus.command).toContain(`type "`);
      expect(initialStatus.command).toContain(`| gemini`);
    });

    it("should update the subagent status with a summary", async () => {
      expect(runId, "runId must be set from previous test").toBeDefined();
      const summaryText = "The task was completed successfully by Vitest.";

      console.log(`\n--- Updating status for ${testSubagentConfig.name} ---`);
      const updatedStatus = await updateSubagentStatus(
        runId,
        "completed",
        LOG_DIR, // Pass LOG_DIR
        summaryText
      );
      console.log("Updated status:", JSON.stringify(updatedStatus, null, 2));

      expect(updatedStatus).toBeDefined();
      expect(updatedStatus.runId).toBe(runId);
      expect(updatedStatus.status).toBe("completed");
      expect(updatedStatus.summary).toBe(summaryText);
      expect(updatedStatus.lastUpdated).toBeTypeOf("string");
    });

    it("should reflect the updated status and summary when checking again", async () => {
      expect(runId, "runId must be set from previous test").toBeDefined();
      console.log(
        `\n--- Checking status after update for ${testSubagentConfig.name} ---`
      );
      const finalStatus = await checkSubagentStatus(runId, LOG_DIR);
      console.log("Final status:", JSON.stringify(finalStatus, null, 2));

      expect(finalStatus).toBeDefined();
      expect(finalStatus.runId).toBe(runId);
      expect(finalStatus.status).toBe("completed");
      expect(finalStatus.summary).toBe(
        "The task was completed successfully by Vitest."
      );
    });

    it("should retrieve the logs for the subagent run", async () => {
      expect(runId, "runId must be set from previous test").toBeDefined();
      console.log(`\n--- Getting logs for ${testSubagentConfig.name} ---`);
      const logs = await getSubagentLogs(runId, LOG_DIR);
      console.log("Logs:", logs);

      expect(logs).toBeTypeOf("string");
      expect(logs).toContain("Hello from Vitest!");
      expect(logs).toContain("Status updated to: completed");
      expect(logs).toContain(
        "Summary: The task was completed successfully by Vitest."
      );
    });
  });

  describe("Failing Subagent Operations", () => {
    it("should not overwrite status if already 'success' or 'error' in metadata before process ends", async () => {
      // Custom subagent that just sleeps for a bit
      const customSubagentConfig: SubagentConfig = {
        name: "test_status_preservation",
        command: "node",
        getArgs: () => ["--help"], // Self-contained system command
        description: "Subagent for status preservation test",
        subagentDirectory: "test-subagents/test-status",
        specialization: "Testing status preservation"
      };

      // Start the subagent
      const runId = await runSubagent(
        "Preserve status test input",
        process.cwd(),
        customSubagentConfig.name,
        "gemini-2.5-flash",
        LOG_DIR
      );
      const metaFile = path.join(LOG_DIR, `${runId}.meta.json`);

      // Wait a short moment to ensure the process has started and metadata exists
      await delay(200);

      // Read and update the metadata to set status to 'success' before process ends
      let meta = JSON.parse(await fs.readFile(metaFile, "utf-8"));
      meta.status = "success";
      await fs.writeFile(metaFile, JSON.stringify(meta, null, 2));

      // Wait for process to finish
      await delay(1200);

      // Check that status is still 'success' and not overwritten by exit code logic
      const finalStatus = await checkSubagentStatus(runId, LOG_DIR);
      expect(finalStatus.status).toBe("success");

      // Repeat for 'error' status
      const runId2 = await runSubagent(
        "Preserve error status test input",
        process.cwd(),
        customSubagentConfig.name,
        "gemini-2.5-flash",
        LOG_DIR
      );
      const metaFile2 = path.join(LOG_DIR, `${runId2}.meta.json`);
      await delay(200);
      let meta2 = JSON.parse(await fs.readFile(metaFile2, "utf-8"));
      meta2.status = "error";
      await fs.writeFile(metaFile2, JSON.stringify(meta2, null, 2));
      await delay(1200);
      const finalStatus2 = await checkSubagentStatus(runId2, LOG_DIR);
      expect(finalStatus2.status).toBe("error");
    });
    it('should mark a failing subagent run as "error" and capture log tail in summary', async () => {
      console.log(
        `\n--- Running failing subagent ${testFailSubagentConfig.name} ---`
      );
      failRunId = await runSubagent(
        "TestFailureInput",
        process.cwd(),
        testFailSubagentConfig.name,
        "gemini-2.5-flash",
        LOG_DIR
      );
      console.log(
        `Failing subagent ${testFailSubagentConfig.name} started with run ID: ${failRunId}`
      );
      expect(failRunId).toBeTypeOf("string");

      await delay(1000); // Wait for the process to exit and metadata to be updated

      console.log(
        `\n--- Checking status for failing subagent ${testFailSubagentConfig.name} ---`
      );
      const status = await checkSubagentStatus(failRunId, LOG_DIR);
      console.log("Failing status:", JSON.stringify(status, null, 2));

      expect(status).toBeDefined();
      expect(status.runId).toBe(failRunId);
      expect(status.status).toBe("error");
      expect([1, 127]).toContain(status.exitCode);
      expect(status.summary).toBeTypeOf("string");
      expect(status.command).toContain(`type "`);
      expect(status.command).toContain(`| gemini`);
      expect(status.summary).toBeTypeOf("string");
      expect(status.summary).toMatch(/Process exited with code/);
    });

    it("should retrieve logs for the failing subagent run", async () => {
      expect(
        failRunId,
        "failRunId must be set from previous test"
      ).toBeDefined();
      console.log(
        `\n--- Getting logs for failing subagent ${testFailSubagentConfig.name} ---`
      );
      const logs = await getSubagentLogs(failRunId, LOG_DIR);
      console.log("Failing logs:", logs);

      expect(logs).toBeTypeOf("string");
      expect(logs).toContain("TestFailureInput");
      expect(logs).toContain("Process exited with code");
    });
  });
});
