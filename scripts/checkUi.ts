/**
 * Browser-only regressions in the app shell: the ones tsc, oxlint, vitest, and
 * validate:data all sit green through.
 *
 * Two checks.
 *
 * 1. No route scrolls sideways, and no control's text spills out of its own box,
 *    at phone widths.
 * 2. The header survives a route that is still loading.
 *
 * Exists because the regression it guards was invisible to everything else the
 * project runs: tsc, oxlint, vitest, and validate:data all passed while the
 * header laid out 479px of content inside a 390px viewport, pushing Settings,
 * Feedback, and the account control off-screen on every route. Only a real
 * browser at a real width sees it — the same reason CLAUDE.md says to verify UI
 * changes by driving them rather than trusting type-checks.
 *
 * Both guard bugs that shipped: a header laying out 479px of content inside a
 * 390px viewport, and a Suspense boundary placed above Shell so every lazy
 * navigation blanked the wordmark, nav, and offline badge to a bare "Loading…".
 * Neither was visible to any other check the project runs.
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

/**
 * Holds a lazy route's chunk and asserts the chrome is still on screen while the
 * route is suspended.
 *
 * The boundary belongs inside Shell around its Outlet. Above Shell, React finds
 * it as the nearest boundary over the suspending route component and swaps out
 * Shell along with the page — so the whole app flickers away on every lazy
 * navigation, worst exactly where it matters most: a cold load on a phone.
 */
async function checkChromeSurvivesSuspense(browser: Browser): Promise<Failure[]> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  let intercepted = 0;
  await page.route('**/assets/CharactersPage-*.js', async (route) => {
    intercepted++;
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });

  // 'commit' rather than a load state: the point is to look mid-suspend.
  const navigation = page.goto(`${BASE}/characters`, { waitUntil: 'commit' });
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  await navigation.catch(() => {});
  await context.close();

  const failures: Failure[] = [];
  if (intercepted === 0) {
    // A pass here would be meaningless if the chunk was never held, so treat a
    // missed intercept as a failure rather than a silent green.
    failures.push({
      viewport: 'iPhone 13',
      route: '/characters',
      detail: 'never intercepted the route chunk — check has stopped testing anything',
    });
    return failures;
  }
  if (!body.includes('Loading')) {
    failures.push({ viewport: 'iPhone 13', route: '/characters', detail: 'route was not suspended when sampled' });
  }
  for (const marker of ['Grimoire', 'LIBRARY', 'CHARACTERS', 'SETTINGS']) {
    if (!body.includes(marker)) {
      failures.push({
        viewport: 'iPhone 13',
        route: '/characters',
        detail: `chrome disappeared while the route loaded: "${marker}" missing`,
      });
    }
  }
  return failures;
}

const browser = await chromium.launch();
let failures: Failure[];
try {
  failures = [...(await check(browser)), ...(await checkChromeSurvivesSuspense(browser))];
} finally {
  await browser.close();
}

if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL [${f.viewport}] ${f.route} — ${f.detail}`);
  console.error(`\n${failures.length} UI failure(s).`);
  process.exit(1);
}
console.log(
  `No horizontal overflow or clipped controls across ${VIEWPORTS.length} viewports x ${ROUTES.length} routes, ` +
    'and the header survives a suspended route.',
);
