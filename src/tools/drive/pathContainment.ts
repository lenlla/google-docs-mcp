import nodePath from 'node:path';
import { UserError } from 'fastmcp';

/**
 * Pure containment check for download destinations.
 *
 * Deliberately free of filesystem and `process.env` access: callers resolve the
 * roots (absolute + realpath) and the target before calling in, so this module
 * can be unit-tested against both platforms' path semantics on any CI runner.
 *
 * @param resolvedTarget  Already-resolved absolute path of the download destination.
 * @param resolvedRoots   Already-resolved absolute allowlisted root directories.
 * @param p               Path implementation -- pass `nodePath.win32` / `nodePath.posix`
 *                        to exercise a specific platform's semantics.
 */
export function isWithinRoots(
  resolvedTarget: string,
  resolvedRoots: string[],
  p: typeof import('node:path') = nodePath
): boolean {
  return resolvedRoots.some((root) => {
    // `relative` -- not `startsWith` -- because a prefix comparison is wrong for
    // Windows drive letters and UNC paths, and false-positives on sibling
    // directories that share a prefix (/data vs /data-backup).
    const relative = p.relative(root, resolvedTarget);
    if (relative === '') return true; // target is the root itself
    if (p.isAbsolute(relative)) return false; // different drive / UNC share
    return relative !== '..' && !relative.startsWith(`..${p.sep}`);
  });
}

/**
 * Throwing wrapper around {@link isWithinRoots}.
 *
 * Fails closed: an empty `resolvedRoots` rejects everything, so callers must
 * skip this entirely when no roots are configured (the default, permissive mode).
 */
export function assertWithinRoots(
  resolvedTarget: string,
  resolvedRoots: string[],
  p: typeof import('node:path') = nodePath
): void {
  if (isWithinRoots(resolvedTarget, resolvedRoots, p)) return;
  throw new UserError(
    `Refusing to write outside the configured download roots: "${resolvedTarget}" ` +
      `is not inside ${resolvedRoots.map((root) => `"${root}"`).join(', ') || '(no roots configured)'}. ` +
      `Choose a path inside a configured root, or adjust GOOGLE_DOCS_DOWNLOAD_ROOTS.`
  );
}
