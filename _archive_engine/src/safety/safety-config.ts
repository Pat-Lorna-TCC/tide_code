import type { SafetyConfig } from "@tide/shared";

export const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
  approvalPolicy: {
    read: "never",
    write: "always",
    command: "disabled",
  },
  commandAllowlist: [],
  gitWriteEnabled: false,
};
