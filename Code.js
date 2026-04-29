/**
 * Research Tag Manager for Google Docs
 * Code.gs - Backend Script 
 */
// Allows functions to be seen by test files when running in Node environment
if (typeof module !== 'undefined') {
  module.exports = {
    onInstall: onInstall,
    onOpen: onOpen,
    showSidebar: showSidebar,
    include: include,
    refreshAllTags: refreshAllTags,
    runBackFill: runBackFill,
    promptAddIndexFolder: promptAddIndexFolder,
    promptAddIndexDocument: promptAddIndexDocument,
    addCurrentDocumentToIndexScope: addCurrentDocumentToIndexScope,
    addCurrentDocumentToIndexScopeForUi: addCurrentDocumentToIndexScopeForUi,
    addCurrentDocumentParentFolderToIndexScope: addCurrentDocumentParentFolderToIndexScope,
    addCurrentDocumentParentFolderToIndexScopeForUi: addCurrentDocumentParentFolderToIndexScopeForUi,
    showIndexScopeManagerDialog: showIndexScopeManagerDialog,
  };
}
// Add-on install hook required by Google Docs Editor Add-ons.
function onInstall(e) {
  onOpen(e);
}

// Install menu when document opens
function onOpen(e) {
  var ui = DocumentApp.getUi();
  var scopeMenu = ui.createMenu('Index Scope')
    .addItem('Manage Scope', 'showIndexScopeManagerDialog')
    .addSeparator()
    .addItem('Add Folder ID', 'promptAddIndexFolder')
    .addItem('Add Parent Folder Of Current Doc', 'addCurrentDocumentParentFolderToIndexScope')
    .addItem('Add Current Document', 'addCurrentDocumentToIndexScope')
    .addItem('Add Document ID', 'promptAddIndexDocument');

  var paperTrailMenu = (typeof ui.createAddonMenu === 'function')
    ? ui.createAddonMenu()
    : ui.createMenu('PaperTrail');

  paperTrailMenu
    .addItem('Open Tag Sidebar', 'showSidebar')
    .addItem('Refresh Tags', 'refreshAllTags')
    .addItem('Sync Indexed Docs', 'runBackFill')
    .addSubMenu(scopeMenu)
    .addSeparator()
    .addItem('Export Tagged Notes', 'showExportTaggedNotesDialog')
    .addToUi();
}

// Show the sidebar
function showSidebar() {
  // Use templated HTML so we can include external HTML snippets (like the script file)
  var template = HtmlService.createTemplateFromFile('Index');
  var html = template.evaluate()
    .setTitle('PaperTrail')
    .setWidth(360)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  DocumentApp.getUi().showSidebar(html);
}

/**
 * Include helper for HTML templates
 * Usage in HTML file: <?!= include('Scripts') ?>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Open dialog to manage index scope using document/folder URLs or IDs.
 */
function showIndexScopeManagerDialog() {
  var html = HtmlService.createHtmlOutputFromFile('ScopeManager')
    .setWidth(640)
    .setHeight(680);
  DocumentApp.getUi().showModalDialog(html, 'Manage Index Scope');
}

/**
 * Refresh all tags (called from menu)
 */
function refreshAllTags() {
  try {
    var ui = DocumentApp.getUi();
    
    // Extract tags
    var tags = extractHashtagsFromDocument();
    var indexResult = upsertDocumentTagsToIndex_(
      DocumentApp.getActiveDocument().getId(),
      DocumentApp.getActiveDocument().getName(),
      DocumentApp.getActiveDocument().getUrl(),
      tags
    );
    if (!indexResult || !indexResult.success) {
      Logger.log('Index update failed: ' + (indexResult && indexResult.error ? indexResult.error : 'Unknown error'));
    }
    var count = Object.keys(tags.tags || {}).length;
    
    if (count === 0) {
      ui.alert('No Tags Found', 'No hashtags found in the document. Start typing #tagname to create tags!', ui.ButtonSet.OK);
    } else {
      ui.alert('Tags Refreshed', 'Found ' + count + ' unique tags in the document.', ui.ButtonSet.OK);
      showSidebar();
    }
  } catch (e) {
    Logger.log('Error refreshing tags: ' + e.toString());
    DocumentApp.getUi().alert('Error', 'Failed to refresh tags: ' + e.toString(), DocumentApp.getUi().ButtonSet.OK);
  }
}

/**
 * Backfill all docs in configured content folder into the spreadsheet index.
 */
function runBackFill() {
  var ui = DocumentApp.getUi();
  try {
    var result = backfillContentFolderToIndex();
    var message =
      'Scanned: ' + result.processed + '\n' +
      'Updated: ' + result.updated + '\n' +
      'Skipped (unchanged): ' + result.skippedUnchanged + '\n' +
      'Failed: ' + result.failed + '\n' +
      'Duration: ' + result.durationMs + ' ms';

    if (result.failed > 0) {
      ui.alert('Index Sync Completed With Errors', message, ui.ButtonSet.OK);
    } else {
      ui.alert('Index Sync Completed', message, ui.ButtonSet.OK);
    }
  } catch (e) {
    Logger.log('BackFill error: ' + e.toString());
    ui.alert('Index Sync Failed', e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Prompt user for folder ID and add it to index scope.
 */
function promptAddIndexFolder() {
  var ui = DocumentApp.getUi();
  var response = ui.prompt('Add Folder To Index Scope', 'Paste Google Drive folder URL or ID:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  try {
    var result = addIndexContentFolder(response.getResponseText());
    ui.alert('Folder Added', 'Configured folders: ' + result.folderIds.length, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Failed To Add Folder', e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Add current active document to explicit index scope.
 */
function addCurrentDocumentToIndexScope() {
  var ui = DocumentApp.getUi();
  try {
    var result = addCurrentDocumentToIndexScopeForUi();
    ui.alert('Current Document Added', 'Configured explicit documents: ' + result.docIds.length, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Failed To Add Current Document', e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Add current active document to explicit index scope and return data for non-alert UI callers.
 */
function addCurrentDocumentToIndexScopeForUi() {
  var doc = DocumentApp.getActiveDocument();
  var result = addIndexExplicitDocId(doc.getId());
  result.docId = doc.getId();
  result.docName = doc.getName();
  return result;
}

/**
 * Add the parent folder of the current active document to index scope.
 */
function addCurrentDocumentParentFolderToIndexScope() {
  var ui = DocumentApp.getUi();
  try {
    var result = addCurrentDocumentParentFolderToIndexScopeForUi();
    ui.alert(
      'Parent Folder Added',
      'Added "' + result.folderName + '". Configured folders: ' + result.folderIds.length,
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('Failed To Add Parent Folder', e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Add current document parent folder and return data for non-alert UI callers.
 */
function addCurrentDocumentParentFolderToIndexScopeForUi() {
  var docId = DocumentApp.getActiveDocument().getId();
  var parents = DriveApp.getFileById(docId).getParents();

  if (!parents.hasNext()) {
    throw new Error('Current document has no parent folder.');
  }

  var parentFolder = parents.next();
  var result = addIndexContentFolderId(parentFolder.getId());
  result.folderName = parentFolder.getName();
  result.folderId = parentFolder.getId();
  return result;
}

/**
 * Prompt user for document ID and add it to explicit index scope.
 */
function promptAddIndexDocument() {
  var ui = DocumentApp.getUi();
  var response = ui.prompt('Add Document To Index Scope', 'Paste Google Doc URL or ID:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  try {
    var result = addIndexExplicitDocument(response.getResponseText());
    ui.alert('Document Added', 'Configured explicit documents: ' + result.docIds.length, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Failed To Add Document', e.toString(), ui.ButtonSet.OK);
  }
}

