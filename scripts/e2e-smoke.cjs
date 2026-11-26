/**
 * 브라우저 스모크 테스트: 방 만들기 → 봇 추가 → 한 판을 끝까지 → 결과 화면.
 *   서버 실행:  PACE=0.15 PORT=3111 npm run server   (먼저 npm run build:client)
 *   실행:       URL=http://localhost:3111 node scripts/e2e-smoke.cjs
 * Playwright(+Chromium)가 설치되어 있어야 한다. 스크린샷은 SHOTS 디렉터리(기본 /tmp/lh-shots)에 저장.
 */
const { chromium } = require('playwright');
const OUT = process.env.SHOTS || '/tmp/lh-shots';
require('node:fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'http://localhost:3111';
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL);
  await page.fill('input[maxlength="12"]', '테스터');
  await page.screenshot({ path: OUT + '/1-home.png' });
  await page.click('text=새 방 만들기');
  await page.waitForSelector('.code');
  for (const k of ['보통', '공격형', '속도형']) await page.click(`button:has-text("+ ${k}")`);
  await page.click('button.chip:has-text("꼬마 코스")');
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/2-lobby.png', fullPage: true });
  await page.click('text=등반 시작');
  await page.waitForSelector('.game');

  // 결정 UI 가 나타나면 자동으로 첫 번째 primary 버튼(없으면 첫 버튼)을 누른다
  let shots = 0, asks = new Set(), done = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    if (await page.locator('.center.result').count()) { done = true; break; }
    const ask = page.locator('.ask');
    if (await ask.count()) {
      const title = (await ask.locator('h4').first().innerText()).slice(0, 12);
      if (!asks.has(title) && shots < 8) { asks.add(title); await page.screenshot({ path: `${OUT}/3-ask-${shots++}.png` }); }
      const prim = ask.locator('button.opt.primary:not([disabled])');
      if (await prim.count()) await prim.first().click().catch(() => {});
      else await ask.locator('button.opt:not([disabled])').first().click().catch(() => {});
    } else if (shots === 3 && !asks.has('mid')) { asks.add('mid'); }
    await page.waitForTimeout(120);
  }
  console.log('finished game:', done, 'ask kinds seen:', [...asks].join(' | '));
  await page.waitForTimeout(3200);
  await page.screenshot({ path: OUT + '/5-result.png', fullPage: true });
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
  if (!done || errors.length) process.exit(1);
})().catch((e) => { console.error('E2E FAIL', e); process.exit(1); });
