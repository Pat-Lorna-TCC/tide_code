import type { ToolRegistry } from "../registry.js";
import { fsListTool } from "./fs_list.js";
import { fsReadTool } from "./fs_read.js";
import { fsStatTool } from "./fs_stat.js";
import { ripgrepTool } from "./ripgrep.js";
import { gitStatusTool } from "./git_status.js";
import { gitDiffTool } from "./git_diff.js";
import { gitLogTool } from "./git_log.js";
import { fsWriteTool } from "./fs_write.js";
import { applyPatchTool } from "./apply_patch.js";
import { runCommandTool } from "./run_command.js";

/** Register all built-in tools with the given registry. */
export function registerAllTools(registry: ToolRegistry): void {
  // Read-only
  registry.register(fsListTool);
  registry.register(fsReadTool);
  registry.register(fsStatTool);
  registry.register(ripgrepTool);
  registry.register(gitStatusTool);
  registry.register(gitDiffTool);
  registry.register(gitLogTool);

  // Write (approval-gated)
  registry.register(fsWriteTool);
  registry.register(applyPatchTool);

  // Command (disabled by default)
  registry.register(runCommandTool);
}
