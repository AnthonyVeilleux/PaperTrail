/**
 * ProjectService.js - Project management logic
 */

/**
 * Get default projects structure
 */
function getDefaultProjects() {
  return [createDefaultProject()];
}

/**
 * Create a default project
 */
function createDefaultProject() {
  return {
    id: 'default-project',
    name: 'Default Project',
    color: '#1A73E8',
    created: new Date().toISOString().split('T')[0],
    lastActivity: 'Just now',
    tags: []
  };
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
