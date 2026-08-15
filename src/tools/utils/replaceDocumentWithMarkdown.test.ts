// AC 4b — replaceDocumentWithMarkdown must not silently destroy a collaborator's
// pending suggested edits. It replaces the whole body, so it refuses when the
// target has pending suggestions unless the caller opts in explicitly.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserError } from 'fastmcp';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
}));

vi.mock('../../markdown-transformer/index.js', () => ({
  insertMarkdown: vi.fn(async () => ({ requests: 0 })),
  formatInsertResult: vi.fn(() => 'inserted'),
}));

import { getDocsClient } from '../../clients.js';
import { insertMarkdown } from '../../markdown-transformer/index.js';
import { register } from './replaceDocumentWithMarkdown.js';

function documentWith(options: { suggested: boolean }) {
  return {
    body: {
      content: [
        {
          startIndex: 1,
          endIndex: 14,
          paragraph: {
            elements: [
              {
                startIndex: 1,
                endIndex: 14,
                textRun: {
                  content: 'existing text',
                  ...(options.suggested ? { suggestedInsertionIds: ['sugg-1'] } : {}),
                },
              },
            ],
          },
        },
      ],
    },
  };
}

let toolExecute: (args: any, context: any) => Promise<string>;
const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
let mockBatchUpdate: ReturnType<typeof vi.fn>;

function mockDocument(suggested: boolean) {
  mockBatchUpdate = vi.fn(async () => ({ data: {} }));
  vi.mocked(getDocsClient).mockResolvedValue({
    documents: {
      get: vi.fn(async () => ({ data: documentWith({ suggested }) })),
      batchUpdate: mockBatchUpdate,
    },
  } as any);
}

describe('replaceDocumentWithMarkdown suggestion guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    register({ addTool: (config: any) => (toolExecute = config.execute) } as any);
  });

  it('refuses with a UserError when the document has a pending suggestion', async () => {
    mockDocument(true);

    await expect(
      toolExecute({ documentId: 'doc1', markdown: '# New' }, { log: mockLog })
    ).rejects.toBeInstanceOf(UserError);

    // Nothing destructive may have run before the refusal.
    expect(mockBatchUpdate).not.toHaveBeenCalled();
    expect(insertMarkdown).not.toHaveBeenCalled();
  });

  it('names the problem and the escape hatch in the refusal', async () => {
    mockDocument(true);

    await expect(
      toolExecute({ documentId: 'doc1', markdown: '# New' }, { log: mockLog })
    ).rejects.toThrow(/pending suggested edit/i);
    await expect(
      toolExecute({ documentId: 'doc1', markdown: '# New' }, { log: mockLog })
    ).rejects.toThrow(/allowDiscardingSuggestions/);
  });

  it('proceeds unchanged when there are no pending suggestions', async () => {
    mockDocument(false);

    const result = await toolExecute({ documentId: 'doc1', markdown: '# New' }, { log: mockLog });

    expect(insertMarkdown).toHaveBeenCalledOnce();
    expect(result).toContain('Successfully replaced document content');
  });

  it('proceeds when allowDiscardingSuggestions is explicitly true', async () => {
    mockDocument(true);

    const result = await toolExecute(
      { documentId: 'doc1', markdown: '# New', allowDiscardingSuggestions: true },
      { log: mockLog }
    );

    expect(insertMarkdown).toHaveBeenCalledOnce();
    expect(result).toContain('Successfully replaced document content');
  });
});
