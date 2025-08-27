# Implementation Plan

- [x] 1. Update SubagentConfig interface and schemas
  - Extend the SubagentConfig interface in `src/tools/schemas.ts` to include `subagentDirectory` and `specialization` fields
  - Remove the `systemPromptFile` field and update `getArgs` to not accept parameters
  - Update TypeScript types and Zod schemas to reflect the new interface
  - _Requirements: 4.3, 4.4_

- [x] 2. Create subagent directory management utility
  - Create `src/tools/subagentDirectory.ts` with functions to manage subagent directories
  - Implement `ensureSubagentDirectory()` function to create directories if they don't exist
  - Implement `validateGeminiPromptFile()` function to check for GEMINI.md files
  - Add error handling for directory creation failures and permission issues
  - _Requirements: 2.1, 2.4_

- [x] 3. Update subagent execution to use dedicated directories
  - Modify `src/tools/run.ts` to spawn Gemini CLI from subagent directories
  - Update the `runSubagent()` function to use the `subagentDirectory` from config
  - Ensure the working directory is set to the subagent's directory before spawning the process
  - Add logging for directory operations and fallback behavior
  - _Requirements: 2.2, 2.3, 2.5_

- [x] 4. Replace existing subagent configurations with Gemini-based ones
  - Update the `SUBAGENTS` object in `src/index.ts` to remove non-Gemini agents (q, claude)
  - Add new Gemini-based subagent configurations (code-assistant, test-specialist, documentation-writer)
  - Include enhanced descriptions and specialization information for each subagent
  - Set appropriate `subagentDirectory` paths for each subagent
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3, 3.4_

- [x] 5. Create example subagent directories and GEMINI.md files
  - Create `subagents/code-assistant/` directory with sample GEMINI.md file
  - Create `subagents/test-specialist/` directory with sample GEMINI.md file  
  - Create `subagents/documentation-writer/` directory with sample GEMINI.md file
  - Write specialized system prompts for each subagent type
  - _Requirements: 2.1, 2.2_

- [x] 6. Update test configurations to use Gemini CLI
  - Modify test files in `src/*.spec.ts` to use Gemini-based test configurations
  - Create test subagent directories in `test-subagents/` for testing
  - Update mock configurations to use the new SubagentConfig interface
  - Ensure existing test patterns continue to work with the new architecture
  - _Requirements: 4.3_

- [x] 7. Add unit tests for directory management functionality
  - Write tests for `ensureSubagentDirectory()` function in new test file
  - Test directory creation, validation, and error handling scenarios
  - Test GEMINI.md file validation and missing file handling
  - Test fallback behavior when directories cannot be created
  - _Requirements: 2.4_

- [x] 8. Update integration tests for complete workflow





  - Test end-to-end subagent execution with Gemini CLI from dedicated directories
  - Verify that GEMINI.md files are properly loaded by testing subagent behavior
  - Test bi-directional communication continues to work with Gemini CLI
  - Test error scenarios like missing directories or GEMINI.md files
  - _Requirements: 1.4, 2.3, 2.4, 2.5_

- [ ] 9. Update documentation and examples
  - Update README.md to reflect the new Gemini-only architecture
  - Update CLAUDE.md with information about subagent directories and GEMINI.md files
  - Add examples of how to create new subagents with custom GEMINI.md prompts
  - Document the directory structure and configuration process
  - _Requirements: 4.1, 4.2_

- [ ] 10. Run comprehensive testing and validation
  - Execute all test suites to ensure no regressions
  - Validate that all existing MCP tools continue to work correctly
  - Test the complete workflow from subagent creation to execution
  - Verify error handling and logging work as expected
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4_