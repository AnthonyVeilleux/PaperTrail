/**
 * Research Tag Manager for Google Docs
 * Code.gs - Backend Script 
 */
// Allows functions to be seen by test files when running in Node environment
if (typeof module !== 'undefined') {
  module.exports = {
    hideSidebar: hideSidebar,
    showSidebar: showSidebar,
  };
}
// Install menu when document opens
function onOpen() {
  var ui = DocumentApp.getUi();
  var scopeMenu = ui.createMenu('Index Scope')
    .addItem('Add Folder ID', 'promptAddIndexFolder')
    .addItem('Add Current Document', 'addCurrentDocumentToIndexScope')
    .addItem('Add Document ID', 'promptAddIndexDocument');

  ui.createMenu('PaperTrail')
    .addItem('Open Tag Sidebar', 'showSidebar')
    .addItem('Refresh Tags', 'refreshAllTags')
    .addItem('Update Database', 'runBackFill')
    .addSubMenu(scopeMenu)
    .addSeparator()
    .addItem('Export Tagged Notes', 'showExportTaggedNotesDialog')
    .addToUi();
  
  // Display keyboard shortcut hint to user
  var ui = DocumentApp.getUi();
  ui.showModelessDialog(
    HtmlService.createHtmlOutput('<p style=\"padding:8px;font-size:12px;\"><strong>💡 Tips:</strong><br>• Press <kbd style=\"background:#f0f0f0;padding:2px 6px;border-radius:3px;border:1px solid #ccc;\">Shift+K</kbd> to toggle sidebar</p>')
      .setWidth(350)
      .setHeight(60),
    'Tag Manager Tips'
  );
}

// Show the sidebar
function showSidebar() {
  // Use templated HTML so we can include external HTML snippets (like the script file)
  var template = HtmlService.createTemplateFromFile('Index');
  var html = template.evaluate()
    .setTitle('Tag Manager')
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

// Hide/close the sidebar (called via Ctrl+K from document or sidebar)
function hideSidebar() {
  DocumentApp.getUi().clear();
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
      'Processed: ' + result.processed + '\n' +
      'Updated: ' + result.updated + '\n' +
      'Skipped (unchanged): ' + result.skippedUnchanged + '\n' +
      'Failed: ' + result.failed + '\n' +
      'Duration: ' + result.durationMs + ' ms';

    if (result.failed > 0) {
      ui.alert('BackFill Completed With Errors', message, ui.ButtonSet.OK);
    } else {
      ui.alert('BackFill Completed', message, ui.ButtonSet.OK);
    }
  } catch (e) {
    Logger.log('BackFill error: ' + e.toString());
    ui.alert('BackFill Failed', e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Prompt user for folder ID and add it to index scope.
 */
function promptAddIndexFolder() {
  var ui = DocumentApp.getUi();
  var response = ui.prompt('Add Folder To Index Scope', 'Paste Google Drive folder ID:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  try {
    var result = addIndexContentFolderId(response.getResponseText());
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
    var result = addIndexExplicitDocId(DocumentApp.getActiveDocument().getId());
    ui.alert('Current Document Added', 'Configured explicit documents: ' + result.docIds.length, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Failed To Add Current Document', e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Prompt user for document ID and add it to explicit index scope.
 */
function promptAddIndexDocument() {
  var ui = DocumentApp.getUi();
  var response = ui.prompt('Add Document To Index Scope', 'Paste Google Doc ID:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  try {
    var result = addIndexExplicitDocId(response.getResponseText());
    ui.alert('Document Added', 'Configured explicit documents: ' + result.docIds.length, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Failed To Add Document', e.toString(), ui.ButtonSet.OK);
  }
}

