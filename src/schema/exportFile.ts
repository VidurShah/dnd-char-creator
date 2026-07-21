import { z } from 'zod';
import { CharacterSchema } from './character';
import { ContentEntrySchema } from './content';

const EXPORT_SCHEMA_VERSION = 1;

/** A single character plus any custom content entries it references, for sharing/backup. */
export const CharacterExportFileSchema = z.object({
  kind: z.literal('character-export'),
  schemaVersion: z.number().int().positive().default(EXPORT_SCHEMA_VERSION),
  exportedAt: z.number(),
  character: CharacterSchema,
  customContent: z.array(ContentEntrySchema).default([]),
});
export type CharacterExportFile = z.infer<typeof CharacterExportFileSchema>;

/** The entire local vault: all characters and all custom/imported content. */
export const VaultExportFileSchema = z.object({
  kind: z.literal('vault-export'),
  schemaVersion: z.number().int().positive().default(EXPORT_SCHEMA_VERSION),
  exportedAt: z.number(),
  characters: z.array(CharacterSchema),
  content: z.array(ContentEntrySchema),
});
export type VaultExportFile = z.infer<typeof VaultExportFileSchema>;
