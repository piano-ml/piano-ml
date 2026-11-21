import type { CoachPrompt } from '../../core/api';

/** What every host needs to know about the PianoML MCP server (coach, issue #414). */
export interface ServerDescription {
  url: string;
  /** The access token, or a placeholder before one is created */
  token: string;
}

export type SnippetKind = 'generic' | 'json' | 'bridge';

export const TOKEN_PLACEHOLDER = '<your token>';

/**
 * The configuration snippets, all produced from the same description of the server: no host-specific logic.
 * - generic: what to type in any host that has a remote MCP server setting;
 * - json: a remote server entry of an mcpServers configuration file;
 * - bridge: the mcp-remote command-line bridge, for hosts that only start local servers. The header value goes
 *   through an environment variable: some hosts split arguments on spaces.
 */
export function snippet(kind: SnippetKind, server: ServerDescription): string {
  switch (kind) {
    case 'generic':
      return [
        `URL: ${server.url}`,
        'Transport: Streamable HTTP',
        `Header: Authorization: Bearer ${server.token}`,
      ].join('\n');
    case 'json':
      return JSON.stringify({
        mcpServers: {
          pianoml: { type: 'http', url: server.url, headers: { Authorization: `Bearer ${server.token}` } },
        },
      }, null, 2);
    case 'bridge':
      return JSON.stringify({
        mcpServers: {
          pianoml: {
            command: 'npx',
            args: ['-y', 'mcp-remote', server.url, '--transport', 'http-only', '--header', 'Authorization:${AUTH_HEADER}'],
            env: { AUTH_HEADER: `Bearer ${server.token}` },
          },
        },
      }, null, 2);
  }
}

/** The URL of the MCP endpoint: the API base (absolute in production, /api through the dev proxy) + /mcp. */
export function mcpUrl(apiBase: string, origin: string): string {
  const base = /^https?:\/\//.test(apiBase) ? apiBase : origin + apiBase;
  return base.replace(/\/+$/, '') + '/mcp';
}

const MAX_ARGUMENT_LENGTH = 200;
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/**
 * The prompt with its placeholders replaced, as the server does it: values as plain text on one line, cut at
 * 200 characters; an empty value falls back to the default.
 */
export function renderPrompt(prompt: CoachPrompt, values: Record<string, string>): string {
  const resolved: Record<string, string> = {};
  for (const argument of prompt.arguments) {
    const value = (values[argument.name] ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').trim().slice(0, MAX_ARGUMENT_LENGTH);
    resolved[argument.name] = value || (argument['default'] ?? '');
  }
  return prompt.text.replace(PLACEHOLDER, (whole, name: string) => (name in resolved ? resolved[name] : whole));
}

/** Copies text to the clipboard; false when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
