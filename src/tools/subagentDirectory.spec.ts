import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ensureSubagentDirectory, validateGeminiPromptFile } from "./subagentDirectory.js";
import fs from "fs-extra";
import { promises as fsPromises } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("subagentDirectory utilities", () => {
  let testBaseDir: string;
  let testSubagentDir: string;
  let testGeminiFile: string;

  beforeEach(async () => {
    // Create unique test directory for this test run to prevent interference
    const testId = `subagent-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    testBaseDir = join(tmpdir(), 'mcp-subagent-tests', testId);
    testSubagentDir = join(testBaseDir, "test-agent");
    testGeminiFile = join(testSubagentDir, "GEMINI.md");
    
    // Ensure clean test directory
    await fs.ensureDir(testBaseDir);
    // Restore all mocks before each test
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    // Clean up test directories after each test
    await fs.remove(testBaseDir);
    // Restore all mocks after each test
    vi.restoreAllMocks();
  });

  describe("ensureSubagentDirectory", () => {
    it("should create a new directory if it doesn't exist", async () => {
      const result = await ensureSubagentDirectory(testSubagentDir);
      
      expect(result).toContain(testSubagentDir);
      expect(await fs.pathExists(testSubagentDir)).toBe(true);
      
      const stats = await fs.stat(testSubagentDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should return existing directory if it already exists", async () => {
      // Create directory first
      await fs.ensureDir(testSubagentDir);
      
      const result = await ensureSubagentDirectory(testSubagentDir);
      
      expect(result).toContain(testSubagentDir);
      expect(await fs.pathExists(testSubagentDir)).toBe(true);
    });

    it("should create nested directories recursively", async () => {
      const nestedDir = join(testBaseDir, "level1", "level2", "test-agent");
      
      const result = await ensureSubagentDirectory(nestedDir);
      
      expect(result).toContain(nestedDir);
      expect(await fs.pathExists(nestedDir)).toBe(true);
    });

    it("should throw error for empty directory path", async () => {
      await expect(ensureSubagentDirectory("")).rejects.toThrow(
        "Subagent directory path cannot be empty"
      );
      
      await expect(ensureSubagentDirectory("   ")).rejects.toThrow(
        "Subagent directory path cannot be empty"
      );
    });

    it("should throw error if path exists but is not a directory", async () => {
      // Create a file instead of directory
      await fs.ensureDir(testBaseDir);
      await fs.writeFile(testSubagentDir, "this is a file");
      
      await expect(ensureSubagentDirectory(testSubagentDir)).rejects.toThrow(
        "Failed to ensure subagent directory"
      );
    });

    it("should handle filesystem errors during directory creation", async () => {
      // Mock fs-extra.ensureDir to simulate filesystem error
      vi.spyOn(fs, "ensureDir").mockRejectedValue(
        Object.assign(new Error("Disk full"), { code: "ENOSPC" })
      );
      
      await expect(ensureSubagentDirectory(testSubagentDir)).rejects.toThrow(
        "Failed to ensure subagent directory"
      );
    });

    it("should handle stat errors after directory creation", async () => {
      // Mock fsPromises.stat to simulate error after directory creation
      vi.spyOn(fsPromises, "stat").mockRejectedValue(
        Object.assign(new Error("Permission denied"), { code: "EACCES" })
      );
      
      await expect(ensureSubagentDirectory(testSubagentDir)).rejects.toThrow(
        "Failed to ensure subagent directory"
      );
    });

    it("should return absolute path for relative directory paths", async () => {
      const relativePath = join(testBaseDir, "relative/test/path");
      const result = await ensureSubagentDirectory(relativePath);
      
      expect(result).toContain(testBaseDir);
      expect(result).toContain("relative");
      expect(result).toContain("test");
      expect(result).toContain("path");
      expect(await fs.pathExists(relativePath)).toBe(true);
      
      // No manual cleanup needed - handled in afterEach
    });
  });

  describe("validateGeminiPromptFile", () => {
    it("should return true when GEMINI.md exists and is readable", async () => {
      // Create directory and GEMINI.md file
      await fs.ensureDir(testSubagentDir);
      await fs.writeFile(testGeminiFile, "# Test Gemini Prompt\n\nThis is a test prompt.");
      
      const result = await validateGeminiPromptFile(testSubagentDir);
      
      expect(result).toBe(true);
    });

    it("should return false when GEMINI.md does not exist", async () => {
      // Create directory but no GEMINI.md file
      await fs.ensureDir(testSubagentDir);
      
      const result = await validateGeminiPromptFile(testSubagentDir);
      
      expect(result).toBe(false);
    });

    it("should return false when directory does not exist", async () => {
      const result = await validateGeminiPromptFile(testSubagentDir);
      
      expect(result).toBe(false);
    });

    it("should return false for empty directory path", async () => {
      const result1 = await validateGeminiPromptFile("");
      const result2 = await validateGeminiPromptFile("   ");
      
      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });

    it("should return false when GEMINI.md exists but is a directory", async () => {
      // Create directory structure where GEMINI.md is a directory instead of file
      await fs.ensureDir(testSubagentDir);
      await fs.ensureDir(testGeminiFile); // Create as directory
      
      const result = await validateGeminiPromptFile(testSubagentDir);
      
      expect(result).toBe(false);
    });

    it("should handle permission errors gracefully", async () => {
      // Create directory and file
      await fs.ensureDir(testSubagentDir);
      await fs.writeFile(testGeminiFile, "test content");
      
      // Mock fsPromises.stat to simulate permission error
      vi.spyOn(fsPromises, "stat").mockRejectedValue(
        Object.assign(new Error("Permission denied"), { code: "EACCES" })
      );
      
      const result = await validateGeminiPromptFile(testSubagentDir);
      
      expect(result).toBe(false);
    });

    it("should handle access permission errors gracefully", async () => {
      // Create directory and file
      await fs.ensureDir(testSubagentDir);
      await fs.writeFile(testGeminiFile, "test content");
      
      // Mock fsPromises.access to simulate permission error
      vi.spyOn(fsPromises, "access").mockRejectedValue(
        Object.assign(new Error("Permission denied"), { code: "EACCES" })
      );
      
      const result = await validateGeminiPromptFile(testSubagentDir);
      
      expect(result).toBe(false);
    });

    it("should handle unexpected errors during validation", async () => {
      // Create directory and file
      await fs.ensureDir(testSubagentDir);
      await fs.writeFile(testGeminiFile, "test content");
      
      // Mock fsPromises.stat to simulate unexpected error
      vi.spyOn(fsPromises, "stat").mockRejectedValue(
        new Error("Unexpected filesystem error")
      );
      
      const result = await validateGeminiPromptFile(testSubagentDir);
      
      expect(result).toBe(false);
    });
  });

  describe("fallback behavior", () => {
    it("should handle EEXIST error when path is actually a directory", async () => {
      // Create directory first
      await fs.ensureDir(testSubagentDir);
      
      // Mock fs-extra.ensureDir to throw EEXIST error
      vi.spyOn(fs, "ensureDir").mockRejectedValue(
        Object.assign(new Error("File exists"), { code: "EEXIST" })
      );
      
      // Should still succeed because the path is actually a directory
      const result = await ensureSubagentDirectory(testSubagentDir);
      expect(result).toContain(testSubagentDir);
    });

    it("should fail when EEXIST error and path is not a directory", async () => {
      // Create a file instead of directory
      await fs.ensureDir(testBaseDir);
      await fs.writeFile(testSubagentDir, "this is a file");
      
      // Mock fs-extra.ensureDir to throw EEXIST error
      vi.spyOn(fs, "ensureDir").mockRejectedValue(
        Object.assign(new Error("File exists"), { code: "EEXIST" })
      );
      
      await expect(ensureSubagentDirectory(testSubagentDir)).rejects.toThrow(
        "Failed to ensure subagent directory"
      );
    });

    it("should handle stat error during EEXIST fallback", async () => {
      // Mock fs-extra.ensureDir to throw EEXIST error
      vi.spyOn(fs, "ensureDir").mockRejectedValue(
        Object.assign(new Error("File exists"), { code: "EEXIST" })
      );
      
      // Mock fsPromises.stat to throw error during fallback
      vi.spyOn(fsPromises, "stat").mockRejectedValue(
        Object.assign(new Error("Permission denied"), { code: "EACCES" })
      );
      
      await expect(ensureSubagentDirectory(testSubagentDir)).rejects.toThrow(
        "Failed to ensure subagent directory"
      );
    });
  });

  describe("integration scenarios", () => {
    it("should work together - ensure directory then validate GEMINI.md", async () => {
      // First ensure directory exists
      await ensureSubagentDirectory(testSubagentDir);
      expect(await fs.pathExists(testSubagentDir)).toBe(true);
      
      // Initially no GEMINI.md file
      let isValid = await validateGeminiPromptFile(testSubagentDir);
      expect(isValid).toBe(false);
      
      // Create GEMINI.md file
      await fs.writeFile(testGeminiFile, "# Code Assistant\n\nYou are a helpful coding assistant.");
      
      // Now validation should pass
      isValid = await validateGeminiPromptFile(testSubagentDir);
      expect(isValid).toBe(true);
    });

    it("should handle multiple subagent directories", async () => {
      const agent1Dir = join(testBaseDir, "code-assistant");
      const agent2Dir = join(testBaseDir, "test-specialist");
      const agent3Dir = join(testBaseDir, "doc-writer");
      
      // Ensure all directories
      await ensureSubagentDirectory(agent1Dir);
      await ensureSubagentDirectory(agent2Dir);
      await ensureSubagentDirectory(agent3Dir);
      
      // Create GEMINI.md files for some agents
      await fs.writeFile(join(agent1Dir, "GEMINI.md"), "Code assistant prompt");
      await fs.writeFile(join(agent2Dir, "GEMINI.md"), "Test specialist prompt");
      // agent3 has no GEMINI.md file
      
      // Validate each
      expect(await validateGeminiPromptFile(agent1Dir)).toBe(true);
      expect(await validateGeminiPromptFile(agent2Dir)).toBe(true);
      expect(await validateGeminiPromptFile(agent3Dir)).toBe(false);
    });
  });
});