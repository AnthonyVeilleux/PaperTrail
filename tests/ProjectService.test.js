const {
  createDefaultProject,
  getDefaultProjects,
  getDefaultGlobalTags,
} = require('../ProjectService');

// ─── createDefaultProject ─────────────────────────────────────────────────────

describe('createDefaultProject', () => {
  test('returns an object with required shape', () => {
    const project = createDefaultProject();
    expect(project).toHaveProperty('id', 'default-project');
    expect(project).toHaveProperty('name', 'Default Project');
    expect(project).toHaveProperty('color');
    expect(project).toHaveProperty('created');
    expect(project).toHaveProperty('lastActivity');
    expect(project.tags).toEqual([]);
  });

  test('created field is a valid date string', () => {
    const { created } = createDefaultProject();
    expect(created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(created).toString()).not.toBe('Invalid Date');
  });

  test('each call returns a new independent object', () => {
    const a = createDefaultProject();
    const b = createDefaultProject();
    a.tags.push('x');
    expect(b.tags).toEqual([]);
  });
});

// ─── getDefaultProjects ───────────────────────────────────────────────────────

describe('getDefaultProjects', () => {
  test('returns an array with one element', () => {
    expect(getDefaultProjects()).toHaveLength(1);
  });

  test('the single element is a valid default project', () => {
    const [project] = getDefaultProjects();
    expect(project.id).toBe('default-project');
    expect(Array.isArray(project.tags)).toBe(true);
  });
});

// ─── getDefaultGlobalTags ─────────────────────────────────────────────────────

describe('getDefaultGlobalTags', () => {
  test('returns the four expected default tags', () => {
    const tags = getDefaultGlobalTags();
    const names = tags.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['Important', 'Urgent', 'Archive', 'Draft']));
  });

  test('all tags have count initialised to 0', () => {
    getDefaultGlobalTags().forEach((tag) => {
      expect(tag.count).toBe(0);
    });
  });

  test('tags have valid type fields', () => {
    const VALID_TYPES = ['priority', 'status'];
    getDefaultGlobalTags().forEach((tag) => {
      expect(VALID_TYPES).toContain(tag.type);
    });
  });

  test('each call returns a new independent array', () => {
    const a = getDefaultGlobalTags();
    a[0].count = 99;
    const b = getDefaultGlobalTags();
    expect(b[0].count).toBe(0);
  });
});
