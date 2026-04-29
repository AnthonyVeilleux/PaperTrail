// @ts-check
const { test, expect } = require('@playwright/test');
const { injectGoogleScriptStub } = require('./helpers/googleScriptStub');

const MOCK_TAGS_DATA = {
  lastUpdated: '2026-01-01T00:00:00Z',
  projects: [
    {
      id: 'doc-1',
      name: 'Research Doc',
      tags: [
        { name: 'biology', count: 5, color: '#34A853' },
        { name: 'methods', count: 3, color: '#1A73E8' },
        { name: 'biochemistry', count: 2, color: '#EA4335' },
      ],
    },
  ],
  globalTags: [],
};

test.describe('Index sidebar - autocomplete', () => {
  test.beforeEach(async ({ page }) => {
    await injectGoogleScriptStub(page, { getAllTags: MOCK_TAGS_DATA });
    await page.goto('/Index.html');
    await expect(page.getByText('#biology')).toBeVisible({ timeout: 5000 });
  });

  test('shows autocomplete dropdown after typing partial tag name', async ({ page }) => {
    await page.fill('#searchInput', 'bio');
    await expect(page.locator('#autocompleteList')).toHaveClass(/show/, { timeout: 3000 });
    await expect(page.locator('.autocomplete-item').first()).toBeVisible();
    // biology and biochemistry both match "bio"
    await expect(page.locator('.autocomplete-item', { hasText: 'biology' })).toBeVisible();
    await expect(page.locator('.autocomplete-item', { hasText: 'biochemistry' })).toBeVisible();
  });

  test('autocomplete items highlight the matched substring', async ({ page }) => {
    await page.fill('#searchInput', 'bio');
    await expect(page.locator('.autocomplete-item .autocomplete-match').first()).toBeVisible({ timeout: 3000 });
  });

  test('autocomplete is hidden when input is cleared', async ({ page }) => {
    await page.fill('#searchInput', 'bio');
    await expect(page.locator('#autocompleteList')).toHaveClass(/show/, { timeout: 3000 });

    await page.fill('#searchInput', '');
    await expect(page.locator('#autocompleteList')).not.toHaveClass(/show/);
  });

  test('pressing Escape closes the autocomplete dropdown', async ({ page }) => {
    await page.fill('#searchInput', 'bio');
    await expect(page.locator('#autocompleteList')).toHaveClass(/show/, { timeout: 3000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('#autocompleteList')).not.toHaveClass(/show/);
  });

  test('ArrowDown selects the first item', async ({ page }) => {
    await page.fill('#searchInput', 'bio');
    await expect(page.locator('#autocompleteList')).toHaveClass(/show/, { timeout: 3000 });

    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.autocomplete-item.selected')).toHaveCount(1);
  });

  test('ArrowDown then ArrowUp moves selection back', async ({ page }) => {
    await page.fill('#searchInput', 'bio');
    await expect(page.locator('.autocomplete-item').nth(1)).toBeVisible({ timeout: 3000 });

    await page.keyboard.press('ArrowDown'); // index 0
    await page.keyboard.press('ArrowDown'); // index 1
    await page.keyboard.press('ArrowUp');   // back to index 0
    const selected = page.locator('.autocomplete-item.selected');
    await expect(selected).toHaveCount(1);
    // first item should be selected
    const items = page.locator('.autocomplete-item');
    await expect(items.nth(0)).toHaveClass(/selected/);
  });

  test('pressing Enter on a selected autocomplete item fills the search input', async ({ page }) => {
    await page.fill('#searchInput', 'bio');
    await expect(page.locator('#autocompleteList')).toHaveClass(/show/, { timeout: 3000 });

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    const value = await page.locator('#searchInput').inputValue();
    expect(value).toMatch(/biology|biochemistry/);
  });

  test('clicking an autocomplete item fills the search input and closes the dropdown', async ({ page }) => {
    await page.fill('#searchInput', 'bio');
    await expect(page.locator('.autocomplete-item', { hasText: 'biology' })).toBeVisible({ timeout: 3000 });

    await page.locator('.autocomplete-item', { hasText: 'biology' }).click();

    const value = await page.locator('#searchInput').inputValue();
    expect(value).toMatch(/biology/);
    await expect(page.locator('#autocompleteList')).not.toHaveClass(/show/);
  });

  test('clicking outside the input closes the autocomplete dropdown', async ({ page }) => {
    await page.fill('#searchInput', 'bio');
    await expect(page.locator('#autocompleteList')).toHaveClass(/show/, { timeout: 3000 });

    await page.locator('.content').click();
    await expect(page.locator('#autocompleteList')).not.toHaveClass(/show/);
  });

  test('shows no autocomplete for a query that matches nothing', async ({ page }) => {
    await page.fill('#searchInput', 'zzznomatch');
    // autocomplete-list should not have 'show' class
    await expect(page.locator('#autocompleteList')).not.toHaveClass(/show/);
  });
});
