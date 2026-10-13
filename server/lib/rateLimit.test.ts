// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientKey, createRateLimiter } from './rateLimit.js';

const HOUR = 60 * 60 * 1000;

afterEach(() => vi.useRealTimers());

describe('createRateLimiter', () => {
  it('admits `limit` calls per window, then returns seconds until the reset', () => {
    vi.useFakeTimers({ now: 10 * HOUR });
    const limiter = createRateLimiter(2, HOUR);
    expect(limiter.check('k')).toBeNull();
    expect(limiter.check('k')).toBeNull();
    vi.setSystemTime(10 * HOUR + 30 * 60 * 1000);
    expect(limiter.check('k')).toBe(30 * 60);
  });

  it('aligns windows to the epoch, matching the Postgres quota', () => {
    // First call 59 minutes into an hour: the window still ends on the hour,
    // not an hour after that first call.
    vi.useFakeTimers({ now: 10 * HOUR + 59 * 60 * 1000 });
    const limiter = createRateLimiter(1, HOUR);
    limiter.check('k');
    expect(limiter.check('k')).toBe(60);
    vi.setSystemTime(11 * HOUR);
    expect(limiter.check('k')).toBeNull();
  });

  it('tracks keys independently', () => {
    const limiter = createRateLimiter(1, HOUR);
    limiter.check('a');
    expect(limiter.check('a')).not.toBeNull();
    expect(limiter.check('b')).toBeNull();
  });

  it('sweeps expired windows once it holds more than 5,000 keys', () => {
    vi.useFakeTimers({ now: 10 * HOUR });
    const limiter = createRateLimiter(1, HOUR);
    for (let i = 0; i <= 5_000; i++) limiter.check(`ip-${i}`);
    vi.setSystemTime(11 * HOUR);
    limiter.check('trigger-sweep');
    // Swept keys start over rather than staying blocked — and nothing throws
    // from deleting while iterating.
    expect(limiter.check('ip-0')).toBeNull();
  });
});

describe('clientKey', () => {
  it('takes the first x-forwarded-for hop, falling back to the socket', () => {
    expect(clientKey('203.0.113.7, 10.0.0.1', '10.0.0.1')).toBe('203.0.113.7');
    expect(clientKey(undefined, '127.0.0.1')).toBe('127.0.0.1');
    expect(clientKey('', undefined)).toBe('unknown');
  });
});
