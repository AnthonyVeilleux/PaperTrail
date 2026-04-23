/**
 * TagService.js - Tag extraction and management logic
 */

/**
 * Extract hashtag counts and hierarchy from plain text.
 * Supports formats: #SimpleTag, #Parent.Child, #Parent.Child.GrandChild
 */
function extractHashtagsFromText_(text) {
  var safeText = String(text || '');
  var textSignature = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, safeText)
  );

  // Matches: #tag, #Parent.Child, #Category.SubCategory.Item
  var hashtagRegex = /#([a-zA-Z0-9_.-]+)/g;
  var matches = [];
  var match;

  while ((match = hashtagRegex.exec(safeText)) !== null) {
    matches.push(match[1]);
  }

  if (matches.length === 0) {
    return { tags: {}, hierarchy: {}, textSignature: textSignature };
  }

  var tagCounts = {};
  var hierarchyMap = {};

  matches.forEach(function(tag) {
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;

    if (tag.indexOf('.') !== -1) {
      var parts = tag.split('.');
      for (var i = 0; i < parts.length - 1; i++) {
        var parent = parts.slice(0, i + 1).join('.');
        var child = parts.slice(0, i + 2).join('.');
        if (!hierarchyMap[parent]) {
          hierarchyMap[parent] = [];
        }
        if (hierarchyMap[parent].indexOf(child) === -1) {
          hierarchyMap[parent].push(child);
        }
      }
    }
  });

  return {
    tags: tagCounts,
    hierarchy: hierarchyMap,
    textSignature: textSignature
  };
}

/**
 * Extract all hashtags from the document (including nested hashtags)
 * Supports formats: #SimpleTag, #Parent.Child, #Parent.Child.GrandChild
 */
function extractHashtagsFromDocument() {
  try {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();
    var text = body.getText();
    Logger.log('Document text length: ' + text.length);

    var parsed = extractHashtagsFromText_(text);
    Logger.log('Found ' + Object.keys(parsed.tags || {}).length + ' unique hashtags');
    Logger.log('Hierarchy map: ' + JSON.stringify(parsed.hierarchy || {}));

    return parsed;
  } catch (e) {
    Logger.log('Error extracting hashtags: ' + e.toString());
    return { tags: {}, hierarchy: {}, textSignature: '' };
  }
}

/**
 * Get all tags with metadata
 */
function getAllTags() {
  try {
    Logger.log('Getting all tags...');

    var properties = PropertiesService.getDocumentProperties();
    var allProps = properties.getProperties(); // single bulk read

    var documentTags = extractHashtagsFromDocument();
    Logger.log('Document tags: ' + JSON.stringify(documentTags));

    var projects = allProps['projects'] ? JSON.parse(allProps['projects']) : getDefaultProjects();
    var globalTags = allProps['globalTags'] ? JSON.parse(allProps['globalTags']) : getDefaultGlobalTags();

    var allTagMetadata = {};
        projects.forEach(function(project) {
      var updatedTags = [];
      if (project.tags) {
        project.tags.forEach(function(tag) {
          if (documentTags.tags[tag.name]) {
            tag.count = documentTags.tags[tag.name];
            var metaKey = 'tag_' + tag.name;
            if (allProps[metaKey]) {
              try {
                var meta = JSON.parse(allProps[metaKey]);
                if (meta && meta.color) tag.color = meta.color;
              } catch (e) {}
            }
            if (!tag.color) {
              tag.color = getRandomColor();
              pendingWrites[metaKey] = JSON.stringify({
                created: new Date().toISOString().split('T')[0],
                createdTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                author: Session.getActiveUser().getEmail() || 'Unknown',
                lastUsed: 'Just now',
                color: tag.color,
                project: '',
                description: '',
                items: [],
                isNested: tag.name.indexOf('.') !== -1,
                parent: tag.name.indexOf('.') !== -1 ? tag.name.split('.').slice(0, -1).join('.') : null,
                children: [],
                depth: tag.name.split('.').length
              });
            }
            updatedTags.push(tag);
            allTagMetadata[tag.name] = true;
          }
        });
      }
      project.tags = updatedTags;
    });

    var newTags = [];
    var pendingWrites = {};

    for (var tagName in documentTags.tags) {
      if (!allTagMetadata[tagName]) {
        var metadata = getOrCreateTagMetadataCached_(tagName, allProps, pendingWrites);
        if (tagName.indexOf('.') !== -1) {
          var parts = tagName.split('.');
          if (parts.length > 1) {
            metadata.parent = parts.slice(0, -1).join('.');
            metadata.isNested = true;
          }
        }
        newTags.push({
          name: tagName,
          count: documentTags.tags[tagName],
          color: metadata.color,
          metadata: metadata
        });
      }
    }

    if (newTags.length > 0) {
      if (projects.length === 0) {
        projects = [createDefaultProject()];
      }
      projects[0].tags = (projects[0].tags || []).concat(newTags);
      pendingWrites['projects'] = JSON.stringify(projects);
    }

    globalTags.forEach(function(tag) {
      tag.count = documentTags.tags[tag.name] || 0;
      var metaKey = 'tag_' + tag.name;
      if (allProps[metaKey]) {
        try {
          var meta = JSON.parse(allProps[metaKey]);
          if (meta && meta.color) tag.color = meta.color;
        } catch (e) {}
      }
      if (!tag.color) {
        tag.color = getRandomColor();
        pendingWrites[metaKey] = JSON.stringify({
          created: new Date().toISOString().split('T')[0],
          createdTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          author: Session.getActiveUser().getEmail() || 'Unknown',
          lastUsed: 'Just now',
          color: tag.color,
          project: '',
          description: '',
          items: [],
          isNested: tag.name.indexOf('.') !== -1,
          parent: tag.name.indexOf('.') !== -1 ? tag.name.split('.').slice(0, -1).join('.') : null,
          children: [],
          depth: tag.name.split('.').length
        });
      }
    });

    if (Object.keys(pendingWrites).length > 0) {
      pendingWrites['tags_last_updated'] = new Date().toISOString();
      properties.setProperties(pendingWrites);
    }

    Logger.log('Returning: ' + projects.length + ' projects');
    return {
      projects: projects,
      globalTags: globalTags,
      documentTags: documentTags,
      hierarchy: documentTags.hierarchy || {},
      lastUpdated: computeTagStateSignature_(documentTags.tags, allProps, pendingWrites)
    };

  } catch (e) {
    Logger.log('Error in getAllTags: ' + e.toString());
    return {
      projects: [createDefaultProject()],
      globalTags: getDefaultGlobalTags(),
      documentTags: { tags: {}, hierarchy: {} }
    };
  }
}

// Deterministic fingerprint of the doc's tag state so the sidebar poll can
// detect count/color/rename changes — not just the discovery of new tags.
function computeTagStateSignature_(tagCounts, allProps, pendingWrites) {
  var names = Object.keys(tagCounts || {}).sort();
  var parts = [];
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var metaKey = 'tag_' + name;
    var raw = (pendingWrites && pendingWrites[metaKey]) || (allProps && allProps[metaKey]) || '';
    var color = '';
    if (raw) {
      try { color = (JSON.parse(raw).color) || ''; } catch (e) {}
    }
    parts.push(name + ':' + tagCounts[name] + ':' + color);
  }
  return parts.join('|');
}

/**
 * Get or create tag metadata (now with support for nested tags)
 */
function getOrCreateTagMetadata(tagName) {
  try {
    var properties = PropertiesService.getDocumentProperties();
    var key = 'tag_' + tagName;
    var data = properties.getProperty(key);
    
    if (data) {
      return JSON.parse(data);
    }
    
    // Determine if this is a nested tag
    var isNested = tagName.indexOf('.') !== -1;
    var parent = null;
    var children = [];
    
    if (isNested) {
      var parts = tagName.split('.');
      parent = parts.slice(0, -1).join('.');
    }
    
    // Create default metadata with nested tag support
    var metadata = {
      created: new Date().toISOString().split('T')[0],
      createdTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      author: Session.getActiveUser().getEmail() || 'Unknown',
      lastUsed: 'Just now',
      color: getRandomColor(),
      project: '',
      description: '',
      items: [],
      // New fields for nested tag support
      isNested: isNested,
      parent: parent,
      children: children,
      depth: isNested ? tagName.split('.').length : 1
    };

    
    // Save metadata
    properties.setProperty(key, JSON.stringify(metadata));
    
    return metadata;
  } catch (e) {
    Logger.log('Error getting/creating metadata: ' + e.toString());
    return {
      created: new Date().toISOString().split('T')[0],
      createdTime: new Date().toLocaleTimeString(),
      author: 'Unknown',
      lastUsed: 'Just now',
      color: '#1A73E8',
      project: '',
      description: '',
      items: []
    };
  }
}

/**
 * Read-from-cache / write-to-pending variant used by getAllTags to avoid
 * individual getProperty calls inside a loop.
 */
function getOrCreateTagMetadataCached_(tagName, propCache, pendingWrites) {
  var key = 'tag_' + tagName;
  var data = propCache[key];

  if (data) {
    return JSON.parse(data);
  }

  var isNested = tagName.indexOf('.') !== -1;
  var parent = null;

  if (isNested) {
    var parts = tagName.split('.');
    parent = parts.slice(0, -1).join('.');
  }

  var metadata = {
    created: new Date().toISOString().split('T')[0],
    createdTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    author: Session.getActiveUser().getEmail() || 'Unknown',
    lastUsed: 'Just now',
    color: getRandomColor(),
    project: '',
    description: '',
    items: [],
    isNested: isNested,
    parent: parent,
    children: [],
    depth: isNested ? tagName.split('.').length : 1
  };

  pendingWrites[key] = JSON.stringify(metadata);
  return metadata;
}

/**
 * Save tag metadata
 */
function saveTagMetadata(tagName, metadata) {
  try {
    var properties = PropertiesService.getDocumentProperties();
    var key = 'tag_' + tagName;
    properties.setProperty(key, JSON.stringify(metadata));
    // mark tags as updated
    try { properties.setProperty('tags_last_updated', new Date().toISOString()); } catch(e) { Logger.log('Error setting tags_last_updated: ' + e.toString()); }
    return { success: true };
  } catch (e) {
    Logger.log('Error saving metadata: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Update just the color for a tag.
 */
function saveTagColor(tagName, color) {
  try {
    var properties = PropertiesService.getDocumentProperties();
    var key = 'tag_' + tagName;
    var existing = properties.getProperty(key);
    var metadata = existing ? JSON.parse(existing) : getOrCreateTagMetadata(tagName);
    metadata.color = color;
    properties.setProperty(key, JSON.stringify(metadata));
    try { properties.setProperty('tags_last_updated', new Date().toISOString()); } catch(e) { Logger.log('Error setting tags_last_updated: ' + e.toString()); }
    return { success: true };
  } catch (e) {
    Logger.log('Error saving tag color: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}




/**
 * Establish parent-child relationships for nested tags
 * Called after extracting all tags to create proper hierarchy
 */
function establishNestedTagRelationships(hierarchyMap) {
  try {
    var properties = PropertiesService.getDocumentProperties();
    
    // Process each parent-child relationship
    for (var parent in hierarchyMap) {
      var parentMetadata = getOrCreateTagMetadata(parent);
      var children = hierarchyMap[parent];
      
      // Update parent's children list
      if (!parentMetadata.children) {
        parentMetadata.children = [];
      }
      parentMetadata.children = children;
      parentMetadata.isParent = true;
      
      saveTagMetadata(parent, parentMetadata);
      
      // Update each child's parent reference
      children.forEach(function(childTag) {
        var childMetadata = getOrCreateTagMetadata(childTag);
        childMetadata.parent = parent;
        childMetadata.isNested = true;
        saveTagMetadata(childTag, childMetadata);
      });
    }
    
    Logger.log('Nested tag relationships established');
    return { success: true };
  } catch (e) {
    Logger.log('Error establishing nested tag relationships: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}




/**
 * Check if a tag match ends at a valid boundary
 */
function isTagBoundary(text, endIndex) {
  if (endIndex + 1 >= text.length) {
    return true;
  }
  return !(/[a-zA-Z0-9_.-]/.test(text.charAt(endIndex + 1)));
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape user tag names for use in regex patterns
 */
function escapeTagForRegex(tagName) {
  return escapeRegex(tagName);
}

/**
 * Rename tag throughout document
 */
function renameTagInDocument(oldName, newName) {
  try {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();
    
    // Create regex pattern for the old tag
    var pattern = '#' + escapeTagForRegex(oldName) + '\\b';

    // Replace all occurrences
    var searchResult = body.findText(pattern);
    var count = 0;
    
    while (searchResult !== null) {
      var element = searchResult.getElement();
      var start = searchResult.getStartOffset();
      var end = searchResult.getEndOffsetInclusive();
      
      if (element.getType() === DocumentApp.ElementType.TEXT) {
        var textElement = element.asText();
        textElement.deleteText(start, end);
        textElement.insertText(start, '#' + newName);
        count++;
      }
      
      searchResult = body.findText(pattern, searchResult);
    }
    
    Logger.log('Renamed ' + count + ' instances of tag');
    return { success: true, count: count };
  } catch (e) {
    Logger.log('Error renaming tag: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}









/**
 * Jump the cursor to the Nth occurrence of a tag using findText (no bookmarks).
 */
function jumpToTagBookmark(tagName, occurrenceIndex) {
  try {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();
    var pattern = '#' + escapeTagForRegex(tagName);
    var searchResult = body.findText(pattern);
    var occurrences = [];

    while (searchResult !== null) {
      var element = searchResult.getElement();
      if (element.getType() === DocumentApp.ElementType.TEXT) {
        var textElement = element.asText();
        var text = textElement.getText();
        if (isTagBoundary(text, searchResult.getEndOffsetInclusive())) {
          occurrences.push({ element: textElement, offset: searchResult.getStartOffset() });
        }
      }
      searchResult = body.findText(pattern, searchResult);
    }

    if (!occurrences.length) {
      return { success: false, error: 'Tag not found in document.' };
    }

    var index = typeof occurrenceIndex === 'number' ? occurrenceIndex : 0;
    if (index < 0 || index >= occurrences.length) {
      index = 0;
    }

    var target = occurrences[index];
    var rangeBuilder = doc.newRange();
    rangeBuilder.addElement(target.element, target.offset, target.offset + tagName.length);
    doc.setSelection(rangeBuilder.build());
    return { success: true, count: occurrences.length, index: index };
  } catch (e) {
    Logger.log('Error jumping to tag: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Get tag occurrence snippets in the document
 */
function getTagOccurrences(tagName, maxChars) {
  try {
    function isMeaningfulSnippetText_(value) {
      var normalized = String(value || '').replace(/\s+/g, ' ').trim();
      if (!normalized) {
        return false;
      }

      // Treat lines made only of hashtags/separators as non-meaningful preview text.
      var residual = normalized
        .replace(/#[a-zA-Z0-9_.-]+/g, '')
        .replace(/[\s,;|()\[\]{}\-]+/g, '')
        .trim();

      return residual.length > 0;
    }

    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();
    var pattern = '#' + escapeTagForRegex(tagName);
    var searchResult = body.findText(pattern);
    var snippets = [];
    var limit = typeof maxChars === 'number' ? maxChars : 80;

    while (searchResult !== null) {
      var element = searchResult.getElement();
      if (element.getType() === DocumentApp.ElementType.TEXT) {
        var textElement = element.asText();
        var text = textElement.getText();
        if (isTagBoundary(text, searchResult.getEndOffsetInclusive())) {
          var tagEnd = searchResult.getEndOffsetInclusive();
          var nextLineBreak = text.indexOf('\n', tagEnd + 1);
          var snippet = '';

          if (nextLineBreak !== -1) {
            var start = nextLineBreak + 1;
            var end = Math.min(start + limit, text.length);
            var rawSnippet = text.substring(start, end);
            snippet = rawSnippet.replace(/\s+/g, ' ').trim();
            if (!isMeaningfulSnippetText_(snippet)) {
              snippet = '';
            }
          }

          if (!snippet) {
            var parent = textElement.getParent();
            if (parent && parent.getType && parent.getType() === DocumentApp.ElementType.PARAGRAPH) {
              var docBody = parent.getParent();
              if (docBody && docBody.getChildIndex) {
                var parentIndex = docBody.getChildIndex(parent);
                for (var i = parentIndex + 1; i < docBody.getNumChildren(); i++) {
                  var sibling = docBody.getChild(i);
                  if (sibling.getType && sibling.getType() === DocumentApp.ElementType.PARAGRAPH) {
                    var siblingText = sibling.asParagraph().getText().replace(/\s+/g, ' ').trim();
                    if (isMeaningfulSnippetText_(siblingText)) {
                      snippet = siblingText.substring(0, limit);
                      break;
                    }
                  }
                }
              }
            }
          }

          if (!snippet) {
            snippet = 'No preview text available';
          }
          snippets.push({
            index: snippets.length,
            snippet: snippet
          });
        }
      }
      searchResult = body.findText(pattern, searchResult);
    }

    return { success: true, occurrences: snippets };
  } catch (e) {
    Logger.log('Error getting tag occurrences: ' + e.toString());
    return { success: false, error: e.toString(), occurrences: [] };
  }
}

/**
 * Get random color for new tags
 */
function getRandomColor() {
  var colors = ['#1A73E8', '#34A853', '#FBBC04', '#EA4335', '#9334E9', '#0891B2'];
  return colors[Math.floor(Math.random() * colors.length)];
}

if (typeof module !== 'undefined') {
  module.exports = {
    extractHashtagsFromText_: extractHashtagsFromText_,
    escapeRegex: escapeRegex,
    escapeTagForRegex: escapeTagForRegex,
    isTagBoundary: isTagBoundary,
    getRandomColor: getRandomColor,
    saveTagColor: saveTagColor,
  };
}


