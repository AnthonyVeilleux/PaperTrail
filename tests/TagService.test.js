const {
  extractHashtagsFromText_,
  escapeRegex,
  escapeTagForRegex,
  isTagBoundary,
  getRandomColor,
} = require('../TagService');

// ─── Globals required by TagService ──────────────────────────────────────────

beforeEach(() => {
  global.Utilities = {
    base64Encode: jest.fn().mockReturnValue('mockedhash=='),
    computeDigest: jest.fn().mockReturnValue([1, 2, 3]),
    DigestAlgorithm: { MD5: 'MD5' },
  };
  global.Logger = { log: jest.fn() };
});

// ─── extractHashtagsFromText_ ─────────────────────────────────────────────────

describe('extractHashtagsFromText_', () => {
  test('returns empty tags and hierarchy for text with no hashtags', () => {
    const result = extractHashtagsFromText_('No tags here');
    expect(result.tags).toEqual({});
    expect(result.hierarchy).toEqual({});
  });

  test('extracts a single simple hashtag', () => {
    const result = extractHashtagsFromText_('Hello #World today');
    expect(result.tags).toEqual({ World: 1 });
    expect(result.hierarchy).toEqual({});
  });

  test('counts multiple occurrences of the same hashtag', () => {
    const result = extractHashtagsFromText_('#alpha and #alpha again and #alpha');
    expect(result.tags['alpha']).toBe(3);
  });

  test('counts distinct hashtags independently', () => {
    const result = extractHashtagsFromText_('#alpha #beta #gamma');
    expect(result.tags).toEqual({ alpha: 1, beta: 1, gamma: 1 });
  });

  test('extracts nested tags and builds hierarchy', () => {
    const result = extractHashtagsFromText_('#Parent.Child');
    expect(result.tags['Parent.Child']).toBe(1);
    expect(result.hierarchy['Parent']).toContain('Parent.Child');
  });

  test('builds multi-level hierarchy for deeply nested tags', () => {
    const result = extractHashtagsFromText_('#A.B.C');
    expect(result.tags['A.B.C']).toBe(1);
    expect(result.hierarchy['A']).toContain('A.B');
    expect(result.hierarchy['A.B']).toContain('A.B.C');
  });

  test('does not duplicate children in hierarchy when tag appears twice', () => {
    const result = extractHashtagsFromText_('#A.B #A.B');
    expect(result.hierarchy['A']).toEqual(['A.B']);
  });

  test('handles null/undefined input gracefully', () => {
    expect(() => extractHashtagsFromText_(null)).not.toThrow();
    expect(() => extractHashtagsFromText_(undefined)).not.toThrow();
    const result = extractHashtagsFromText_(null);
    expect(result.tags).toEqual({});
  });

  test('returns a textSignature field', () => {
    const result = extractHashtagsFromText_('#tag');
    expect(result).toHaveProperty('textSignature');
  });
});

// ─── escapeRegex ──────────────────────────────────────────────────────────────

describe('escapeRegex', () => {
  test('escapes regex special characters', () => {
    expect(escapeRegex('a.b')).toBe('a\\.b');
    expect(escapeRegex('a*b')).toBe('a\\*b');
    expect(escapeRegex('a+b')).toBe('a\\+b');
    expect(escapeRegex('a?b')).toBe('a\\?b');
    expect(escapeRegex('(test)')).toBe('\\(test\\)');
    expect(escapeRegex('a[b]')).toBe('a\\[b\\]');
  });

  test('leaves plain alphanumeric strings unchanged', () => {
    expect(escapeRegex('hello123')).toBe('hello123');
  });

  test('escapes backslash', () => {
    expect(escapeRegex('a\\b')).toBe('a\\\\b');
  });
});

// ─── escapeTagForRegex ────────────────────────────────────────────────────────

describe('escapeTagForRegex', () => {
  test('delegates to escapeRegex', () => {
    expect(escapeTagForRegex('Tag.Name')).toBe('Tag\\.Name');
    expect(escapeTagForRegex('plain')).toBe('plain');
  });
});

// ─── isTagBoundary ────────────────────────────────────────────────────────────

describe('isTagBoundary', () => {
  test('returns true when endIndex is at the last character', () => {
    expect(isTagBoundary('hello', 4)).toBe(true);
  });

  test('returns true when endIndex is past the last character', () => {
    expect(isTagBoundary('hi', 5)).toBe(true);
  });

  test('returns true when next char is a space', () => {
    expect(isTagBoundary('#tag rest', 3)).toBe(true); // char after index 3 is ' '
  });

  test('returns false when next char is a word character', () => {
    // text = '#tagmore', endIndex = 3 => char at 4 is 'm'
    expect(isTagBoundary('#tagmore', 3)).toBe(false);
  });

  test('returns false when next char is a dot (nested tag continues)', () => {
    // text = '#A.B', endIndex = 1 => char at 2 is '.'
    expect(isTagBoundary('#A.B', 1)).toBe(false);
  });
});

// ─── getRandomColor ───────────────────────────────────────────────────────────

describe('getRandomColor', () => {
  const VALID_COLORS = ['#1A73E8', '#34A853', '#FBBC04', '#EA4335', '#9334E9', '#0891B2'];

  test('returns one of the known palette colors', () => {
    for (let i = 0; i < 20; i++) {
      expect(VALID_COLORS).toContain(getRandomColor());
    }
  });
});
