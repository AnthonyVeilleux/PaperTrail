const {
  onInstall,
  onOpen,
  showSidebar,
  include,
  refreshAllTags,
  runBackFill,
  promptAddIndexFolder,
  promptAddIndexDocument,
  addCurrentDocumentToIndexScope,
  addCurrentDocumentToIndexScopeForUi,
  addCurrentDocumentParentFolderToIndexScope,
  addCurrentDocumentParentFolderToIndexScopeForUi,
  showIndexScopeManagerDialog,
} = require('../Code');

// ─── Shared mock factories ────────────────────────────────────────────────────

function makeUi() {
  return {
    showSidebar: jest.fn(),
    showModalDialog: jest.fn(),
    alert: jest.fn(),
    prompt: jest.fn(),
    createMenu: jest.fn().mockReturnThis(),
    createAddonMenu: jest.fn().mockReturnThis(),
    addItem: jest.fn().mockReturnThis(),
    addSeparator: jest.fn().mockReturnThis(),
    addSubMenu: jest.fn().mockReturnThis(),
    addToUi: jest.fn(),
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' },
    Button: { OK: 'OK', CANCEL: 'CANCEL' },
  };
}

function makeHtmlOutput() {
  return {
    setTitle: jest.fn().mockReturnThis(),
    setWidth: jest.fn().mockReturnThis(),
    setHeight: jest.fn().mockReturnThis(),
    addMetaTag: jest.fn().mockReturnThis(),
    setXFrameOptionsMode: jest.fn().mockReturnThis(),
    getContent: jest.fn().mockReturnValue('<html></html>'),
  };
}

// ─── Global mocks ─────────────────────────────────────────────────────────────

let mockUi;
let mockHtmlOutput;
let mockTemplate;
let mockDocument;

beforeEach(() => {
  mockUi = makeUi();
  mockHtmlOutput = makeHtmlOutput();
  mockTemplate = { evaluate: jest.fn().mockReturnValue(mockHtmlOutput) };
  mockDocument = {
    getId: jest.fn().mockReturnValue('doc-id-123'),
    getName: jest.fn().mockReturnValue('My Doc'),
    getUrl: jest.fn().mockReturnValue('https://docs.google.com/doc/d/doc-id-123'),
  };

  global.DocumentApp = {
    getUi: jest.fn().mockReturnValue(mockUi),
    getActiveDocument: jest.fn().mockReturnValue(mockDocument),
  };

  global.HtmlService = {
    createTemplateFromFile: jest.fn().mockReturnValue(mockTemplate),
    createHtmlOutputFromFile: jest.fn().mockReturnValue(mockHtmlOutput),
    createHtmlOutput: jest.fn().mockReturnValue(mockHtmlOutput),
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
  };

  global.Logger = { log: jest.fn() };

  // External service stubs (defined per-test as needed)
  global.extractHashtagsFromDocument = jest.fn().mockReturnValue({ tags: {} });
  global.upsertDocumentTagsToIndex_ = jest.fn().mockReturnValue({ success: true });
  global.backfillContentFolderToIndex = jest.fn().mockReturnValue({
    processed: 5, updated: 3, skippedUnchanged: 2, failed: 0, durationMs: 100,
  });
  global.addIndexContentFolder = jest.fn().mockReturnValue({ folderIds: ['f1', 'f2'] });
  global.addIndexExplicitDocId = jest.fn().mockReturnValue({ docIds: ['d1'] });
  global.addIndexExplicitDocument = jest.fn().mockReturnValue({ docIds: ['d1', 'd2'] });
  global.addIndexContentFolderId = jest.fn().mockReturnValue({ folderIds: ['f1'], folderId: 'f1' });
  global.DriveApp = {
    getFileById: jest.fn().mockReturnValue({
      getParents: jest.fn().mockReturnValue({
        hasNext: jest.fn().mockReturnValue(true),
        next: jest.fn().mockReturnValue({
          getId: jest.fn().mockReturnValue('folder-id-1'),
          getName: jest.fn().mockReturnValue('My Folder'),
        }),
      }),
    }),
  };
});

// ─── onInstall ────────────────────────────────────────────────────────────────

describe('onInstall', () => {
  test('delegates to onOpen with the same event object', () => {
    const e = { authMode: 'FULL' };
    // onOpen will call getUi; we just verify it runs without throwing
    onInstall(e);
    expect(global.DocumentApp.getUi).toHaveBeenCalled();
  });
});

// ─── onOpen ───────────────────────────────────────────────────────────────────

describe('onOpen', () => {
  test('creates addon menu and adds it to the UI', () => {
    onOpen({});
    expect(mockUi.addToUi).toHaveBeenCalled();
  });

  test('falls back to named menu when createAddonMenu is unavailable', () => {
    delete mockUi.createAddonMenu;
    onOpen({});
    expect(mockUi.createMenu).toHaveBeenCalledWith('PaperTrail');
    expect(mockUi.addToUi).toHaveBeenCalled();
  });
});

// ─── showSidebar ──────────────────────────────────────────────────────────────

describe('showSidebar', () => {
  test('creates sidebar from template and shows it', () => {
    showSidebar();
    expect(global.HtmlService.createTemplateFromFile).toHaveBeenCalledWith('Index');
    expect(mockTemplate.evaluate).toHaveBeenCalled();
    expect(mockHtmlOutput.setTitle).toHaveBeenCalledWith('PaperTrail');
    expect(mockHtmlOutput.setWidth).toHaveBeenCalledWith(360);
    expect(mockHtmlOutput.addMetaTag).toHaveBeenCalledWith('viewport', 'width=device-width, initial-scale=1');
    expect(mockHtmlOutput.setXFrameOptionsMode).toHaveBeenCalledWith('ALLOWALL');
    expect(mockUi.showSidebar).toHaveBeenCalledWith(mockHtmlOutput);
  });
});

// ─── include ──────────────────────────────────────────────────────────────────

describe('include', () => {
  test('returns HTML content of the named file', () => {
    const result = include('Scripts');
    expect(global.HtmlService.createHtmlOutputFromFile).toHaveBeenCalledWith('Scripts');
    expect(result).toBe('<html></html>');
  });
});

// ─── showIndexScopeManagerDialog ─────────────────────────────────────────────

describe('showIndexScopeManagerDialog', () => {
  test('shows modal dialog with ScopeManager', () => {
    showIndexScopeManagerDialog();
    expect(global.HtmlService.createHtmlOutputFromFile).toHaveBeenCalledWith('ScopeManager');
    expect(mockHtmlOutput.setWidth).toHaveBeenCalledWith(640);
    expect(mockHtmlOutput.setHeight).toHaveBeenCalledWith(680);
    expect(mockUi.showModalDialog).toHaveBeenCalledWith(mockHtmlOutput, 'Manage Index Scope');
  });
});

// ─── refreshAllTags ───────────────────────────────────────────────────────────

describe('refreshAllTags', () => {
  test('alerts "No Tags Found" when document has no hashtags', () => {
    global.extractHashtagsFromDocument.mockReturnValue({ tags: {} });
    refreshAllTags();
    expect(mockUi.alert).toHaveBeenCalledWith(
      'No Tags Found',
      expect.stringContaining('No hashtags found'),
      mockUi.ButtonSet.OK
    );
  });

  test('alerts "Tags Refreshed" and opens sidebar when tags are found', () => {
    global.extractHashtagsFromDocument.mockReturnValue({ tags: { alpha: 1, beta: 2 } });
    refreshAllTags();
    expect(mockUi.alert).toHaveBeenCalledWith(
      'Tags Refreshed',
      expect.stringContaining('2 unique tags'),
      mockUi.ButtonSet.OK
    );
    expect(mockUi.showSidebar).toHaveBeenCalled();
  });

  test('alerts error when an exception is thrown', () => {
    global.extractHashtagsFromDocument.mockImplementation(() => { throw new Error('oops'); });
    refreshAllTags();
    expect(mockUi.alert).toHaveBeenCalledWith(
      'Error',
      expect.stringContaining('oops'),
      expect.anything()
    );
  });
});

// ─── runBackFill ──────────────────────────────────────────────────────────────

describe('runBackFill', () => {
  test('alerts success summary when no failures', () => {
    runBackFill();
    expect(mockUi.alert).toHaveBeenCalledWith(
      'Index Sync Completed',
      expect.stringContaining('Scanned: 5'),
      mockUi.ButtonSet.OK
    );
  });

  test('alerts with-errors title when failures > 0', () => {
    global.backfillContentFolderToIndex.mockReturnValue({
      processed: 4, updated: 2, skippedUnchanged: 1, failed: 1, durationMs: 50,
    });
    runBackFill();
    expect(mockUi.alert).toHaveBeenCalledWith(
      'Index Sync Completed With Errors',
      expect.any(String),
      mockUi.ButtonSet.OK
    );
  });

  test('alerts failure when an exception is thrown', () => {
    global.backfillContentFolderToIndex.mockImplementation(() => { throw new Error('drive error'); });
    runBackFill();
    expect(mockUi.alert).toHaveBeenCalledWith(
      'Index Sync Failed',
      expect.stringContaining('drive error'),
      mockUi.ButtonSet.OK
    );
  });
});

// ─── promptAddIndexFolder ─────────────────────────────────────────────────────

describe('promptAddIndexFolder', () => {
  test('returns early when user cancels', () => {
    mockUi.prompt.mockReturnValue({
      getSelectedButton: () => mockUi.Button.CANCEL,
      getResponseText: () => '',
    });
    promptAddIndexFolder();
    expect(global.addIndexContentFolder).not.toHaveBeenCalled();
  });

  test('adds folder and alerts success on OK', () => {
    mockUi.prompt.mockReturnValue({
      getSelectedButton: () => mockUi.Button.OK,
      getResponseText: () => 'folder-url',
    });
    promptAddIndexFolder();
    expect(global.addIndexContentFolder).toHaveBeenCalledWith('folder-url');
    expect(mockUi.alert).toHaveBeenCalledWith(
      'Folder Added',
      expect.stringContaining('2'),
      mockUi.ButtonSet.OK
    );
  });

  test('alerts failure when an exception is thrown', () => {
    mockUi.prompt.mockReturnValue({
      getSelectedButton: () => mockUi.Button.OK,
      getResponseText: () => 'bad-input',
    });
    global.addIndexContentFolder.mockImplementation(() => { throw new Error('invalid'); });
    promptAddIndexFolder();
    expect(mockUi.alert).toHaveBeenCalledWith(
      'Failed To Add Folder',
      expect.stringContaining('invalid'),
      mockUi.ButtonSet.OK
    );
  });
});

// ─── promptAddIndexDocument ───────────────────────────────────────────────────

describe('promptAddIndexDocument', () => {
  test('returns early when user cancels', () => {
    mockUi.prompt.mockReturnValue({
      getSelectedButton: () => mockUi.Button.CANCEL,
      getResponseText: () => '',
    });
    promptAddIndexDocument();
    expect(global.addIndexExplicitDocument).not.toHaveBeenCalled();
  });

  test('adds document and alerts success on OK', () => {
    mockUi.prompt.mockReturnValue({
      getSelectedButton: () => mockUi.Button.OK,
      getResponseText: () => 'doc-url',
    });
    promptAddIndexDocument();
    expect(global.addIndexExplicitDocument).toHaveBeenCalledWith('doc-url');
    expect(mockUi.alert).toHaveBeenCalledWith(
      'Document Added',
      expect.stringContaining('2'),
      mockUi.ButtonSet.OK
    );
  });

  test('alerts failure when an exception is thrown', () => {
    mockUi.prompt.mockReturnValue({
      getSelectedButton: () => mockUi.Button.OK,
      getResponseText: () => 'bad-doc',
    });
    global.addIndexExplicitDocument.mockImplementation(() => { throw new Error('not found'); });
    promptAddIndexDocument();
    expect(mockUi.alert).toHaveBeenCalledWith(
      'Failed To Add Document',
      expect.stringContaining('not found'),
      mockUi.ButtonSet.OK
    );
  });
});

// ─── addCurrentDocumentToIndexScope ──────────────────────────────────────────

describe('addCurrentDocumentToIndexScope', () => {
  test('alerts success with doc count', () => {
    global.addIndexExplicitDocId.mockReturnValue({ docIds: ['d1', 'd2'] });
    addCurrentDocumentToIndexScope();
    expect(mockUi.alert).toHaveBeenCalledWith(
      'Current Document Added',
      expect.stringContaining('2'),
      mockUi.ButtonSet.OK
    );
  });

  test('alerts failure when an exception is thrown', () => {
    global.addIndexExplicitDocId.mockImplementation(() => { throw new Error('quota exceeded'); });
    addCurrentDocumentToIndexScope();
    expect(mockUi.alert).toHaveBeenCalledWith(
      'Failed To Add Current Document',
      expect.stringContaining('quota exceeded'),
      mockUi.ButtonSet.OK
    );
  });
});

// ─── addCurrentDocumentToIndexScopeForUi ─────────────────────────────────────

describe('addCurrentDocumentToIndexScopeForUi', () => {
  test('returns result enriched with docId and docName', () => {
    global.addIndexExplicitDocId.mockReturnValue({ docIds: ['doc-id-123'] });
    const result = addCurrentDocumentToIndexScopeForUi();
    expect(global.addIndexExplicitDocId).toHaveBeenCalledWith('doc-id-123');
    expect(result.docId).toBe('doc-id-123');
    expect(result.docName).toBe('My Doc');
  });
});

// ─── addCurrentDocumentParentFolderToIndexScope ───────────────────────────────

describe('addCurrentDocumentParentFolderToIndexScope', () => {
  test('alerts success with folder name and count', () => {
    global.addIndexContentFolderId.mockReturnValue({ folderIds: ['folder-id-1'] });
    addCurrentDocumentParentFolderToIndexScope();
    expect(mockUi.alert).toHaveBeenCalledWith(
      'Parent Folder Added',
      expect.stringContaining('My Folder'),
      mockUi.ButtonSet.OK
    );
  });

  test('alerts failure when an exception is thrown', () => {
    global.DriveApp.getFileById.mockReturnValue({
      getParents: jest.fn().mockReturnValue({ hasNext: jest.fn().mockReturnValue(false) }),
    });
    addCurrentDocumentParentFolderToIndexScope();
    expect(mockUi.alert).toHaveBeenCalledWith(
      'Failed To Add Parent Folder',
      expect.stringContaining('no parent folder'),
      mockUi.ButtonSet.OK
    );
  });
});

// ─── addCurrentDocumentParentFolderToIndexScopeForUi ─────────────────────────

describe('addCurrentDocumentParentFolderToIndexScopeForUi', () => {
  test('returns result enriched with folderName and folderId', () => {
    global.addIndexContentFolderId.mockReturnValue({ folderIds: ['folder-id-1'], folderId: 'folder-id-1' });
    const result = addCurrentDocumentParentFolderToIndexScopeForUi();
    expect(result.folderName).toBe('My Folder');
    expect(result.folderId).toBe('folder-id-1');
  });

  test('throws when document has no parent folder', () => {
    global.DriveApp.getFileById.mockReturnValue({
      getParents: jest.fn().mockReturnValue({ hasNext: jest.fn().mockReturnValue(false) }),
    });
    expect(() => addCurrentDocumentParentFolderToIndexScopeForUi()).toThrow('no parent folder');
  });
});
