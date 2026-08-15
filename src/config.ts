import fs from 'node:fs';
import path from 'node:path';

/**
 * Parses MCP_STATELESS env var. Stateless mode disables httpStream session
 * tracking so the server survives serverless scale-to-zero without losing
 * MCP sessions.
 */
export function parseStatelessFlag(value?: string): boolean {
  const raw = (value ?? process.env.MCP_STATELESS ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

export const DOWNLOAD_ROOTS_ENV = 'GOOGLE_DOCS_DOWNLOAD_ROOTS';

/**
 * Parses GOOGLE_DOCS_DOWNLOAD_ROOTS into the allowlist of directories that
 * `downloadFile` may write into.
 *
 * Unset (the default) returns an empty list, which means "no containment" --
 * behaviour identical to a server without this feature. When set, entries are
 * separated by the platform delimiter (`;` on Windows, `:` on POSIX) and must
 * be absolute paths that exist on disk; the returned paths are realpath-resolved
 * so a symlinked root compares correctly against a realpath-resolved target.
 *
 * Reads `process.env` when called rather than at import time, so a malformed
 * value surfaces on the first download attempt instead of preventing the whole
 * MCP server from starting. Throws a plain `Error` -- not a fastmcp `UserError`
 * -- because a malformed server configuration is an operator problem, not a
 * client-facing tool error.
 */
export function getDownloadRoots(): string[] {
  const raw = (process.env[DOWNLOAD_ROOTS_ENV] ?? '').trim();
  if (!raw) return [];

  return raw
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      if (!path.isAbsolute(entry)) {
        throw new Error(
          `${DOWNLOAD_ROOTS_ENV} entry "${entry}" is not an absolute path. ` +
            `Every configured download root must be an absolute directory path, ` +
            `separated by "${path.delimiter}".`
        );
      }
      try {
        return fs.realpathSync(entry);
      } catch {
        throw new Error(
          `${DOWNLOAD_ROOTS_ENV} entry "${entry}" does not exist on disk. ` +
            `Create the directory or correct the configured value.`
        );
      }
    });
}
