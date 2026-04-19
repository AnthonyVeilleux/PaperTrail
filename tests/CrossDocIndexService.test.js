const {
  dedupeStringList_,
  normalizeDriveFolderId_,
  normalizeGoogleDocId_,
  normalizeGoogleResourceId_,
  searchIndexedDocsByTag,
  searchIndexedDocsByTags,
} = require('../CrossDocIndexService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a fake sheet whose getDataRange().getValues() returns the given rows.
 * Row 0 should be the header row; data starts at row 1.
 */
function makeSheet(rows) {
  return {
    getDataRange: jest.fn().mockReturnValue({
      getValues: jest.fn().mockReturnValue(rows),
    }),
    getLastRow: jest.fn().mockReturnValue(rows.length),
    getRange: jest.fn().mockReturnValue({
      getValues: jest.fn().mockReturnValue(rows),
      setValues: jest.fn(),
    }),
    deleteRow: jest.fn(),
    insertSheet: jest.fn(),
    setFrozenRows: jest.fn(),
  };
}

const HEADERS = ['tag', 'docId', 'docTitle', 'docUrl', 'tagCountInDoc', 'textSignature', 'lastSeenAt'];

function makeRow(tag, docId, docTitle, docUrl, count, sig, date) {
  return [tag, docId, docTitle || 'Doc', docUrl || 'http://doc', count || 1, sig || '', date || ''];
}

// ─── Global mocks ─────────────────────────────────────────────────────────────

let mockSheet;

beforeEach(() => {
  mockSheet = makeSheet([HEADERS]);

  global.Logger = { log: jest.fn() };
  global.LockService = {
    getScriptLock: jest.fn().mockReturnValue({
      waitLock: jest.fn(),
      releaseLock: jest.fn(),
    }),
  };
  global.SpreadsheetApp = {
    openById: jest.fn().mockReturnValue({ getSheetByName: jest.fn().mockReturnValue(mockSheet) }),
    create: jest.fn().mockReturnValue({
      getId: jest.fn().mockReturnValue('spreadsheet-id'),
      getSheetByName: jest.fn().mockReturnValue(mockSheet),
      insertSheet: jest.fn().mockReturnValue(mockSheet),
    }),
  };
  global.PropertiesService = {
    getScriptProperties: jest.fn().mockReturnValue({
      getProperty: jest.fn().mockReturnValue('spreadsheet-id'),
      setProperty: jest.fn(),
      deleteProperty: jest.fn(),
    }),
    getDocumentProperties: jest.fn().mockReturnValue({
      getProperty: jest.fn().mockReturnValue(null),
      setProperty: jest.fn(),
    }),
  };
  global.DriveApp = {
    searchFiles: jest.fn().mockReturnValue({ hasNext: jest.fn().mockReturnValue(false) }),
  };
});

// ─── dedupeStringList_ ────────────────────────────────────────────────────────

describe('dedupeStringList_', () => {
  test('removes duplicate strings', () => {
    expect(dedupeStringList_(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  test('trims whitespace and dedupes trimmed values', () => {
    expect(dedupeStringList_(['  a  ', 'a'])).toEqual(['a']);
  });

  test('filters out empty strings', () => {
    expect(dedupeStringList_(['a', '', '  ', 'b'])).toEqual(['a', 'b']);
  });

  test('returns empty array for non-array input', () => {
    expect(dedupeStringList_(null)).toEqual([]);
    expect(dedupeStringList_(undefined)).toEqual([]);
    expect(dedupeStringList_('string')).toEqual([]);
  });

  test('returns empty array for empty input', () => {
    expect(dedupeStringList_([])).toEqual([]);
  });

  test('preserves order of first occurrence', () => {
    expect(dedupeStringList_(['c', 'a', 'b', 'a'])).toEqual(['c', 'a', 'b']);
  });
});

// ─── normalizeDriveFolderId_ ──────────────────────────────────────────────────

describe('normalizeDriveFolderId_', () => {
  test('extracts folder ID from a Drive URL', () => {
    const url = 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXy';
    expect(normalizeDriveFolderId_(url)).toBe('1aBcDeFgHiJkLmNoPqRsTuVwXy');
  });

  test('returns raw ID when given a plain ID string', () => {
    expect(normalizeDriveFolderId_('1aBcDeFgHiJkLmNoPqRsTuVwXy')).toBe('1aBcDeFgHiJkLmNoPqRsTuVwXy');
  });

  test('returns empty string for empty input', () => {
    expect(normalizeDriveFolderId_('')).toBe('');
    expect(normalizeDriveFolderId_(null)).toBe('');
  });

  test('returns empty string for a short string that is not a valid ID', () => {
    expect(normalizeDriveFolderId_('short')).toBe('');
  });
});

// ─── normalizeGoogleDocId_ ────────────────────────────────────────────────────

describe('normalizeGoogleDocId_', () => {
  test('extracts doc ID from a Google Docs URL', () => {
    const url = 'https://docs.google.com/document/d/1aBcDeFgHiJkLmNoPqRsTuVwXy/edit';
    expect(normalizeGoogleDocId_(url)).toBe('1aBcDeFgHiJkLmNoPqRsTuVwXy');
  });

  test('returns raw ID when given a plain ID string', () => {
    expect(normalizeGoogleDocId_('1aBcDeFgHiJkLmNoPqRsTuVwXy')).toBe('1aBcDeFgHiJkLmNoPqRsTuVwXy');
  });

  test('returns empty string for empty or null input', () => {
    expect(normalizeGoogleDocId_('')).toBe('');
    expect(normalizeGoogleDocId_(null)).toBe('');
  });

  test('does not accidentally match folder URLs', () => {
    const folderUrl = 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXy';
    // No /document/d/ segment, so falls back to raw ID heuristic — still returns the ID portion
    const result = normalizeGoogleDocId_(folderUrl);
    // Should NOT pull the folder-path segment via doc regex; may still find the ID via fallback
    expect(result).not.toBe('folders');
  });
});

// ─── normalizeGoogleResourceId_ ──────────────────────────────────────────────

describe('normalizeGoogleResourceId_', () => {
  test('prefers a URL regex match over the fallback ID pattern', () => {
    const url = 'https://drive.google.com/drive/folders/FOLDER_ID_VALUE_HERE_XYZ12';
    const result = normalizeGoogleResourceId_(url, /\/folders\/([a-zA-Z0-9_-]+)/);
    expect(result).toBe('FOLDER_ID_VALUE_HERE_XYZ12');
  });

  test('falls back to bare ID when URL regex does not match', () => {
    const result = normalizeGoogleResourceId_('1aBcDeFgHiJkLmNoPqRsTuVwXy', /\/folders\/([a-zA-Z0-9_-]+)/);
    expect(result).toBe('1aBcDeFgHiJkLmNoPqRsTuVwXy');
  });

  test('returns empty string when input is empty', () => {
    expect(normalizeGoogleResourceId_('', /\/folders\/([a-zA-Z0-9_-]+)/)).toBe('');
  });
});

// ─── searchIndexedDocsByTag ───────────────────────────────────────────────────

describe('searchIndexedDocsByTag', () => {
  function setupSheet(dataRows) {
    mockSheet = makeSheet([HEADERS, ...dataRows]);
    global.SpreadsheetApp.openById.mockReturnValue({
      getSheetByName: jest.fn().mockReturnValue(mockSheet),
    });
  }

  test('returns empty array when no rows match', () => {
    setupSheet([makeRow('alpha', 'doc1')]);
    expect(searchIndexedDocsByTag('beta')).toEqual([]);
  });

  test('returns empty array for empty tag input', () => {
    setupSheet([makeRow('alpha', 'doc1')]);
    expect(searchIndexedDocsByTag('')).toEqual([]);
    expect(searchIndexedDocsByTag(null)).toEqual([]);
  });

  test('matches case-insensitively', () => {
    setupSheet([makeRow('Alpha', 'doc1', 'Doc 1', 'http://doc1', 3)]);
    const results = searchIndexedDocsByTag('ALPHA');
    expect(results).toHaveLength(1);
    expect(results[0].docId).toBe('doc1');
  });

  test('strips leading # from search input', () => {
    setupSheet([makeRow('mytag', 'doc1')]);
    const results = searchIndexedDocsByTag('#mytag');
    expect(results).toHaveLength(1);
  });

  test('returns correct fields on matched row', () => {
    setupSheet([makeRow('note', 'docABC', 'My Doc', 'https://docs.google.com/abc', 5, 'sig123', '2026-01-01')]);
    const [result] = searchIndexedDocsByTag('note');
    expect(result).toMatchObject({
      tag: 'note',
      docId: 'docABC',
      docTitle: 'My Doc',
      docUrl: 'https://docs.google.com/abc',
      tagCountInDoc: 5,
    });
  });

  test('returns multiple documents that share the same tag', () => {
    setupSheet([
      makeRow('research', 'doc1'),
      makeRow('research', 'doc2'),
      makeRow('other', 'doc3'),
    ]);
    expect(searchIndexedDocsByTag('research')).toHaveLength(2);
  });
});

// ─── searchIndexedDocsByTags ──────────────────────────────────────────────────

describe('searchIndexedDocsByTags', () => {
  function setupSheet(dataRows) {
    mockSheet = makeSheet([HEADERS, ...dataRows]);
    global.SpreadsheetApp.openById.mockReturnValue({
      getSheetByName: jest.fn().mockReturnValue(mockSheet),
    });
  }

  test('returns empty array for empty tag list', () => {
    setupSheet([makeRow('alpha', 'doc1')]);
    expect(searchIndexedDocsByTags([])).toEqual([]);
    expect(searchIndexedDocsByTags(null)).toEqual([]);
  });

  test('AND mode returns only documents matching ALL requested tags', () => {
    setupSheet([
      makeRow('alpha', 'doc1'),
      makeRow('beta', 'doc1'),
      makeRow('alpha', 'doc2'), // doc2 only has alpha, not beta
    ]);
    const results = searchIndexedDocsByTags(['alpha', 'beta'], 'AND');
    expect(results).toHaveLength(1);
    expect(results[0].docId).toBe('doc1');
  });

  test('OR mode returns documents matching ANY of the requested tags', () => {
    setupSheet([
      makeRow('alpha', 'doc1'),
      makeRow('beta', 'doc2'),
      makeRow('gamma', 'doc3'),
    ]);
    const results = searchIndexedDocsByTags(['alpha', 'beta'], 'OR');
    expect(results).toHaveLength(2);
    const docIds = results.map((r) => r.docId);
    expect(docIds).toContain('doc1');
    expect(docIds).toContain('doc2');
  });

  test('defaults to AND mode when mode is omitted', () => {
    setupSheet([
      makeRow('alpha', 'doc1'),
      makeRow('beta', 'doc1'),
      makeRow('alpha', 'doc2'),
    ]);
    const results = searchIndexedDocsByTags(['alpha', 'beta']);
    expect(results).toHaveLength(1);
    expect(results[0].docId).toBe('doc1');
  });

  test('sorts by matchCount descending', () => {
    setupSheet([
      makeRow('alpha', 'doc2'),
      makeRow('alpha', 'doc1'),
      makeRow('beta', 'doc1'),
    ]);
    const results = searchIndexedDocsByTags(['alpha', 'beta'], 'OR');
    expect(results[0].docId).toBe('doc1'); // matched both, higher matchCount
  });

  test('deduplicates tags in the input list', () => {
    setupSheet([
      makeRow('alpha', 'doc1'),
      makeRow('beta', 'doc1'),
    ]);
    // Passing alpha twice should still only count as 1 required tag
    const results = searchIndexedDocsByTags(['alpha', 'alpha', 'beta'], 'AND');
    expect(results).toHaveLength(1);
  });

  test('is case-insensitive for both input tags and index tags', () => {
    setupSheet([makeRow('Alpha', 'doc1')]);
    const results = searchIndexedDocsByTags(['ALPHA'], 'OR');
    expect(results).toHaveLength(1);
  });

  test('strips leading # from tag inputs', () => {
    setupSheet([makeRow('note', 'doc1')]);
    const results = searchIndexedDocsByTags(['#note'], 'OR');
    expect(results).toHaveLength(1);
  });

  test('accumulates tagCountInDoc across multiple tag matches for same doc', () => {
    setupSheet([
      makeRow('alpha', 'doc1', 'D', 'u', 3),
      makeRow('beta', 'doc1', 'D', 'u', 7),
    ]);
    const results = searchIndexedDocsByTags(['alpha', 'beta'], 'AND');
    expect(results[0].tagCountInDoc).toBe(10);
  });
});
