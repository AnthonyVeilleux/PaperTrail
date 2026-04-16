// @ts-check
const { test, expect } = require('@playwright/test');
const { injectGoogleScriptStub } = require('./helpers/googleScriptStub');

const MOCK_TAGS = ['biology', 'methods', 'experiment'];

test.describe('ExportDialog', () => {
  test.describe('tag loading', () => {
    test('populates the tag dropdown after load', async ({ page }) => {
      await injectGoogleScriptStub(page, { getTagNamesForExport: MOCK_TAGS });
      await page.goto('/ExportDialog.html');

      const select = page.locator('#tag');
      await expect(select.locator('option')).toHaveCount(MOCK_TAGS.length, { timeout: 5000 });
      await expect(select.locator('option[value="biology"]')).toHaveText('#biology');
      await expect(select.locator('option[value="methods"]')).toHaveText('#methods');
    });

    test('enables the Export button once tags load', async ({ page }) => {
      await injectGoogleScriptStub(page, { getTagNamesForExport: MOCK_TAGS });
      await page.goto('/ExportDialog.html');

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

      await expect(page.locator('#status')).toContainText('No tags found', { timeout: 5000 });
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
      await expect(page.locator('#exportButton')).toBeEnabled({ timeout: 5000 });
    });

    test('offers Google Doc and PDF format options', async ({ page }) => {
      await expect(page.locator('#format option[value="DOC"]')).toHaveText('Google Doc');
      await expect(page.locator('#format option[value="PDF"]')).toHaveText('PDF');
    });

    test('Google Doc is the default selected format', async ({ page }) => {
      await expect(page.locator('#format')).toHaveValue('DOC');
    });
  });

  test.describe('export action', () => {
    test.beforeEach(async ({ page }) => {
      await injectGoogleScriptStub(page, {
        getTagNamesForExport: MOCK_TAGS,
        exportTaggedNotes: { url: 'https://docs.google.com/exported-doc', type: 'DOC' },
      });
      await page.goto('/ExportDialog.html');
      await expect(page.locator('#exportButton')).toBeEnabled({ timeout: 5000 });
    });

    test('shows "Exporting..." status while export is in progress', async ({ page }) => {
      // Use a stub that never fires success so we can catch the interim state
      await injectGoogleScriptStub(page, { getTagNamesForExport: MOCK_TAGS });
      await page.goto('/ExportDialog.html');
      await expect(page.locator('#exportButton')).toBeEnabled({ timeout: 5000 });

      await page.locator('#exportButton').click();
      await expect(page.locator('#status')).toContainText('Exporting', { timeout: 3000 });
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
      await expect(page.locator('#exportButton')).toBeEnabled({ timeout: 5000 });

      await page.locator('#exportButton').click();
      await expect(page.locator('#status')).toContainText('Quota exceeded', { timeout: 5000 });
      await expect(page.locator('#exportButton')).toBeEnabled();
    });
  });
});
