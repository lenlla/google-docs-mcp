// src/readChokepoint.test.ts
//
// AC 1 / AC 2 — these are properties of the source tree, not of any one function:
// there must be exactly one place that calls the Docs get endpoint, and exactly
// one place that names the default view mode. A new tool that reaches for the
// API client directly is precisely the regression this guards against, and only
// a source-level check can catch it.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('.', import.meta.url));

/** Every compiled source file: excludes src/backup (dead .bak files) and tests. */
function sourceFiles(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === 'backup' ? [] : sourceFiles(full);
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) return [];
    return [full];
  });
}

const HELPERS = join(SRC, 'googleDocsApiHelpers.ts');

/** The source of a file with the body of getDocument() removed. */
function withoutGetDocumentBody(path: string): string {
  const source = readFileSync(path, 'utf8');
  if (path !== HELPERS) return source;
  const start = source.indexOf('export async function getDocument(');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n}', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(0, start) + source.slice(end);
}

describe('single read chokepoint (AC 1)', () => {
  it('exports exactly one getDocument helper, in googleDocsApiHelpers.ts', () => {
    const declaring = sourceFiles().filter((path) =>
      readFileSync(path, 'utf8').includes('export async function getDocument(')
    );
    expect(declaring).toEqual([HELPERS]);
  });

  it('has no direct documents.get call anywhere else in src/', () => {
    const offenders = sourceFiles().filter((path) =>
      withoutGetDocumentBody(path).includes('documents.get(')
    );
    expect(offenders).toEqual([]);
  });
});

describe('single default view mode (AC 2)', () => {
  it('never names PREVIEW_WITHOUT_SUGGESTIONS in compiled source', () => {
    const offenders = sourceFiles().filter((path) =>
      readFileSync(path, 'utf8').includes('PREVIEW_WITHOUT_SUGGESTIONS')
    );
    expect(offenders).toEqual([]);
  });

  it('declares SUGGESTIONS_INLINE in exactly one exported constant', () => {
    const declaring = sourceFiles().filter((path) =>
      readFileSync(path, 'utf8').includes("'SUGGESTIONS_INLINE'")
    );
    expect(declaring).toEqual([HELPERS]);

    const source = readFileSync(HELPERS, 'utf8');
    expect(source).toContain("export const DEFAULT_SUGGESTIONS_VIEW_MODE = 'SUGGESTIONS_INLINE';");
    expect(source.split("'SUGGESTIONS_INLINE'")).toHaveLength(2);
  });
});
