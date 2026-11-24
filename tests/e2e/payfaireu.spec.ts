import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

async function assertNoHorizontalOverflow(page: Page) {
  const dims = await page.evaluate(() => {
    const main = document.querySelector('main');
    const header = document.querySelector('header');
    const mainRect = main?.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      mainWidth: mainRect ? Math.ceil(mainRect.width) : 0,
      headerWidth: headerRect ? Math.ceil(headerRect.width) : 0,
    };
  });
  expect(dims.scrollWidth).toBeLessThanOrEqual(dims.innerWidth);
  expect(dims.mainWidth).toBeLessThanOrEqual(dims.innerWidth);
  expect(dims.headerWidth).toBeLessThanOrEqual(dims.innerWidth);
}

test.describe('PayFairEU — Directive (EU) 2023/970 Pay Transparency Studio E2E', () => {
  test('defaults to EN LTR / Equity Parchment, toggles AR RTL / Boardroom Slate, and persists across reload', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await expect(page.locator('header')).toContainText('SQLite WAL Server');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'equity-parchment');
    await expect(page.getByTestId('quartile-svg-chart')).toBeVisible();
    await expect(page.getByTestId('category-gap-svg-chart')).toBeVisible();
    await expect(page.getByTestId('legal-disclaimer')).toContainText(
      'Statistical & HR pre-flight analyzer only',
    );
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: 'test-results/qa-screenshots/01-workspace-en-equity-parchment.png',
      fullPage: true,
      animations: 'disabled',
    });

    await page.getByTestId('toggle-locale').click();
    await page.getByTestId('toggle-theme').click();

    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'boardroom-slate');
    await expect(page.getByTestId('legal-disclaimer')).toContainText('أداة تحليل إحصائية');
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: 'test-results/qa-screenshots/02-workspace-ar-boardroom-slate.png',
      fullPage: true,
      animations: 'disabled',
    });

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'boardroom-slate');

    // Restore EN LTR Light
    await page.getByTestId('toggle-locale').click();
    await page.getByTestId('toggle-theme').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'equity-parchment');

    expect(errors).toEqual([]);
  });

  test('evaluates Art. 10 >=5% trigger, tests Dec 31 -> Feb 28 Art. 7 SLA + GDPR <3 redaction, batch CSV, seals PAYF-YYYY-0001 with BOM CSV & /r/:code', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    const year = new Date().getUTCFullYear();
    const expectedCode = `PAYF-${year}-0001`;

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.getByTestId('kpi-score')).toContainText('100/100');

    // Load blocked enterprise scenario -> verify Art. 10 Joint Assessment Triggered
    await page.getByTestId('preset-select').selectOption('preset-enterprise-art10-blocked');
    await page.getByTestId('new-from-preset-btn').click();
    await expect(page.getByTestId('kpi-art10')).toContainText('TRIGGERED (>=5%)');

    // Toggle objective criteria justification on Enterprise Sales -> Art. 10 clears
    await page.getByTestId('justified-enterprise-sales').check();
    await expect(page.getByTestId('kpi-art10')).toContainText('Clean / Clear');

    // Load conditional preset -> test Art. 7 Dec 31 -> Feb 28 clamping + GDPR <3 guard + Art. 5 snippet
    await page.getByTestId('preset-select').selectOption('preset-midsize-justified-conditional');
    await page.getByTestId('new-from-preset-btn').click();
    await page.getByTestId('tab-notices').click();
    await expect(page.getByTestId('art7-due-date')).toContainText('2027-02-28');
    await expect(page.locator('main')).toContainText('GDPR k-anonymity guard');
    await expect(page.getByTestId('art5-html-snippet')).toContainText('data-payfaireu-art5="true"');
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: 'test-results/qa-screenshots/03-art5-and-art7-desktop.png',
      fullPage: true,
      animations: 'disabled',
    });

    // Run Batch Payroll CSV audit
    await page.getByTestId('tab-batch').click();
    await page.getByTestId('run-batch-csv-btn').click();
    await expect(page.locator('main')).toContainText('Enterprise Sales');
    await expect(page.locator('main')).toContainText('ART10_TRIGGER');

    // Switch back to Analytics tab and Seal dossier -> PAYF-YYYY-0001
    await page.getByTestId('tab-analytics').click();
    await page.getByTestId('seal-dossier-btn').click();
    await expect(page.getByTestId('sealed-dossier-code')).toContainText(expectedCode);
    await expect(page.getByTestId('seal-dossier-btn')).toHaveCount(0);

    // Download UTF-8 BOM CSV and verify magic bytes
    const csvDlPromise = page.waitForEvent('download');
    await page.getByTestId('export-dossier-csv-btn').click();
    const csvDl = await csvDlPromise;
    expect(csvDl.suggestedFilename()).toContain('.csv');
    const dlPath = await csvDl.path();
    expect(dlPath).toBeTruthy();
    if (dlPath) {
      const bytes = fs.readFileSync(dlPath);
      expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    }

    await page.screenshot({
      path: 'test-results/qa-screenshots/04-sealed-dossier-desktop.png',
      fullPage: true,
      animations: 'disabled',
    });

    // Public read-only /r/:code route
    await page.goto(`/r/${expectedCode}`);
    await expect(page.locator('header').first()).toContainText(
      'Public Read-Only PayFairEU Pre-Flight Snapshot',
    );
    await expect(page.locator('main')).toContainText(expectedCode);
    await page.reload();
    await expect(page.locator('main')).toContainText(expectedCode);

    expect(errors).toEqual([]);
  });

  test('verifies mobile 390x844 responsiveness across all 4 tabs in EN light and AR dark with zero overflow', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('quartile-svg-chart')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: 'test-results/qa-screenshots/05-mobile-en-equity-parchment.png',
      fullPage: true,
      animations: 'disabled',
    });

    await page.getByTestId('tab-notices').click();
    await expect(page.getByTestId('art5-html-snippet')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.getByTestId('tab-batch').click();
    await page.getByTestId('run-batch-csv-btn').click();
    await expect(page.locator('main')).toContainText('Enterprise Sales');
    await assertNoHorizontalOverflow(page);

    await page.getByTestId('tab-dossier').click();
    await expect(page.getByTestId('print-pdf-btn')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.getByTestId('tab-analytics').click();
    await page.getByTestId('toggle-locale').click();
    await page.getByTestId('toggle-theme').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'boardroom-slate');
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: 'test-results/qa-screenshots/06-mobile-ar-boardroom-slate.png',
      fullPage: true,
      animations: 'disabled',
    });

    expect(errors).toEqual([]);
  });
});
