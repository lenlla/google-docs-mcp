import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { docs_v1 } from 'googleapis';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import { getDefaultWriteMode } from '../../config.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertText',
    description:
      "Inserts text at a specific character index within a document. Use readDocument with format='json' to determine the correct index.",
    parameters: DocumentIdParameter.extend({
      text: z.string().min(1).describe('The text to insert.'),
      index: z
        .number()
        .int()
        .min(1)
        .describe(
          "1-based character index within the document body. Use readDocument with format='json' to inspect indices."
        ),
      tabId: z
        .string()
        .optional()
        .describe(
          'The ID of the specific tab to insert into. If not specified, inserts into the first tab (or legacy document.body for documents without tabs).'
        ),
      editMode: z
        .enum(['direct', 'suggest'])
        .optional()
        .describe(
          "How the change is written: 'direct' commits it immediately; 'suggest' leaves it as a pending suggested edit. Defaults to the GOOGLE_DOCS_WRITE_MODE environment variable, or 'direct' when that is unset. Suggest mode requires the Google Workspace Developer Preview Program."
        ),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      const writeMode = args.editMode ?? getDefaultWriteMode();
      log.info(
        `Inserting text in doc ${args.documentId} at index ${args.index}${args.tabId ? ` (tab: ${args.tabId})` : ''}`
      );
      try {
        if (args.tabId) {
          const targetTab = await GDocsHelpers.getDocumentTab(docs, args.documentId, args.tabId);

          // Insert with tabId
          const location: any = { index: args.index, tabId: args.tabId };
          const request: docs_v1.Schema$Request = {
            insertText: { location, text: args.text },
          };
          await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [request], { writeMode });
        } else {
          // Use existing helper for backward compatibility
          await GDocsHelpers.insertText(docs, args.documentId, args.text, args.index, {
            writeMode,
          });
        }
        return `Successfully inserted text at index ${args.index}${args.tabId ? ` in tab ${args.tabId}` : ''}.`;
      } catch (error: any) {
        log.error(`Error inserting text in doc ${args.documentId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to insert text: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
