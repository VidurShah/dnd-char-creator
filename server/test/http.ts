import type { Express } from 'express';
import type { AddressInfo } from 'node:net';

/**
 * Serves an app on an ephemeral port and returns a fetch bound to it. Plain
 * fetch against a real socket rather than supertest: it exercises the same
 * body parsing and status handling a browser would, with no extra dependency.
 */
export async function serve(app: Express) {
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function request(
    method: string,
    path: string,
    { user, body }: { user?: string; body?: unknown } = {},
  ): Promise<{ status: number; headers: Headers; body: any }> {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(user ? { 'x-test-user': user } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  }

  return {
    request,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
