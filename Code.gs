/**
 * Research Tag Manager for Google Docs
 * Code.gs - Backend Script 
 */

// Install menu when document opens
function onOpen() {
  DocumentApp.getUi()
    .createMenu('Tag Manager')
    .addItem('Open Tag Sidebar', 'showSidebar')
    .addItem('Refresh Tags', 'refreshAllTags')
    .addItem('Enable Hashtag Autocomplete', 'enableHashtagAutocomplete')
    .addSeparator()
    .addItem('Settings', 'showSettings')
    .addToUi();
  
  // Display keyboard shortcut hint to user
  var ui = DocumentApp.getUi();
  ui.showModelessDialog(
    HtmlService.createHtmlOutput('<p style="padding:8px;font-size:12px;"><strong>💡 Tips:</strong><br>• Press <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:3px;border:1px solid #ccc;">Shift+K</kbd> to toggle sidebar<br>• Use <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:3px;border:1px solid #ccc;">#</kbd> + type to autocomplete hashtags</p>')
      .setWidth(350)
      .setHeight(100),
    'Tag Manager Tips'
  );
}

// Show the sidebar
function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Tag Manager')
    .setWidth(360);
  DocumentApp.getUi().showSidebar(html);
}

// Hide/close the sidebar (called via Ctrl+K from document or sidebar)
function hideSidebar() {
  DocumentApp.getUi().clear();
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
      return {};
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
      hierarchy: hierarchyMap
    };
  } catch (e) {
    Logger.log('Error extracting hashtags: ' + e.toString());
    return { tags: {}, hierarchy: {} };
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
      hierarchy: documentTags.hierarchy || {}
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
// Save tags to Properties Service (Auto-sync)
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
 * Create a default project
 */
function createDefaultProject() {
  return {
    id: 'default-project',
    name: 'My Research',
    color: '#1A73E8',
    created: new Date().toISOString().split('T')[0],
    lastActivity: 'Just now',
    tags: []
  };
}

/**
 * Get default projects structure
 */
function getDefaultProjects() {
  return [createDefaultProject()];
}

/**
 * Get default global tags
 */
function getDefaultGlobalTags() {
  return [
    { name: 'Important', count: 0, color: '#EA4335', type: 'priority' },
    { name: 'Urgent', count: 0, color: '#FBBC04', type: 'priority' },
    { name: 'Archive', count: 0, color: '#5F6368', type: 'status' },
    { name: 'Draft', count: 0, color: '#9334E9', type: 'status' }
  ];
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
 * Update projects with new tag information
 */
function updateProjectsWithNewTagInfo(tagName, metadata) {
  try {
    var properties = PropertiesService.getDocumentProperties();
    var projectsData = properties.getProperty('projects');
    
    if (!projectsData) return;
    
    var projects = JSON.parse(projectsData);
    var updated = false;
    
    projects.forEach(function(project) {
      if (project.tags) {
        project.tags.forEach(function(tag) {
          if (tag.name === tagName) {
            tag.color = metadata.color;
            tag.metadata = metadata;
            updated = true;
          }
        });
      }
    });
    
    if (updated) {
      properties.setProperty('projects', JSON.stringify(projects));
    }
  } catch (e) {
    Logger.log('Error updating projects: ' + e.toString());
  }
}

/**
 * Rename tag throughout document
 */
function renameTagInDocument(oldName, newName) {
  try {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();
    
    // Create regex pattern for the old tag
    var pattern = '#' + oldName + '(?![a-zA-Z0-9_-])';
    
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
    var pattern = '#' + tagName + '(?![a-zA-Z0-9_-])';
    
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
    // mark tags as updated after modifying projects
    try { properties.setProperty('tags_last_updated', new Date().toISOString()); } catch(e) { Logger.log('Error setting tags_last_updated: ' + e.toString()); }
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
    var pattern = '#' + tagName + '(?![a-zA-Z0-9_-])';
    
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
 * Get random color for new tags
 */
function getRandomColor() {
  var colors = ['#1A73E8', '#34A853', '#FBBC04', '#EA4335', '#9334E9', '#0891B2'];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Refresh all tags (called from menu)
 */
function refreshAllTags() {
  try {
    var ui = DocumentApp.getUi();
    
    // Extract tags
    var tags = extractHashtagsFromDocument();
    var count = Object.keys(tags).length;
    
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
 * Show settings dialog
 */
function showSettings() {
  var html = HtmlService.createHtmlOutput('<p style="padding: 20px;">Settings coming soon...</p>')
    .setWidth(300)
    .setHeight(200);
  DocumentApp.getUi().showModalDialog(html, 'Settings');
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

/**
 * Enable hashtag autocomplete feature in the document
 */
function enableHashtagAutocomplete() {
  var ui = DocumentApp.getUi();
  var response = ui.alert(
    'Hashtag Autocomplete',
    'This feature is built-in! Just type a hashtag followed by a letter or number, and autocomplete suggestions will appear.\n\nExample: Type "#imp" and you\'ll see suggestions for tags containing "imp".',
    ui.ButtonSet.OK
  );
}

/**
 * Get hashtag suggestions based on partial input
 * Used for autocomplete feature in the document
 */
function getHashtagSuggestions(partialTag) {
  try {
    // Get all tags from the document
    var allTags = getAllTags();
    
    if (!allTags || !allTags.projects) {
      return { success: false, suggestions: [] };
    }
    
    // Combine all tags from projects
    var allTagsList = [];
    allTags.projects.forEach(function(project) {
      if (project.tags) {
        project.tags.forEach(function(tag) {
          if (!allTagsList.find(t => t.name === tag.name)) {
            allTagsList.push({
              name: tag.name,
              count: tag.count,
              color: tag.color
            });
          }
        });
      }
    });
    
    // Add global tags
    if (allTags.globalTags) {
      allTags.globalTags.forEach(function(tag) {
        if (!allTagsList.find(t => t.name === tag.name)) {
          allTagsList.push({
            name: tag.name,
            count: tag.count,
            color: tag.color
          });
        }
      });
    }
    
    // Filter by partial match (case-insensitive)
    var query = partialTag.toLowerCase();
    var suggestions = allTagsList
      .filter(tag => tag.name.toLowerCase().includes(query))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Limit to 5 suggestions
    
    return {
      success: true,
      suggestions: suggestions,
      count: suggestions.length
    };
  } catch (e) {
    Logger.log('Error getting hashtag suggestions: ' + e.toString());
    return { success: false, suggestions: [], error: e.toString() };
  }
}

/**
 * Show hashtag autocomplete dialog for the user
 */
function showHashtagAutocomplete() {
  try {
    var doc = DocumentApp.getActiveDocument();
    var selection = doc.getSelection();
    
    if (!selection) {
      DocumentApp.getUi().alert('Please place your cursor in the document where you want to add a hashtag.');
      return;
    }
    
    // Get the selected element
    var selectedElement = selection.getRangeElements()[0];
    var text = selectedElement.getElement().asText().getText();
    var offset = selection.getRangeElements()[0].getStartOffset();
    
    // Find hashtag pattern before cursor (now supports nested tags with dots)
    var beforeCursor = text.substring(0, offset);
    var hashtagMatch = beforeCursor.match(/#([a-zA-Z0-9_.-]*)$/);
    
    if (!hashtagMatch) {
      return;
    }
    
    var partialTag = hashtagMatch[1];
    var suggestions = getHashtagSuggestions(partialTag);
    
    if (suggestions.count === 0) {
      return;
    }
    
    // Create HTML for autocomplete dialog
    var html = HtmlService.createHtmlOutput(`
      <div style="font-family: Arial, sans-serif; width: 250px;">
        <div style="margin-bottom: 10px;">
          <div style="font-weight: bold; margin-bottom: 8px; color: #202124;">Hashtag Suggestions</div>
          <div id="suggestions"></div>
        </div>
        <div style="font-size: 11px; color: #5f6368; margin-top: 10px;">
          Click a suggestion to insert it (supports nested: #Parent.Child)
        </div>
      </div>
      <script>
        var suggestionsList = ${JSON.stringify(suggestions.suggestions)};
        var partial = '${partialTag}';
        
        var html = suggestionsList.map(tag => `
          <div onclick="google.script.run.insertHashtag(\\'${tag.name}\\'); google.script.host.close();" 
               style="padding: 8px; margin: 4px 0; background: #f8f9fa; border-radius: 4px; cursor: pointer; border-left: 3px solid ${tag.color};">
            <span style="font-weight: 500;">#${tag.name}</span>
            <span style="font-size: 11px; color: #5f6368; margin-left: 8px;">[${tag.count}]</span>
          </div>
        `).join('');
        
        document.getElementById('suggestions').innerHTML = html;
      </script>
    `);
    
    DocumentApp.getUi().showModelessDialog(html, 'Insert Hashtag');
  } catch (e) {
    Logger.log('Error in showHashtagAutocomplete: ' + e.toString());
  }
}

/**
 * Insert a hashtag at the current cursor position (supports nested tags)
 */
function insertHashtag(tagName) {
  try {
    var doc = DocumentApp.getActiveDocument();
    var selection = doc.getSelection();
    
    if (!selection) {
      return;
    }
    
    var selectedElement = selection.getRangeElements()[0];
    var text = selectedElement.getElement().asText();
    var offset = selection.getRangeElements()[0].getStartOffset();
    
    // Find the hashtag pattern and replace it (now supports nested with dots)
    var beforeCursor = text.getText().substring(0, offset);
    var hashtagMatch = beforeCursor.match(/#([a-zA-Z0-9_.-]*)$/);
    
    if (hashtagMatch) {
      var matchStart = offset - hashtagMatch[0].length;
      var matchEnd = offset - 1;
      
      // Delete the partial hashtag
      text.deleteText(matchStart, matchEnd);
      // Insert the complete hashtag
      text.insertText(matchStart, '#' + tagName);
    }
  } catch (e) {
    Logger.log('Error inserting hashtag: ' + e.toString());
  }
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
