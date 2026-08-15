// AC 4 / AC 10 — the three suggestion tools are registered in the docs group,
// and accept/reject send the corresponding Docs API request type.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
  getDriveClient: vi.fn(),
}));

vi.mock('../../googleSheetsApiHelpers.js', async (importOriginal) => importOriginal());

import { getDocsClient } from '../../clients.js';
import { registerDocsTools } from './index.js';
import { register as registerAccept } from './acceptSuggestion.js';
import { register as registerReject } from './rejectSuggestion.js';

const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

function captureToolExecute(register: (server: any) => void) {
  let execute!: (args: any, context: any) => Promise<string>;
  register({ addTool: (config: any) => (execute = config.execute) } as any);
  return execute;
}

function mockDocs() {
  const batchUpdate = vi.fn(async () => ({ data: {} }));
  vi.mocked(getDocsClient).mockResolvedValue({ documents: { batchUpdate } } as any);
  return batchUpdate;
}

describe('docs tool group registration', () => {
  it('registers listSuggestions, acceptSuggestion and rejectSuggestion', () => {
    const names: string[] = [];
    registerDocsTools({ addTool: (config: any) => names.push(config.name) } as any);

    expect(names).toContain('listSuggestions');
    expect(names).toContain('acceptSuggestion');
    expect(names).toContain('rejectSuggestion');
  });
});

describe('acceptSuggestion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends an acceptSuggestion request carrying the suggestion ID', async () => {
    const batchUpdate = mockDocs();

    const result = await captureToolExecute(registerAccept)(
      { documentId: 'doc1', suggestionId: 'sugg-1' },
      { log: mockLog }
    );

    expect(batchUpdate).toHaveBeenCalledWith({
      documentId: 'doc1',
      requestBody: { requests: [{ acceptSuggestion: { suggestionId: 'sugg-1' } }] },
    });
    expect(result).toContain('sugg-1');
  });
});

describe('rejectSuggestion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends a rejectSuggestion request carrying the suggestion ID', async () => {
    const batchUpdate = mockDocs();

    const result = await captureToolExecute(registerReject)(
      { documentId: 'doc1', suggestionId: 'sugg-2' },
      { log: mockLog }
    );

    expect(batchUpdate).toHaveBeenCalledWith({
      documentId: 'doc1',
      requestBody: { requests: [{ rejectSuggestion: { suggestionId: 'sugg-2' } }] },
    });
    expect(result).toContain('sugg-2');
  });
});
