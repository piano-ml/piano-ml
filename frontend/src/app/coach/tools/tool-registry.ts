import { Injectable, inject } from '@angular/core';
import contract from './tools.generated.json';
import { PlayerTools } from './player-tools';
import { SelectionTools } from './selection-tools';
import { type ToolArgs, type ToolDefinition, ToolError, type ToolResult, ok, refused } from './tool';
import { validateArgs } from './validate';

/** Above this many characters, a result is replaced by its truncated text (as on the server). */
export const OUTPUT_CAP = 16_000;

type Executor = (args: ToolArgs) => unknown;

/** The browser tools of the contract file: the ones the remote coach runs in this tab. */
export const BROWSER_TOOLS: ToolDefinition[] = (contract as ToolDefinition[]).filter(t => t.runsIn === 'browser');

/**
 * Runs the browser tools of openapi/coach-tools.json by name (coach, issue #414): arguments checked against the
 * schema of the contract, refusals and crashes turned into envelopes (nothing escapes: uncaught errors are
 * reported to the backend), output capped.
 */
@Injectable({ providedIn: 'root' })
export class CoachToolRegistry {
  private readonly player = inject(PlayerTools);
  private readonly selection = inject(SelectionTools);

  readonly executors: Record<string, Executor> = {
    get_player_state: () => this.player.getPlayerState(),
    list_exercises: () => this.selection.listExercises(),
    open_score: args => this.selection.openScore(args),
    open_exercise: args => this.selection.openExercise(args),
    configure_practice: args => this.player.configurePractice(args),
    play: args => this.player.play(args),
    stop: () => this.player.stop(),
    wait_for_take_end: args => this.player.waitForTakeEnd(args),
    get_current_session: () => this.player.getCurrentSession(),
    navigate: args => this.selection.navigate(args),
  };

  list(): ToolDefinition[] {
    return BROWSER_TOOLS;
  }

  async call(name: string, args: unknown): Promise<ToolResult> {
    const definition = BROWSER_TOOLS.find(t => t.name === name);
    const executor = Object.hasOwn(this.executors, name) ? this.executors[name] : undefined;
    if (!definition || !executor) {
      return refused('INVALID_ARGUMENT', `Unknown tool '${name}'.`);
    }
    const invalid = validateArgs(definition.inputSchema, args);
    if (invalid) {
      return refused('INVALID_ARGUMENT', invalid);
    }
    try {
      return cap(ok(await executor((args ?? {}) as ToolArgs)));
    } catch (e) {
      if (e instanceof ToolError) {
        return refused(e.code, e.message);
      }
      return refused('INTERNAL', 'The tool failed.');
    }
  }
}

/** The result, or its first 16 000 serialized characters when longer. */
export function cap(result: ToolResult): ToolResult {
  const json = JSON.stringify(result);
  return json.length <= OUTPUT_CAP ? result : ok({ truncated: true, text: json.slice(0, OUTPUT_CAP) });
}
