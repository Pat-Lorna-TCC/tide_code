import * as fs from "node:fs";
import * as path from "node:path";
import type { SafetyConfig } from "@tide/shared";
import { DEFAULT_SAFETY_CONFIG } from "./safety-config.js";

const DEFAULT_TIDE_MD = `# TIDE.md — Workspace Configuration
# This file configures safety, test commands, and tool allowlists for Tide.

## Safety
# Approval policy for write operations: always | ask | never
write_approval: always

# Command execution: disabled | always | allowlist
command_policy: disabled

# Git write operations (push, commit, etc.)
git_write: false

## Command Allowlist
# Commands allowed when command_policy is "allowlist" (one per line):
# allowlist: pnpm test
# allowlist: pnpm build

## Test Commands
# Confirmed test commands for this workspace:
# test: pnpm test
`;

/**
 * Load safety configuration from TIDE.md at workspace root.
 * Creates a default TIDE.md if not present.
 */
export function loadTideMd(workspaceRoot: string): SafetyConfig {
  const tideMdPath = path.join(workspaceRoot, "TIDE.md");

  if (!fs.existsSync(tideMdPath)) {
    try {
      fs.writeFileSync(tideMdPath, DEFAULT_TIDE_MD, "utf-8");
      console.log("[safety] Created default TIDE.md at", tideMdPath);
    } catch (err) {
      console.warn("[safety] Could not create TIDE.md:", err);
    }
    return { ...DEFAULT_SAFETY_CONFIG };
  }

  try {
    const content = fs.readFileSync(tideMdPath, "utf-8");
    return parseTideMd(content);
  } catch (err) {
    console.warn("[safety] Error reading TIDE.md, using defaults:", err);
    return { ...DEFAULT_SAFETY_CONFIG };
  }
}

/** Parse TIDE.md content into SafetyConfig. */
function parseTideMd(content: string): SafetyConfig {
  const config: SafetyConfig = {
    approvalPolicy: {
      read: "never",
      write: "always",
      command: "disabled",
    },
    commandAllowlist: [],
    gitWriteEnabled: false,
  };

  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed.length === 0) continue;

    const [key, ...valueParts] = trimmed.split(":");
    const value = valueParts.join(":").trim();
    if (!key || !value) continue;

    switch (key.trim()) {
      case "write_approval": {
        if (value === "always" || value === "ask" || value === "never") {
          config.approvalPolicy.write = value;
        }
        break;
      }
      case "command_policy": {
        if (value === "disabled" || value === "always" || value === "allowlist") {
          config.approvalPolicy.command = value;
        }
        break;
      }
      case "git_write": {
        config.gitWriteEnabled = value === "true";
        break;
      }
      case "allowlist": {
        config.commandAllowlist.push(value);
        break;
      }
    }
  }

  return config;
}
