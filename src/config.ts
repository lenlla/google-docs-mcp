import fs from 'node:fs';
import path from 'node:path';
import { UserError } from 'fastmcp';

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

/** How a Docs write is committed: straight into the document, or as a suggestion. */
export type WriteMode = 'direct' | 'suggest';

/** The env var that sets the default write mode for the suggest-capable Docs tools. */
export const WRITE_MODE_ENV_VAR = 'GOOGLE_DOCS_WRITE_MODE';

/**
 * Resolves the default write mode for the Docs tools that support suggest mode.
 *
 * Reads `process.env` on every call rather than capturing it at import time, so
 * tests can flip the variable between cases without resetting the module graph.
 * Only the tool layer calls this — the batch-update helpers take the mode as an
 * explicit argument so a tool that does not opt in can never inherit it.
 *
 * @param value - Override for the raw env value (mainly for tests)
 * @throws If the variable is set to anything other than `direct` or `suggest`
 */
export function getDefaultWriteMode(value?: string): WriteMode {
  const raw = (value ?? process.env[WRITE_MODE_ENV_VAR] ?? '').trim().toLowerCase();
  if (raw === '') return 'direct';
  if (raw === 'direct' || raw === 'suggest') return raw;
  throw new UserError(
    `Invalid ${WRITE_MODE_ENV_VAR} value "${value ?? process.env[WRITE_MODE_ENV_VAR]}". ` +
      `Valid values are "direct" and "suggest".`
  );
}
