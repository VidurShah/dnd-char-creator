/**
 * Files an issue from in-app feedback.
 *
 * Deliberately best-effort: the caller writes its database row first and
 * ignores whatever happens here. A revoked token, a rate limit, or a GitHub
 * outage must not turn into an error for someone who just reported a bug — the
 * row is the durable record, and the issue is a convenience on top of it.
 */
const GITHUB_API = 'https://api.github.com';
const DEFAULT_REPO = 'VidurShah/dnd-char-creator';

/** Long enough for a slow API, short enough not to hold a serverless function open. */
const TIMEOUT_MS = 10_000;

export interface IssueRequest {
  title: string;
  body: string;
  labels: string[];
}

export interface IssueResult {
  number: number;
  url: string;
}

export const githubConfigured = Boolean(process.env.GITHUB_TOKEN);

export async function createIssue(issue: IssueRequest): Promise<IssueResult | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  const repo = process.env.GITHUB_REPO || DEFAULT_REPO;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${GITHUB_API}/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify(issue),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[github] issue creation failed: ${res.status} ${await res.text().catch(() => '')}`);
      return null;
    }

    const created = (await res.json()) as { number: number; html_url: string };
    return { number: created.number, url: created.html_url };
  } catch (err) {
    console.warn('[github] issue creation failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
