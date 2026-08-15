// AC 4 — listSuggestions returns { suggestionId, types[], ranges[] } per suggestion.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
}));

import { getDocsClient } from '../../clients.js';
import { register } from './listSuggestions.js';
import { DEFAULT_SUGGESTIONS_VIEW_MODE } from '../../googleDocsApiHelpers.js';

interface RunSpec {
  startIndex: number;
  endIndex: number;
  insertionIds?: string[];
  deletionIds?: string[];
}

function paragraph(...runs: RunSpec[]) {
  return {
    startIndex: runs[0]?.startIndex,
    endIndex: runs[runs.length - 1]?.endIndex,
    paragraph: {
      elements: runs.map((run) => ({
        startIndex: run.startIndex,
        endIndex: run.endIndex,
        textRun: {
          content: 'x'.repeat(run.endIndex - run.startIndex),
          ...(run.insertionIds ? { suggestedInsertionIds: run.insertionIds } : {}),
          ...(run.deletionIds ? { suggestedDeletionIds: run.deletionIds } : {}),
        },
      })),
    },
  };
}

let toolExecute: (args: any, context: any) => Promise<string>;
const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
let mockGet: ReturnType<typeof vi.fn>;

function mockDocument(data: any) {
  mockGet = vi.fn(async () => ({ data }));
  vi.mocked(getDocsClient).mockResolvedValue({ documents: { get: mockGet } } as any);
}

async function listSuggestions(args: any = {}) {
  const raw = await toolExecute({ documentId: 'doc1', ...args }, { log: mockLog });
  return JSON.parse(raw).suggestions;
}

describe('listSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    register({ addTool: (config: any) => (toolExecute = config.execute) } as any);
  });

  it('reports a suggested insertion', async () => {
    mockDocument({
      body: { content: [paragraph({ startIndex: 1, endIndex: 5, insertionIds: ['s1'] })] },
    });

    expect(await listSuggestions()).toEqual([
      { suggestionId: 's1', types: ['insertion'], ranges: [{ startIndex: 1, endIndex: 5 }] },
    ]);
  });

  it('reports a suggested deletion', async () => {
    mockDocument({
      body: { content: [paragraph({ startIndex: 4, endIndex: 9, deletionIds: ['s2'] })] },
    });

    expect(await listSuggestions()).toEqual([
      { suggestionId: 's2', types: ['deletion'], ranges: [{ startIndex: 4, endIndex: 9 }] },
    ]);
  });

  it('reports a replacement as one suggestionId carrying both types', async () => {
    mockDocument({
      body: {
        content: [
          paragraph(
            { startIndex: 1, endIndex: 5, insertionIds: ['s3'] },
            { startIndex: 5, endIndex: 12, deletionIds: ['s3'] }
          ),
        ],
      },
    });

    const suggestions = await listSuggestions();
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].suggestionId).toBe('s3');
    expect(suggestions[0].types.sort()).toEqual(['deletion', 'insertion']);
  });

  it('reports one suggestion spanning two non-adjacent runs as two ranges', async () => {
    mockDocument({
      body: {
        content: [
          paragraph(
            { startIndex: 1, endIndex: 5, insertionIds: ['s4'] },
            { startIndex: 5, endIndex: 20 },
            { startIndex: 20, endIndex: 25, insertionIds: ['s4'] }
          ),
        ],
      },
    });

    const suggestions = await listSuggestions();
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].ranges).toEqual([
      { startIndex: 1, endIndex: 5 },
      { startIndex: 20, endIndex: 25 },
    ]);
  });

  it('finds suggestions in a tabbed document (no top-level body)', async () => {
    mockDocument({
      tabs: [
        {
          tabProperties: { tabId: 'tab1' },
          documentTab: {
            body: { content: [paragraph({ startIndex: 1, endIndex: 6, insertionIds: ['s5'] })] },
          },
        },
        {
          tabProperties: { tabId: 'tab2' },
          documentTab: {
            body: { content: [paragraph({ startIndex: 1, endIndex: 4, deletionIds: ['s6'] })] },
          },
        },
      ],
    });

    const suggestions = await listSuggestions();
    expect(suggestions.map((s: any) => s.suggestionId).sort()).toEqual(['s5', 's6']);
  });

  it('scopes the scan to a single tab when tabId is given', async () => {
    mockDocument({
      tabs: [
        {
          tabProperties: { tabId: 'tab1' },
          documentTab: {
            body: { content: [paragraph({ startIndex: 1, endIndex: 6, insertionIds: ['s5'] })] },
          },
        },
        {
          tabProperties: { tabId: 'tab2' },
          documentTab: {
            body: { content: [paragraph({ startIndex: 1, endIndex: 4, deletionIds: ['s6'] })] },
          },
        },
      ],
    });

    const suggestions = await listSuggestions({ tabId: 'tab2' });
    expect(suggestions.map((s: any) => s.suggestionId)).toEqual(['s6']);
  });

  it('finds suggestions nested inside a table cell', async () => {
    mockDocument({
      body: {
        content: [
          {
            startIndex: 1,
            endIndex: 30,
            table: {
              tableRows: [
                {
                  tableCells: [
                    {
                      content: [paragraph({ startIndex: 3, endIndex: 8, insertionIds: ['s7'] })],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    });

    expect((await listSuggestions()).map((s: any) => s.suggestionId)).toEqual(['s7']);
  });

  it('returns an empty collection (not an error) for a document with no suggestions', async () => {
    mockDocument({ body: { content: [paragraph({ startIndex: 1, endIndex: 10 })] } });

    expect(await listSuggestions()).toEqual([]);
  });

  it('reads with tab content so a tabbed document is never silently empty', async () => {
    mockDocument({ body: { content: [] } });
    await listSuggestions();

    expect(mockGet).toHaveBeenCalledWith({
      documentId: 'doc1',
      includeTabsContent: true,
      suggestionsViewMode: DEFAULT_SUGGESTIONS_VIEW_MODE,
    });
  });
});
