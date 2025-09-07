import { z } from "zod";

export interface SubagentConfig {
  name: string;
  command: string;
  getArgs: () => string[];
  description: string;
  subagentDirectory: string;
  specialization: string;
}

export const SubagentConfigSchema = z.object({
  name: z.string().min(1, "Subagent name cannot be empty"),
  command: z.string().min(1, "Command cannot be empty"),
  getArgs: z.function().returns(z.array(z.string())),
  description: z.string().min(1, "Description cannot be empty"),
  subagentDirectory: z.string().min(1, "Subagent directory path cannot be empty"),
  specialization: z.string().min(1, "Specialization cannot be empty"),
});

export const RunSubagentArgumentsSchema = z.object({
  input: z.string().min(1, "Input cannot be empty"),
  project_directory: z.string().min(1, "Main agent project directory path"),
  subagent_name: z.string().min(1, "Name of the subagent to execute"),
  model: z.string().optional().default("gemini-2.5-flash")
});

export const CheckSubagentStatusArgumentsSchema = z.object({
  runId: z.string().uuid("Run ID must be a valid UUID"),
});

export const GetSubagentLogsArgumentsSchema = z.object({
  runId: z.string().uuid("Run ID must be a valid UUID"),
});

export const UpdateSubagentStatusArgumentsSchema = z.object({
  runId: z.string().uuid("Run ID must be a valid UUID"),
  status: z.enum(["success", "error", "running", "completed"]),
  summary: z.string().optional(),
});

// CommunicationMessage schema and MetaFileContent schema (bi-directional communication design)

export const CommunicationMessageSchema = z.object({
  messageId: z.string(),
  questionContent: z.string(),
  questionTimestamp: z.string(),
  answerContent: z.string().optional(),
  answerTimestamp: z.string().optional(),
  messageStatus: z.enum([
    "pending_parent_reply",
    "parent_replied",
    "parent_acknowledged",
    "acknowledged_by_subagent",
  ]),
});
export type CommunicationMessage = z.infer<typeof CommunicationMessageSchema>;

export const MetaFileContentSchema = z.object({
  runId: z.string().optional(),
  agentName: z.string().optional(),
  status: z
    .enum([
      "pending",
      "running",
      "completed",
      "error",
      "success",
      "waiting_parent_reply",
      "parent_replied",
    ])
    .optional(),
  messages: z.array(CommunicationMessageSchema).optional(),
  // Other standard metadata fields
  command: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().nullable().optional(),
  exitCode: z.number().nullable().optional(),
  summary: z.string().nullable().optional(),
  lastUpdated: z.string().optional(),
});
export type MetaFileContent = z.infer<typeof MetaFileContentSchema>;
