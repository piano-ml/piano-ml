import type { ToolSchema } from './tool';
import { validateArgs } from './validate';

const SCHEMA: ToolSchema = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 20 },
    grade: { type: 'number', minimum: 0, maximum: 8 },
    sort: { type: 'string', enum: ['a', 'b'] },
    query: { type: 'string', minLength: 2, maxLength: 5 },
    slug: { type: 'string', pattern: '^[a-z-]+$' },
    id: { type: 'string', format: 'uuid' },
    flag: { type: 'boolean' },
  },
  required: ['limit'],
  additionalProperties: false,
};

describe('validateArgs (same rules as the server)', () => {
  it('accepts valid arguments', () => {
    expect(validateArgs(SCHEMA, { limit: 5 })).toBeNull();
    expect(validateArgs(SCHEMA, { limit: 5, grade: 2.5, sort: 'a', query: 'ab', slug: 'a-b', id: '123e4567-e89b-12d3-a456-426614174000', flag: true })).toBeNull();
  });

  it.each([
    [{}, 'required'],
    [{ limit: 5, userId: 'x' }, 'Unknown argument'],
    [{ limit: 0 }, 'at least'],
    [{ limit: 21 }, 'at most'],
    [{ limit: 1.5 }, 'integer'],
    [{ limit: '5' }, 'number'],
    [{ limit: 5, grade: 8.5 }, 'at most'],
    [{ limit: 5, sort: 'c' }, 'one of'],
    [{ limit: 5, query: 'a' }, 'at least 2'],
    [{ limit: 5, query: 'abcdef' }, 'at most 5'],
    [{ limit: 5, slug: 'a/b' }, 'format'],
    [{ limit: 5, id: 'nope' }, 'UUID'],
    [{ limit: 5, flag: 'true' }, 'true or false'],
  ])('refuses %j', (args, reason) => {
    expect(validateArgs(SCHEMA, args)).toContain(reason);
  });

  it('refuses arguments that are not an object', () => {
    expect(validateArgs(SCHEMA, [1])).toContain('object');
  });
});
