// SNS 共有用のプレビュー画像 public/og.png (1200x630) を作る。
// 使い方: npm run build && npx vite preview --port 4173 を起動した状態で node scripts/make-og.cjs
// Playwright (Chromium) が必要。
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 718 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('d4-clusters-guide-closed', '1'); } catch {} });
  const page = await ctx.newPage();
  await page.goto(`${process.env.PREVIEW_URL ?? 'http://localhost:4173/'}?v=1&d=40&m=3&c=all&map=142.45,43.5,6.2`);
  await page.waitForTimeout(5000);
  await page.addStyleTag({ content: '.maplibregl-ctrl-bottom-right,.overlay{display:none}.map-card{border-radius:0}.og-title{position:absolute;right:32px;bottom:44px;line-height:1.5;z-index:5;background:rgba(255,255,255,.92);border-radius:14px;padding:14px 20px;box-shadow:0 8px 24px rgba(25,40,70,.18);font-family:"Hiragino Sans","Noto Sans JP",sans-serif;color:#1d2330}.og-title b{display:block;font-size:30px;letter-spacing:.02em;line-height:1.35;margin-bottom:6px}.og-title i{display:block;font-style:normal;font-size:20px;font-weight:700;color:#2f7fc8;margin-bottom:4px}.og-title span{font-size:16px;color:#5a6170}' });
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'og-title';
    el.innerHTML = '<b>Shabon Hokkaido</b><i>How Near Is Near?</i><span>Clustering Hokkaido’s tourist spots by distance / #30DayMapChallenge Day 4 Clusters</span>';
    document.querySelector('.map-card').appendChild(el);
  });
  await page.waitForTimeout(300);
  const box = await page.locator('.map-card').boundingBox();
  await page.screenshot({ path: process.argv[2] ?? "public/og.png", clip: { x: box.x, y: box.y, width: Math.min(box.width, 1200), height: Math.min(box.height, 630) } });
  console.log(box);
  await browser.close();
})();
