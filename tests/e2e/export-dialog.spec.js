// @ts-check
const { test, expect } = require('@playwright/test');
const { injectGoogleScriptStub } = require('./helpers/googleScriptStub');

const MOCK_TAGS = [
  { name: 'biology', count: 5, color: '#1A73E8' },
  { name: 'methods', count: 2, color: '#34A853' },
  { name: 'experiment', count: 1, color: '#EA4335' }
];

test.describe('ExportDialog', () => {
  test.describe('tag loading', () => {
    test('populates tag chips after load', async ({ page }) => {
      await injectGoogleScriptStub(page, { getTagNamesForExport: MOCK_TAGS });
      await page.goto('/ExportDialog.html');

      await expect(page.locator('.tag-row')).toHaveCount(MOCK_TAGS.length, { timeout: 5000 });
      await expect(page.getByText('#biology')).toBeVisible();
      await expect(page.getByText('#methods')).toBeVisible();
    });

    test('enables the Export button once a tag is selected', async ({ page }) => {
      await injectGoogleScriptStub(page, { getTagNamesForExport: MOCK_TAGS });
      await page.goto('/ExportDialog.html');

      await expect(page.locator('#exportButton')).toBeDisabled();
      await page.locator('.tag-row', { hasText: '#biology' }).click();
      await expect(page.locator('#exportButton')).toBeEnabled({ timeout: 5000 });
    });

    test('Export button is disabled on initial render before tags load', async ({ page }) => {
      // stub never fires — callback never called
      await injectGoogleScriptStub(page, {});
      await page.goto('/ExportDialog.html');

      await expect(page.locator('#exportButton')).toBeDisabled();
    });

    test('shows "No tags found" and keeps button disabled when document has no tags', async ({ page }) => {
      await injectGoogleScriptStub(page, { getTagNamesForExport: [] });
      await page.goto('/ExportDialog.html');

      await expect(page.locator('#tagList')).toContainText('No tags found', { timeout: 5000 });
      await expect(page.locator('#exportButton')).toBeDisabled();
    });

    test('shows error status when loading tags fails', async ({ page }) => {
      await injectGoogleScriptStub(page, {}, { getTagNamesForExport: 'Permission denied' });
      await page.goto('/ExportDialog.html');

      await expect(page.locator('#status')).toContainText('Permission denied', { timeout: 5000 });
      await expect(page.locator('#exportButton')).toBeDisabled();
    });
  });

  test.describe('format selector', () => {
    test.beforeEach(async ({ page }) => {
      await injectGoogleScriptStub(page, { getTagNamesForExport: MOCK_TAGS });
      await page.goto('/ExportDialog.html');
      await page.locator('.tag-row', { hasText: '#biology' }).click();
      await expect(page.locator('#exportButton')).toBeEnabled({ timeout: 5000 });
    });

    test('offers Google Doc and PDF format options', async ({ page }) => {
      await expect(page.locator('.format-btn[data-format="DOC"]')).toHaveText('Google Doc');
      await expect(page.locator('.format-btn[data-format="PDF"]')).toHaveText('PDF');
    });

    test('Google Doc is the default selected format', async ({ page }) => {
      await expect(page.locator('.format-btn[data-format="DOC"]')).toHaveClass(/active/);
    });
  });

  test('shows "Exporting..." status while export is in progress', async ({ page }) => {
    // Use a stub that never fires success so we can catch the interim state
    await injectGoogleScriptStub(page, { getTagNamesForExport: MOCK_TAGS });
    await page.goto('/ExportDialog.html');
    await page.locator('.tag-row', { hasText: '#biology' }).click();
    await expect(page.locator('#exportButton')).toBeEnabled({ timeout: 5000 });

    await page.locator('#exportButton').click();
    await expect(page.locator('#status')).toContainText('Exporting', { timeout: 3000 });
  });

  test.describe('destination and source link options', () => {
    test.beforeEach(async ({ page }) => {
      await injectGoogleScriptStub(page, {
        getTagNamesForExport: MOCK_TAGS,
        getDefaultExportFolder: { folderId: 'folder123', folderName: 'Project Folder' },
        resolveFolderId: { folderId: 'folder456', folderName: 'Resolved Folder' },
        exportTaggedNotes: { url: 'https://docs.google.com/exported-doc', type: 'DOC' },
      });
      await page.goto('/ExportDialog.html');
      await page.locator('.tag-row', { hasText: '#biology' }).click();
      await expect(page.locator('#exportButton')).toBeEnabled({ timeout: 5000 });
    });

    test('shows destination folder input and quick link', async ({ page }) => {
      await expect(page.locator('#folderInput')).toBeVisible();
      await expect(page.getByText('Use this document\'s folder')).toBeVisible();
    });

    test('source link checkbox is checked by default', async ({ page }) => {
      await expect(page.locator('#includeSource')).toBeChecked();
    });

    test('metadata and divider checkboxes are checked by default', async ({ page }) => {
      await expect(page.locator('#includeMetadata')).toBeChecked();
      await expect(page.locator('#includeDividers')).toBeChecked();
    });

    test('document order is the default sort', async ({ page }) => {
      await expect(page.locator('.sort-btn[data-sort="document"]')).toHaveClass(/active/);
    });

    test('fills folder input and shows name when quick link is clicked', async ({ page }) => {
      await page.getByText('Use this document\'s folder').click();
      await expect(page.locator('#folderInput')).toHaveValue('folder123');
      await expect(page.locator('#folderName')).toContainText('Project Folder');
    });
  });

  test.describe('export action', () => {
    test.beforeEach(async ({ page }) => {
      await injectGoogleScriptStub(page, {
        getTagNamesForExport: MOCK_TAGS,
        exportTaggedNotes: { url: 'https://docs.google.com/exported-doc', type: 'DOC' },
      });
      await page.goto('/ExportDialog.html');
      await page.locator('.tag-row', { hasText: '#biology' }).click();
      await expect(page.locator('#exportButton')).toBeEnabled({ timeout: 5000 });
    });

    test('shows success status with a link after export completes', async ({ page }) => {
      await page.locator('#exportButton').click();
      await expect(page.locator('#status')).toContainText('Done', { timeout: 5000 });
      await expect(page.locator('#status a')).toHaveAttribute('href', 'https://docs.google.com/exported-doc');
    });

    test('re-enables Export button after a successful export', async ({ page }) => {
      await page.locator('#exportButton').click();
      await expect(page.locator('#exportButton')).toBeEnabled({ timeout: 5000 });
    });

    test('shows error status when export call fails', async ({ page }) => {
      await injectGoogleScriptStub(
        page,
        { getTagNamesForExport: MOCK_TAGS },
        { exportTaggedNotes: 'Quota exceeded' }
      );
      await page.goto('/ExportDialog.html');
      await page.locator('.tag-row', { hasText: '#biology' }).click();
      await expect(page.locator('#exportButton')).toBeEnabled({ timeout: 5000 });

      await page.locator('#exportButton').click();
      await expect(page.locator('#status')).toContainText('Quota exceeded', { timeout: 5000 });
      await expect(page.locator('#exportButton')).toBeEnabled();
    });
  });
});
