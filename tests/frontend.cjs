/* Run only against a disposable test database. Requires Playwright and Chromium.
 * HUB_TEST_URL, HUB_TEST_PASSWORD; optional HUB_TEST_ASSETS for locally fetched CDN builds.
 * The database harness owns teardown. Upload responses are mocked; PHP CRUD is real.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const base = process.env.HUB_TEST_URL || 'http://127.0.0.1:8080';
  if (!process.env.HUB_TEST_PASSWORD) throw new Error('Set a disposable HUB_TEST_PASSWORD');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (process.env.HUB_TEST_ASSETS) {
      await context.route('https://**/*', async route => {
        const url = route.request().url();
        const file = url.includes('tailwindcss') ? 'tailwind.js' : url.includes('lucide') ? 'lucide.js' : url.includes('xlsx.full.min.js') ? 'xlsx.js' : null;
        if (file) return route.fulfill({ path: path.join(process.env.HUB_TEST_ASSETS, file), contentType: 'text/javascript' });
        return route.abort();
      });
    }
    await page.goto(base);
    await page.locator('#login-submit:not([disabled])').waitFor();
    assert.equal(await page.locator('#app').isVisible(), false);
    await page.fill('#login-password', 'wrong-test-password');
    await page.click('#login-submit');
    await page.getByText('密码错误', { exact: true }).waitFor();
    await page.fill('#login-password', process.env.HUB_TEST_PASSWORD);
    await page.click('#login-submit');
    await page.locator('#new-button:not([disabled])').waitFor();
    assert.equal(await page.locator('#gate').isVisible(), false);
    const schema = (await (await page.request.get(`${base}/api.php?action=schema`)).json()).modules;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const titles = { purchases: '旅行耳机', investments: '长期指数基金', temp_investments: '短期项目', subscriptions: '设计工具订阅', savings: '旅行储蓄账户', currencies: '日本旅行余钱', cards: 'Wise 旅行卡', passwords: '测试网站账号' };
    for (const [module, fields] of Object.entries(schema)) {
      await page.click('#new-button');
      await page.selectOption('#new-module', module);
      assert.equal(await page.locator('#record-fields [name]').count(), Object.keys(fields).length);
      for (const [key, [kind, required, options]] of Object.entries(fields)) {
        const input = page.locator(`#field-${key}`);
        if (kind === 'image') continue;
        if (kind === 'currency') await input.selectOption(module === 'purchases' ? 'MYR' : module === 'currencies' ? 'JPY' : 'SGD');
        else if (kind === 'enum') await input.selectOption(options[0]);
        else if (kind === 'date') await input.fill(today);
        else if (kind === 'money') await input.fill(key === 'recovered_amount' ? '80.1234' : key === 'target_amount' ? '200.2468' : '100.1234');
        else if (kind === 'percent') await input.fill('3.5');
        else if (kind === 'rate') await input.fill('0.009');
        else if (kind === 'last_four') await input.fill('0123');
        else if (kind === 'day') await input.fill('20');
        else if (kind === 'url') await input.fill('https://example.com');
        else await input.fill(key === 'name' || key === 'location' ? titles[module] : key === 'notes' ? '<img src=x onerror="window.hubXSS=true">\n测试备注' : '测试备忘');
      }
      if (module === 'temp_investments') assert.match(await page.locator('#record-derived').innerText(), /−SGD 20\.00/);
      if (module === 'savings') assert.match(await page.locator('#record-derived').innerText(), /50\.0%/);
      await page.click('#save-record');
      await page.locator('#record-dialog').waitFor({ state: 'hidden' });
      await page.getByText(titles[module], { exact: true }).first().waitFor();
    }
    assert.equal(await page.evaluate(() => !!window.hubXSS), false);
    let exported = (await (await page.request.get(`${base}/api.php?action=export`)).json()).modules;
    assert.equal(Object.values(exported).flat().length, 8);
    assert.equal(exported.cards[0].data.last_four, '0123');
    assert.equal(exported.temp_investments[0].computed.net_profit, '-20.0000');

    await page.keyboard.press('Control+k');
    await page.fill('#global-search', '旅行耳机');
    await page.locator('[data-search-open]').click();
    await page.locator('#record-dialog[open]').waitFor();
    assert.equal(await page.locator('#field-name').inputValue(), '旅行耳机');
    await page.fill('#field-notes', '编辑后的收据记录');
    await page.click('#save-record');
    await page.locator('#record-dialog').waitFor({ state: 'hidden' });
    await page.getByText('未设置汇率', { exact: true }).first().waitFor();

    await page.click('#currency-toggle');
    await page.locator('#rates-dialog[open]').waitFor();
    await page.fill('#rate-MYR', '0.30');
    await page.fill('#rate-JPY', '0.009');
    await page.click('#save-rates');
    await page.locator('#rates-dialog').waitFor({ state: 'hidden' });
    assert.match(await page.locator('#currency-toggle').getAttribute('aria-label'), /MYR/);
    await page.click('#currency-toggle');
    await page.waitForFunction(() => document.querySelector('#currency-toggle').getAttribute('aria-label').includes('SGD'));

    // Actual Canvas processing, mocked Drive transport. Never needs personal Drive credentials.
    let uploadPayload;
    await page.route('**/api.php?action=upload', async route => {
      uploadPayload = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, image_url: 'https://drive.google.com/uc?export=view&id=test_image_123456789', view_url: 'https://drive.google.com/file/d/test_image_123456789/view', file_id: 'test_image_123456789', public: false } });
    });
    const testImage = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 3200;
      const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, 2400, 3200);
      context.fillStyle = '#222'; context.font = '60px sans-serif'; context.fillText('Receipt 100.1234', 200, 300);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.locator('.record-table [data-open]').first().click();
    await page.locator('#upload-receipt_url').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from(testImage, 'base64') });
    await page.getByText(/上传成功 ·/).waitFor();
    assert.equal(uploadPayload.module, 'purchases');
    assert.match(uploadPayload.image, /^data:image\/jpeg;base64,/);
    const dimensions = await page.evaluate(async data => {
      const image = new Image(); image.src = data; await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, uploadPayload.image);
    assert.deepEqual(dimensions, [1200, 1600]);
    assert.ok(Buffer.from(uploadPayload.image.split(',')[1], 'base64').length < 3 * 1024 * 1024);
    assert.match(await page.locator('#field-receipt_url').inputValue(), /drive\.google\.com/);
    await page.click('#save-record');
    await page.locator('#record-dialog').waitFor({ state: 'hidden' });

    // A second-device write must not be silently overwritten by the editor.
    exported = (await (await page.request.get(`${base}/api.php?action=export`)).json()).modules;
    const purchase = exported.purchases[0];
    await page.locator('.record-table [data-open]').first().click();
    const csrf = (await (await page.request.get(`${base}/api.php?action=session`)).json()).csrf_token;
    const conflict = await page.request.post(`${base}/api.php?action=update`, { headers: { 'X-CSRF-Token': csrf }, data: { id: purchase.id, version: purchase.version, data: { ...purchase.data, notes: '另一设备的新备注' } } });
    assert.equal(conflict.status(), 200);
    await page.fill('#field-notes', '本机尚未保存的备注');
    await page.click('#save-record');
    await page.locator('#record-conflict:not([hidden])').waitFor();
    assert.equal(await page.locator('#field-notes').inputValue(), '本机尚未保存的备注');
    page.once('dialog', dialog => dialog.accept());
    await page.click('[data-action="reload-record"]');
    await page.waitForFunction(() => document.querySelector('#field-notes').value === '另一设备的新备注');
    await page.locator('#record-dialog [data-action="close-record"]').first().click();

    await page.click('#desktop-nav [data-page="dashboard"]');
    await page.waitForFunction(() => document.querySelector('#toasts').children.length === 0);
    await page.screenshot({ path: path.join(os.tmpdir(), 'life-hub-desktop.png'), fullPage: true });
    const downloadEvent = page.waitForEvent('download');
    await page.click('#export-button');
    const download = await downloadEvent;
    const filename = path.join(os.tmpdir(), 'life-hub-test.xlsx');
    await download.saveAs(filename);
    assert.ok(fs.statSync(filename).size > 1000);
    const workbookResult = await page.evaluate(async base64 => {
      const workbook = XLSX.read(base64, { type: 'base64' });
      return {
        names: workbook.SheetNames,
        rows: Object.fromEntries(workbook.SheetNames.map(name => [name, XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 })])),
        formulaCount: Object.values(workbook.Sheets).flatMap(sheet => Object.values(sheet)).filter(cell => cell && cell.f).length
      };
    }, fs.readFileSync(filename).toString('base64'));
    assert.deepEqual(workbookResult.names, Object.keys(schema));
    assert.equal(workbookResult.rows.cards[1][4], '0123');
    assert.equal(workbookResult.formulaCount, 0);

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('#sidebar').isVisible(), false);
    assert.equal(await page.locator('#bottom-nav').isVisible(), true);
    await page.click('#bottom-nav [data-action="drawer"]');
    await page.click('#drawer-nav [data-page="savings"]');
    assert.equal(await page.locator('.record-table').isVisible(), false);
    assert.equal(await page.locator('.mobile-card').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.waitForFunction(() => document.querySelector('#toasts').children.length === 0);
    await page.screenshot({ path: path.join(os.tmpdir(), 'life-hub-mobile.png'), fullPage: true });
    await page.click('.mobile-card [data-open]');
    await page.click('#delete-button');
    await page.click('#confirm-delete');
    await page.locator('#record-dialog').waitFor({ state: 'hidden' });
    exported = (await (await page.request.get(`${base}/api.php?action=export`)).json()).modules;
    assert.equal(exported.savings.length, 0);
    await page.locator('.toolbar [data-action="theme"]').click();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), false);
    await page.reload();
    await page.locator('#new-button:not([disabled])').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), false);
    await page.setViewportSize({ width: 820, height: 1180 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const caches = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      return (await Promise.all((await window.caches.keys()).map(async name => (await window.caches.open(name)).keys()))).flat().map(request => request.url);
    });
    assert.ok(caches.length > 0);
    assert.ok(caches.every(url => !url.includes('api.php') && !url.includes('drive.google')));
    await page.locator('.toolbar [data-action="logout"]').click();
    await page.locator('#gate').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#app').isVisible(), false);
    assert.equal(await page.locator('#record-fields').innerText(), '');
    assert.equal(await page.locator('#content').innerText(), '');
    assert.deepEqual(errors, []);
    console.log('PASS: real PHP login; all 8 UI forms/CRUD; instant search; rates/currency; Canvas upload payload; conflicts; eight-sheet XLSX; mobile/tablet; theme persistence; PWA cache isolation; logout clears data');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
