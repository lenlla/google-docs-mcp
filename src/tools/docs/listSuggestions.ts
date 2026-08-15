import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { collectSuggestions } from './suggestionHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listSuggestions',
    description:
      'Lists the pending suggested edits in a Google Document. Returns one entry per suggestion ID: ' +
      '{ suggestionId, types, ranges }. `types` is an array because a suggested replacement carries the ' +
      'same ID as both an insertion and a deletion, and `ranges` is an array because one suggestion can ' +
      'span several non-adjacent runs of text. Use the returned suggestionId with acceptSuggestion or ' +
      'rejectSuggestion. ' +
      'Limitations: covers body content only (including text inside tables) — suggestions in headers, ' +
      'footers and footnotes are not reported, and neither are style-only suggestions, which carry no ' +
      'insertion or deletion ID. Suggestion authors are not resolvable through this API surface.',
    parameters: DocumentIdParameter.extend({
      tabId: z
        .string()
        .optional()
        .describe(
          'The ID of a specific tab to scan. If not specified, scans every tab of a tabbed document ' +
            '(or the document body for a document without tabs).'
        ),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Listing suggestions in doc ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}`
      );

      try {
        // No field mask: suggestion IDs hang off individual paragraph elements at
        // arbitrary nesting depth inside tables, which a field mask cannot express.
        const res = await GDocsHelpers.getDocument(docs, {
          documentId: args.documentId,
          includeTabsContent: true,
        });

        const suggestions = collectSuggestions(res.data, args.tabId);
        log.info(`Found ${suggestions.length} pending suggestion(s).`);

        return JSON.stringify({ documentId: args.documentId, suggestions }, null, 2);
      } catch (error: any) {
        log.error(
          `Error listing suggestions for doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        if (error.code === 404) throw new UserError(`Document not found (ID: ${args.documentId}).`);
        if (error.code === 403)
          throw new UserError(`Permission denied for document (ID: ${args.documentId}).`);
        throw new UserError(`Failed to list suggestions: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
