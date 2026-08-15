import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DOWNLOAD_ROOTS_ENV, getDownloadRoots, parseStatelessFlag } from './config.js';

describe('parseStatelessFlag', () => {
  it('defaults to false when no value is provided', () => {
    expect(parseStatelessFlag(undefined)).toBe(false);
    expect(parseStatelessFlag('')).toBe(false);
    expect(parseStatelessFlag('  ')).toBe(false);
  });

  it('returns true for "true" (case-insensitive)', () => {
    expect(parseStatelessFlag('true')).toBe(true);
    expect(parseStatelessFlag('TRUE')).toBe(true);
    expect(parseStatelessFlag('True')).toBe(true);
    expect(parseStatelessFlag(' true ')).toBe(true);
  });

  it('returns true for "1"', () => {
    expect(parseStatelessFlag('1')).toBe(true);
  });

  it('returns false for other values', () => {
    expect(parseStatelessFlag('false')).toBe(false);
    expect(parseStatelessFlag('0')).toBe(false);
    expect(parseStatelessFlag('yes')).toBe(false);
    expect(parseStatelessFlag('stateless')).toBe(false);
  });
});

describe('getDownloadRoots', () => {
  const ORIGINAL = process.env[DOWNLOAD_ROOTS_ENV];
  const REAL_TMP = fs.realpathSync(os.tmpdir());
  const REAL_CWD = fs.realpathSync(process.cwd());

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env[DOWNLOAD_ROOTS_ENV];
    else process.env[DOWNLOAD_ROOTS_ENV] = ORIGINAL;
  });

  it('returns an empty list when unset or blank', () => {
    delete process.env[DOWNLOAD_ROOTS_ENV];
    expect(getDownloadRoots()).toEqual([]);

    process.env[DOWNLOAD_ROOTS_ENV] = '   ';
    expect(getDownloadRoots()).toEqual([]);
  });

  it('parses a single absolute root', () => {
    process.env[DOWNLOAD_ROOTS_ENV] = REAL_TMP;
    expect(getDownloadRoots()).toEqual([REAL_TMP]);
  });

  it('splits multiple roots on the platform delimiter and trims whitespace', () => {
    process.env[DOWNLOAD_ROOTS_ENV] = ` ${REAL_TMP} ${path.delimiter} ${REAL_CWD} `;
    expect(getDownloadRoots()).toEqual([REAL_TMP, REAL_CWD]);
  });

  it('reads process.env at call time, not at import time', () => {
    process.env[DOWNLOAD_ROOTS_ENV] = REAL_TMP;
    expect(getDownloadRoots()).toEqual([REAL_TMP]);

    process.env[DOWNLOAD_ROOTS_ENV] = REAL_CWD;
    expect(getDownloadRoots()).toEqual([REAL_CWD]);
  });

  it('throws a plain Error naming the variable for a relative root', () => {
    process.env[DOWNLOAD_ROOTS_ENV] = 'relative/downloads';

    expect(() => getDownloadRoots()).toThrow(Error);
    expect(() => getDownloadRoots()).toThrow(/GOOGLE_DOCS_DOWNLOAD_ROOTS/);
    expect(() => getDownloadRoots()).toThrow(/absolute/);
    // Plain Error, NOT fastmcp's client-facing UserError: a malformed server
    // configuration is an operator problem, not a tool-call problem.
    try {
      getDownloadRoots();
      expect.unreachable('getDownloadRoots should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).constructor.name).toBe('Error');
    }
  });

  it('throws a plain Error naming the variable for a root that does not exist', () => {
    const missing = path.join(REAL_TMP, 'gdocs-mcp-download-root-that-does-not-exist');
    process.env[DOWNLOAD_ROOTS_ENV] = missing;

    expect(() => getDownloadRoots()).toThrow(/GOOGLE_DOCS_DOWNLOAD_ROOTS/);
    expect(() => getDownloadRoots()).toThrow(/does not exist/);
    try {
      getDownloadRoots();
      expect.unreachable('getDownloadRoots should have thrown');
    } catch (error) {
      expect((error as Error).constructor.name).toBe('Error');
    }
  });

  it('rejects a bad entry even when another entry is valid', () => {
    process.env[DOWNLOAD_ROOTS_ENV] = [REAL_TMP, 'relative/downloads'].join(path.delimiter);
    expect(() => getDownloadRoots()).toThrow(/GOOGLE_DOCS_DOWNLOAD_ROOTS/);
  });
});
