/**
 * CrossDocIndexService.js - Spreadsheet-backed index for cross-document tag search.
 */

var INDEX_DB_PROPERTY_KEY = 'PAPERTRAIL_INDEX_SHEET_ID';
var CONTENT_FOLDER_PROPERTY_KEY = 'PAPERTRAIL_CONTENT_FOLDER_ID';
var CONTENT_FOLDERS_PROPERTY_KEY = 'PAPERTRAIL_CONTENT_FOLDER_IDS';
var EXPLICIT_DOC_IDS_PROPERTY_KEY = 'PAPERTRAIL_EXPLICIT_DOC_IDS';
var INDEX_SPREADSHEET_NAME = 'PaperTrail_Index';
var INDEX_SHEET_NAME = 'TagIndex';
var INDEX_CACHE_META_KEY = 'papertrail_idx_meta_v1';
var INDEX_CACHE_CHUNK_PREFIX = 'papertrail_idx_chunk_v1_';
var INDEX_CACHE_TTL_SECONDS = 21600;
var INDEX_CACHE_CHUNK_BYTES = 90000;
var INDEX_HEADERS = [
	'tag',
	'docId',
	'docTitle',
	'docUrl',
	'tagCountInDoc',
	'textSignature',
	'lastSeenAt'
];

/**
 * Ensure the index spreadsheet and sheet exist.
 */
function getOrCreateIndexSheet_() {
	var scriptProps = PropertiesService.getScriptProperties();
	var spreadsheetId = scriptProps.getProperty(INDEX_DB_PROPERTY_KEY);
	var spreadsheet = null;

	if (spreadsheetId) {
		try {
			spreadsheet = SpreadsheetApp.openById(spreadsheetId);
		} catch (e) {
			Logger.log('Index spreadsheet lookup failed, creating a new one: ' + e.toString());
			spreadsheet = null;
		}
	}

	if (!spreadsheet) {
		spreadsheet = findExistingIndexSpreadsheet_();
		if (!spreadsheet) {
			spreadsheet = SpreadsheetApp.create(INDEX_SPREADSHEET_NAME);
		}
		scriptProps.setProperty(INDEX_DB_PROPERTY_KEY, spreadsheet.getId());
	}

	var sheet = spreadsheet.getSheetByName(INDEX_SHEET_NAME);
	if (!sheet) {
		sheet = spreadsheet.insertSheet(INDEX_SHEET_NAME);
	}

	if (sheet.getLastRow() === 0) {
		sheet.getRange(1, 1, 1, INDEX_HEADERS.length).setValues([INDEX_HEADERS]);
		sheet.setFrozenRows(1);
	}

	return sheet;
}

/**
 * Reuse an existing index spreadsheet by name when script properties are not initialized.
 */
function findExistingIndexSpreadsheet_() {
	try {
		var files = DriveApp.searchFiles(
			"title = '" + INDEX_SPREADSHEET_NAME + "' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
		);

		if (files.hasNext()) {
			return SpreadsheetApp.openById(files.next().getId());
		}
	} catch (e) {
		Logger.log('Existing index spreadsheet search failed: ' + e.toString());
	}

	return null;
}

/**
 * Upsert active document tags to spreadsheet index.
 */
function upsertCurrentDocumentToIndex_() {
	var doc = DocumentApp.getActiveDocument();
	var parsed = extractHashtagsFromDocument();
	return upsertDocumentTagsToIndex_(doc.getId(), doc.getName(), doc.getUrl(), parsed);
}

/**
 * Replace all index rows for a document with the latest parsed tag data.
 */
function upsertDocumentTagsToIndex_(docId, docTitle, docUrl, parsed) {
	var lock = LockService.getScriptLock();
	lock.waitLock(30000);

	try {
		var sheet = getOrCreateIndexSheet_();
		var rows = sheet.getDataRange().getValues();
		var updated = replaceDocumentRowsInData_(rows, docId, docTitle, docUrl, parsed);
		writeIndexRows_(sheet, updated);

		var tagNames = Object.keys((parsed && parsed.tags) ? parsed.tags : {});
		return { success: true, indexedRows: tagNames.length, docId: docId };
	} catch (e) {
		Logger.log('Error upserting document tags to index: ' + e.toString());
		return { success: false, error: e.toString(), docId: docId };
	} finally {
		lock.releaseLock();
	}
}

/**
 * Build a new in-memory row array with the given doc's rows replaced by fresh tag data.
 * existingRows[0] is the header row and is always preserved.
 */
function replaceDocumentRowsInData_(existingRows, docId, docTitle, docUrl, parsed) {
	var out = existingRows.length ? [existingRows[0]] : [INDEX_HEADERS.slice()];
	for (var i = 1; i < existingRows.length; i++) {
		if (String(existingRows[i][1]) !== String(docId)) {
			out.push(existingRows[i]);
		}
	}

	var tagCounts = (parsed && parsed.tags) ? parsed.tags : {};
	var tagNames = Object.keys(tagCounts);
	if (!tagNames.length) {
		return out;
	}

	var nowIso = new Date().toISOString();
	var signature = (parsed && parsed.textSignature) ? parsed.textSignature : '';

	tagNames.forEach(function(tagName) {
		out.push([
			tagName,
			docId,
			docTitle,
			docUrl,
			tagCounts[tagName],
			signature,
			nowIso
		]);
	});

	return out;
}

/**
 * Overwrite the sheet with the given rows (including header) in a single pass.
 * Trims any surplus rows left over from a prior, larger dataset.
 */
function writeIndexRows_(sheet, rows) {
	var existingLastRow = sheet.getLastRow();
	if (existingLastRow > rows.length) {
		sheet.deleteRows(rows.length + 1, existingLastRow - rows.length);
	}
	if (rows.length) {
		sheet.getRange(1, 1, rows.length, INDEX_HEADERS.length).setValues(rows);
	}
	invalidateIndexCache_();
}

/**
 * Read index rows, preferring the CacheService copy. Falls through to the sheet on miss.
 */
function getCachedIndexRows_() {
	try {
		var cache = CacheService.getScriptCache();
		var meta = cache.get(INDEX_CACHE_META_KEY);
		if (meta) {
			var parsed = JSON.parse(meta);
			var chunkKeys = [];
			for (var i = 0; i < parsed.chunks; i++) {
				chunkKeys.push(INDEX_CACHE_CHUNK_PREFIX + i);
			}
			var chunks = cache.getAll(chunkKeys);
			var joined = '';
			var complete = true;
			for (var j = 0; j < parsed.chunks; j++) {
				var piece = chunks[INDEX_CACHE_CHUNK_PREFIX + j];
				if (piece === undefined || piece === null) {
					complete = false;
					break;
				}
				joined += piece;
			}
			if (complete) {
				return JSON.parse(joined);
			}
		}
	} catch (e) {
		Logger.log('Index cache read failed: ' + e.toString());
	}

	var rows = getIndexRows_();
	cacheIndexRows_(rows);
	return rows;
}

/**
 * Store the rows in CacheService, chunked to fit the per-key size limit.
 */
function cacheIndexRows_(rows) {
	try {
		var payload = JSON.stringify(rows);
		var chunkCount = Math.max(1, Math.ceil(payload.length / INDEX_CACHE_CHUNK_BYTES));
		var entries = {};
		for (var i = 0; i < chunkCount; i++) {
			entries[INDEX_CACHE_CHUNK_PREFIX + i] = payload.slice(i * INDEX_CACHE_CHUNK_BYTES, (i + 1) * INDEX_CACHE_CHUNK_BYTES);
		}
		entries[INDEX_CACHE_META_KEY] = JSON.stringify({ chunks: chunkCount });
		CacheService.getScriptCache().putAll(entries, INDEX_CACHE_TTL_SECONDS);
	} catch (e) {
		Logger.log('Index cache write failed: ' + e.toString());
	}
}

/**
 * Drop every cached chunk + meta entry. Called after any sheet mutation.
 */
function invalidateIndexCache_() {
	try {
		var cache = CacheService.getScriptCache();
		var meta = cache.get(INDEX_CACHE_META_KEY);
		var keys = [INDEX_CACHE_META_KEY];
		if (meta) {
			var parsed = JSON.parse(meta);
			for (var i = 0; i < parsed.chunks; i++) {
				keys.push(INDEX_CACHE_CHUNK_PREFIX + i);
			}
		}
		cache.removeAll(keys);
	} catch (e) {
		Logger.log('Index cache invalidation failed: ' + e.toString());
	}
}

/**
 * Search indexed documents by tag name. Substring match — querying "note" matches "notes".
 */
function searchIndexedDocsByTag(tagName) {
	var normalizedTag = String(tagName || '').replace(/^#/, '').trim().toLowerCase();
	if (!normalizedTag) {
		return [];
	}

	try {
		var values = getCachedIndexRows_();
		var matches = [];
		var i;

		for (i = 1; i < values.length; i++) {
			var rowTag = String(values[i][0] || '').trim().toLowerCase();
			if (rowTag && rowTag.indexOf(normalizedTag) !== -1) {
				matches.push({
					tag: values[i][0],
					docId: values[i][1],
					docTitle: values[i][2],
					docUrl: values[i][3],
					tagCountInDoc: values[i][4],
					textSignature: values[i][5],
					lastSeenAt: values[i][6]
				});
			}
		}

		return matches;
	} catch (e) {
		Logger.log('Error searching indexed docs by tag: ' + e.toString());
		return [];
	}
}

/**
 * Search indexed documents by multiple tags using substring matching.
 * Mode can be 'AND' (default) or 'OR'.
 */
function searchIndexedDocsByTags(tags, mode) {
	var requestedTags = Array.isArray(tags) ? tags : [];
	var normalizedTags = dedupeStringList_(requestedTags.map(function(tag) {
		return String(tag || '').replace(/^#/, '').trim().toLowerCase();
	})).filter(function(tag) { return !!tag; });

	if (!normalizedTags.length) {
		return [];
	}

	var queryMode = String(mode || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';

	try {
		var values = getCachedIndexRows_();
		var byDocId = {};
		var i;

		for (i = 1; i < values.length; i++) {
			var rowTag = String(values[i][0] || '').trim().toLowerCase();
			if (!rowTag) {
				continue;
			}

			var matchedQueryIndices = [];
			for (var q = 0; q < normalizedTags.length; q++) {
				if (rowTag.indexOf(normalizedTags[q]) !== -1) {
					matchedQueryIndices.push(q);
				}
			}
			if (!matchedQueryIndices.length) {
				continue;
			}

			var docId = String(values[i][1] || '').trim();
			if (!docId) {
				continue;
			}

			if (!byDocId[docId]) {
				byDocId[docId] = {
					docId: docId,
					docTitle: values[i][2],
					docUrl: values[i][3],
					textSignature: values[i][5],
					lastSeenAt: values[i][6],
					tagCountInDoc: 0,
					matchedTags: {},
					matchedQueryIndices: {}
				};
			}

			var count = Number(values[i][4] || 0);
			byDocId[docId].tagCountInDoc += count;
			byDocId[docId].matchedTags[rowTag] = (byDocId[docId].matchedTags[rowTag] || 0) + count;
			matchedQueryIndices.forEach(function(qi) {
				byDocId[docId].matchedQueryIndices[qi] = true;
			});
		}

		var requiredCount = normalizedTags.length;
		var output = Object.keys(byDocId)
			.map(function(docId) {
				var record = byDocId[docId];
				record.matchCount = Object.keys(record.matchedQueryIndices).length;
				record.tags = Object.keys(record.matchedTags);
				delete record.matchedQueryIndices;
				return record;
			})
			.filter(function(record) {
				return queryMode === 'AND' ? record.matchCount === requiredCount : record.matchCount > 0;
			})
			.sort(function(a, b) {
				if (b.matchCount !== a.matchCount) {
					return b.matchCount - a.matchCount;
				}
				return Number(b.tagCountInDoc || 0) - Number(a.tagCountInDoc || 0);
			});

		return output;
	} catch (e) {
		Logger.log('Error searching indexed docs by tags: ' + e.toString());
		return [];
	}
}

/**
 * Return tag suggestions from indexed rows for autocomplete.
 */
function getIndexedTagSuggestions(prefix, limit) {
	var normalizedPrefix = String(prefix || '').replace(/^#/, '').trim().toLowerCase();
	var maxResults = Number(limit || 10);
	if (maxResults <= 0) {
		maxResults = 10;
	}

	try {
		var values = getCachedIndexRows_();
		var countsByTag = {};
		var i;

		for (i = 1; i < values.length; i++) {
			var rawTag = String(values[i][0] || '').trim();
			if (!rawTag) {
				continue;
			}

			var normalizedTag = rawTag.toLowerCase();
			if (normalizedPrefix && normalizedTag.indexOf(normalizedPrefix) === -1) {
				continue;
			}

			countsByTag[normalizedTag] = (countsByTag[normalizedTag] || 0) + Number(values[i][4] || 0);
		}

		return Object.keys(countsByTag)
			.map(function(tag) {
				return {
					name: tag,
					count: countsByTag[tag],
					type: 'global',
					color: '#1A73E8'
				};
			})
			.sort(function(a, b) { return b.count - a.count; })
			.slice(0, maxResults);
	} catch (e) {
		Logger.log('Error getting indexed tag suggestions: ' + e.toString());
		return [];
	}
}

/**
 * Get all configured content folder IDs.
 */
function getIndexContentFolderIds() {
	var scriptProps = PropertiesService.getScriptProperties();
	var raw = scriptProps.getProperty(CONTENT_FOLDERS_PROPERTY_KEY);
	var list = [];

	if (raw) {
		try {
			list = JSON.parse(raw);
		} catch (e) {
			list = [];
		}
	}

	if (!list.length) {
		var legacy = scriptProps.getProperty(CONTENT_FOLDER_PROPERTY_KEY);
		if (legacy) {
			list = [legacy];
		}
	}

	return dedupeStringList_(list);
}

/**
 * Add a folder ID to the configured content folder list.
 */
function addIndexContentFolderId(folderId) {
	var normalized = normalizeDriveFolderId_(folderId);
	if (!normalized) {
		throw new Error('Folder ID is required.');
	}

	var list = getIndexContentFolderIds();
	if (list.indexOf(normalized) === -1) {
		list.push(normalized);
	}

	var scriptProps = PropertiesService.getScriptProperties();
	scriptProps.setProperty(CONTENT_FOLDERS_PROPERTY_KEY, JSON.stringify(list));
	if (list.length) {
		scriptProps.setProperty(CONTENT_FOLDER_PROPERTY_KEY, list[0]);
	}

	return { success: true, folderIds: list };
}

/**
 * Get explicitly configured document IDs.
 */
function getIndexExplicitDocIds() {
	var raw = PropertiesService.getScriptProperties().getProperty(EXPLICIT_DOC_IDS_PROPERTY_KEY);
	if (!raw) {
		return [];
	}
	try {
		return dedupeStringList_(JSON.parse(raw));
	} catch (e) {
		return [];
	}
}

/**
 * Add an explicit document ID to index scope.
 */
function addIndexExplicitDocId(docId) {
	var normalized = normalizeGoogleDocId_(docId);
	if (!normalized) {
		throw new Error('Document ID is required.');
	}

	var list = getIndexExplicitDocIds();
	if (list.indexOf(normalized) === -1) {
		list.push(normalized);
	}

	PropertiesService.getScriptProperties().setProperty(EXPLICIT_DOC_IDS_PROPERTY_KEY, JSON.stringify(list));
	return { success: true, docIds: list };
}

/**
 * Remove a folder ID from the configured content folder list.
 */
function removeIndexContentFolderId(folderId) {
	var normalized = normalizeDriveFolderId_(folderId);
	if (!normalized) {
		throw new Error('Folder ID is required.');
	}

	var list = getIndexContentFolderIds().filter(function(id) {
		return id !== normalized;
	});

	var scriptProps = PropertiesService.getScriptProperties();
	if (list.length) {
		scriptProps.setProperty(CONTENT_FOLDERS_PROPERTY_KEY, JSON.stringify(list));
		scriptProps.setProperty(CONTENT_FOLDER_PROPERTY_KEY, list[0]);
	} else {
		scriptProps.deleteProperty(CONTENT_FOLDERS_PROPERTY_KEY);
		scriptProps.deleteProperty(CONTENT_FOLDER_PROPERTY_KEY);
	}

	return { success: true, folderIds: list };
}

/**
 * Remove an explicit document ID from index scope.
 */
function removeIndexExplicitDocId(docId) {
	var normalized = normalizeGoogleDocId_(docId);
	if (!normalized) {
		throw new Error('Document ID is required.');
	}

	var list = getIndexExplicitDocIds().filter(function(id) {
		return id !== normalized;
	});

	var scriptProps = PropertiesService.getScriptProperties();
	if (list.length) {
		scriptProps.setProperty(EXPLICIT_DOC_IDS_PROPERTY_KEY, JSON.stringify(list));
	} else {
		scriptProps.deleteProperty(EXPLICIT_DOC_IDS_PROPERTY_KEY);
	}

	return { success: true, docIds: list };
}

/**
 * Return display-ready index scope data for UI rendering.
 */
function getIndexScopeState() {
	var folderIds = getIndexContentFolderIds();
	var explicitDocIds = getIndexExplicitDocIds();

	return {
		folders: folderIds.map(function(id) {
			var item = {
				id: id,
				type: 'folder',
				name: id,
				url: 'https://drive.google.com/drive/folders/' + id,
				valid: true
			};

			try {
				var folder = DriveApp.getFolderById(id);
				item.name = folder.getName();
			} catch (e) {
				item.valid = false;
				item.error = e.toString();
			}

			return item;
		}),
		documents: explicitDocIds.map(function(id) {
			var item = {
				id: id,
				type: 'doc',
				name: id,
				url: 'https://docs.google.com/document/d/' + id + '/edit',
				valid: true
			};

			try {
				var doc = DocumentApp.openById(id);
				item.name = doc.getName();
			} catch (e) {
				item.valid = false;
				item.error = e.toString();
			}

			return item;
		}),
		counts: {
			folders: folderIds.length,
			documents: explicitDocIds.length
		}
	};
}

/**
 * Accept a folder URL or ID and add it to index scope.
 */
function addIndexContentFolder(folderInput) {
	return addIndexContentFolderId(folderInput);
}

/**
 * Accept a document URL or ID and add it to explicit index scope.
 */
function addIndexExplicitDocument(docInput) {
	return addIndexExplicitDocId(docInput);
}

/**
 * Sync all Google Docs in the configured content folder to the index.
 * Reads the index sheet once, mutates in memory, and writes once at the end.
 */
function backfillContentFolderToIndex() {
	var folderIds = getIndexContentFolderIds();
	var explicitDocIds = getIndexExplicitDocIds();
	if (!folderIds.length && !explicitDocIds.length) {
		throw new Error('No index scope configured. Add a folder and/or explicit documents first.');
	}

	var started = new Date().getTime();
	var docIdsBySource = collectScopedDocIds_(folderIds, explicitDocIds);
	var allDocIds = Object.keys(docIdsBySource);
	var summary = {
		success: true,
		folderIds: folderIds,
		explicitDocIds: explicitDocIds,
		processed: 0,
		updated: 0,
		skippedUnchanged: 0,
		failed: 0,
		errors: [],
		durationMs: 0
	};

	var lock = LockService.getScriptLock();
	lock.waitLock(60000);

	try {
		var sheet = getOrCreateIndexSheet_();
		var rows = sheet.getDataRange().getValues();
		var signatureByDocId = {};
		for (var i = 1; i < rows.length; i++) {
			if (rows[i][1]) {
				signatureByDocId[String(rows[i][1])] = rows[i][5] || '';
			}
		}

		var mutated = false;
		allDocIds.forEach(function(docId) {
			summary.processed++;

			try {
				var doc = DocumentApp.openById(docId);
				var docTitle = doc.getName();
				var docUrl = doc.getUrl();
				var parsed = extractHashtagsFromText_(doc.getBody().getText());
				if (signatureByDocId[docId] && signatureByDocId[docId] === parsed.textSignature) {
					summary.skippedUnchanged++;
					return;
				}

				rows = replaceDocumentRowsInData_(rows, docId, docTitle, docUrl, parsed);
				signatureByDocId[docId] = parsed.textSignature;
				mutated = true;
				summary.updated++;
			} catch (e) {
				summary.failed++;
				summary.errors.push({ docId: docId, source: docIdsBySource[docId], error: e.toString() });
			}
		});

		if (mutated) {
			writeIndexRows_(sheet, rows);
		}
	} finally {
		lock.releaseLock();
	}

	summary.durationMs = new Date().getTime() - started;
	if (summary.failed > 0) {
		summary.success = false;
	}
	return summary;
}

/**
 * Collect unique doc IDs from configured folders and explicit doc list.
 */
function collectScopedDocIds_(folderIds, explicitDocIds) {
	var byDocId = {};

	folderIds.forEach(function(folderId) {
		try {
			var files = DriveApp.getFolderById(folderId).getFilesByType(MimeType.GOOGLE_DOCS);
			while (files.hasNext()) {
				var file = files.next();
				var docId = file.getId();
				if (!byDocId[docId]) {
					byDocId[docId] = 'folder:' + folderId;
				}
			}
		} catch (e) {
			Logger.log('Error reading folder ' + folderId + ': ' + e.toString());
		}
	});

	explicitDocIds.forEach(function(docId) {
		if (!byDocId[docId]) {
			byDocId[docId] = 'explicit';
		}
	});

	return byDocId;
}

/**
 * Normalize, trim, and dedupe a list of strings.
 */
function dedupeStringList_(list) {
	if (!Array.isArray(list)) {
		return [];
	}
	var seen = {};
	var out = [];
	list.forEach(function(item) {
		var value = String(item || '').trim();
		if (!value || seen[value]) {
			return;
		}
		seen[value] = true;
		out.push(value);
	});
	return out;
}

/**
 * Normalize input that can be either a Drive folder ID or URL.
 */
function normalizeDriveFolderId_(input) {
	return normalizeGoogleResourceId_(input, /\/folders\/([a-zA-Z0-9_-]+)/);
}

/**
 * Normalize input that can be either a Google Doc ID or URL.
 */
function normalizeGoogleDocId_(input) {
	return normalizeGoogleResourceId_(input, /\/document\/d\/([a-zA-Z0-9_-]+)/);
}

/**
 * Extract and normalize a Google Drive resource ID from a URL or raw ID string.
 */
function normalizeGoogleResourceId_(input, urlRegex) {
	var value = String(input || '').trim();
	if (!value) {
		return '';
	}

	var urlMatch = value.match(urlRegex);
	if (urlMatch && urlMatch[1]) {
		return urlMatch[1];
	}

	var idMatch = value.match(/[a-zA-Z0-9_-]{20,}/);
	return idMatch ? idMatch[0] : '';
}

/**
 * Read all index rows once.
 */
function getIndexRows_() {
	var sheet = getOrCreateIndexSheet_();
	var lastRow = sheet.getLastRow();
	if (lastRow <= 0) {
		return [INDEX_HEADERS.slice()];
	}
	return sheet.getRange(1, 1, lastRow, INDEX_HEADERS.length).getValues();
}

if (typeof module !== 'undefined') {
	module.exports = {
		dedupeStringList_: dedupeStringList_,
		normalizeDriveFolderId_: normalizeDriveFolderId_,
		normalizeGoogleDocId_: normalizeGoogleDocId_,
		normalizeGoogleResourceId_: normalizeGoogleResourceId_,
		searchIndexedDocsByTag: searchIndexedDocsByTag,
		searchIndexedDocsByTags: searchIndexedDocsByTags,
	};
}

