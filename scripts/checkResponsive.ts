/**
 * Fails if any route scrolls sideways, or if any control's text spills out of
 * its own box, at phone widths.
 *
 * Exists because the regression it guards was invisible to everything else the
 * project runs: tsc, oxlint, vitest, and validate:data all passed while the
 * header laid out 479px of content inside a 390px viewport, pushing Settings,
 * Feedback, and the account control off-screen on every route. Only a real
 * browser at a real width sees it — the same reason CLAUDE.md says to verify UI
 * changes by driving them rather than trusting type-checks.
 *
 * Needs a server already running (`pnpm dev`); pass --url to point elsewhere.
 */
import { chromium, type Browser } from 'playwright';

const BASE = process.argv.find((a) => a.startsWith('--url='))?.slice(6) ?? 'http://localhost:5173';

/** Phone widths first: those are the ones that actually broke. */
const VIEWPORTS = [
  { label: 'iPhone SE', width: 375, height: 667 },
  { label: 'iPhone 13', width: 390, height: 844 },
  { label: 'tablet', width: 768, height: 1024 },
  { label: 'desktop', width: 1280, height: 900 },
];

const ROUTES = ['/library', '/characters', '/characters/templates', '/characters/new', '/settings'];

interface Failure {
  viewport: string;
  route: string;
  detail: string;
}

async function check(browser: Browser): Promise<Failure[]> {
  const failures: Failure[] = [];

  for (const vp of VIEWPORTS) {
    const isPhone = vp.width < 500;
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: isPhone,
      hasTouch: isPhone,
    });
    const page = await context.newPage();

    for (const route of ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'networkidle' });
      // Clerk's account control mounts late and is one of the widest things in
      // the header, so measuring before it lands would miss the overflow.
      await page.waitForTimeout(1200);

      const overflow = await page.evaluate(() => {
        const d = document.documentElement;
        return d.scrollWidth - d.clientWidth;
      });
      if (overflow > 1) {
        failures.push({ viewport: vp.label, route, detail: `page scrolls sideways by ${overflow}px` });
      }

      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll('button, a')]
          .filter((el) => el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)
          .map((el) => (el.textContent ?? '').trim().slice(0, 40))
          .slice(0, 5),
      );
      for (const label of clipped) {
        failures.push({ viewport: vp.label, route, detail: `control clips its own label: "${label}"` });
      }
    }
    await context.close();
  }
  return failures;
}

const browser = await chromium.launch();
let failures: Failure[];
try {
  failures = await check(browser);
} finally {
  await browser.close();
}

if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL [${f.viewport}] ${f.route} — ${f.detail}`);
  console.error(`\n${failures.length} responsive failure(s).`);
  process.exit(1);
}
console.log(`No horizontal overflow or clipped controls across ${VIEWPORTS.length} viewports x ${ROUTES.length} routes.`);
