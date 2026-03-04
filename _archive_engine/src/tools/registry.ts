import type { AnyToolDefinition } from "@tide/shared";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Central registry of all available tools.
 * Tools are registered at engine startup and looked up by name during execution.
 */
export class ToolRegistry {
  private tools = new Map<string, AnyToolDefinition>();

  /** Register a tool definition. Throws if name already taken. */
  register(tool: AnyToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Get a tool by name. */
  get(name: string): AnyToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** Check if a tool is registered. */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** List all registered tools. */
  listTools(): AnyToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Generate tool descriptions for LLM system prompts.
   * Returns name, description, and JSON schema for each tool's arguments.
   */
  generateToolDescriptions(): Array<{
    name: string;
    description: string;
    parameters: unknown;
  }> {
    return this.listTools().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.argsSchema, { name: t.name }),
    }));
  }
}
