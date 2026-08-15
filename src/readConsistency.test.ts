// src/readConsistency.test.ts
//
// AC 3 — every document read goes through getDocument() and therefore asks the
// Google Docs API for the SAME suggestionsViewMode. Reading one view while
// writing another is what lets a computed index land in the wrong place, so this
// test fails if any of the six covered call sites drifts.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./clients.js', () => ({
  getDocsClient: vi.fn(),
  getDriveClient: vi.fn(),
}));

import { getDocsClient } from './clients.js';
import {
  findTextRange,
  getParagraphRange,
  getTableCellRange,
  DEFAULT_SUGGESTIONS_VIEW_MODE,
} from './googleDocsApiHelpers.js';
import { register as registerReadDocument } from './tools/docs/readGoogleDoc.js';
import { register as registerAppendText } from './tools/docs/appendToGoogleDoc.js';
import { register as registerAppendMarkdown } from './tools/utils/appendMarkdownToGoogleDoc.js';

const TABLE_START = 10;

/** One fixture rich enough to satisfy all six call sites. */
function buildDocumentFixture() {
  return {
    documentId: 'doc1',
    title: 'Fixture',
    body: {
      content: [
        {
          startIndex: 1,
          endIndex: TABLE_START,
          paragraph: {
            elements: [
              { startIndex: 1, endIndex: TABLE_START, textRun: { content: 'find me here\n' } },
            ],
          },
        },
        {
          startIndex: TABLE_START,
          endIndex: 40,
          table: {
            rows: 1,
            columns: 1,
            tableRows: [
              {
                tableCells: [
                  {
                    startIndex: 12,
                    endIndex: 24,
                    content: [
                      {
                        startIndex: 13,
                        endIndex: 22,
                        paragraph: {
                          elements: [
                            { startIndex: 13, endIndex: 22, textRun: { content: 'Cell A1\n' } },
                          ],
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  };
}

function buildMockDocs() {
  const get = vi.fn(async () => ({ data: buildDocumentFixture() }));
  const batchUpdate = vi.fn(async () => ({ data: {} }));
  return { documents: { get, batchUpdate } };
}

function captureToolExecute(register: (server: any) => void) {
  let execute!: (args: any, context: any) => Promise<string>;
  register({ addTool: (config: any) => (execute = config.execute) } as any);
  return execute;
}

const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };

describe('read consistency across call sites', () => {
  let mockDocs: ReturnType<typeof buildMockDocs>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDocs = buildMockDocs();
    vi.mocked(getDocsClient).mockResolvedValue(mockDocs as any);
  });

  it('requests the same suggestionsViewMode from all six read paths', async () => {
    // 1. readDocument
    await captureToolExecute(registerReadDocument)(
      { documentId: 'doc1', format: 'text' },
      { log: mockLog }
    );
    // 2. appendText
    await captureToolExecute(registerAppendText)(
      { documentId: 'doc1', text: 'hello', addNewlineIfNeeded: false },
      { log: mockLog }
    );
    // 3. appendMarkdown
    await captureToolExecute(registerAppendMarkdown)(
      { documentId: 'doc1', markdown: 'hello', addNewlineIfNeeded: false },
      { log: mockLog }
    );
    // 4. findTextRange
    await findTextRange(mockDocs as any, 'doc1', 'find me', 1);
    // 5. getParagraphRange
    await getParagraphRange(mockDocs as any, 'doc1', 3);
    // 6. getTableCellRange
    await getTableCellRange(mockDocs as any, 'doc1', TABLE_START, 0, 0);

    const calls = mockDocs.documents.get.mock.calls;
    // Exactly one read per call site. An exact count also catches the case where
    // one site loses its read while another gains a second one.
    expect(calls.length).toBe(6);

    const viewModes = calls.map((call: any[]) => call[0]?.suggestionsViewMode);
    // Every read asked for the same view — and specifically the documented default.
    expect(new Set(viewModes).size).toBe(1);
    expect(viewModes.every((mode) => mode === DEFAULT_SUGGESTIONS_VIEW_MODE)).toBe(true);
  });

  it('pins the default view mode to the index space batchUpdate writes into', () => {
    expect(DEFAULT_SUGGESTIONS_VIEW_MODE).toBe('SUGGESTIONS_INLINE');
  });
});
