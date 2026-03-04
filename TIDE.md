# TIDE.md — Workspace Safety Config
# This file is read by tide-safety.ts on each Pi session start.

## Safety Policy

approval_policy:
  read: never          # Read tools never need approval
  write: always        # Write/edit tools always need approval
  command: disabled    # Bash/command execution disabled by default

## Command Allowlist
# Commands listed here are allowed when command policy is set to "allowlist".
# Format: one command per line
command_allowlist:

## Test Commands
# Confirmed test commands for this workspace (written by test discovery skill).
# Format: one command per line
test_commands:
