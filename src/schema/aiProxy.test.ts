import { describe, expect, it } from 'vitest';
import { MAX_SHARED_KEY_REQUEST_BYTES, sharedKeyRequestBytes } from './aiProxy';

const KB = 1024;
const text = (n: number) => 'x'.repeat(n);

/**
 * Regression: the ceiling once measured `contents` alone. Because the advisor
 * puts its whole system prompt in `config.systemInstruction` and the builder
 * puts its tool schema in `config.tools`, that check was watching the smaller
 * half of a real request and an 883 KB payload reached Google untouched.
 */
describe('sharedKeyRequestBytes', () => {
  it('counts config, not just contents', () => {
    const contentsOnly = sharedKeyRequestBytes({ contents: [{ text: text(10 * KB) }], config: {} });
    const configOnly = sharedKeyRequestBytes({ contents: [], config: { systemInstruction: text(10 * KB) } });

    // The bug this pins: a payload parked in config used to measure as ~nothing.
    expect(configOnly).toBeGreaterThan(10 * KB);
    expect(contentsOnly).toBeGreaterThan(10 * KB);
  });

  it('rejects the bypass shape: small contents, huge systemInstruction', () => {
    const bytes = sharedKeyRequestBytes({
      contents: [{ role: 'user', parts: [{ text: text(4 * KB) }] }],
      config: { systemInstruction: text(900 * KB) },
    });
    expect(bytes).toBeGreaterThan(MAX_SHARED_KEY_REQUEST_BYTES);
  });

  it('rejects a payload parked in config.tools', () => {
    const bytes = sharedKeyRequestBytes({ contents: [], config: { tools: [{ blob: text(800 * KB) }] } });
    expect(bytes).toBeGreaterThan(MAX_SHARED_KEY_REQUEST_BYTES);
  });

  it('still rejects oversize contents', () => {
    const bytes = sharedKeyRequestBytes({ contents: [{ text: text(600 * KB) }], config: {} });
    expect(bytes).toBeGreaterThan(MAX_SHARED_KEY_REQUEST_BYTES);
  });

  /**
   * The ceiling has to stay clear of real traffic. The content catalog the AI
   * builder sends measures 15.1 KB (2014) and 11.9 KB (2024); this asserts a
   * request several times that size is still nowhere near the limit, so
   * tightening the ceiling to include config did not put legitimate use at risk.
   */
  it('leaves a realistic request far under the ceiling', () => {
    const bytes = sharedKeyRequestBytes({
      contents: [{ role: 'user', parts: [{ text: text(2 * KB) }] }],
      config: { systemInstruction: text(60 * KB) },
    });
    expect(bytes).toBeLessThan(MAX_SHARED_KEY_REQUEST_BYTES / 4);
  });

  it('handles absent contents and config', () => {
    expect(sharedKeyRequestBytes({})).toBeLessThan(100);
  });

  it('measures multi-byte characters by their encoded length, not character count', () => {
    // JSON.stringify keeps these as literal characters, so a naive .length
    // would undercount a prompt written in a non-Latin script by up to 3x.
    const bytes = sharedKeyRequestBytes({ contents: [{ text: '　'.repeat(1000) }], config: {} });
    expect(bytes).toBeGreaterThan(3000);
  });
});
