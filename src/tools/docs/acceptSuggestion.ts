import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { docs_v1 } from 'googleapis';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';

/**
 * Builds the AcceptSuggestionRequest.
 *
 * `acceptSuggestion` belongs to the same Google Workspace Developer Preview
 * surface as `writeControl.writeMode = SUGGEST` and is not yet present in the
 * published googleapis TypeScript types, so the request is constructed and cast
 * here at its single point of use rather than widening types globally.
 */
export function buildAcceptSuggestionRequest(suggestionId: string): docs_v1.Schema$Request {
  return { acceptSuggestion: { suggestionId } } as unknown as docs_v1.Schema$Request;
}

export function register(server: FastMCP) {
  server.addTool({
    name: 'acceptSuggestion',
    description:
      'Accepts a pending suggested edit, committing it into the document. Use listSuggestions to get ' +
      'the suggestionId. Requires the Google Workspace Developer Preview Program.',
    parameters: DocumentIdParameter.extend({
      suggestionId: z
        .string()
        .min(1)
        .describe('The opaque suggestion ID to accept, as returned by listSuggestions.'),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(`Accepting suggestion ${args.suggestionId} in doc ${args.documentId}`);

      try {
        await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [
          buildAcceptSuggestionRequest(args.suggestionId),
        ]);
        return `Successfully accepted suggestion ${args.suggestionId}.`;
      } catch (error: any) {
        log.error(
          `Error accepting suggestion ${args.suggestionId} in doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to accept suggestion: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
