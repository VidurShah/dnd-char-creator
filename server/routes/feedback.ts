import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { and, count, eq, gte } from 'drizzle-orm';
import { dbConfigured, getDb } from '../db/client.js';
import { feedback } from '../db/schema.js';
import { currentUserId, requireUser } from '../lib/auth.js';
import { createIssue } from '../lib/github.js';
import { FeedbackRequestSchema } from '../../src/schema/feedback.js';

/**
 * In-app feedback, which becomes a GitHub issue.
 *
 * Order matters: the row is written first and always, then the issue is
 * attempted. If GitHub fails the feedback is still captured and the reporter
 * still gets a success — losing a bug report because a token expired would be
 * the worse failure by far.
 *
 * Requires an account. Anonymous submission would make the endpoint an open
 * relay for writing into a public issue tracker.
 */

/** Per-user hourly cap, enforced against the table so it survives cold starts. */
const HOURLY_LIMIT = 10;

function buildBody(message: string, context: Record<string, unknown> | undefined, userId: string): string {
  const lines = [message.trim(), '', '---', ''];
  if (context && Object.keys(context).length > 0) {
    lines.push('| field | value |', '| --- | --- |');
    for (const [k, v] of Object.entries(context)) lines.push(`| ${k} | ${String(v)} |`);
    lines.push('');
  }
  // The Clerk user id, never the email address — enough to follow up through
  // Clerk without publishing someone's address in a public issue.
  lines.push(`Submitted from Grimoire by user \`${userId}\`.`);
  return lines.join('\n');
}

export const feedbackRouter: Router = Router();

feedbackRouter.use(requireUser);

feedbackRouter.post('/', async (req, res) => {
  const parsed = FeedbackRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid feedback.' });
    return;
  }
  if (!dbConfigured) {
    res.status(503).json({ error: 'Feedback is not configured on this server.' });
    return;
  }

  const userId = currentUserId(req)!;
  const db = getDb();
  const { category, title, message, context } = parsed.data;

  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [{ value: recent }] = await db
    .select({ value: count() })
    .from(feedback)
    .where(and(eq(feedback.userId, userId), gte(feedback.createdAt, since)));

  if (recent >= HOURLY_LIMIT) {
    res.status(429).json({ error: "You've sent a lot of feedback in the last hour — try again later." });
    return;
  }

  const id = randomUUID();
  await db.insert(feedback).values({ id, userId, category, title, message, context: context ?? null });

  const issue = await createIssue({
    // The reporter's own title, verbatim — the category is already carried by
    // a label, so prefixing it here would just duplicate that in every title.
    title,
    body: buildBody(message, context, userId),
    labels: ['feedback', category],
  });

  if (issue) {
    await db.update(feedback).set({ githubIssueNumber: issue.number }).where(eq(feedback.id, id));
  }

  res.json({ ok: true, ...(issue ? { issueUrl: issue.url } : {}) });
});
