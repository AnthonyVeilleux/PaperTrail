# PaperTrail

PaperTrail is a Google Docs add-on for researchers and note-takers who organize their work with hashtags. It scans the active document for `#tags`, surfaces them in a sidebar, indexes tags across a configurable set of documents into a Google Sheet, and exports tagged paragraphs to a new Doc.

## Features

- **Hashtag tag manager sidebar** — lists every `#tag` in the active document, grouped and searchable, with sort and date-range filters.
- **Date extraction** — pulls dates out of hashtag tokens (e.g. `#2026-04-30`) and surrounding paragraph context, displayed as date badges next to tags.
- **Cross-document index** — a Google Sheet acts as a tag index across multiple documents, kept in sync by a backfill job (`Sync Indexed Docs`).
- **Configurable index scope** — choose which folders or individual docs are indexed, via the `Index Scope` menu or the Scope Manager modal.
- **Tagged-notes export** — export paragraphs matching a tag selection to a new Google Doc.
- **Keyboard shortcut** — `Shift+K` while the sidebar is focused toggles it closed.

## Project Team

- Zihan Wu (Client) — zihan.wu@maine.edu
- Ben Yandell (Client Liaison / Developer) — benjamin.yandell@maine.edu
- Robert Kulow (Scrum Master / Developer) — robert.kulow@maine.edu
- Anthony Veilleux (DevOps Engineer / Developer) — anthony.veilleux@maine.edu
- Arius Ahmad (Developer) — arius.ahmad@maine.edu
- Vasu Patel (Developer) — vasu.patel@maine.edu

## Architecture

The add-on is split into backend Apps Script services and HTML-templated UI:

| File | Role |
| --- | --- |
| `Code.js` | Entry points: `onOpen`/`onInstall` menu wiring, sidebar show/hide, menu handlers. |
| `TagService.js` | Hashtag extraction from the active document, date parsing from tokens and paragraph context, tag state signature for change detection. |
| `CrossDocIndexService.js` | Reads/writes the cross-doc tag index spreadsheet; `backfillContentFolderToIndex` walks the configured scope and upserts tag rows. |
| `ProjectService.js` | Persists index-scope configuration (folder IDs, explicit doc IDs) in Script Properties. |
| `ExportService.js` | Builds the "Tagged Notes" export Doc from selected tags. |
| `Index.html` + `Scripts.html` + `Stylesheet.html` | The sidebar UI, composed via `<?!= include('...') ?>` from `Code.js`'s `include()` helper. |
| `ScopeManager.html` | Modal dialog for managing the index scope. |
| `ExportDialog.html` | Modal dialog for the export flow. |
| `appsscript.json` | Add-on manifest — declares this as a Docs add-on and requests Drive + Spreadsheets + Documents OAuth scopes. |
| `Documents/architecture.mmd` | Mermaid system architecture diagram. |
| `tests/` | Jest unit tests; `tests/e2e/` runs Playwright against an HTML build produced by `tests/build-html.js`. |

The GitHub repository is the **source of truth**. Each developer pushes their working copy into a personal Apps Script project for testing — never make changes you intend to keep directly in the Apps Script web editor.

## Menus installed by the add-on

- **PaperTrail** (add-on menu): `Open Tag Sidebar`, `Refresh Tags`, `Sync Indexed Docs`, `Index Scope` (submenu), `Export Tagged Notes`.
- **Index Scope** (top-level menu): `Manage Scope`, `Add Folder ID`, `Add Parent Folder Of Current Doc`, `Add Current Document`, `Add Document ID`.

## Prerequisites

- Git
- Node.js + npm (for `clasp` and the test suites)
- A Google account with access to Google Apps Script
- `@google/clasp` installed globally: `npm install -g @google/clasp`

## Setup

### 1. Clone and install

```bash
git clone https://github.com/AnthonyVeilleux/PaperTrail.git
cd PaperTrail
npm install
```

### 2. Authenticate clasp

```bash
clasp login
```

### 3. Create your personal dev Apps Script project

Because PaperTrail is a Docs Editor add-on (`appsscript.json` declares `addOns.docs`), the most reliable way to test it is **container-bound to a test Google Doc** — `onOpen` and `DocumentApp.getUi()` only fire from within a Doc.

**Recommended (container-bound):**

1. Create a new Google Doc you'll use for testing.
2. In that Doc: `Extensions → Apps Script`. Rename the project `<Your Name> - Dev Environment`.
3. Copy the script ID from the URL (`https://script.google.com/d/SCRIPT_ID/edit`).
4. From this repo:
   ```bash
   clasp clone SCRIPT_ID
   ```
   This will overwrite the local `.clasp.json` with one pointing at your project.

**Alternative (standalone):**

```bash
clasp create --type standalone --title "<Your Name> - Dev Environment"
```
A standalone project works for editing/pushing code but you'll need to bind/test it manually from a Doc.

> `.clasp.json` is gitignored and contains your personal script ID — never commit it.

### 4. Push code to your Apps Script project

```bash
clasp push
clasp open
```

In the Doc, reload, accept the OAuth consent (Drive + Spreadsheets + Documents scopes), then use the **PaperTrail** menu.

## Development workflow

1. **GitHub is the source of truth** — all official code changes go through this repo.
2. **Branch from `main`** — name branches `feat/<short-name>` (matches existing history; `fix/`, `chore/` etc. as appropriate).
3. **Pull before branching** — `git pull` on `main` first.
4. **Push to your dev Apps Script project after every edit** — `clasp push`.
5. **Conventional Commits** — commits follow `type(scope): subject`, e.g. `feat(sidebar): add date sort, range filter panel`.
6. **Open a PR for review** — never commit directly to `main`.

## Testing

```bash
npm test            # Jest unit tests (TagService, CrossDocIndexService, ExportService, ProjectService, Code)
npm run test:e2e    # Builds a static HTML bundle, then runs Playwright against the sidebar UI
npm run test:all    # Both
```

Jest ignores `tests/e2e/` (configured in `package.json`).

## Troubleshooting

- **`clasp` not found** — install Node.js, then `npm install -g @google/clasp`.
- **Auth issues** — `clasp logout && clasp login`.
- **`clasp push` errors** — confirm `.clasp.json` exists and contains your personal script ID.
- **Menus don't appear in the Doc** — the script must be bound to (or installed into) a Google Doc; reload the Doc after `clasp push`.
- **Index Sync errors about a missing spreadsheet** — open the Scope Manager and confirm an index spreadsheet is configured before running `Sync Indexed Docs`.

## Getting help

- Apps Script docs: https://developers.google.com/apps-script
- Project specs and design docs: see `Documents/` (SD, SRS, UIDD PDFs and the architecture Mermaid diagram).
- Ask questions in PR review threads.
