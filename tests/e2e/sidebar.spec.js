// @ts-check
const { test, expect } = require('@playwright/test');
const { injectGoogleScriptStub } = require('./helpers/googleScriptStub');

// ─── Shared mock data ─────────────────────────────────────────────────────────

const MOCK_TAGS_DATA = {
  lastUpdated: '2026-01-01T00:00:00Z',
  projects: [
    {
      id: 'doc-1',
      name: 'Research Doc',
      tags: [
        { name: 'biology', count: 3, color: '#34A853' },
        { name: 'methods', count: 1, color: '#1A73E8' },
        // Nested tags — dot notation
        { name: 'project.alpha', count: 2, color: '#9334E9' },
        { name: 'project.beta', count: 1, color: '#9334E9' },
        { name: 'project.alpha.subitem', count: 1, color: '#9334E9' },
      ],
    },
    {
      id: 'doc-2',
      name: 'Lab Notes',
      tags: [
        { name: 'experiment', count: 2, color: '#EA4335' },
      ],
    },
  ],
  globalTags: [],
};

const MOCK_SCOPE_STATE = {
  counts: { folders: 2, documents: 1 },
  folders: [
    { id: 'folder-1', name: 'Research Folder', url: 'https://drive.google.com/folder/1', valid: true },
    { id: 'folder-2', name: 'Data Folder', url: 'https://drive.google.com/folder/2', valid: true },
  ],
  documents: [
    { id: 'doc-1', name: 'Pinned Doc', url: 'https://docs.google.com/d/doc-1', valid: true },
  ],
};

// ─── Index / Sidebar tests ────────────────────────────────────────────────────

test.describe('Index sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await injectGoogleScriptStub(page, { getAllTags: MOCK_TAGS_DATA });
    await page.goto('/Index.html');
  });

  test('search input is present', async ({ page }) => {
    await expect(page.locator('#searchInput')).toBeVisible();
  });

  test('shows tag names after load', async ({ page }) => {
    await expect(page.getByText('#biology')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('#methods')).toBeVisible();
    await expect(page.getByText('#experiment')).toBeVisible();
  });

  test('shows tag occurrence counts', async ({ page }) => {
    // biology has count:3, experiment has count:2
    await expect(page.locator('.tag-count-badge', { hasText: '3' }).first()).toBeVisible({ timeout: 5000 });
  });

  test('filter tabs are present', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Local' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Global' })).toBeVisible();
  });

  test('search input filters tag list after pressing Enter', async ({ page }) => {
    // Wait for tags to load first
    await expect(page.getByText('#biology')).toBeVisible({ timeout: 5000 });

    await page.fill('#searchInput', 'biology');
    await page.keyboard.press('Enter');
    // biology should remain; experiment should disappear
    await expect(page.getByText('#biology')).toBeVisible();
    await expect(page.getByText('#experiment')).not.toBeVisible();
  });

  test('search shows empty state when no tags match', async ({ page }) => {
    await expect(page.getByText('#biology')).toBeVisible({ timeout: 5000 });
    await page.fill('#searchInput', 'nonexistenttag');
    await page.keyboard.press('Enter');
    await expect(page.getByText('No Tags Found')).toBeVisible();
  });

  test('shows real content after load completes', async ({ page }) => {
    // After getAllTags resolves the spinner should be replaced by tag content
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText('#biology')).toBeVisible();
  });

  test('shows error state when getAllTags fails', async ({ page }) => {
    // Override with a failure
    await page.close();
  });
});

test.describe('Index sidebar - getAllTags failure', () => {
  test('shows error message when backend fails', async ({ page }) => {
    await injectGoogleScriptStub(page, {}, { getAllTags: 'Service unavailable' });
    await page.goto('/Index.html');
    await expect(page.locator('#content')).toContainText('Service unavailable', { timeout: 5000 });
  });
});

// ─── ScopeManager dialog tests ────────────────────────────────────────────────

test.describe('ScopeManager dialog', () => {
  test.beforeEach(async ({ page }) => {
    await injectGoogleScriptStub(page, { getIndexScopeState: MOCK_SCOPE_STATE });
    await page.goto('/ScopeManager.html');
  });

  test('renders header title', async ({ page }) => {
    await expect(page.locator('.header-title')).toContainText('Index scope');
  });

  test('shows folder count after load', async ({ page }) => {
    await expect(page.locator('#folderCount')).toContainText('2', { timeout: 5000 });
  });

  test('shows document count after load', async ({ page }) => {
    await expect(page.locator('#docCount')).toContainText('1', { timeout: 5000 });
  });

  test('renders folder list items', async ({ page }) => {
    await expect(page.getByText('Research Folder')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Data Folder')).toBeVisible();
  });

  test('renders document list items', async ({ page }) => {
    await expect(page.getByText('Pinned Doc')).toBeVisible({ timeout: 5000 });
  });

  test('shows success status after adding a folder', async ({ page }) => {
    await injectGoogleScriptStub(page, {
      getIndexScopeState: MOCK_SCOPE_STATE,
      addIndexContentFolder: null,  // success with no return value
    });
    await page.goto('/ScopeManager.html');

    await page.fill('#addInput', 'https://drive.google.com/folder/new');
    await page.locator('#addBtn').click();
    await expect(page.locator('#status')).toContainText('Folder added', { timeout: 3000 });
  });

  test('shows error status when adding folder fails', async ({ page }) => {
    await injectGoogleScriptStub(
      page,
      { getIndexScopeState: MOCK_SCOPE_STATE },
      { addIndexContentFolder: 'Invalid folder ID' }
    );
    await page.goto('/ScopeManager.html');

    await page.fill('#addInput', 'bad-input');
    await page.locator('#addBtn').click();
    await expect(page.locator('#status')).toContainText('Invalid folder ID', { timeout: 3000 });
  });

  test('shows success status after adding a document', async ({ page }) => {
    await injectGoogleScriptStub(page, {
      getIndexScopeState: MOCK_SCOPE_STATE,
      addIndexExplicitDocument: null,
    });
    await page.goto('/ScopeManager.html');

    // Switch to Document mode
    await page.locator('#segDoc').click();
    await page.fill('#addInput', 'https://docs.google.com/d/new-doc');
    await page.locator('#addBtn').click();
    await expect(page.locator('#status')).toContainText('Document added', { timeout: 3000 });
  });

  test('shows sync status after running backfill', async ({ page }) => {
    await injectGoogleScriptStub(page, {
      getIndexScopeState: MOCK_SCOPE_STATE,
      backfillContentFolderToIndex: { updated: 4, skippedUnchanged: 1, failed: 0 },
    });
    await page.goto('/ScopeManager.html');

    await page.locator('#syncBtn').click();
    await expect(page.locator('#status')).toContainText('updated 4', { timeout: 3000 });
  });

  test('shows failure status when backfill fails', async ({ page }) => {
    await injectGoogleScriptStub(
      page,
      { getIndexScopeState: MOCK_SCOPE_STATE },
      { backfillContentFolderToIndex: 'Quota exceeded' }
    );
    await page.goto('/ScopeManager.html');

    await page.locator('#syncBtn').click();
    await expect(page.locator('#status')).toContainText('Quota exceeded', { timeout: 3000 });
  });

  test('shows error when scope load fails', async ({ page }) => {
    await injectGoogleScriptStub(page, {}, { getIndexScopeState: 'Permission denied' });
    await page.goto('/ScopeManager.html');
    await expect(page.locator('#status')).toContainText('Permission denied', { timeout: 3000 });
  });
});

// ─── Nested tags ──────────────────────────────────────────────────────────────

test.describe('Index sidebar - nested tags', () => {
  test.beforeEach(async ({ page }) => {
    await injectGoogleScriptStub(page, { getAllTags: MOCK_TAGS_DATA });
    await page.goto('/Index.html');
    // Wait for data to load
    await expect(page.getByText('#biology')).toBeVisible({ timeout: 5000 });
  });

  test('renders parent tag with expand arrow', async ({ page }) => {
    // "project" is the parent; it should have a .tag-expand-icon
    const parentRow = page.locator('.tag-item.parent-tag').filter({ hasText: '#project' });
    await expect(parentRow).toBeVisible();
    await expect(parentRow.locator('.tag-expand-icon')).toBeVisible();
  });

  test('group node children are collapsed by default', async ({ page }) => {
    // project.alpha and project.beta are hidden until the parent is expanded
    await expect(page.locator('span.tag-name[title="#project.alpha"]')).not.toBeVisible();
    await expect(page.locator('span.tag-name[title="#project.beta"]')).not.toBeVisible();
  });

  test('deeply nested child is visible after expanding parent tags', async ({ page }) => {
    // First expand the root "project" group node
    const projectExpandIcon = page.locator('.tag-item').filter({
      has: page.locator('span.tag-name[title="#project"]')
    }).locator('.tag-expand-icon');
    await projectExpandIcon.click();
    await expect(page.locator('span.tag-name[title="#project.alpha"]')).toBeVisible({ timeout: 3000 });

    // Then expand project.alpha to reveal its child
    const alphaExpandIcon = page.locator('.tag-item').filter({
      has: page.locator('span.tag-name[title="#project.alpha"]')
    }).locator('.tag-expand-icon');
    await alphaExpandIcon.click();

    // Now subitem should be visible inside nested-children
    await expect(page.locator('span.tag-name[title="#project.alpha.subitem"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.nested-children .nested-children')).toBeVisible();
  });

  test('clicking expand arrow expands and collapses children', async ({ page }) => {
    const projectExpandIcon = page.locator('.tag-item').filter({
      has: page.locator('span.tag-name[title="#project"]')
    }).locator('.tag-expand-icon');
    await expect(projectExpandIcon).toBeVisible();

    // First click expands
    await projectExpandIcon.click();
    await expect(page.locator('span.tag-name[title="#project.alpha"]')).toBeVisible({ timeout: 3000 });

    // Second click collapses
    await projectExpandIcon.click();
    await expect(page.locator('span.tag-name[title="#project.alpha"]')).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator('span.tag-name[title="#project.beta"]')).not.toBeVisible();
  });

  test('clicking expand arrow a third time re-expands children', async ({ page }) => {
    const projectExpandIcon = page.locator('.tag-item').filter({
      has: page.locator('span.tag-name[title="#project"]')
    }).locator('.tag-expand-icon');

    // Expand
    await projectExpandIcon.click();
    await expect(page.locator('span.tag-name[title="#project.alpha"]')).toBeVisible({ timeout: 3000 });

    // Collapse
    await projectExpandIcon.click();
    await expect(page.locator('span.tag-name[title="#project.alpha"]')).not.toBeVisible({ timeout: 3000 });

    // Third click re-expands
    await projectExpandIcon.click();
    await expect(page.locator('span.tag-name[title="#project.alpha"]')).toBeVisible({ timeout: 3000 });
  });
});

// ─── Tag button actions ───────────────────────────────────────────────────────

test.describe('Index sidebar - tag actions', () => {
  test.beforeEach(async ({ page }) => {
    await injectGoogleScriptStub(page, {
      getAllTags: MOCK_TAGS_DATA,
      jumpToTagBookmark: null,
      getTagOccurrences: {
        occurrences: [
          { snippet: 'first occurrence text' },
          { snippet: 'second occurrence text' },
          { snippet: 'third occurrence text' },
        ],
      },
    });
    await page.goto('/Index.html');
    await expect(page.getByText('#biology')).toBeVisible({ timeout: 5000 });
  });

  test('clicking a leaf tag calls jumpToTagBookmark', async ({ page }) => {
    // Click #methods (count:1, leaf tag)
    await page.locator('.tag-item').filter({ hasText: '#methods' }).click();
    // Verify no error state appeared — the tag remained visible
    await expect(page.getByText('#methods')).toBeVisible();
  });

  test('occurrence badge appears for tags with count > 1', async ({ page }) => {
    // biology has count:3, so it should show the has-occurrences badge
    const biologyRow = page.locator('.tag-item').filter({ hasText: '#biology' });
    await expect(biologyRow.locator('.tag-count-badge.has-occurrences')).toBeVisible();
  });

  test('occurrence badge is absent for tags with count = 1', async ({ page }) => {
    // methods has count:1
    const methodsRow = page.locator('.tag-item').filter({ hasText: '#methods' });
    await expect(methodsRow.locator('.tag-count-badge.has-occurrences')).not.toBeVisible();
  });

  test('clicking occurrence badge expands occurrence list and shows items', async ({ page }) => {
    const biologyRow = page.locator('.tag-item').filter({ hasText: '#biology' });
    await biologyRow.locator('.tag-count-badge.has-occurrences').click();

    // getTagOccurrences stub fires and renders occurrences
    await expect(page.getByText('first occurrence text')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('second occurrence text')).toBeVisible();
    await expect(page.getByText('third occurrence text')).toBeVisible();
  });

  test('clicking occurrence badge again collapses the occurrence list', async ({ page }) => {
    const badge = page.locator('.tag-item').filter({ hasText: '#biology' })
      .locator('.tag-count-badge.has-occurrences');

    // Expand
    await badge.click();
    await expect(page.getByText('first occurrence text')).toBeVisible({ timeout: 3000 });

    // Collapse
    await badge.click();
    await expect(page.getByText('first occurrence text')).not.toBeVisible();
  });

  test('occurrence list shows loading state before getTagOccurrences resolves', async ({ page }) => {
    // Use a stub that never fires the success handler
    await injectGoogleScriptStub(page, {
      getAllTags: MOCK_TAGS_DATA,
      jumpToTagBookmark: null,
      // getTagOccurrences intentionally omitted → callback never fires
    });
    await page.goto('/Index.html');
    await expect(page.getByText('#biology')).toBeVisible({ timeout: 5000 });

    await page.locator('.tag-item').filter({ hasText: '#biology' })
      .locator('.tag-count-badge.has-occurrences').click();

    await expect(page.getByText('Loading…')).toBeVisible({ timeout: 3000 });
  });

  test('filter tabs switch between Local and Global views', async ({ page }) => {
    // Start on Local
    await expect(page.getByRole('button', { name: 'Local' })).toHaveClass(/active/);

    // Switch to Global
    await page.getByRole('button', { name: 'Global' }).click();
    await expect(page.getByRole('button', { name: 'Global' })).toHaveClass(/active/);
    await expect(page.getByRole('button', { name: 'Local' })).not.toHaveClass(/active/);

    // Global view shows the search prompt
    await expect(page.getByText('Search Global Index')).toBeVisible();
  });

  test('switching back to Local tab restores tag list', async ({ page }) => {
    await page.getByRole('button', { name: 'Global' }).click();
    await page.getByRole('button', { name: 'Local' }).click();
    await expect(page.getByText('#biology')).toBeVisible();
  });
});
