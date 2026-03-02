function showExportTaggedNotesDialog() {
  var html =HtmlService.createHtmlOutputFromFile('ExportDialog')
    .setWidth(420)
    .setHeight(320);
  DocumentApp.getUi().showModalDialog(html,'Export Tagged Notes');
}

function getTagNamesForExport() {
  var extracted =extractHashtagsFromDocument(); 
  var tagCounts= (extracted && extracted.tags) ? extracted.tags : extracted;
  return Object.keys(tagCounts || {}).sort();
}

/**
 * the collector header-delimited sections.
 * A section starts when a paragraph begins with "#Tag'
 * and ends when the next paragraph begins with "#OtherTag".
 * Only sections whose header tag == tagName are returned.
 */
function collectParagraphBlocksWithTag(tagName) {
  var body =DocumentApp.getActiveDocument().getBody();
  var wanted =String(tagName || '').toLowerCase();
  var elements =[];     //colect paragraphs/list items in order
  for (var i =0; i < body.getNumChildren(); i++) {
    var child = body.getChild(i);
    var t =child.getType();
    if (t ===DocumentApp.ElementType.PARAGRAPH || t === DocumentApp.ElementType.LIST_ITEM) {
      elements.push(child);
    }
  }
  var headerRe= /^#([A-Za-z0-9_-]+)\b/;   //header = paragraph that starts with "#Tag"
  var blocks= [];
  var currentTag= null;
  var currentLines= [];
  function flush_() {
    if (currentTag && currentTag === wanted) {
      while (currentLines.length && (currentLines[currentLines.length - 1] || '').trim() === '') {   //trim trailing blank lines
        currentLines.pop();
      }
      var text= currentLines.join('\n').trim();
      if (text) blocks.push(text);
    }
    currentLines= [];
  }
  for (var k= 0; k < elements.length;k++) {
    var line =elements[k].getText() || '';
    var trimmed= line.trim();
    var m =trimmed.match(headerRe);
    if (m) {
      flush_();
      currentTag =m[1].toLowerCase();
      currentLines.push(line);
      continue;
    }
    if (currentTag) currentLines.push(line);
  }
  flush_();
  var seen = {};  //dedupe whil keeping order
  var unique =[];
  blocks.forEach(function(b) {
    if (!seen[b]) {
      seen[b]= true;
      unique.push(b);
    }
  });
  return unique;
}

function buildExportText(tagName, notes) {   //build plan text export (GDoc export)
  var doc =DocumentApp.getActiveDocument();
  var header=
    'PaperTrail Export\n' +
    'Document: ' + doc.getName() + '\n' +
    'Tag: #' + tagName + '\n' +
    'Exported: ' +new Date().toLocaleString() + '\n\n';
  if (!notes || notes.length ===0) return header + 'No notes found for this tag.\n';
  var body = notes.map(function(n, i) {   //keep each block intact add simple numeric prefix
    return (i +1) + '.\n' + n;
  }).join('\n\n');
  return header + body + '\n';
}
function exportTaggedNotes(tagName, format) {      //entry point called from dialog
  if (!tagName) throw new Error('Tag is required.');
  var notes =collectParagraphBlocksWithTag(tagName);
  if (!notes || notes.length === 0) throw new Error('No notes found for #' + tagName);
  var fileName= 'PaperTrail Export - #' + tagName;
  if (format=== 'PDF') {
    //render directly from blocks for PDF (no numbred text parsing)
    return exportBlocksAsPdf_(fileName, tagName, notes);
  } else {
    var content = buildExportText(tagName, notes);
    return exportContentAsDoc_(fileName, content);
  }
}
function exportContentAsDoc_(title, content) {     //google doc export plain text
  var doc =DocumentApp.create(title);
  doc.getBody().setText(content);
  return { url: doc.getUrl(), id: doc.getId(), type: 'DOC' };
}
function exportBlocksAsPdf_(title, tagName, blocks) {   //pdf export style 
  var tempDoc =DocumentApp.create(title + ' (temp)');
  var body= tempDoc.getBody();
  body.clear();
  var FONT= 'Arial';
  var META_COLOR= '#555555';
  //the tuning knobs
  var SPACE_AFTER_TITLE = 10;
  var SPACE_AFTER_META_LINE =2;

  var SPACE_BEFORE_ENTRY_NUM= 14;   //bigger gap betwen entries
  var SPACE_AFTER_ENTRY_NUM =6;

  var SPACE_AFTER_ENTRY_HEADER =8;
  var SPACE_AFTER_BODY_LINE= 4;
  var SPACE_AFTER_BLANK_LINE =8;

  var INDENT_BODY = 28;

  //title od export
  var pTitle = body.appendParagraph('PaperTrail Export');
  pTitle.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  pTitle.setFontFamily(FONT);
  pTitle.setBold(false);
  pTitle.setSpacingAfter(SPACE_AFTER_TITLE);
  //metadata
  var src =DocumentApp.getActiveDocument();
  var metaLines =[
    'Document: ' + src.getName(),
    'Tag: #' + tagName,
    'Exported: ' + new Date().toLocaleString()
  ];
  metaLines.forEach(function(line) {
    var p =body.appendParagraph(line);
    p.setFontFamily(FONT);
    p.setFontSize(10);
    p.setForegroundColor(META_COLOR);
    p.setBold(false);
    p.setSpacingAfter(SPACE_AFTER_META_LINE);
  });
  body.appendParagraph('').setSpacingAfter(10);
  //entries mirror Google Doc export layot
  for (var i =0; i < blocks.length; i++) {
    var block= String(blocks[i] || '');
    var lines =block.split('\n');
    //find first non-empty line like #Note ....
    var firstNonEmptyIdx =-1;
    for (var j =0; j < lines.length; j++) {
      if ((lines[j] || '').trim() !== '') { firstNonEmptyIdx =j; break; }
    }
    if (firstNonEmptyIdx < 0) continue;
    //add entry number line '1'
    var pNum = body.appendParagraph((i + 1) + '.');
    pNum.setBold(true);
    pNum.setFontFamily(FONT);
    pNum.setFontSize(12);
    pNum.setSpacingBefore(i === 0 ? 6 : SPACE_BEFORE_ENTRY_NUM);
    pNum.setSpacingAfter(SPACE_AFTER_ENTRY_NUM);
    //add header line as written in the doc: #Note title
    var headerLine =(lines[firstNonEmptyIdx] || '').trim();
    var pHead= body.appendParagraph(headerLine);
    pHead.setBold(true);
    pHead.setFontFamily(FONT);
    pHead.setFontSize(11);
    pHead.setIndentStart(0);
    pHead.setSpacingAfter(SPACE_AFTER_ENTRY_HEADER);
    //add remaning lines
    for (var k =firstNonEmptyIdx + 1; k < lines.length; k++) {
      var raw =lines[k] || '';
      var trimmed= raw.trim();
      if (trimmed ==='') {
        body.appendParagraph('').setSpacingAfter(SPACE_AFTER_BLANK_LINE);
        continue;
      }
      var p =body.appendParagraph(raw);
      p.setFontFamily(FONT);
      p.setFontSize(11);
      p.setBold(false);
      p.setIndentStart(INDENT_BODY);
      p.setSpacingAfter(SPACE_AFTER_BODY_LINE);
    }
  }
  //footer mmmmm
  body.appendParagraph('').setSpacingBefore(14);
  var footer =body.appendParagraph('Generated by PaperTrail');
  footer.setFontFamily(FONT);
  footer.setFontSize(9);
  footer.setBold(false);
  footer.setForegroundColor('#888888');
  footer.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  tempDoc.saveAndClose();
  Utilities.sleep(1500);

  var tempFile =DriveApp.getFileById(tempDoc.getId());
  var pdfBlob =tempFile.getAs(MimeType.PDF).setName(title + '.pdf');
  var pdfFile =DriveApp.createFile(pdfBlob);
  try { tempFile.setTrashed(true); } catch (e) {}
  return { url: pdfFile.getUrl(), id: pdfFile.getId(), type: 'PDF' };
}
//debug dah bugs
function debugExportRuntime() {
  var result ={
    hasCollect: typeof collectParagraphBlocksWithTag,
    hasBuild: typeof buildExportText,
    hasExport: typeof exportTaggedNotes,
    hasDialog: typeof showExportTaggedNotesDialog
  };

  Logger.log('debugExportRuntime: ' + JSON.stringify(result));
  return result;
}
