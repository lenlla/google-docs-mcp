// AC 6 — each of the ten suggest-capable tools accepts an optional `editMode`
// zod enum of exactly 'direct' | 'suggest'. Asserted through the schema rather
// than by reading source, so a rename or a widened enum fails the build.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
  getDriveClient: vi.fn(),
}));

import { register as insertText } from './insertText.js';
import { register as appendText } from './appendToGoogleDoc.js';
import { register as findAndReplace } from './findAndReplace.js';
import { register as modifyText } from './modifyText.js';
import { register as replaceTableRowData } from './replaceTableRowData.js';
import { register as insertTableWithData } from './insertTableWithData.js';
import { register as appendTableRows } from './appendTableRows.js';
import { register as deleteTableRows } from './deleteTableRows.js';
import { register as applyTextStyle } from './formatting/applyTextStyle.js';
import { register as applyParagraphStyle } from './formatting/applyParagraphStyle.js';

const SUGGEST_CAPABLE_TOOLS: Array<[string, (server: any) => void]> = [
  ['insertText', insertText],
  ['appendText', appendText],
  ['findAndReplace', findAndReplace],
  ['modifyText', modifyText],
  ['replaceTableRowData', replaceTableRowData],
  ['applyTextStyle', applyTextStyle],
  ['applyParagraphStyle', applyParagraphStyle],
  ['insertTableWithData', insertTableWithData],
  ['appendTableRows', appendTableRows],
  ['deleteTableRows', deleteTableRows],
];

function captureTool(register: (server: any) => void) {
  let captured: any;
  register({ addTool: (config: any) => (captured = config) } as any);
  return captured;
}

/** Issues zod raised specifically about editMode (other missing fields are irrelevant here). */
function editModeIssues(schema: any, value: unknown) {
  const result = schema.safeParse({ editMode: value });
  if (result.success) return [];
  return result.error.issues.filter((issue: any) => issue.path[0] === 'editMode');
}

describe.each(SUGGEST_CAPABLE_TOOLS)('%s editMode parameter', (name, register) => {
  const tool = captureTool(register);

  it(`registers as ${name}`, () => {
    expect(tool.name).toBe(name);
  });

  it("accepts 'direct' and 'suggest'", () => {
    expect(editModeIssues(tool.parameters, 'direct')).toEqual([]);
    expect(editModeIssues(tool.parameters, 'suggest')).toEqual([]);
  });

  it('is optional', () => {
    expect(editModeIssues(tool.parameters, undefined)).toEqual([]);
  });

  it('rejects any other value', () => {
    expect(editModeIssues(tool.parameters, 'SUGGEST')).not.toEqual([]);
    expect(editModeIssues(tool.parameters, 'suggested')).not.toEqual([]);
    expect(editModeIssues(tool.parameters, true)).not.toEqual([]);
  });

  it('documents itself with .describe()', () => {
    // `.refine()` wraps the object schema in a ZodEffects — sometimes more than
    // once — so unwrap down to the object before reading the field.
    let schema: any = tool.parameters;
    while (!schema.shape && schema._def?.schema) schema = schema._def.schema;
    expect(schema.shape.editMode.description).toMatch(/suggest/i);
  });
});
