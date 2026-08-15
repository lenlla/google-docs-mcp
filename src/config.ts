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
