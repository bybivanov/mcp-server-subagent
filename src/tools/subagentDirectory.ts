import { promises as fs } from "fs";
import { join } from "path";
import fs_extra from "fs-extra";

/**
 * Ensures that a subagent directory exists, creating it if necessary.
 * @param subagentDirectory - The path to the subagent directory
 * @returns Promise<string> - The absolute path to the created/validated directory
 * @throws Error if directory cannot be created or accessed
 */
export async function ensureSubagentDirectory(subagentDirectory: string): Promise<string> {
  if (!subagentDirectory || subagentDirectory.trim() === "") {
    throw new Error("Subagent directory path cannot be empty");
  }

  try {
    // Use fs-extra's ensureDir which creates the directory recursively if it doesn't exist
    await fs_extra.ensureDir(subagentDirectory);
    
    // Verify the directory exists and is accessible
    const stats = await fs.stat(subagentDirectory);
    if (!stats.isDirectory()) {
      throw new Error(`Path exists but is not a directory: ${subagentDirectory}`);
    }

    // Return the absolute path
    const absolutePath = join(process.cwd(), subagentDirectory);
    console.error(`Subagent directory ensured: ${absolutePath}`);
    return absolutePath;
    
  } catch (error) {
    // Check if the error is because a file exists at the path
    if ((error as any).code === "EEXIST") {
      try {
        const stats = await fs.stat(subagentDirectory);
        if (!stats.isDirectory()) {
          throw new Error(`Path exists but is not a directory: ${subagentDirectory}`);
        }
        // If it's a directory, return the path (this shouldn't happen with ensureDir, but just in case)
        const absolutePath = join(process.cwd(), subagentDirectory);
        console.error(`Subagent directory ensured: ${absolutePath}`);
        return absolutePath;
      } catch (statError) {
        // If we can't stat the path, throw the original error
        const errorMessage = `Failed to ensure subagent directory '${subagentDirectory}': ${error}`;
        console.error(errorMessage);
        throw new Error(errorMessage);
      }
    }
    
    const errorMessage = `Failed to ensure subagent directory '${subagentDirectory}': ${error}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

/**
 * Validates that a GEMINI.md file exists in the specified subagent directory.
 * @param subagentDirectory - The path to the subagent directory
 * @returns Promise<boolean> - True if GEMINI.md exists and is readable, false otherwise
 */
export async function validateGeminiPromptFile(subagentDirectory: string): Promise<boolean> {
  if (!subagentDirectory || subagentDirectory.trim() === "") {
    console.error("Cannot validate GEMINI.md: subagent directory path is empty");
    return false;
  }

  const geminiFilePath = join(subagentDirectory, "GEMINI.md");
  
  try {
    // Check if the file exists and is readable
    const stats = await fs.stat(geminiFilePath);
    
    if (!stats.isFile()) {
      console.error(`GEMINI.md exists but is not a file: ${geminiFilePath}`);
      return false;
    }

    // Try to read the file to ensure it's accessible
    await fs.access(geminiFilePath, fs.constants.R_OK);
    
    console.error(`GEMINI.md file validated: ${geminiFilePath}`);
    return true;
    
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`GEMINI.md file not found: ${geminiFilePath}`);
    } else if ((error as NodeJS.ErrnoException).code === "EACCES") {
      console.error(`GEMINI.md file not readable: ${geminiFilePath}`);
    } else {
      console.error(`Error validating GEMINI.md file '${geminiFilePath}': ${error}`);
    }
    return false;
  }
}