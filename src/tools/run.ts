import { promises as fs } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { createWriteStream } from "fs";
import { v4 as uuidv4 } from "uuid";
import { ensureSubagentDirectory, validateGeminiPromptFile } from "./subagentDirectory.js";

// Dynamic directory resolution for project-specific subagents
async function resolveSubagentDirectory(
  projectDirectory: string,
  subagentName: string
): Promise<string> {
  const subagentDir = join(projectDirectory, '.gemini', 'subagents', subagentName);
  
  // Ensure directory exists
  await ensureSubagentDirectory(subagentDir);
  
  // Create default GEMINI.md if missing
  const geminiFile = join(subagentDir, 'GEMINI.md');
  if (!await validateGeminiPromptFile(subagentDir)) {
    await createDefaultGeminiMd(geminiFile, subagentName);
  }
  
  return subagentDir;
}

// Create default GEMINI.md files for new subagents
async function createDefaultGeminiMd(
  filePath: string,
  subagentName: string
): Promise<void> {
  const defaultContent = `# ${subagentName} Subagent

You are a specialized AI assistant focused on ${subagentName.replace(/-/g, ' ')} tasks.

## Your Role
- Provide expert assistance with ${subagentName.replace(/-/g, ' ')}-related tasks
- Follow best practices and industry standards
- Give clear, actionable guidance
- Be concise but comprehensive

## Approach
1. Understand the specific requirements
2. Analyze the current context and codebase
3. Provide targeted solutions
4. Include examples where helpful
5. Suggest next steps or improvements

Focus on delivering high-quality results that align with the project's goals and conventions.
`;
  await fs.writeFile(filePath, defaultContent, 'utf8');
  console.error(`Created default GEMINI.md for ${subagentName} at ${filePath}`);
}

// Run a subagent and return the run ID
export async function runSubagent(
  input: string,
  projectDirectory: string, 
  subagentName: string,
  model: string,
  logDir: string
): Promise<string> {
  if (!subagentName || !projectDirectory || !model) {
    throw new Error(`Missing required parameters: subagentName, projectDirectory, or model.`);
  }

  const runId = uuidv4();
  const logFile = join(logDir, `${runId}.log`);
  const metadataFile = join(logDir, `${runId}.meta.json`);
  const promptFile = join(logDir, `${runId}.prompt.md`);

  // Determine the working directory for the subagent
  const subagentWorkingDir = await resolveSubagentDirectory(projectDirectory, subagentName);
  
  console.error(`Subagent ${subagentName} will execute from directory: ${subagentWorkingDir}`);

  // Construct the prompt
  const toolName = "update_subagent_status";
  const prompt = `
This is a sub-task executed by an automated agent.
Your unique run ID for this task is: ${runId}.
You MUST report your final status and results using the MCP tool: ${toolName}.
Ensure all necessary information is included in your update via this tool.

You are able to ask the commander/manager for clarification if something is unclear using the 'ask_parent' tool.

If you are unable to complete the task, please provide a detailed error as summary in the tool call ${toolName} and set the status to 'error'.

Instructions are the following:
---
`;
  const fullInput = prompt + input;

  // Write prompt to file
  await fs.writeFile(promptFile, fullInput);

  // Get command and arguments (no input as CLI arg)
  const command = "gemini";
  const args = [
    "--model", model,
    "--include-directories", projectDirectory
  ];

  // Prepare shell pipeline: cat <promptFile> | <command> <args...>
  // Use cross-platform shell command
  const isWindows = process.platform === 'win32';
  const shellCommand = isWindows ? "cmd" : "sh";
  const catCommand = isWindows ? "type" : "cat";
  const shellArgs = isWindows 
    ? ["/c", `${catCommand} "${promptFile}" | ${command} ${args.join(" ")}`]
    : ["-c", `${catCommand} "${promptFile}" | ${command} ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`];

  // Create log file stream for real-time logging
  const logStream = createWriteStream(logFile, { flags: "a" });

  // Write initial metadata, now including agentName
  const metadata = {
    runId,
    agentName: subagentName,
    command: `${catCommand} "${promptFile}" | ${command} ${args.join(" ")}`,
    startTime: new Date().toISOString(),
    status: "running",
    exitCode: null,
    endTime: null,
    summary: null,
  };

  await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));

  try {
    // Log the command being executed (for debugging)
    console.error(
      `Executing: ${catCommand} "${promptFile}" | ${command} ${args.join(" ")}`,
    );
    console.error(`Working directory: ${subagentWorkingDir}`);

    // Use spawn for the shell pipeline
    const childProcess = spawn(shellCommand, shellArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: subagentWorkingDir,
      env: {
        ...process.env,
        NO_COLOR: "1",
        TERM: "dumb",
      },
    });

    // Log timestamp at the beginning
    logStream.write(
      `[${new Date().toISOString()}] Starting ${subagentName} with input: ${input}\n`,
    );
    logStream.write(
      `[${new Date().toISOString()}] Working directory: ${subagentWorkingDir}\n`,
    );
    logStream.write(
      `[${new Date().toISOString()}] Command: ${catCommand} "${promptFile}" | ${command} ${args.join(
        " ",
      )}\n`,
    );

    // Stream stdout to log file in real-time
    childProcess.stdout.on("data", (data) => {
      const timestamp = new Date().toISOString();
      logStream.write(`[${timestamp}] [stdout] ${data}`);
    });

    // Stream stderr to log file in real-time
    childProcess.stderr.on("data", (data) => {
      const timestamp = new Date().toISOString();
      logStream.write(`[${timestamp}] [stderr] ${data}`);
    });

    // Update metadata when process completes
    childProcess.on("close", async (code) => {
      const endTime = new Date().toISOString();
      logStream.write(`[${endTime}] Process exited with code ${code}\n`);
      await new Promise<void>((resolve) => logStream.end(resolve));

      let currentMetadata;
      try {
        const metadataContent = await fs.readFile(metadataFile, "utf-8");
        currentMetadata = JSON.parse(metadataContent);
      } catch (readError) {
        console.error(
          `Error reading metadata file ${metadataFile} on process close:`,
          readError,
        );
        currentMetadata = metadata;
      }

      let finalSummary = currentMetadata.summary;

      if (code !== 0) {
        if (!finalSummary) {
          try {
            const logContent = await fs.readFile(logFile, "utf-8");
            finalSummary = logContent.split("\n").slice(-50).join("\n");
          } catch (logError) {
            console.error(`Error reading log file for summary: ${logError}`);
            finalSummary = "Error reading log file for summary.";
          }
        }
      }

      let newStatus = currentMetadata.status;
      if (
        currentMetadata.status !== "success" &&
        currentMetadata.status !== "error"
      ) {
        newStatus = code === 0 ? "success" : "error";
      }

      const updatedMetadata = {
        ...currentMetadata,
        status: newStatus,
        exitCode: code,
        endTime,
        summary: finalSummary,
      };

      await fs.writeFile(
        metadataFile,
        JSON.stringify(updatedMetadata, null, 2),
      );
    });

    // Return the run ID immediately
    return runId;
  } catch (error) {
    const errorTime = new Date().toISOString();
    logStream.write(`[${errorTime}] Error executing subagent: ${error}\n`);
    await new Promise((resolve) => logStream.end(resolve));

    let summary = null;
    try {
      const logContent = await fs.readFile(logFile, "utf-8");
      summary = logContent.split("\n").slice(-50).join("\n");
    } catch (logError) {
      console.error(`Error reading log file for summary: ${logError}`);
      summary = "Error reading log file for summary.";
    }

    const errorMetadata = {
      ...metadata,
      status: "error",
      error: String(error),
      endTime: errorTime,
      summary: summary,
    };

    await fs.writeFile(metadataFile, JSON.stringify(errorMetadata, null, 2));
    try {
      await fs.unlink(promptFile);
    } catch (cleanupErr) {
      // ignore
    }
    console.error(`Error executing subagent ${subagentName}:`, error);
    throw error;
  }
}
