import { z } from 'zod';
import { ContentEntrySchema } from './content';

/**
 * Output of the PDF extraction pipeline (scripts/extract) after review approval.
 * Gitignored, never bundled with the app — imported into IndexedDB by the user
 * via Library > Import Pack.
 */
export const PackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceBook: z.string(),
  edition: z.enum(['2014', '2024']),
  createdAt: z.number(),
  entries: z.array(ContentEntrySchema),
});
export type Pack = z.infer<typeof PackSchema>;

/** A single candidate entry awaiting human review, before it's promoted into a Pack. */
export const PendingExtractionEntrySchema = z.object({
  entry: ContentEntrySchema,
  page: z.number().int().positive(),
  verbatimQuote: z.string().min(1),
  confidence: z.number().min(0).max(1),
  status: z.enum(['pending', 'approved', 'rejected', 'conflict']).default('pending'),
  conflictNote: z.string().optional(),
});
export type PendingExtractionEntry = z.infer<typeof PendingExtractionEntrySchema>;
