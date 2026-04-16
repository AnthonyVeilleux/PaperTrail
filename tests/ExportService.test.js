const {
  collectParagraphBlocksWithTag,
  buildExportText,
  getTagNamesForExport,
} = require('../ExportService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeParagraph(text) {
  return {
    getText: jest.fn().mockReturnValue(text),
    getType: jest.fn().mockReturnValue('PARAGRAPH'),
  };
}

function makeBody(paragraphs) {
  return {
    getNumChildren: jest.fn().mockReturnValue(paragraphs.length),
    getChild: jest.fn().mockImplementation((i) => ({
      getType: jest.fn().mockReturnValue('PARAGRAPH'),
      getText: jest.fn().mockReturnValue(paragraphs[i]),
    })),
  };
}

// ─── Global mocks ─────────────────────────────────────────────────────────────

beforeEach(() => {
  global.Logger = { log: jest.fn() };
  global.DocumentApp = {
    ElementType: { PARAGRAPH: 'PARAGRAPH', LIST_ITEM: 'LIST_ITEM' },
    getActiveDocument: jest.fn(),
  };
  global.extractHashtagsFromDocument = jest.fn().mockReturnValue({ tags: {} });
});

// ─── collectParagraphBlocksWithTag ────────────────────────────────────────────

describe('collectParagraphBlocksWithTag', () => {
  function setupBody(paragraphs) {
    const body = makeBody(paragraphs);
    global.DocumentApp.getActiveDocument.mockReturnValue({ getBody: () => body });
  }

  test('returns empty array when no matching tag section exists', () => {
    setupBody(['Some text', 'More text']);
    expect(collectParagraphBlocksWithTag('note')).toEqual([]);
  });

  test('collects block starting with the matching tag header', () => {
    setupBody(['#Note This is a note', 'Detail line']);
    const blocks = collectParagraphBlocksWithTag('Note');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('#Note This is a note');
    expect(blocks[0]).toContain('Detail line');
  });

  test('is case-insensitive for the tag name', () => {
    setupBody(['#NOTE header', 'body text']);
    const blocks = collectParagraphBlocksWithTag('note');
    expect(blocks).toHaveLength(1);
  });

  test('stops collecting body lines when the next tag header starts', () => {
    setupBody(['#Alpha first', 'alpha body', '#Beta second', 'beta body']);
    const alphaBlocks = collectParagraphBlocksWithTag('alpha');
    expect(alphaBlocks).toHaveLength(1);
    expect(alphaBlocks[0]).not.toContain('#Beta second');

    const betaBlocks = collectParagraphBlocksWithTag('beta');
    expect(betaBlocks).toHaveLength(1);
    expect(betaBlocks[0]).toContain('#Beta second');
  });

  test('collects multiple separate sections for the same tag', () => {
    setupBody([
      '#Note first note',
      'first body',
      '#Other something else',
      '#Note second note',
      'second body',
    ]);
    const blocks = collectParagraphBlocksWithTag('Note');
    expect(blocks).toHaveLength(2);
  });

  test('deduplicates identical blocks', () => {
    setupBody(['#Note same content', '#Note same content']);
    const blocks = collectParagraphBlocksWithTag('Note');
    expect(blocks).toHaveLength(1);
  });

  test('trims trailing blank lines from each block', () => {
    setupBody(['#Note header', 'content', '', '']);
    const blocks = collectParagraphBlocksWithTag('Note');
    expect(blocks[0]).not.toMatch(/\n\s*$/);
  });
});

// ─── buildExportText ──────────────────────────────────────────────────────────

describe('buildExportText', () => {
  beforeEach(() => {
    global.DocumentApp.getActiveDocument.mockReturnValue({
      getName: jest.fn().mockReturnValue('My Research Doc'),
    });
  });

  test('includes document name, tag, and export label in header', () => {
    const text = buildExportText('MyTag', ['Note 1']);
    expect(text).toContain('My Research Doc');
    expect(text).toContain('#MyTag');
    expect(text).toContain('PaperTrail Export');
  });

  test('returns "No notes found" message when notes array is empty', () => {
    const text = buildExportText('MyTag', []);
    expect(text).toContain('No notes found');
  });

  test('returns "No notes found" message when notes is null', () => {
    const text = buildExportText('MyTag', null);
    expect(text).toContain('No notes found');
  });

  test('numbers each note block starting from 1', () => {
    const text = buildExportText('tag', ['First note', 'Second note']);
    expect(text).toContain('1.');
    expect(text).toContain('2.');
    expect(text).toContain('First note');
    expect(text).toContain('Second note');
  });

  test('separates multiple blocks with blank lines', () => {
    const text = buildExportText('tag', ['Block A', 'Block B']);
    expect(text).toContain('\n\n');
  });
});

// ─── getTagNamesForExport ─────────────────────────────────────────────────────

describe('getTagNamesForExport', () => {
  test('returns sorted list of tag names from document', () => {
    global.extractHashtagsFromDocument.mockReturnValue({ tags: { Zebra: 1, Alpha: 2, Mango: 1 } });
    const names = getTagNamesForExport();
    expect(names).toEqual(['Alpha', 'Mango', 'Zebra']);
  });

  test('returns empty array when no tags in document', () => {
    global.extractHashtagsFromDocument.mockReturnValue({ tags: {} });
    expect(getTagNamesForExport()).toEqual([]);
  });
});
