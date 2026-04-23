function showExportTaggedNotesDialog() {
  var html = HtmlService.createHtmlOutputFromFile('ExportDialog')
    .setWidth(480)
    .setHeight(720);
  DocumentApp.getUi().showModalDialog(html, 'Export Tagged Notes');
}

function getDefaultExportFolder() {
  var doc = DocumentApp.getActiveDocument();
  var file = DriveApp.getFileById(doc.getId());
  var parents = file.getParents();
  if (parents.hasNext()) {
    var folder = parents.next();
    return { folderId: folder.getId(), folderName: folder.getName() };
  }
  return { folderId: '', folderName: '' };
}

function resolveFolderId(value) {
  if (!value) throw new Error('Folder value is required.');
  var id = value.trim();
  var urlMatch = id.match(/\/folders\/([a-zA-Z0-9_-]+)/) || id.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (urlMatch) id = urlMatch[1];

  var folder = DriveApp.getFolderById(id);
  return { folderId: folder.getId(), folderName: folder.getName() };
}

function getTagNamesForExport() {
  var extracted = extractHashtagsFromDocument();
  var tagCounts = (extracted && extracted.tags) ? extracted.tags : extracted;
  var names = Object.keys(tagCounts || {}).sort();

  var props = {};
  try {
    props = PropertiesService.getDocumentProperties().getProperties();
  } catch (e) {
    Logger.log('Error reading properties for export: ' + e.toString());
  }

  return names.map(function(name) {
    var metaKey = 'tag_' + name;
    var meta = props[metaKey] ? JSON.parse(props[metaKey]) : null;
    return {
      name: name,
      count: tagCounts[name] || 0,
      color: (meta && meta.color) || getRandomColor()
    };
  });
}

// Single-pass collection of all tag blocks from the document.
// Returns { tagName: [block, ...], ... } for every tag found.
function collectAllTagBlocks_() {
  var body = DocumentApp.getActiveDocument().getBody();
  var headerRe = /^#([A-Za-z0-9_.-]+)/;
  var map = {};
  var currentTag = null;
  var currentLines = [];

  function flush_() {
    if (!currentTag) return;
    while (currentLines.length && (currentLines[currentLines.length - 1] || '').trim() === '') {
      currentLines.pop();
    }
    var text = currentLines.join('\n').trim();
    if (text) {
      if (!map[currentTag]) map[currentTag] = [];
      map[currentTag].push(text);
    }
    currentLines = [];
  }

  var n = body.getNumChildren();
  for (var i = 0; i < n; i++) {
    var child = body.getChild(i);
    var t = child.getType();
    if (t !== DocumentApp.ElementType.PARAGRAPH && t !== DocumentApp.ElementType.LIST_ITEM) continue;
    var line = child.getText() || '';
    var m = line.trim().match(headerRe);
    if (m) {
      flush_();
      currentTag = m[1].toLowerCase();
      currentLines.push(line);
    } else if (currentTag) {
      currentLines.push(line);
    }
  }
  flush_();

  Object.keys(map).forEach(function(tag) {
    var seen = {};
    map[tag] = map[tag].filter(function(b) {
      if (seen[b]) return false;
      seen[b] = true;
      return true;
    });
  });

  return map;
}

// Entry point called from dialog. tagNames may be a string or array.
function exportTaggedNotes(tagNames, format, options) {
  options = options || {};
  if (!tagNames || (Array.isArray(tagNames) && tagNames.length === 0)) {
    throw new Error('At least one tag is required.');
  }
  var tags = Array.isArray(tagNames) ? tagNames : [tagNames];

  // Single pass through the document, then look up each requested tag
  var allBlocks = collectAllTagBlocks_();
  var sections = [];
  tags.forEach(function(tag) {
    var blocks = allBlocks[tag.toLowerCase()];
    if (blocks && blocks.length) {
      sections.push({ tag: tag, blocks: blocks });
    }
  });

  if (sections.length === 0) {
    throw new Error('No notes found for the selected tag' + (tags.length > 1 ? 's' : '') + '.');
  }

  var docName = DocumentApp.getActiveDocument().getName();
  var MAX_SHOWN = 3;
  var tagLabel = tags.slice(0, MAX_SHOWN).map(function(t) { return '#' + t; }).join(', ');
  if (tags.length > MAX_SHOWN) tagLabel += ', +' + (tags.length - MAX_SHOWN) + ' more';
  var fileName = docName + ': ' + tagLabel;

  if (format === 'PDF') {
    return exportSectionsAsPdf_(fileName, sections, options);
  } else {
    var content = buildExportText_(sections, options);
    return exportContentAsDoc_(fileName, content, options);
  }
}

function buildExportText_(sections, options) {
  options = options || {};
  var doc = DocumentApp.getActiveDocument();

  if (options.sortOrder === 'alpha') {
    sections = sections.slice().sort(function(a, b) {
      return String(a.tag).localeCompare(String(b.tag));
    });
  }

  var header = '';
  if (options.includeMetadataHeader !== false) {
    header = doc.getName() + '  ·  ' + new Date().toLocaleDateString() + '\n\n';
  }

  var body = sections.map(function(section) {
    if (options.includeTagDividers === false) {
      return section.blocks.join('\n\n');
    }
    var divider = '── #' + section.tag + ' ──';
    return divider + '\n\n' + section.blocks.join('\n\n');
  }).join('\n\n\n');

  var footer = '';
  if (options.includeSourceLink) {
    footer = '\n\nExported from: ' + doc.getUrl();
  }

  return header + body + footer + '\n';
}

function exportContentAsDoc_(title, content, options) {
  options = options || {};
  var doc = DocumentApp.create(title);
  doc.getBody().setText(content);

  var file = DriveApp.getFileById(doc.getId());
  if (options.folderId) {
    try {
      var folder = DriveApp.getFolderById(options.folderId);
      folder.addFile(file);
    } catch (e) {
      Logger.log('Could not add doc to folder: ' + e.toString());
    }
  }

  return { url: doc.getUrl(), id: doc.getId(), type: 'DOC' };
}

function exportSectionsAsPdf_(title, sections, options) {
  options = options || {};
  var A = DocumentApp.Attribute;
  var FONT = 'Arial';

  if (options.sortOrder === 'alpha') {
    sections = sections.slice().sort(function(a, b) {
      return String(a.tag).localeCompare(String(b.tag));
    });
  }

  var metaStyle = {};
  metaStyle[A.FONT_FAMILY] = FONT; metaStyle[A.FONT_SIZE] = 10;
  metaStyle[A.FOREGROUND_COLOR] = '#888888'; metaStyle[A.BOLD] = false;
  metaStyle[A.SPACING_AFTER] = 18;

  var tagStyle = {};
  tagStyle[A.FONT_FAMILY] = FONT; tagStyle[A.FONT_SIZE] = 13;
  tagStyle[A.BOLD] = true; tagStyle[A.FOREGROUND_COLOR] = '#1a73e8';
  tagStyle[A.SPACING_AFTER] = 10;

  var bodyStyle = {};
  bodyStyle[A.FONT_FAMILY] = FONT; bodyStyle[A.FONT_SIZE] = 11;
  bodyStyle[A.BOLD] = false; bodyStyle[A.FOREGROUND_COLOR] = '#202124';
  bodyStyle[A.SPACING_AFTER] = 4;

  var linkStyle = {};
  linkStyle[A.FONT_FAMILY] = FONT; linkStyle[A.FONT_SIZE] = 10;
  linkStyle[A.FOREGROUND_COLOR] = '#888888'; linkStyle[A.BOLD] = false;
  linkStyle[A.SPACING_BEFORE] = 20;

  var tempDoc = DocumentApp.create(title + ' (temp)');
  var docBody = tempDoc.getBody();
  docBody.clear();

  var src = DocumentApp.getActiveDocument();

  if (options.includeMetadataHeader !== false) {
    docBody.appendParagraph(src.getName() + '  ·  ' + new Date().toLocaleDateString())
      .setAttributes(metaStyle);
  }

  sections.forEach(function(section, sIdx) {
    var ts = Object.assign ? Object.assign({}, tagStyle) : JSON.parse(JSON.stringify(tagStyle));
    ts[A.SPACING_BEFORE] = sIdx === 0 && options.includeMetadataHeader === false ? 0 : 20;

    if (options.includeTagDividers !== false) {
      docBody.appendParagraph('#' + section.tag).setAttributes(ts);
    }

    section.blocks.forEach(function(block, bIdx) {
      block.split('\n').forEach(function(line) {
        if ((line || '').trim() === '') {
          docBody.appendParagraph('').setAttributes(bodyStyle);
          return;
        }
        docBody.appendParagraph(line).setAttributes(bodyStyle);
      });
      if (bIdx < section.blocks.length - 1) {
        docBody.appendParagraph('').setAttributes(bodyStyle);
      }
    });
  });

  if (options.includeSourceLink) {
    docBody.appendParagraph('Exported from: ' + src.getUrl()).setAttributes(linkStyle);
  }

  tempDoc.saveAndClose();
  Utilities.sleep(1500);

  var tempFile = DriveApp.getFileById(tempDoc.getId());
  var pdfBlob = tempFile.getAs(MimeType.PDF).setName(title + '.pdf');
  var pdfFile = DriveApp.createFile(pdfBlob);

  if (options.folderId) {
    try {
      var folder = DriveApp.getFolderById(options.folderId);
      folder.addFile(pdfFile);
    } catch (e) {
      Logger.log('Could not add PDF to folder: ' + e.toString());
    }
  }

  try { tempFile.setTrashed(true); } catch (e) {}
  return { url: pdfFile.getUrl(), id: pdfFile.getId(), type: 'PDF' };
}

if (typeof module !== 'undefined') {
  module.exports = {
    collectAllTagBlocks_: collectAllTagBlocks_,
    buildExportText_: buildExportText_,
    getTagNamesForExport: getTagNamesForExport,
    exportTaggedNotes: exportTaggedNotes,
    getDefaultExportFolder: getDefaultExportFolder,
    resolveFolderId: resolveFolderId,
    exportContentAsDoc_: exportContentAsDoc_,
    exportSectionsAsPdf_: exportSectionsAsPdf_,
  };
}
