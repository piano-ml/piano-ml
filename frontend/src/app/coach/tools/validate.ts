import type { ToolArgs, ToolSchema } from './tool';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks arguments against a flat schema of openapi/coach-tools.json, with the same rules as the server
 * (CoachArgumentValidator): no unknown property, required ones present, type, enum, minimum, maximum,
 * minLength, maxLength, pattern, uuid format. Returns the reason for the model, or null when valid.
 */
export function validateArgs(schema: ToolSchema, args: unknown): string | null {
  if (args != null && (typeof args !== 'object' || Array.isArray(args))) {
    return 'The arguments must be an object.';
  }
  const values = (args ?? {}) as ToolArgs;
  const properties = schema.properties ?? {};
  for (const name of Object.keys(values)) {
    if (!(name in properties)) {
      return `Unknown argument '${name}'. Known arguments: [${Object.keys(properties).join(', ')}].`;
    }
  }
  for (const name of schema.required ?? []) {
    if (values[name] == null) {
      return `The argument '${name}' is required.`;
    }
  }
  for (const [name, value] of Object.entries(values)) {
    if (value == null) {
      continue;
    }
    const p = properties[name];
    switch (p.type) {
      case 'string':
        if (typeof value !== 'string') return `The argument '${name}' must be a string.`;
        if (p.enum && !p.enum.includes(value)) return `The argument '${name}' must be one of [${p.enum.join(', ')}].`;
        if (p.minLength != null && value.length < p.minLength) return `The argument '${name}' must have at least ${p.minLength} characters.`;
        if (p.maxLength != null && value.length > p.maxLength) return `The argument '${name}' must have at most ${p.maxLength} characters.`;
        if (p.pattern && !new RegExp(p.pattern).test(value)) return `The argument '${name}' has an invalid format.`;
        if (p.format === 'uuid' && !UUID.test(value)) return `The argument '${name}' must be a UUID.`;
        break;
      case 'integer':
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) return `The argument '${name}' must be a number.`;
        if (p.type === 'integer' && !Number.isInteger(value)) return `The argument '${name}' must be an integer.`;
        if (p.minimum != null && value < p.minimum) return `The argument '${name}' must be at least ${p.minimum}.`;
        if (p.maximum != null && value > p.maximum) return `The argument '${name}' must be at most ${p.maximum}.`;
        break;
      case 'boolean':
        if (typeof value !== 'boolean') return `The argument '${name}' must be true or false.`;
        break;
      default:
        return `The argument '${name}' has an unsupported type.`;
    }
  }
  return null;
}
