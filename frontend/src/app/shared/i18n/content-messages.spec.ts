import shaders from '../../../assets/shader/manifest.json' with { type: 'json' };
import songs from '../../../assets/midi/manifest.json' with { type: 'json' };
import { difficultyLabel, shaderDescription, songDescription } from './content-messages';

/** Content manifests stay English JSON; their visible text is looked up in a translated table. */
describe('content manifest text', () => {
  it('has an entry for every shader and song in the manifests, with the same English text', () => {
    for (const shader of shaders.shaders) expect(shaderDescription(shader.id), `shader ${shader.id}`).toBe(shader.description);
    for (const song of songs) expect(songDescription(song.filename, 'fallback'), song.filename).toBe(song.description);
  });

  it('falls back to the manifest text for something not in the table yet', () => {
    expect(shaderDescription(99, 'A new shader')).toBe('A new shader');
    expect(shaderDescription(99)).toBe('No description available');
    expect(songDescription('new-song.mid', 'A new song')).toBe('A new song');
  });

  it('translates difficulty levels as a fixed list', () => {
    expect(['beginner', 'intermediate', 'advanced'].map(difficultyLabel)).toEqual(['beginner', 'intermediate', 'advanced']);
    expect(difficultyLabel('expert')).toBe('expert');
    for (const song of songs) expect(difficultyLabel(song.difficulty)).toBe(song.difficulty);
  });
});
