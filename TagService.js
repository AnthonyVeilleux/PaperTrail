/**
 * TagService.js - Tag extraction and management logic
 */

/**
 * Extract all hashtags from the document (including nested hashtags)
 * Supports formats: #SimpleTag, #Parent.Child, #Parent.Child.GrandChild
 */
function extractHashtagsFromDocument() {
  try {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();
    var text = body.getText();
    var textSignature = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text)
    );
    
    Logger.log('Document text length: ' + text.length);
    
    // Enhanced regex to find hashtags including nested ones (with dots)
    // Matches: #tag, #Parent.Child, #Category.SubCategory.Item
    var hashtagRegex = /#([a-zA-Z0-9_.-]+)/g;
    var matches = [];
    var match;
    
    while ((match = hashtagRegex.exec(text)) !== null) {
      matches.push(match[1]);
    }
    
    Logger.log('Found ' + matches.length + ' hashtags');
    
    if (matches.length === 0) {
      return { tags: {}, hierarchy: {}, textSignature: textSignature };
    }
    
    // Count occurrences and organize by hierarchy
    var tagCounts = {};
    var hierarchyMap = {}; // Track parent-child relationships
    
    matches.forEach(function(tag) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      
      // Build hierarchy map for nested tags
      if (tag.indexOf('.') !== -1) {
        var parts = tag.split('.');
        // Store parent-child relationship
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
    
    Logger.log('Unique tags: ' + Object.keys(tagCounts).length);
    Logger.log('Hierarchy map: ' + JSON.stringify(hierarchyMap));
    
    return {
      tags: tagCounts,
      hierarchy: hierarchyMap,
      textSignature: textSignature
    };
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
    var projectsData = properties.getProperty('projects');
    var globalTagsData = properties.getProperty('globalTags');
    
    // Extract current hashtags from document
    var documentTags = extractHashtagsFromDocument();
    Logger.log('Document tags: ' + JSON.stringify(documentTags));

    try {
      ensureTagBookmarks(documentTags.tags || {});
    } catch (e) {
      Logger.log('Error ensuring tag bookmarks: ' + e.toString());
    }
    
    var bookmarkCounts = {};
    try {
      var bookmarkData = properties.getProperty('tag_bookmarks');
      var bookmarkMap = bookmarkData ? JSON.parse(bookmarkData) : {};
      Object.keys(bookmarkMap).forEach(function(tagName) {
        bookmarkCounts[tagName] = (bookmarkMap[tagName] || []).length;
      });
    } catch (e) {
      Logger.log('Error reading tag bookmarks: ' + e.toString());
    }

    // Get or create projects
    var projects = projectsData ? JSON.parse(projectsData) : getDefaultProjects();
    var globalTags = globalTagsData ? JSON.parse(globalTagsData) : getDefaultGlobalTags();
    
    // Create a map of all existing tag metadata
    var allTagMetadata = {};
    
    // Update project tags with document counts
    projects.forEach(function(project) {
      var updatedTags = [];
      
      // First, update existing tags
      if (project.tags) {
        project.tags.forEach(function(tag) {
          if (documentTags.tags[tag.name]) {
            tag.count = documentTags.tags[tag.name];
            updatedTags.push(tag);
            allTagMetadata[tag.name] = true;
          }
        });
      }
      
      project.tags = updatedTags;
    });
    
    // Add new tags from document that aren't in any project
    var newTags = [];
    for (var tagName in documentTags.tags) {
      if (!allTagMetadata[tagName]) {
        var metadata = getOrCreateTagMetadata(tagName);
        // Check if this is a nested tag and set parent if needed
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

    // Add new tags to first project or create a default project
    if (newTags.length > 0) {
      if (projects.length === 0) {
        projects = [createDefaultProject()];
      }
      projects[0].tags = (projects[0].tags || []).concat(newTags);
      
      // Save updated projects
      properties.setProperty('projects', JSON.stringify(projects));
    }
    
    // Update global tags counts
    globalTags.forEach(function(tag) {
      tag.count = documentTags.tags[tag.name] || 0;
    });
    
    var result = {
      projects: projects,
      globalTags: globalTags,
      documentTags: documentTags,
      hierarchy: documentTags.hierarchy || {},
      bookmarkCounts: bookmarkCounts
    };
    
    // Establish nested tag relationships
    if (documentTags.hierarchy && Object.keys(documentTags.hierarchy).length > 0) {
      establishNestedTagRelationships(documentTags.hierarchy);
    }
    
    // include last-updated timestamp allowing clients to do lightweight checks
    try {
      var lastUpdated = properties.getProperty('tags_last_updated') || new Date().toISOString();
      result.lastUpdated = lastUpdated;
    } catch (e) {
      result.lastUpdated = new Date().toISOString();
    }
    
    Logger.log('Returning: ' + projects.length + ' projects');
    return result;
    
  } catch (e) {
    Logger.log('Error in getAllTags: ' + e.toString());
    return {
      projects: [createDefaultProject()],
      globalTags: getDefaultGlobalTags(),
      documentTags: { tags: {}, hierarchy: {} }
    };
  }
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
 * Get tag metadata
 */
function getTagMetadata(tagName) {
  return getOrCreateTagMetadata(tagName);
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
 * Save tags to Properties Service (Auto-sync)
 */
function saveTags(tags) {
  try {
    const userProperties = PropertiesService.getUserProperties();
    userProperties.setProperty('TAGS_DATA', JSON.stringify(tags));
    // update document-level last-updated timestamp so clients can detect changes
    try { PropertiesService.getDocumentProperties().setProperty('tags_last_updated', new Date().toISOString()); } catch(e) { Logger.log('Error setting last-updated: ' + e.toString()); }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      count: tags.length
    };
  } catch (error) {
    console.error('Error saving tags:', error);
    return {
      success: false,
      error: error.message
    };
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
 * Get full tag hierarchy including parent and children
 */
function getTagHierarchy() {
  try {
    var allTags = getAllTags();
    var hierarchy = {
      rootTags: [],
      nestedTags: {}
    };
    
    // Combine all tags from projects and global tags
    var allTagsList = [];
    allTags.projects.forEach(function(project) {
      if (project.tags) {
        allTagsList = allTagsList.concat(project.tags);
      }
    });
    allTagsList = allTagsList.concat(allTags.globalTags || []);
    
    // Build hierarchy
    allTagsList.forEach(function(tag) {
      var metadata = tag.metadata || getOrCreateTagMetadata(tag.name);
      
      if (!metadata.isNested) {
        hierarchy.rootTags.push({
          name: tag.name,
          count: tag.count || 0,
          color: tag.color || metadata.color,
          children: metadata.children || []
        });
      }
    });
    
    return hierarchy;
  } catch (e) {
    Logger.log('Error getting tag hierarchy: ' + e.toString());
    return { rootTags: [], nestedTags: {} };
  }
}

/**
 * Update tag metadata
 */
function updateTag(tagName, updates) {
  try {
    Logger.log('Updating tag: ' + tagName);
    Logger.log('Updates: ' + JSON.stringify(updates));
    
    var metadata = getOrCreateTagMetadata(tagName);
    
    // Update fields
    if (updates.color) {
      metadata.color = updates.color;
    }
    if (updates.project !== undefined) {
      metadata.project = updates.project;
    }
    if (updates.description !== undefined) {
      metadata.description = updates.description;
    }
    
    // Handle tag rename
    if (updates.tagName && updates.tagName !== tagName) {
      // Rename tag in document
      var renameResult = renameTagInDocument(tagName, updates.tagName);
      if (!renameResult.success) {
        return renameResult;
      }
      
      // Delete old metadata
      var properties = PropertiesService.getDocumentProperties();
      properties.deleteProperty('tag_' + tagName);
      tagName = updates.tagName;
    }
    
    metadata.lastUsed = new Date().toLocaleString();
    
    var result = saveTagMetadata(tagName, metadata);
    
    if (result.success) {
      // Update projects data
      updateProjectsWithNewTagInfo(tagName, metadata);
      // mark tags as updated
      try { PropertiesService.getDocumentProperties().setProperty('tags_last_updated', new Date().toISOString()); } catch(e) { Logger.log('Error setting tags_last_updated: ' + e.toString()); }
    }
    
    return result;
  } catch (e) {
    Logger.log('Error in updateTag: ' + e.toString());
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
    var tagName = oldName; // Fix for undefined variable in original code
    
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
 * Delete tag from document
 */
function deleteTag(tagName) {
  try {
    Logger.log('Deleting tag: ' + tagName);
    
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();
    
    // Create regex pattern
    var pattern = '#' + escapeTagForRegex(tagName) + '\\b';
    
    // Find and remove all instances
    var searchResult = body.findText(pattern);
    var count = 0;
    
    while (searchResult !== null) {
      var element = searchResult.getElement();
      var start = searchResult.getStartOffset();
      var end = searchResult.getEndOffsetInclusive();
      
      if (element.getType() === DocumentApp.ElementType.TEXT) {
        var textElement = element.asText();
        textElement.deleteText(start, end);
        count++;
      }
      
      searchResult = body.findText(pattern);
    }
    
    // Delete metadata
    var properties = PropertiesService.getDocumentProperties();
    properties.deleteProperty('tag_' + tagName);
    
    // Remove from projects
    removeTagFromProjects(tagName);
    // mark tags as updated
    try { properties.setProperty('tags_last_updated', new Date().toISOString()); } catch(e) { Logger.log('Error setting tags_last_updated: ' + e.toString()); }
    
    Logger.log('Deleted ' + count + ' instances of tag');
    return { success: true, message: 'Tag deleted successfully. Removed from ' + count + ' locations.' };
  } catch (e) {
    Logger.log('Error deleting tag: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Remove tag from projects data
 */
function removeTagFromProjects(tagName) {
  try {
    var properties = PropertiesService.getDocumentProperties();
    var projectsData = properties.getProperty('projects');
    
    if (!projectsData) return;
    
    var projects = JSON.parse(projectsData);
    
    projects.forEach(function(project) {
      if (project.tags) {
        project.tags = project.tags.filter(function(tag) {
          return tag.name !== tagName;
        });
      }
    });
    
    properties.setProperty('projects', JSON.stringify(projects));
  } catch (e) {
    Logger.log('Error removing tag from projects: ' + e.toString());
  }
}

/**
 * Highlight tag in document
 */
function highlightTag(tagName) {
  try {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();
    var pattern = '#' + escapeTagForRegex(tagName) + '\\b';

    
    var rangeBuilder = doc.newRange();
    var searchResult = body.findText(pattern);
    var found = false;
    
    while (searchResult !== null) {
      var element = searchResult.getElement();
      rangeBuilder.addElement(element.asText(), searchResult.getStartOffset(), searchResult.getEndOffsetInclusive());
      found = true;
      searchResult = body.findText(pattern, searchResult);
    }
    
    if (found) {
      doc.setSelection(rangeBuilder.build());
      return { success: true };
    } else {
      return { success: false, error: 'Tag not found in document' };
    }
  } catch (e) {
    Logger.log('Error highlighting tag: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Build or refresh bookmarks for all tags in the document
 */
function buildTagBookmarks(documentTags) {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();
  var properties = PropertiesService.getDocumentProperties();

  var tags = documentTags || extractHashtagsFromDocument().tags || {};
  var tagNames = Object.keys(tags);
  var bookmarksByTag = {};

  // Remove previously created tag bookmarks
  try {
    var existing = properties.getProperty('tag_bookmarks');
    if (existing) {
      var existingMap = JSON.parse(existing);
      Object.keys(existingMap).forEach(function(tagName) {
        existingMap[tagName].forEach(function(bookmarkId) {
          var bookmark = doc.getBookmark(bookmarkId);
          if (bookmark) {
            bookmark.remove();
          }
        });
      });
    }
  } catch (e) {
    Logger.log('Error removing existing tag bookmarks: ' + e.toString());
  }

  // Create new bookmarks for each tag occurrence
  tagNames.forEach(function(tagName) {
    var pattern = '#' + escapeTagForRegex(tagName);
    var searchResult = body.findText(pattern);

    while (searchResult !== null) {
      var element = searchResult.getElement();
      if (element.getType() === DocumentApp.ElementType.TEXT) {
        var textElement = element.asText();
        var text = textElement.getText();
        if (isTagBoundary(text, searchResult.getEndOffsetInclusive())) {
          var position = doc.newPosition(textElement, searchResult.getStartOffset());
          var bookmark = doc.addBookmark(position);
          if (bookmark) {
            if (!bookmarksByTag[tagName]) {
              bookmarksByTag[tagName] = [];
            }
            bookmarksByTag[tagName].push(bookmark.getId());
          }
        }
      }
      searchResult = body.findText(pattern, searchResult);
    }
  });

  properties.setProperty('tag_bookmarks', JSON.stringify(bookmarksByTag));
  properties.setProperty('tag_bookmarks_last_updated', new Date().toISOString());
  properties.setProperty('tag_bookmarks_hash', JSON.stringify(tags));

  return bookmarksByTag;
}

/**
 * Ensure bookmarks are up to date with the current document tags
 */
function ensureTagBookmarks(documentTags) {
  var properties = PropertiesService.getDocumentProperties();
  var tags = documentTags || extractHashtagsFromDocument().tags || {};
  var currentHash = JSON.stringify(tags);
  var savedHash = properties.getProperty('tag_bookmarks_hash');
  var existing = properties.getProperty('tag_bookmarks');

  if (existing && savedHash === currentHash) {
    return;
  }

  buildTagBookmarks(tags);
}

/**
 * Jump the cursor to a bookmark for the given tag
 */
function jumpToTagBookmark(tagName, occurrenceIndex) {
  try {
    var doc = DocumentApp.getActiveDocument();
    var properties = PropertiesService.getDocumentProperties();
    var bookmarksData = properties.getProperty('tag_bookmarks');

    if (!bookmarksData) {
      ensureTagBookmarks();
      bookmarksData = properties.getProperty('tag_bookmarks');
    }

    var map = bookmarksData ? JSON.parse(bookmarksData) : {};
    var list = map[tagName] || [];

    if (!list.length) {
      ensureTagBookmarks();
      map = JSON.parse(properties.getProperty('tag_bookmarks') || '{}');
      list = map[tagName] || [];
    }

    if (!list.length) {
      return { success: false, error: 'No bookmarks found for tag.' };
    }

    var index = typeof occurrenceIndex === 'number' ? occurrenceIndex : 0;
    if (index < 0 || index >= list.length) {
      index = 0;
    }

    var bookmark = doc.getBookmark(list[index]);
    if (!bookmark) {
      return { success: false, error: 'Bookmark not found.' };
    }

    doc.setCursor(bookmark.getPosition());
    return { success: true, count: list.length, index: index };
  } catch (e) {
    Logger.log('Error jumping to tag bookmark: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Get tag occurrence snippets in the document
 */
function getTagOccurrences(tagName, maxChars) {
  try {
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
          }

          if (!snippet) {
            var parent = textElement.getParent();
            if (parent && parent.getType && parent.getType() === DocumentApp.ElementType.PARAGRAPH) {
              var body = parent.getParent();
              if (body && body.getChildIndex) {
                var parentIndex = body.getChildIndex(parent);
                for (var i = parentIndex + 1; i < body.getNumChildren(); i++) {
                  var sibling = body.getChild(i);
                  if (sibling.getType && sibling.getType() === DocumentApp.ElementType.PARAGRAPH) {
                    var siblingText = sibling.asParagraph().getText().replace(/\s+/g, ' ').trim();
                    if (siblingText) {
                      snippet = siblingText.substring(0, limit);
                      break;
                    }
                  }
                }
              }
            }
          }

          if (!snippet) {
            snippet = '(no text on next line)';
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

/**
 * Create a bookmark at the current cursor position
 */
function createBookmarkAtCursor() {
  try {
    var doc = DocumentApp.getActiveDocument();
    var cursor = doc.getCursor();

    if (!cursor) {
      return { success: false, error: 'No cursor position found.' };
    }

    var surroundingText = cursor.getSurroundingText();
    var surroundingOffset = cursor.getSurroundingTextOffset();

    if (!surroundingText || surroundingOffset === null) {
      return { success: false, error: 'Unable to resolve cursor position.' };
    }

    var position = doc.newPosition(surroundingText, surroundingOffset);
    var bookmark = doc.addBookmark(position);
    var bookmarkId = bookmark.getId();

    return {
      success: true,
      id: bookmarkId,
      url: doc.getUrl() + '#bookmark=' + bookmarkId
    };
  } catch (e) {
    Logger.log('Error creating bookmark: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Create a bookmark for each new tag (first occurrence only)
 */
function createBookmarksForNewTags(tagCounts) {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();
  var properties = PropertiesService.getDocumentProperties();
  var data = properties.getProperty('tag_first_bookmarks');
  var bookmarkMap = data ? JSON.parse(data) : {};

  Object.keys(tagCounts).forEach(function(tagName) {
    var existingId = bookmarkMap[tagName];
    if (existingId) {
      try {
        if (doc.getBookmark(existingId)) {
          return;
        }
      } catch (e) {
        Logger.log('Error reading bookmark ' + existingId + ': ' + e.toString());
      }
    }

    var pattern = '#' + escapeRegex(tagName) + '(?![a-zA-Z0-9_.-])';
    var searchResult = body.findText(pattern);
    if (!searchResult) {
      return;
    }

    var element = searchResult.getElement();
    if (element.getType() !== DocumentApp.ElementType.TEXT) {
      return;
    }

    var textElement = element.asText();
    var position = doc.newPosition(textElement, searchResult.getStartOffset());
    var bookmark = doc.addBookmark(position);
    bookmarkMap[tagName] = bookmark.getId();
  });

  properties.setProperty('tag_first_bookmarks', JSON.stringify(bookmarkMap));
}




/**
 * Test function to debug hashtag extraction
 */
function testTagExtraction() {
  var tags = extractHashtagsFromDocument();
  Logger.log('Tags found: ' + JSON.stringify(tags));
  return tags;
}

/**
 * Clear all stored data (for debugging)
 */
function clearAllData() {
  var ui = DocumentApp.getUi();
  var response = ui.alert(
    'Clear All Data',
    'This will delete all tag metadata. Are you sure?',
    ui.ButtonSet.YES_NO
  );
  
  if (response === ui.Button.YES) {
    PropertiesService.getDocumentProperties().deleteAllProperties();
    ui.alert('Success', 'All tag data has been cleared.', ui.ButtonSet.OK);
  }
}

function touchTagsUpdated_() {
  try {
    PropertiesService.getDocumentProperties()
      .setProperty('tags_last_updated',new Date().toISOString());
  } catch (e) {
    Logger.log('Error setting tags_last_updated: '+ e);
  }
}
