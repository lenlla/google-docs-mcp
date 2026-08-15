// src/tools/docs/suggestionHelpers.ts
//
// Walks a fetched document and collects its pending suggestions.
//
// Scope (deliberately narrow — stated in the listSuggestions tool description
// so callers are not misled):
//   - Covers suggested insertions and deletions of body content, including
//     content nested inside tables and tables of contents.
//   - Does NOT cover headers, footers or footnote bodies.
//   - Does NOT cover style-only suggestions (suggestedTextStyleChanges /
//     suggestedParagraphStyleChanges), which carry neither an insertion nor a
//     deletion ID and so have no place in the { types, ranges } contract.

import { docs_v1 } from 'googleapis';
import { UserError } from 'fastmcp';
import { findTabById, getAllTabs } from '../../googleDocsApiHelpers.js';

export type SuggestionType = 'insertion' | 'deletion';

export interface SuggestionRange {
  startIndex: number;
  endIndex: number;
}

/**
 * One pending suggestion, keyed by its opaque suggestion ID.
 *
 * Both fields are arrays on purpose. A suggested *replacement* — the most common
 * real edit — surfaces a single suggestionId as a suggestedInsertionId on the new
 * runs and a suggestedDeletionId on the old ones, so a scalar `type` would have to
 * lie. And one suggestion can span several non-adjacent runs, so a scalar range
 * would too.
 */
export interface DocumentSuggestion {
  suggestionId: string;
  types: SuggestionType[];
  ranges: SuggestionRange[];
}

/**
 * Every ParagraphElement variant. Each carries its own suggestedInsertionIds /
 * suggestedDeletionIds, so all of them have to be inspected — restricting this to
 * textRun would silently miss a suggested image, page break or smart chip.
 */
const PARAGRAPH_ELEMENT_KEYS = [
  'textRun',
  'autoText',
  'pageBreak',
  'columnBreak',
  'footnoteReference',
  'horizontalRule',
  'equation',
  'inlineObjectElement',
  'person',
  'richLink',
] as const;

interface SuggestionAccumulator {
  types: Set<SuggestionType>;
  ranges: SuggestionRange[];
}

function record(
  acc: Map<string, SuggestionAccumulator>,
  suggestionId: string,
  type: SuggestionType,
  range: SuggestionRange
): void {
  let entry = acc.get(suggestionId);
  if (!entry) {
    entry = { types: new Set(), ranges: [] };
    acc.set(suggestionId, entry);
  }
  entry.types.add(type);
  entry.ranges.push(range);
}

/** Merges adjacent and overlapping ranges so only genuinely disjoint spans survive. */
function mergeRanges(ranges: SuggestionRange[]): SuggestionRange[] {
  const sorted = [...ranges].sort((a, b) => a.startIndex - b.startIndex);
  const merged: SuggestionRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.startIndex <= last.endIndex) {
      last.endIndex = Math.max(last.endIndex, range.endIndex);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function walkParagraph(
  paragraph: docs_v1.Schema$Paragraph,
  acc: Map<string, SuggestionAccumulator>
): void {
  for (const element of paragraph.elements ?? []) {
    const { startIndex, endIndex } = element;
    if (startIndex == null || endIndex == null) continue;
    const range: SuggestionRange = { startIndex, endIndex };

    for (const key of PARAGRAPH_ELEMENT_KEYS) {
      const inner = (element as Record<string, any>)[key];
      if (!inner) continue;
      for (const id of (inner.suggestedInsertionIds ?? []) as string[]) {
        record(acc, id, 'insertion', range);
      }
      for (const id of (inner.suggestedDeletionIds ?? []) as string[]) {
        record(acc, id, 'deletion', range);
      }
    }
  }
}

function walkContent(
  content: docs_v1.Schema$StructuralElement[] | undefined,
  acc: Map<string, SuggestionAccumulator>
): void {
  for (const element of content ?? []) {
    if (element.paragraph) {
      walkParagraph(element.paragraph, acc);
    }
    if (element.table) {
      for (const row of element.table.tableRows ?? []) {
        for (const cell of row.tableCells ?? []) {
          walkContent(cell.content, acc);
        }
      }
    }
    if (element.tableOfContents) {
      walkContent(element.tableOfContents.content, acc);
    }
  }
}

/**
 * Resolves which body (or bodies) to scan.
 *
 * A tabbed document has no top-level `body` — content lives under
 * `tabs[].documentTab.body` — so scanning only `doc.body` would report "no
 * suggestions" on exactly the documents most likely to have them.
 *
 * @param doc   - A document fetched with `includeTabsContent: true`
 * @param tabId - Optional single tab to scan; omit to scan every tab
 */
export function resolveSuggestionBodies(
  doc: docs_v1.Schema$Document,
  tabId?: string
): docs_v1.Schema$StructuralElement[][] {
  if (tabId) {
    const tab = findTabById(doc, tabId);
    if (!tab) {
      throw new UserError(`Tab with ID "${tabId}" not found in document.`);
    }
    if (!tab.documentTab) {
      throw new UserError(`Tab "${tabId}" does not have content (may not be a document tab).`);
    }
    return [tab.documentTab.body?.content ?? []];
  }

  if (doc.tabs && doc.tabs.length > 0) {
    return getAllTabs(doc)
      .map((tab) => tab.documentTab?.body?.content)
      .filter((content): content is docs_v1.Schema$StructuralElement[] => !!content);
  }

  return [doc.body?.content ?? []];
}

/**
 * Collects every pending insertion/deletion suggestion in the document or tab.
 *
 * @param doc   - A document fetched with `includeTabsContent: true`
 * @param tabId - Optional tab to restrict the scan to
 * @returns One entry per suggestion ID, ordered by first appearance in the text
 */
export function collectSuggestions(
  doc: docs_v1.Schema$Document,
  tabId?: string
): DocumentSuggestion[] {
  const acc = new Map<string, SuggestionAccumulator>();
  for (const content of resolveSuggestionBodies(doc, tabId)) {
    walkContent(content, acc);
  }

  return [...acc.entries()]
    .map(([suggestionId, entry]) => ({
      suggestionId,
      // Deterministic order so callers and tests can compare directly.
      types: (['insertion', 'deletion'] as const).filter((t) => entry.types.has(t)),
      ranges: mergeRanges(entry.ranges),
    }))
    .sort(
      (a, b) =>
        a.ranges[0].startIndex - b.ranges[0].startIndex ||
        a.suggestionId.localeCompare(b.suggestionId)
    );
}

/** True when the document (or the given tab) has at least one pending suggestion. */
export function hasPendingSuggestions(doc: docs_v1.Schema$Document, tabId?: string): boolean {
  return collectSuggestions(doc, tabId).length > 0;
}
