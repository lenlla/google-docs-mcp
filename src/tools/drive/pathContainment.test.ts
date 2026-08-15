import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { UserError } from 'fastmcp';
import { isWithinRoots, assertWithinRoots } from './pathContainment.js';

// The path implementation is injected, so both platforms' semantics are real
// assertions on any runner -- no fs access, no platform gating, no skipped tests.

describe('isWithinRoots (posix)', () => {
  const p = path.posix;

  it('accepts a target directly inside the root', () => {
    expect(isWithinRoots('/srv/dl/report.pdf', ['/srv/dl'], p)).toBe(true);
  });

  it('accepts a target nested several levels inside the root', () => {
    expect(isWithinRoots('/srv/dl/a/b/c/report.pdf', ['/srv/dl'], p)).toBe(true);
  });

  it('accepts the root itself', () => {
    expect(isWithinRoots('/srv/dl', ['/srv/dl'], p)).toBe(true);
  });

  it('accepts a target inside the SECOND of two roots', () => {
    expect(isWithinRoots('/var/out/report.pdf', ['/srv/dl', '/var/out'], p)).toBe(true);
  });

  it('rejects a traversal escape', () => {
    // Resolved with the same path impl, since isWithinRoots never resolves.
    const target = p.resolve('/srv/dl', '../../evil.txt');
    expect(target).toBe('/evil.txt');
    expect(isWithinRoots(target, ['/srv/dl'], p)).toBe(false);
  });

  it('rejects an absolute path outside all roots', () => {
    expect(isWithinRoots('/etc/passwd', ['/srv/dl', '/var/out'], p)).toBe(false);
  });

  it('rejects a sibling directory sharing a prefix with the root', () => {
    // The case a naive `startsWith` implementation gets wrong.
    expect(isWithinRoots('/data-backup/x', ['/data'], p)).toBe(false);
  });

  it('rejects everything when no roots are configured', () => {
    expect(isWithinRoots('/srv/dl/report.pdf', [], p)).toBe(false);
  });
});

describe('isWithinRoots (win32)', () => {
  const p = path.win32;

  it('accepts a target inside the root', () => {
    expect(isWithinRoots('C:\\root\\sub\\report.pdf', ['C:\\root'], p)).toBe(true);
  });

  it('is case-insensitive about the drive letter', () => {
    expect(isWithinRoots('c:\\root\\report.pdf', ['C:\\root'], p)).toBe(true);
  });

  it('rejects a traversal escape', () => {
    const target = p.resolve('C:\\root', '..\\..\\evil.txt');
    expect(target).toBe('C:\\evil.txt');
    expect(isWithinRoots(target, ['C:\\root'], p)).toBe(false);
  });

  it('rejects a drive-letter path outside the root', () => {
    expect(isWithinRoots('D:\\evil\\payload.txt', ['C:\\root'], p)).toBe(false);
  });

  it('rejects a UNC path outside the root', () => {
    expect(isWithinRoots('\\\\attacker\\share\\payload.txt', ['C:\\root'], p)).toBe(false);
  });

  it('rejects a different UNC share when the root is itself UNC', () => {
    expect(isWithinRoots('\\\\server\\other\\payload.txt', ['\\\\server\\share'], p)).toBe(false);
  });

  it('rejects a sibling directory sharing a prefix with the root', () => {
    expect(isWithinRoots('C:\\data-backup\\x', ['C:\\data'], p)).toBe(false);
  });
});

describe('assertWithinRoots', () => {
  it('returns silently for a contained target', () => {
    expect(() => assertWithinRoots('/srv/dl/report.pdf', ['/srv/dl'], path.posix)).not.toThrow();
  });

  it('throws a UserError naming the env var for an escaping target', () => {
    expect(() => assertWithinRoots('/etc/passwd', ['/srv/dl'], path.posix)).toThrow(UserError);
    expect(() => assertWithinRoots('/etc/passwd', ['/srv/dl'], path.posix)).toThrow(
      /GOOGLE_DOCS_DOWNLOAD_ROOTS/
    );
  });

  it('fails closed when no roots are supplied', () => {
    expect(() => assertWithinRoots('/srv/dl/report.pdf', [], path.posix)).toThrow(UserError);
  });
});
