// src/writeMode.test.ts
//
// AC 5 / 7 / 8 / 9 — SUGGEST write mode.
//
// The Docs API surface for writeMode SUGGEST is gated on the Google Workspace
// Developer Preview Program, so nothing here talks to the real API: these tests
// pin the request shape and the opt-in boundary, which is what a regression
// would break.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserError } from 'fastmcp';

vi.mock('./clients.js', () => ({
  getDocsClient: vi.fn(),
}));

import { getDocsClient } from './clients.js';
import { executeBatchUpdate, executeBatchUpdateWithSplitting } from './googleDocsApiHelpers.js';
import { getDefaultWriteMode } from './config.js';
import { register as registerFindAndReplace } from './tools/docs/findAndReplace.js';
import { register as registerUpdateSectionStyle } from './tools/docs/updateSectionStyle.js';

const REQUESTS = [{ insertText: { location: { index: 1 }, text: 'hi' } }];

function mockDocs(batchUpdate?: ReturnType<typeof vi.fn>) {
  const fn = batchUpdate ?? vi.fn(async () => ({ data: {} }));
  const docs = { documents: { batchUpdate: fn, get: vi.fn(async () => ({ data: {} })) } };
  vi.mocked(getDocsClient).mockResolvedValue(docs as any);
  return { docs, batchUpdate: fn };
}

function captureToolExecute(register: (server: any) => void) {
  let execute!: (args: any, context: any) => Promise<string>;
  register({ addTool: (config: any) => (execute = config.execute) } as any);
  return execute;
}

const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

/** The writeControl the last batchUpdate call sent, or undefined if it sent none. */
function sentWriteControl(batchUpdate: ReturnType<typeof vi.fn>) {
  const [params] = batchUpdate.mock.calls[batchUpdate.mock.calls.length - 1] as any[];
  return params.requestBody.writeControl;
}

describe('executeBatchUpdate request body (AC 5)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends writeControl.writeMode SUGGEST for suggest mode', async () => {
    const { docs, batchUpdate } = mockDocs();

    await executeBatchUpdate(docs as any, 'doc1', REQUESTS, { writeMode: 'suggest' });

    expect(batchUpdate).toHaveBeenCalledWith({
      documentId: 'doc1',
      requestBody: { requests: REQUESTS, writeControl: { writeMode: 'SUGGEST' } },
    });
  });

  it('sends no writeControl key at all for a direct write', async () => {
    const { docs, batchUpdate } = mockDocs();

    await executeBatchUpdate(docs as any, 'doc1', REQUESTS, { writeMode: 'direct' });

    expect(batchUpdate).toHaveBeenCalledWith({
      documentId: 'doc1',
      requestBody: { requests: REQUESTS },
    });
    expect('writeControl' in (batchUpdate.mock.calls[0][0] as any).requestBody).toBe(false);
  });

  it('sends no writeControl key when no options are passed at all', async () => {
    const { docs, batchUpdate } = mockDocs();

    await executeBatchUpdate(docs as any, 'doc1', REQUESTS);

    expect((batchUpdate.mock.calls[0][0] as any).requestBody).toEqual({ requests: REQUESTS });
  });
});

describe('executeBatchUpdateWithSplitting request body (AC 5)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('propagates suggest mode to every sub-batch', async () => {
    const { docs, batchUpdate } = mockDocs();

    // One delete + one insert + one format request => three separate batches.
    await executeBatchUpdateWithSplitting(
      docs as any,
      'doc1',
      [
        { deleteContentRange: { range: { startIndex: 1, endIndex: 2 } } },
        { insertText: { location: { index: 1 }, text: 'hi' } },
        { updateTextStyle: { range: { startIndex: 1, endIndex: 2 }, textStyle: {}, fields: '*' } },
      ],
      undefined,
      { writeMode: 'suggest' }
    );

    expect(batchUpdate).toHaveBeenCalledTimes(3);
    for (const [params] of batchUpdate.mock.calls as any[][]) {
      expect(params.requestBody.writeControl).toEqual({ writeMode: 'SUGGEST' });
    }
  });

  it('sends no writeControl for a direct write', async () => {
    const { docs, batchUpdate } = mockDocs();

    await executeBatchUpdateWithSplitting(docs as any, 'doc1', REQUESTS, undefined, {
      writeMode: 'direct',
    });

    expect((batchUpdate.mock.calls[0][0] as any).requestBody).toEqual({ requests: REQUESTS });
  });
});

describe('suggest-mode failure hint (AC 9)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mentions Developer Preview when a SUGGEST write fails', async () => {
    const failing = vi.fn(async () => {
      throw Object.assign(new Error('Invalid requests[0]'), { code: 400 });
    });
    const { docs } = mockDocs(failing);

    await expect(
      executeBatchUpdate(docs as any, 'doc1', REQUESTS, { writeMode: 'suggest' })
    ).rejects.toThrow(/Developer Preview/);
    await expect(
      executeBatchUpdate(docs as any, 'doc1', REQUESTS, { writeMode: 'suggest' })
    ).rejects.toBeInstanceOf(UserError);
  });

  it('does not mention Developer Preview when a direct write fails', async () => {
    const failing = vi.fn(async () => {
      throw Object.assign(new Error('Invalid requests[0]'), { code: 400 });
    });
    const { docs } = mockDocs(failing);

    await expect(
      executeBatchUpdate(docs as any, 'doc1', REQUESTS, { writeMode: 'direct' })
    ).rejects.toThrow(/Invalid request sent to Google Docs API/);
    await expect(
      executeBatchUpdate(docs as any, 'doc1', REQUESTS, { writeMode: 'direct' })
    ).rejects.not.toThrow(/Developer Preview/);
  });
});

describe('GOOGLE_DOCS_WRITE_MODE (AC 7)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('defaults a listed tool to SUGGEST when the env var is set to suggest', async () => {
    vi.stubEnv('GOOGLE_DOCS_WRITE_MODE', 'suggest');
    const { batchUpdate } = mockDocs();

    await captureToolExecute(registerFindAndReplace)(
      { documentId: 'doc1', findText: 'a', replaceText: 'b' },
      { log: mockLog }
    );

    expect(sentWriteControl(batchUpdate)).toEqual({ writeMode: 'SUGGEST' });
  });

  it('sends no writeControl when the env var is unset', async () => {
    vi.stubEnv('GOOGLE_DOCS_WRITE_MODE', undefined);
    const { batchUpdate } = mockDocs();

    await captureToolExecute(registerFindAndReplace)(
      { documentId: 'doc1', findText: 'a', replaceText: 'b' },
      { log: mockLog }
    );

    expect(sentWriteControl(batchUpdate)).toBeUndefined();
  });

  it("lets an explicit editMode='direct' override the env var", async () => {
    vi.stubEnv('GOOGLE_DOCS_WRITE_MODE', 'suggest');
    const { batchUpdate } = mockDocs();

    await captureToolExecute(registerFindAndReplace)(
      { documentId: 'doc1', findText: 'a', replaceText: 'b', editMode: 'direct' },
      { log: mockLog }
    );

    expect(sentWriteControl(batchUpdate)).toBeUndefined();
  });

  it('is case-insensitive and rejects an unrecognised value by name', () => {
    vi.stubEnv('GOOGLE_DOCS_WRITE_MODE', 'SUGGEST');
    expect(getDefaultWriteMode()).toBe('suggest');

    vi.stubEnv('GOOGLE_DOCS_WRITE_MODE', 'yes-please');
    expect(() => getDefaultWriteMode()).toThrow(/GOOGLE_DOCS_WRITE_MODE/);
    expect(() => getDefaultWriteMode()).toThrow(/direct.*suggest|suggest.*direct/);
  });
});

describe('suggest mode never leaks to non-listed callers (AC 8)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('leaves updateSectionStyle on a direct write even with the env var set to suggest', async () => {
    vi.stubEnv('GOOGLE_DOCS_WRITE_MODE', 'suggest');
    const { batchUpdate } = mockDocs();

    await captureToolExecute(registerUpdateSectionStyle)(
      { documentId: 'doc1', startIndex: 1, endIndex: 5, marginTop: 72 },
      { log: mockLog }
    );

    expect(batchUpdate).toHaveBeenCalledOnce();
    expect(sentWriteControl(batchUpdate)).toBeUndefined();
  });

  it('executeBatchUpdate itself ignores the env var entirely', async () => {
    vi.stubEnv('GOOGLE_DOCS_WRITE_MODE', 'suggest');
    const { docs, batchUpdate } = mockDocs();

    await executeBatchUpdate(docs as any, 'doc1', REQUESTS);

    expect(sentWriteControl(batchUpdate)).toBeUndefined();
  });
});
