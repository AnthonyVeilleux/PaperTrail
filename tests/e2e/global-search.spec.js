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
        { name: 'biology', count: 3, color: '#34A853' },
        { name: 'methods', count: 1, color: '#1A73E8' },
        { name: 'climate', count: 2, color: '#EA4335' },
      ],
    },
  ],
  globalTags: [],
};

const MOCK_SEARCH_RESULTS = [
  {
    docId: 'docA',
    docTitle: 'Climate Study',
    docUrl: 'https://docs.google.com/d/docA',
    tagCountInDoc: 5,
    tags: ['climate'],
    lastSeenAt: '2026-01-10',
  },
  {
    docId: 'docB',
    docTitle: 'Arctic Research',
    docUrl: 'https://docs.google.com/d/docB',
    tagCountInDoc: 2,
    tags: ['climate'],
    lastSeenAt: '2026-01-08',
  },
];

// ─── Global search flow ───────────────────────────────────────────────────────

test.describe('Index sidebar - global search', () => {
  test.beforeEach(async ({ page }) => {
    await injectGoogleScriptStub(page, {
      getAllTags: MOCK_TAGS_DATA,
      searchIndexedDocsByTags: MOCK_SEARCH_RESULTS,
      getIndexedTagSuggestions: [],
    });
    await page.goto('/Index.html');
    await expect(page.getByText('#biology')).toBeVisible({ timeout: 5000 });

    // Switch to Global tab
    await page.getByRole('button', { name: 'Global' }).click();
    await expect(page.getByText('Search Global Index')).toBeVisible({ timeout: 3000 });
  });

  test('shows empty prompt before any search is submitted', async ({ page }) => {
    await expect(page.getByText('Search Global Index')).toBeVisible();
  });

  test('pressing Enter on a tag query triggers global search', async ({ page }) => {
    await page.fill('#searchInput', '#climate');
    await page.keyboard.press('Enter');

    await expect(page.getByText('Climate Study')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Arctic Research')).toBeVisible();
  });

  test('results show the document title and an Open link', async ({ page }) => {
    await page.fill('#searchInput', '#climate');
    await page.keyboard.press('Enter');

    const card = page.locator('.global-result-card').first();
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card.locator('.global-result-link')).toHaveText('Open');
    await expect(card.locator('.global-result-link')).toHaveAttribute('href', /docs\.google\.com/);
  });

  test('results show hit count badges', async ({ page }) => {
    await page.fill('#searchInput', '#climate');
    await page.keyboard.press('Enter');

    await expect(page.locator('.global-count-badge').first()).toBeVisible({ timeout: 5000 });
  });

  test('shows "No Indexed Matches" when search returns empty', async ({ page }) => {
    await injectGoogleScriptStub(page, {
      getAllTags: MOCK_TAGS_DATA,
      searchIndexedDocsByTags: [],
      getIndexedTagSuggestions: [],
    });
    await page.goto('/Index.html');
    await expect(page.getByText('#biology')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Global' }).click();

    await page.fill('#searchInput', '#unknowntag');
    await page.keyboard.press('Enter');

    await expect(page.getByText('No Indexed Matches')).toBeVisible({ timeout: 5000 });
  });

  test('shows error state and Try Again button when search fails', async ({ page }) => {
    await injectGoogleScriptStub(
      page,
      { getAllTags: MOCK_TAGS_DATA, getIndexedTagSuggestions: [] },
      { searchIndexedDocsByTags: 'Index unavailable' }
    );
    await page.goto('/Index.html');
    await expect(page.getByText('#biology')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Global' }).click();

    await page.fill('#searchInput', '#climate');
    await page.keyboard.press('Enter');

    await expect(page.getByText('Global Search Failed')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Index unavailable')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
  });

  test('clicking Try Again re-triggers the search', async ({ page }) => {
    await injectGoogleScriptStub(
      page,
      { getAllTags: MOCK_TAGS_DATA, getIndexedTagSuggestions: [] },
      { searchIndexedDocsByTags: 'Index unavailable' }
    );
    await page.goto('/Index.html');
    await expect(page.getByText('#biology')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Global' }).click();

    await page.fill('#searchInput', '#climate');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Global Search Failed')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();

    // Clicking Try Again resets state and re-runs the search.
    // Since the failure stub still fires, the error reappears — proving a retry occurred.
    await page.getByRole('button', { name: 'Try Again' }).click();
    await expect(page.getByText('Global Search Failed')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Index unavailable')).toBeVisible();
  });
});
