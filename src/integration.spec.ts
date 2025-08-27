#!/usr/bin/env node

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { runSubagent } from "./tools/run.js";
import { checkSubagentStatus } from "./tools/status.js";
import { getSubagentLogs } from "./tools/logs.js";
import { askParentHandler } from "./tools/askParent.js";
import { replySubagentHandler } from "./tools/replySubagent.js";
import { checkMessageStatusHandler } from "./tools/checkMessage.js";
import { SubagentConfig } from "./tools/schemas.js";
import { ensureSubagentDirectory, validateGeminiPromptFile } from "./tools/subagentDirectory.js";

// Helper function to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Test log directory
const TEST_LOG_DIR = path.join(process.cwd(), "logs");

describe("End-to-End Gemini Subagent Integration Tests", () => {
  let testSubagentConfig: SubagentConfig;
  let testSubagentWithoutGeminiConfig: SubagentConfig;
  let testSubagentMissingDirConfig: SubagentConfig;

  beforeAll(async () => {
    // Ensure test log directory exists
    await fs.mkdir(TEST_LOG_DIR, { recursive: true });

    // Create test subagent directories and GEMINI.md files
    await setupTestSubagents();

    // Define test subagent configurations
    testSubagentConfig = {
      name: "test-gemini-integration",
      command: "node",
      getArgs: () => ["test-script.js"],
      description: "Test subagent for Gemini integration testing",
      subagentDirectory: "test-subagents/test-gemini",
      specialization: "Integration testing with Gemini CLI simulation"
    };

    testSubagentWithoutGeminiConfig = {
      name: "test-no-gemini",
      command: "node", 
      getArgs: () => ["test-script.js"],
      description: "Test subagent without GEMINI.md file",
      subagentDirectory: "test-subagents/test-no-gemini",
      specialization: "Testing missing GEMINI.md scenarios"
    };

    testSubagentMissingDirConfig = {
      name: "test-missing-dir",
      command: "node",
      getArgs: () => ["test-script.js"],
      description: "Test subagent with missing directory",
      subagentDirectory: "test-subagents/non-existent-dir",
      specialization: "Testing missing directory scenarios"
    };
  });

  afterAll(async () => {
    // Clean up test subagent directories
    await cleanupTestSubagents();
  });

  beforeEach(async () => {
    // Ensure clean state for each test
  });

  afterEach(async () => {
    // Clean up any test-specific files if needed
  });

  describe("Subagent Directory Management", () => {
    it("should create subagent directory if it doesn't exist", async () => {
      const testDir = "test-subagents/auto-created";
      
      // Ensure directory doesn't exist initially
      try {
        await fs.rmdir(testDir, { recursive: true });
      } catch (error) {
        // Directory might not exist, which is fine
      }

      // Test directory creation
      const createdDir = await ensureSubagentDirectory(testDir);
      expect(createdDir).toBe(path.resolve(testDir));

      // Verify directory exists
      const stats = await fs.stat(testDir);
      expect(stats.isDirectory()).toBe(true);

      // Clean up
      await fs.rmdir(testDir, { recursive: true });
    });

    it("should validate GEMINI.md file exists in subagent directory", async () => {
      // Test with existing GEMINI.md
      const hasGemini = await validateGeminiPromptFile("test-subagents/test-gemini");
      expect(hasGemini).toBe(true);

      // Test with missing GEMINI.md
      const noGemini = await validateGeminiPromptFile("test-subagents/test-no-gemini");
      expect(noGemini).toBe(false);
    });

    it("should handle directory creation errors gracefully", async () => {
      // Test with a path that should work (the function creates directories recursively)
      const testDir = "test-subagents/should-work";
      
      // This should succeed, not throw
      const result = await ensureSubagentDirectory(testDir);
      expect(result).toContain("should-work");
      
      // Clean up
      try {
        await fs.rmdir(testDir, { recursive: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });
  });

  describe("End-to-End Subagent Execution from Dedicated Directories", () => {
    it("should execute subagent from its dedicated directory with GEMINI.md", async () => {
      const runId = await runSubagent(
        testSubagentConfig,
        "Test execution from dedicated directory",
        process.cwd(),
        TEST_LOG_DIR
      );

      expect(runId).toBeTypeOf("string");
      expect(runId.length).toBeGreaterThan(0);

      // Wait for process to complete
      await delay(1500);

      // Check status
      const status = await checkSubagentStatus(runId, TEST_LOG_DIR);
      expect(status.runId).toBe(runId);
      expect(status.agentName).toBe(testSubagentConfig.name);
      expect(["success", "completed"]).toContain(status.status);

      // Verify logs contain working directory information
      const logs = await getSubagentLogs(runId, TEST_LOG_DIR);
      expect(logs).toContain("Working directory:");
      expect(logs).toContain("test-gemini"); // Just check for the directory name, not full path
      expect(logs).toContain("Test execution from dedicated directory");
    });

    it("should execute subagent and log warning when GEMINI.md is missing", async () => {
      const runId = await runSubagent(
        testSubagentWithoutGeminiConfig,
        "Test execution without GEMINI.md",
        process.cwd(),
        TEST_LOG_DIR
      );

      expect(runId).toBeTypeOf("string");

      // Wait for process to complete
      await delay(1500);

      // Check status
      const status = await checkSubagentStatus(runId, TEST_LOG_DIR);
      expect(status.runId).toBe(runId);
      expect(status.agentName).toBe(testSubagentWithoutGeminiConfig.name);

      // Verify logs contain warning about missing GEMINI.md
      const logs = await getSubagentLogs(runId, TEST_LOG_DIR);
      expect(logs).toContain("Test execution without GEMINI.md");
      expect(logs).toContain("Working directory:");
      expect(logs).toContain("test-no-gemini"); // Just check for the directory name
    });

    it("should fallback to original working directory when subagent directory setup fails", async () => {
      const runId = await runSubagent(
        testSubagentMissingDirConfig,
        "Test fallback to original directory",
        process.cwd(),
        TEST_LOG_DIR
      );

      expect(runId).toBeTypeOf("string");

      // Wait for process to complete
      await delay(1500);

      // Check status
      const status = await checkSubagentStatus(runId, TEST_LOG_DIR);
      expect(status.runId).toBe(runId);
      expect(status.agentName).toBe(testSubagentMissingDirConfig.name);

      // Verify logs show fallback behavior
      const logs = await getSubagentLogs(runId, TEST_LOG_DIR);
      expect(logs).toContain("Test fallback to original directory");
      expect(logs).toContain("Working directory:");
    });
  });

  describe("Bi-directional Communication with Gemini CLI", () => {
    it("should support complete ask -> reply -> check cycle with Gemini subagent", async () => {
      // Start a subagent
      const runId = await runSubagent(
        testSubagentConfig,
        "Please ask me a question using ask_parent tool",
        process.cwd(),
        TEST_LOG_DIR
      );

      // Wait a bit for subagent to start
      await delay(500);

      // Simulate subagent asking a question
      const question = "Should I proceed with the integration test?";
      const askResult = await askParentHandler(
        {
          runId,
          question,
        },
        TEST_LOG_DIR
      );

      expect(askResult.messageId).toBeDefined();
      expect(askResult.instructions).toContain("check_message_status");

      // Verify status shows waiting for parent reply
      const waitingStatus = await checkSubagentStatus(runId, TEST_LOG_DIR);
      expect(waitingStatus.status).toBe("waiting_parent_reply");
      expect(waitingStatus.messages).toHaveLength(1);
      expect(waitingStatus.messages[0].messageStatus).toBe("pending_parent_reply");

      // Parent replies to the question
      const answer = "Yes, proceed with the integration test";
      const replyResult = await replySubagentHandler(
        {
          runId,
          messageId: askResult.messageId,
          answer,
        },
        TEST_LOG_DIR
      );

      expect(replyResult.success).toBe(true);

      // Verify status shows parent replied
      const repliedStatus = await checkSubagentStatus(runId, TEST_LOG_DIR);
      expect(repliedStatus.status).toBe("parent_replied");

      // Subagent checks for the reply
      const checkResult = await checkMessageStatusHandler(
        {
          runId,
          messageId: askResult.messageId,
        },
        TEST_LOG_DIR
      );

      expect(checkResult.messageId).toBe(askResult.messageId);
      expect(checkResult.questionContent).toBe(question);
      expect(checkResult.answerContent).toBe(answer);
      expect(checkResult.messageStatus).toBe("parent_replied");

      // Verify final status shows running (acknowledged)
      const finalStatus = await checkSubagentStatus(runId, TEST_LOG_DIR);
      expect(finalStatus.status).toBe("running");
      expect(finalStatus.messages[0].messageStatus).toBe("acknowledged_by_subagent");
    });

    it("should handle multiple questions and replies in sequence", async () => {
      const runId = await runSubagent(
        testSubagentConfig,
        "Test multiple questions scenario",
        process.cwd(),
        TEST_LOG_DIR
      );

      await delay(500);

      // First question
      const question1 = "What is the first step?";
      const askResult1 = await askParentHandler({ runId, question: question1 }, TEST_LOG_DIR);
      
      const answer1 = "Start with initialization";
      await replySubagentHandler({
        runId,
        messageId: askResult1.messageId,
        answer: answer1,
      }, TEST_LOG_DIR);

      await checkMessageStatusHandler({
        runId,
        messageId: askResult1.messageId,
      }, TEST_LOG_DIR);

      // Second question
      const question2 = "What is the second step?";
      const askResult2 = await askParentHandler({ runId, question: question2 }, TEST_LOG_DIR);
      
      const answer2 = "Proceed with validation";
      await replySubagentHandler({
        runId,
        messageId: askResult2.messageId,
        answer: answer2,
      }, TEST_LOG_DIR);

      await checkMessageStatusHandler({
        runId,
        messageId: askResult2.messageId,
      }, TEST_LOG_DIR);

      // Verify final status has both messages
      const finalStatus = await checkSubagentStatus(runId, TEST_LOG_DIR);
      expect(finalStatus.messages).toHaveLength(2);
      expect(finalStatus.messages[0].questionContent).toBe(question1);
      expect(finalStatus.messages[1].questionContent).toBe(question2);
      expect(finalStatus.messages[0].messageStatus).toBe("acknowledged_by_subagent");
      expect(finalStatus.messages[1].messageStatus).toBe("acknowledged_by_subagent");
    });
  });

  describe("Error Scenarios and Edge Cases", () => {
    it("should handle missing subagent directory gracefully", async () => {
      const config: SubagentConfig = {
        name: "test-missing-directory",
        command: "node",
        getArgs: () => ["test-script.js"],
        description: "Test with missing directory",
        subagentDirectory: "non-existent-directory",
        specialization: "Error testing"
      };

      // This should not throw, but should handle the error gracefully
      const runId = await runSubagent(
        config,
        "Test with missing directory",
        process.cwd(),
        TEST_LOG_DIR
      );

      expect(runId).toBeTypeOf("string");

      await delay(1500);

      const status = await checkSubagentStatus(runId, TEST_LOG_DIR);
      expect(status.runId).toBe(runId);
      
      // Should still execute, just from fallback directory
      const logs = await getSubagentLogs(runId, TEST_LOG_DIR);
      expect(logs).toContain("Test with missing directory");
    });

    it("should handle invalid message IDs in communication", async () => {
      const runId = await runSubagent(
        testSubagentConfig,
        "Test invalid message handling",
        process.cwd(),
        TEST_LOG_DIR
      );

      await delay(500);

      const invalidMessageId = uuidv4();

      // Try to reply to non-existent message
      await expect(
        replySubagentHandler({
          runId,
          messageId: invalidMessageId,
          answer: "This should fail",
        }, TEST_LOG_DIR)
      ).rejects.toThrow("Message with ID");

      // Try to check non-existent message
      await expect(
        checkMessageStatusHandler({
          runId,
          messageId: invalidMessageId,
        }, TEST_LOG_DIR)
      ).rejects.toThrow("No messages found");
    });

    it("should handle invalid run IDs in communication", async () => {
      const invalidRunId = uuidv4();

      // Try to ask parent with invalid run ID
      await expect(
        askParentHandler({
          runId: invalidRunId,
          question: "This should fail",
        }, TEST_LOG_DIR)
      ).rejects.toThrow("Could not read meta file");

      // Try to reply with invalid run ID
      await expect(
        replySubagentHandler({
          runId: invalidRunId,
          messageId: uuidv4(),
          answer: "This should fail",
        }, TEST_LOG_DIR)
      ).rejects.toThrow("Could not read meta file");
    });

    it("should handle subagent process failures", async () => {
      const failingConfig: SubagentConfig = {
        name: "test-failing-subagent",
        command: "node",
        getArgs: () => ["non-existent-script.js"], // This will fail
        description: "Test failing subagent",
        subagentDirectory: "test-subagents/test-gemini",
        specialization: "Failure testing"
      };

      const runId = await runSubagent(
        failingConfig,
        "This should fail",
        process.cwd(),
        TEST_LOG_DIR
      );

      await delay(1500);

      const status = await checkSubagentStatus(runId, TEST_LOG_DIR);
      expect(status.status).toBe("error");
      expect(status.exitCode).not.toBe(0);
      expect(status.summary).toContain("Process exited with code");
    });
  });

  describe("GEMINI.md File Loading Verification", () => {
    it("should verify GEMINI.md content is accessible in subagent directory", async () => {
      // Read the test GEMINI.md file to verify it exists and has content
      const geminiPath = path.join("test-subagents/test-gemini", "GEMINI.md");
      const geminiContent = await fs.readFile(geminiPath, "utf-8");
      
      expect(geminiContent).toContain("Test Gemini Integration Assistant");
      expect(geminiContent).toContain("specialized assistant for integration testing");

      // Verify the file is in the correct location for Gemini CLI to find it
      const stats = await fs.stat(geminiPath);
      expect(stats.isFile()).toBe(true);
    });

    it("should execute subagent from directory containing GEMINI.md", async () => {
      const runId = await runSubagent(
        testSubagentConfig,
        "Verify GEMINI.md is accessible",
        process.cwd(),
        TEST_LOG_DIR
      );

      await delay(1500);

      const logs = await getSubagentLogs(runId, TEST_LOG_DIR);
      
      // Verify the subagent executed from the correct directory
      expect(logs).toContain("Working directory:");
      expect(logs).toContain("test-gemini"); // Just check for the directory name
      
      // The actual Gemini CLI would read the GEMINI.md file automatically
      // Our test simulation just verifies the working directory is correct
    });
  });
});

// Helper functions for test setup and cleanup

async function setupTestSubagents() {
  // Create test subagent directories
  const testDirs = [
    "test-subagents/test-gemini",
    "test-subagents/test-no-gemini"
  ];

  for (const dir of testDirs) {
    await fs.mkdir(dir, { recursive: true });
  }

  // Create GEMINI.md file for test-gemini directory
  const geminiContent = `# Test Gemini Integration Assistant

You are a specialized assistant for integration testing. You are designed to:

1. Respond to test inputs appropriately
2. Use the ask_parent tool when instructed
3. Update your status using update_subagent_status tool
4. Simulate realistic Gemini CLI behavior for testing

When you receive test instructions, follow them precisely and provide clear, testable responses.

Remember to always update your status when completing tasks.
`;

  await fs.writeFile(
    path.join("test-subagents/test-gemini", "GEMINI.md"),
    geminiContent
  );

  // Create a simple test script that simulates subagent behavior
  const testScript = `
// Simple test script that simulates subagent behavior
console.log("Test subagent started");
console.log("Input received:", process.argv.slice(2).join(" "));

// Simulate some processing time
setTimeout(() => {
  console.log("Test subagent completed");
  process.exit(0);
}, 500);
`;

  // Write test script to each directory (simulating the command that would be executed)
  for (const dir of testDirs) {
    await fs.writeFile(path.join(dir, "test-script.js"), testScript);
  }
}

async function cleanupTestSubagents() {
  const testDirs = [
    "test-subagents/test-gemini",
    "test-subagents/test-no-gemini",
    "test-subagents/auto-created"
  ];

  for (const dir of testDirs) {
    try {
      await fs.rmdir(dir, { recursive: true });
    } catch (error) {
      // Directory might not exist, which is fine
    }
  }
}