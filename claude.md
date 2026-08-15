# Google Docs MCP Server

FastMCP server with 94 tools for Google Docs, Sheets, Drive, Gmail, and Calendar.

## Tool Categories

| Category      | Count | Examples                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Docs          | 5     | `readGoogleDoc`, `appendToGoogleDoc`, `insertText`, `deleteRange`, `listDocumentTabs`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Markdown      | 2     | `replaceDocumentWithMarkdown`, `appendMarkdownToGoogleDoc`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Formatting    | 3     | `applyTextStyle`, `applyParagraphStyle`, `formatMatchingText`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Structure     | 9     | `insertTable`, `insertPageBreak`, `insertSectionBreak`, `updateSectionStyle`, `insertImageFromUrl`, `insertLocalImage`, `editTableCell`_, `findElement`_, `fixListFormatting`\*                                                                                                                                                                                                                                                                                                                        |
| Comments      | 6     | `listComments`, `getComment`, `addComment`, `replyToComment`, `resolveComment`, `deleteComment`                                                                                                                                                                                                                                                                                                                                                                                                        |
| Sheets        | 31    | `readSpreadsheet`, `writeSpreadsheet`, `appendRows`, `clearRange`, `batchWrite`, `createSpreadsheet`, `listSpreadsheets`, `duplicateSheet`, `copySheetTo`, `renameSheet`, `deleteSheet`, `formatCells`, `setCellBorders`, `autoResizeColumns`, `autoResizeRows`, `setColumnWidths`, `setRowHeights`, `freezeRowsAndColumns`, `groupRows`, `protectRange`, `addConditionalFormatting`, `getConditionalFormatting`, `deleteConditionalFormatting`, `setDropdownValidation`, `insertChart`, `deleteChart` |
| Sheets Tables | 6     | `createTable`, `listTables`, `getTable`, `deleteTable`, `updateTableRange`, `appendTableRows`                                                                                                                                                                                                                                                                                                                                                                                                          |
| Drive         | 13    | `listGoogleDocs`, `searchGoogleDocs`, `getDocumentInfo`, `createFolder`, `moveFile`, `copyFile`, `createDocument`                                                                                                                                                                                                                                                                                                                                                                                      |
| Gmail         | 13    | `listMessages`, `getMessage`, `sendEmail`, `trashMessage`, `modifyMessageLabels`, `listLabels`, `createDraft`, `listDrafts`, `getDraft`, `updateDraft`, `sendDraft`, `deleteDraft`, `triageInbox`                                                                                                                                                                                                                                                                                                      |
| Calendar      | 5     | `listEvents`, `createEvent`, `updateEvent`, `deleteEvent`, `quickAddEvent`                                                                                                                                                                                                                                                                                                                                                                                                                             |

\*Not fully implemented

## Shared Drives Support

The server supports Google Shared Drives. All Drive file operations (`files.list`, `files.get`, `files.create`, `files.update`, `files.copy`, `files.delete`, `permissions.create`) use `supportsAllDrives: true` and `includeItemsFromAllDrives: true` (for list operations), enabling agents to query, create, and update documents in shared drives.

## Known Limitations

- **Comment anchoring:** Programmatically created comments appear in "All Comments" but aren't visibly anchored to text in the UI
- **Resolved status:** May not persist in Google Docs UI (Drive API limitation)
- **fixListFormatting:** Experimental, may not work reliably
- **Gmail hard delete:** `trashMessage` only moves to Trash (reversible). Permanent deletion requires the full `https://mail.google.com/` scope, which is not requested.
- **Gmail attachments:** `getMessage` exposes attachment metadata only — no download of attachment bytes yet.
- **Gmail send format:** `sendEmail` is plain-text only. HTML bodies are delivered as literal text.
- **Calendar scope:** `calendar.events` covers event CRUD only. Cannot create or delete entire calendars.
- **Calendar recurring events:** `updateEvent` and `deleteEvent` operate on the entire series unless you target a specific instance ID from `listEvents` with `singleEvents=true`.

## Suggested Edits

**Reads reflect pending suggestions.** Every read goes through one `getDocument()` helper in
`src/googleDocsApiHelpers.ts`, which asks for `suggestionsViewMode: 'SUGGESTIONS_INLINE'` — the
same index space `documents.batchUpdate` writes into. `readGoogleDoc`, `appendToGoogleDoc` and
`appendMarkdownToGoogleDoc` therefore now show suggested edits inline; previously they showed the
document as if every suggestion were rejected, while the index-computing helpers did not. Do not
add a direct Docs get call anywhere else — a read that skips the helper can compute an index
against text that differs from what gets written.

**Suggestion tools** (`docs` group):

| Tool               | Parameters                   | Returns / effect                                                                         |
| ------------------ | ---------------------------- | ---------------------------------------------------------------------------------------- |
| `listSuggestions`  | `documentId`, `tabId?`       | `{ suggestionId, types: ('insertion'/'deletion')[], ranges: [{startIndex,endIndex}] }[]` |
| `acceptSuggestion` | `documentId`, `suggestionId` | Commits the suggestion                                                                   |
| `rejectSuggestion` | `documentId`, `suggestionId` | Discards the suggestion                                                                  |

`types` and `ranges` are arrays because a suggested replacement carries one ID as both an
insertion and a deletion, and one suggestion can span non-adjacent runs. Without `tabId`,
`listSuggestions` scans every tab of a tabbed document (or the legacy body when there are no
tabs). It covers body content including tables; headers, footers, footnotes and style-only
suggestions are out of scope, and authors are not resolvable.

**Writing suggestions.** `GOOGLE_DOCS_WRITE_MODE=suggest` makes the ten `editMode`-capable tools
default to suggest mode; a per-call `editMode` wins. `writeMode: SUGGEST` and the accept/reject
requests need the Google Workspace Developer Preview Program — without enrolment the API rejects
them, and the surfaced error says so.

## Parameter Patterns

- **Document ID:** Extract from URL: `docs.google.com/document/d/DOCUMENT_ID/edit`
- **Text targeting:** Use `textToFind` + `matchInstance` OR `startIndex`/`endIndex`
- **Colors:** Hex format `#RRGGBB` or `#RGB`
- **Alignment:** `START`, `END`, `CENTER`, `JUSTIFIED` (not LEFT/RIGHT)
- **Indices:** 1-based, ranges are [start, end)
- **Tabs:** Optional `tabId` parameter (defaults to first tab)
- **Write mode:** Optional `editMode` parameter (`'direct' | 'suggest'`) on `insertText`, `appendText`, `findAndReplace`, `modifyText`, `replaceTableRowData`, `applyTextStyle`, `applyParagraphStyle`, `insertTableWithData`, `appendTableRows`, `deleteTableRows`. Omit it to use the `GOOGLE_DOCS_WRITE_MODE` env var, which itself defaults to `direct`. No other tool accepts it — the Docs API cannot suggest section styles, column widths, named ranges or tab operations.

## Markdown Support

### Workflow

1. **Retrieve**: Use `readGoogleDoc` with `format='markdown'` to get document content as markdown
2. **Edit**: Modify markdown locally using your preferred editor
3. **Apply**: Use `replaceDocumentWithMarkdown` or `appendMarkdownToGoogleDoc` to write changes back

### Supported Markdown Features

- **Headings**: `# H1` through `###### H6`
- **Bold**: `**bold**` or `__bold__`
- **Italic**: `*italic*` or `_italic_`
- **Strikethrough**: `~~strikethrough~~`
- **Links**: `[text](url)`
- **Lists**: Bullet (`-`, `*`) and numbered (`1.`, `2.`)
- **Code blocks**: Fenced code blocks (` ``` `) rendered as styled 1x1 tables (matching Google Docs' native Code Block building block)
- **Inline code**: Backtick code rendered with monospace font + green color + gray background
- **Nested formatting**: `***bold italic***`, `**bold [link](url)**`

### Markdown Tools

#### `replaceDocumentWithMarkdown`

Replaces entire document content with markdown-formatted content.

**Parameters:**

- `documentId`: The document ID
- `markdown`: The markdown content to apply
- `preserveTitle` (optional): If true, preserves the first heading/title
- `firstHeadingAsTitle` (optional, default: false): If true, the first `# H1` is styled as a Google Docs **Title** instead of Heading 1
- `tabId` (optional): Target a specific tab
- `allowDiscardingSuggestions` (optional, default: false): The tool refuses with a `UserError` when the target document or tab has pending suggested edits, because replacing the body destroys them. Set true to discard them deliberately.

**Example:**

```markdown
# My Document

This is **bold** text with a [link](https://example.com).

- List item 1
- List item 2
  - Nested item

## Section 2

More content with _italic_ and ~~strikethrough~~.
```

#### `appendMarkdownToGoogleDoc`

Appends markdown content to the end of a document with full formatting.

**Parameters:**

- `documentId`: The document ID
- `markdown`: The markdown content to append
- `addNewlineIfNeeded` (optional, default: true): Add spacing before appended content
- `firstHeadingAsTitle` (optional, default: false): If true, the first `# H1` is styled as a Google Docs **Title** instead of Heading 1
- `tabId` (optional): Target a specific tab

### Known Limitations for Markdown

- Tables not yet supported in markdown-to-docs conversion
- Images not yet supported in markdown-to-docs conversion
- Complex nested lists (3+ levels) may have formatting quirks
- Maximum practical document size: ~10,000 words (due to Google Docs API batch limits)

## Source Files (for implementation details)

| File                                         | Contains                                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`                               | Zod schemas, hex color validation, style parameter definitions                                                                                                                |
| `src/googleDocsApiHelpers.ts`                | `getDocument` (the single read chokepoint), `DEFAULT_SUGGESTIONS_VIEW_MODE`, `findTextRange`, `executeBatchUpdate`, `executeBatchUpdateWithSplitting`, style request builders |
| `src/tools/docs/suggestionHelpers.ts`        | Walks a fetched document and collects its pending insertion/deletion suggestions                                                                                              |
| `src/config.ts`                              | `getDefaultWriteMode()` — reads `GOOGLE_DOCS_WRITE_MODE` per call, not at import                                                                                              |
| `src/googleSheetsApiHelpers.ts`              | A1 notation parsing, range/format operations, protected-range helpers, table helpers                                                                                          |
| `src/markdown-transformer/markdownToDocs.ts` | Markdown-to-Google-Docs conversion logic                                                                                                                                      |
| `src/markdown-transformer/docsToMarkdown.ts` | Google-Docs-to-Markdown conversion logic                                                                                                                                      |
| `src/markdown-transformer/index.ts`          | Markdown-it configuration and public API                                                                                                                                      |
| `src/index.ts`                               | Entry point, CLI handling, and MCP server startup                                                                                                                             |

## See Also

- `README.md` - Setup instructions and usage examples
- `SAMPLE_TASKS.md` - 15 example workflows
