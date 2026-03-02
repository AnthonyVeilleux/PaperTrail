/**
 * Research Tag Manager for Google Docs
 * Code.gs - Backend Script 
 */

// Install menu when document opens
function onOpen() {
  DocumentApp.getUi()
    .createMenu('PaperTrail')
    .addItem('Open Tag Sidebar', 'showSidebar')
    .addItem('Refresh Tags', 'refreshAllTags')
    .addSeparator()
    .addItem('Export Tagged Notes', 'showExportTaggedNotesDialog')
    .addItem('Settings', 'showSettings')
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
 * Get document info
 */
function getDocumentInfo() {
  try {
    var doc = DocumentApp.getActiveDocument();
    return {
      name: doc.getName(),
      id: doc.getId(),
      url: doc.getUrl()
    };
  } catch (e) {
    Logger.log('Error getting document info: ' + e.toString());
    return {
      name: 'Unknown',
      id: 'unknown',
      url: ''
    };
  }
}
