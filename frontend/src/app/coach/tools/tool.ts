/** The envelope every coach tool returns (coach, issue #414, section 4.1 of the specification). */
export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; code: string; message: string };

/** A property of a flat tool schema, as in openapi/coach-tools.json. */
export interface PropertySchema {
  type: 'string' | 'integer' | 'number' | 'boolean';
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  default?: unknown;
  description?: string;
}

export interface ToolSchema {
  type: 'object';
  properties: Record<string, PropertySchema>;
  required?: string[];
  additionalProperties: false;
}

/** One tool of the contract file. */
export interface ToolDefinition {
  name: string;
  runsIn: 'server' | 'browser';
  scopes: string[];
  timeoutSeconds: number;
  description: string;
  inputSchema: ToolSchema;
}

export type ToolArgs = Record<string, unknown>;

/** A refusal the model should see: thrown by executors, turned into an envelope by the registry. */
export class ToolError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export const ok = (data: unknown): ToolResult => ({ ok: true, data });
export const refused = (code: string, message: string): ToolResult => ({ ok: false, code, message });
