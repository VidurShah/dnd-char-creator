import { z } from 'zod';

/** Shared by the feedback form and the API route so the contract can't drift. */
export const FEEDBACK_CATEGORIES = ['bug', 'idea', 'content', 'other'] as const;

export const FeedbackCategorySchema = z.enum(FEEDBACK_CATEGORIES);
export type FeedbackCategory = z.infer<typeof FeedbackCategorySchema>;

export const FEEDBACK_TITLE_MAX_LENGTH = 120;
export const FEEDBACK_MAX_LENGTH = 4000;

export const FeedbackRequestSchema = z.object({
  category: FeedbackCategorySchema,
  /** Becomes the GitHub issue title verbatim. */
  title: z.string().trim().min(1).max(FEEDBACK_TITLE_MAX_LENGTH),
  /** Becomes the issue body. */
  message: z.string().trim().min(1).max(FEEDBACK_MAX_LENGTH),
  /**
   * Whatever the client can cheaply attach about where this came from — route,
   * edition, character id, app build. Free-form on purpose: it's for a human
   * reading the issue, and locking down a shape would just mean losing detail.
   */
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

export const FeedbackResponseSchema = z.object({
  ok: z.literal(true),
  /** Present only when the GitHub issue was actually filed. */
  issueUrl: z.string().url().optional(),
});
