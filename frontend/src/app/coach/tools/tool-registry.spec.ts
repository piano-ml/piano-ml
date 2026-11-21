import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import contract from './tools.generated.json';
import { BROWSER_TOOLS, CoachToolRegistry, OUTPUT_CAP, cap } from './tool-registry';
import { ToolError, ok } from './tool';
import { PlayerControlService } from '../../desktop/service/player-control.service';
import { fakeWorkbench } from '../../testing/fake-workbench';

describe('CoachToolRegistry', () => {
  let registry: CoachToolRegistry;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
    registry = TestBed.inject(CoachToolRegistry);
  });

  it('has an executor for every browser tool of the contract, and none for any other name', () => {
    const browser = (contract as { name: string; runsIn: string }[]).filter(t => t.runsIn === 'browser').map(t => t.name);
    expect(browser).toHaveLength(10);
    expect(Object.keys(registry.executors).sort()).toEqual([...browser].sort());
    expect(registry.list().map(t => t.name)).toEqual(browser);
    expect(BROWSER_TOOLS.every(t => t.inputSchema.additionalProperties === false)).toBe(true);
  });

  it('refuses an unknown or server tool, and invalid arguments, before running anything', async () => {
    expect(await registry.call('get_practice_summary', {})).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    expect(await registry.call('toString', {})).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    expect(await registry.call('configure_practice', { tempoPercent: 500 })).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    expect(await registry.call('navigate', { page: 'score_info', slug: '../admin' })).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    expect(await registry.call('open_score', {})).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
  });

  it('turns refusals and crashes into envelopes; nothing escapes', async () => {
    registry.executors['get_player_state'] = () => { throw new ToolError('NO_SCORE_LOADED', 'Nothing open.'); };
    expect(await registry.call('get_player_state', {})).toEqual({ ok: false, code: 'NO_SCORE_LOADED', message: 'Nothing open.' });
    registry.executors['get_player_state'] = () => { throw new Error('secret detail'); };
    expect(await registry.call('get_player_state', {})).toEqual({ ok: false, code: 'INTERNAL', message: 'The tool failed.' });
    registry.executors['get_player_state'] = async () => Promise.reject(new Error('async failure'));
    expect(await registry.call('get_player_state', undefined)).toMatchObject({ ok: false, code: 'INTERNAL' });
  });

  it('runs a tool through the remote control', async () => {
    const workbench = fakeWorkbench();
    TestBed.inject(PlayerControlService).register(workbench.handle);
    const result = await registry.call('get_player_state', {});
    expect(result).toMatchObject({ ok: true, data: { loaded: true, item: { slug: 'prelude' } } });
  });

  it('caps the output like the server', () => {
    expect(cap(ok({ a: 1 }))).toEqual(ok({ a: 1 }));
    const capped = cap(ok('x'.repeat(20_000)));
    expect(capped).toMatchObject({ ok: true, data: { truncated: true } });
    expect(((capped as { data: { text: string } }).data.text)).toHaveLength(OUTPUT_CAP);
  });
});
