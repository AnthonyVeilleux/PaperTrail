const {
  collectAllTagBlocks_,
  buildExportText_,
  getTagNamesForExport,
  getDefaultExportFolder,
  resolveFolderId,
} = require('../ExportService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    Attribute: {
      FONT_FAMILY: 'FONT_FAMILY',
      FONT_SIZE: 'FONT_SIZE',
      FOREGROUND_COLOR: 'FOREGROUND_COLOR',
      BOLD: 'BOLD',
      SPACING_AFTER: 'SPACING_AFTER',
      SPACING_BEFORE: 'SPACING_BEFORE',
    },
  };
  global.extractHashtagsFromDocument = jest.fn().mockReturnValue({ tags: {} });
  global.PropertiesService = {
    getDocumentProperties: jest.fn().mockReturnValue({
      getProperties: jest.fn().mockReturnValue({})
    })
  };
  global.getRandomColor = jest.fn().mockReturnValue('#1A73E8');
  global.DriveApp = {
    getFileById: jest.fn(),
    getFolderById: jest.fn(),
    createFile: jest.fn(),
  };
  global.Utilities = { sleep: jest.fn() };
});

// ─── collectAllTagBlocks_ ─────────────────────────────────────────────────────

describe('collectAllTagBlocks_', () => {
  function setupBody(paragraphs) {
    const body = makeBody(paragraphs);
    global.DocumentApp.getActiveDocument.mockReturnValue({ getBody: () => body });
  }

  test('returns empty object when no tag sections exist', () => {
    setupBody(['Some text', 'More text']);
    expect(collectAllTagBlocks_()).toEqual({});
  });

  test('collects block starting with matching tag header', () => {
    setupBody(['#Note This is a note', 'Detail line']);
    const map = collectAllTagBlocks_();
    expect(map['note']).toHaveLength(1);
    expect(map['note'][0]).toContain('#Note This is a note');
    expect(map['note'][0]).toContain('Detail line');
  });

  test('is case-insensitive for the tag name (keys are lowercased)', () => {
    setupBody(['#NOTE header', 'body text']);
    const map = collectAllTagBlocks_();
    expect(map['note']).toHaveLength(1);
  });

  test('stops collecting body lines when the next tag header starts', () => {
    setupBody(['#Alpha first', 'alpha body', '#Beta second', 'beta body']);
    const map = collectAllTagBlocks_();
    expect(map['alpha']).toHaveLength(1);
    expect(map['alpha'][0]).not.toContain('#Beta second');
    expect(map['beta']).toHaveLength(1);
    expect(map['beta'][0]).toContain('#Beta second');
  });

  test('collects multiple separate sections for the same tag', () => {
    setupBody([
      '#Note first note',
      'first body',
      '#Other something else',
      '#Note second note',
      'second body',
    ]);
    const map = collectAllTagBlocks_();
    expect(map['note']).toHaveLength(2);
  });

  test('deduplicates identical blocks', () => {
    setupBody(['#Note same content', '#Note same content']);
    const map = collectAllTagBlocks_();
    expect(map['note']).toHaveLength(1);
  });

  test('trims trailing blank lines from each block', () => {
    setupBody(['#Note header', 'content', '', '']);
    const map = collectAllTagBlocks_();
    expect(map['note'][0]).not.toMatch(/\n\s*$/);
  });
});

// ─── buildExportText_ ─────────────────────────────────────────────────────────

describe('buildExportText_', () => {
  beforeEach(() => {
    global.DocumentApp.getActiveDocument.mockReturnValue({
      getName: jest.fn().mockReturnValue('My Research Doc'),
    });
  });

  test('includes document name and date in header', () => {
    const text = buildExportText_([{ tag: 'MyTag', blocks: ['Note 1'] }]);
    expect(text).toContain('My Research Doc');
    expect(text).toContain(new Date().toLocaleDateString());
  });

  test('includes tag divider and block content', () => {
    const text = buildExportText_([{ tag: 'MyTag', blocks: ['Note 1'] }]);
    expect(text).toContain('── #MyTag ──');
    expect(text).toContain('Note 1');
  });

  test('joins multiple sections with blank lines', () => {
    const text = buildExportText_([
      { tag: 'A', blocks: ['Block A'] },
      { tag: 'B', blocks: ['Block B'] },
    ]);
    expect(text).toContain('Block A');
    expect(text).toContain('Block B');
  });

  test('joins multiple blocks within a section with blank lines', () => {
    const text = buildExportText_([
      { tag: 'A', blocks: ['Block 1', 'Block 2'] },
    ]);
    expect(text).toContain('Block 1');
    expect(text).toContain('Block 2');
    expect(text).toContain('Block 1\n\nBlock 2');
  });

  test('includes source link when includeSourceLink is true', () => {
    global.DocumentApp.getActiveDocument.mockReturnValue({
      getName: jest.fn().mockReturnValue('My Research Doc'),
      getUrl: jest.fn().mockReturnValue('https://docs.google.com/doc/123'),
    });
    const text = buildExportText_([{ tag: 'MyTag', blocks: ['Note 1'] }], { includeSourceLink: true });
    expect(text).toContain('Exported from: https://docs.google.com/doc/123');
  });

  test('excludes source link when includeSourceLink is false', () => {
    global.DocumentApp.getActiveDocument.mockReturnValue({
      getName: jest.fn().mockReturnValue('My Research Doc'),
      getUrl: jest.fn().mockReturnValue('https://docs.google.com/doc/123'),
    });
    const text = buildExportText_([{ tag: 'MyTag', blocks: ['Note 1'] }], { includeSourceLink: false });
    expect(text).not.toContain('Exported from:');
  });

  test('sorts sections alphabetically when sortOrder is alpha', () => {
    global.DocumentApp.getActiveDocument.mockReturnValue({
      getName: jest.fn().mockReturnValue('My Research Doc'),
    });
    const text = buildExportText_([
      { tag: 'Zebra', blocks: ['Z note'] },
      { tag: 'Alpha', blocks: ['A note'] },
    ], { sortOrder: 'alpha' });
    const alphaIndex = text.indexOf('── #Alpha ──');
    const zebraIndex = text.indexOf('── #Zebra ──');
    expect(alphaIndex).toBeLessThan(zebraIndex);
  });

  test('skips tag dividers when includeTagDividers is false', () => {
    global.DocumentApp.getActiveDocument.mockReturnValue({
      getName: jest.fn().mockReturnValue('My Research Doc'),
    });
    const text = buildExportText_([{ tag: 'MyTag', blocks: ['Note 1'] }], { includeTagDividers: false });
    expect(text).not.toContain('── #MyTag ──');
    expect(text).toContain('Note 1');
  });

  test('skips metadata header when includeMetadataHeader is false', () => {
    global.DocumentApp.getActiveDocument.mockReturnValue({
      getName: jest.fn().mockReturnValue('My Research Doc'),
    });
    const text = buildExportText_([{ tag: 'MyTag', blocks: ['Note 1'] }], { includeMetadataHeader: false });
    expect(text).not.toContain('My Research Doc');
    expect(text).toContain('── #MyTag ──');
  });
});

// ─── getTagNamesForExport ─────────────────────────────────────────────────────

describe('getTagNamesForExport', () => {
  test('returns sorted list of tag objects with counts and colors', () => {
    global.extractHashtagsFromDocument.mockReturnValue({ tags: { Zebra: 1, Alpha: 2, Mango: 1 } });
    global.PropertiesService.getDocumentProperties.mockReturnValue({
      getProperties: jest.fn().mockReturnValue({
        'tag_Alpha': JSON.stringify({ color: '#34A853' }),
        'tag_Zebra': JSON.stringify({ color: '#EA4335' })
      })
    });
    const tags = getTagNamesForExport();
    expect(tags).toEqual([
      { name: 'Alpha', count: 2, color: '#34A853' },
      { name: 'Mango', count: 1, color: '#1A73E8' },
      { name: 'Zebra', count: 1, color: '#EA4335' }
    ]);
  });

  test('returns empty array when no tags in document', () => {
    global.extractHashtagsFromDocument.mockReturnValue({ tags: {} });
    expect(getTagNamesForExport()).toEqual([]);
  });
});

// ─── getDefaultExportFolder ───────────────────────────────────────────────────

describe('getDefaultExportFolder', () => {
  test('returns first parent folder of active document', () => {
    const mockFolder = { getId: jest.fn().mockReturnValue('folder123'), getName: jest.fn().mockReturnValue('Project Folder') };
    const mockParents = { hasNext: jest.fn().mockReturnValue(true), next: jest.fn().mockReturnValue(mockFolder) };
    const mockFile = { getParents: jest.fn().mockReturnValue(mockParents) };

    global.DocumentApp.getActiveDocument.mockReturnValue({ getId: jest.fn().mockReturnValue('doc123') });
    global.DriveApp.getFileById.mockReturnValue(mockFile);

    const result = getDefaultExportFolder();
    expect(result).toEqual({ folderId: 'folder123', folderName: 'Project Folder' });
  });

  test('returns empty values when document has no parent folder', () => {
    const mockParents = { hasNext: jest.fn().mockReturnValue(false) };
    const mockFile = { getParents: jest.fn().mockReturnValue(mockParents) };

    global.DocumentApp.getActiveDocument.mockReturnValue({ getId: jest.fn().mockReturnValue('doc123') });
    global.DriveApp.getFileById.mockReturnValue(mockFile);

    const result = getDefaultExportFolder();
    expect(result).toEqual({ folderId: '', folderName: '' });
  });
});

// ─── resolveFolderId ──────────────────────────────────────────────────────────

describe('resolveFolderId', () => {
  test('resolves a raw folder ID', () => {
    const mockFolder = { getId: jest.fn().mockReturnValue('abc123'), getName: jest.fn().mockReturnValue('My Folder') };
    global.DriveApp.getFolderById.mockReturnValue(mockFolder);

    const result = resolveFolderId('abc123');
    expect(result).toEqual({ folderId: 'abc123', folderName: 'My Folder' });
  });

  test('resolves a Drive folder URL', () => {
    const mockFolder = { getId: jest.fn().mockReturnValue('xyz789'), getName: jest.fn().mockReturnValue('URL Folder') };
    global.DriveApp.getFolderById.mockReturnValue(mockFolder);

    const result = resolveFolderId('https://drive.google.com/drive/folders/xyz789');
    expect(result).toEqual({ folderId: 'xyz789', folderName: 'URL Folder' });
  });

  test('throws for an empty value', () => {
    expect(() => resolveFolderId('')).toThrow('Folder value is required.');
  });
});
