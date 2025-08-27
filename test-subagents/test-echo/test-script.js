#!/usr/bin/env node

// Simple test script that simulates Gemini CLI behavior
console.log("Test status subagent started");

// Read input from stdin (simulating how Gemini CLI would work)
let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  console.log("Received input:", input.substring(0, 100) + "...");
  console.log("Processing test task...");
  
  // Simulate some processing time
  setTimeout(() => {
    console.log("Test task completed successfully");
    console.log("Status updated to: completed");
    console.log("Summary: The task was completed successfully by Vitest.");
    process.exit(0);
  }, 800);
});

// Handle process termination
process.on('SIGTERM', () => {
  console.log("Process terminated");
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log("Process interrupted");
  process.exit(0);
});