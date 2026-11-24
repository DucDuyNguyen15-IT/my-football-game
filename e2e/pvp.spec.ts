import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const PASSWORD = 'e2e-mat-khau-123';

async function setupPlayer(
  browser: Browser,
  prefix: string,
): Promise<{ ctx: BrowserContext; page: Page; username: string }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const username = `${prefix}_${Date.now().toString(36).slice(-6)}_${Math.floor(Math.random() * 1000)}`;

  await page.addInitScript(() => {
    window.sessionStorage.setItem('mfg.introSeen', '1');
    window.localStorage.setItem(
      'pitch.gfx',
      JSON.stringify({ preset: 'low', overrides: { replay: false } }),
    );
  });

  await page.goto('/login');
  const origin = new URL(page.url()).origin;
  const reg = await page.request.post('/api/v1/auth/register', {
    headers: { origin },
    data: { username, password: PASSWORD, acceptTerms: true },
  });
  expect(reg.status()).toBe(201);
  return { ctx, page, username };
}

test('kịch bản phòng (US1): tạo phòng, nhập mã, đá autopilot hết trận cùng tỉ số giao hữu', async ({
  browser,
}) => {
  const a = await setupPlayer(browser, 'pvpa');
  const b = await setupPlayer(browser, 'pvpb');

  try {
    await Promise.all([a.page.goto('/pvp'), b.page.goto('/pvp')]);
    await expect(a.page.getByRole('button', { name: 'Tạo phòng' })).toBeEnabled({ timeout: 15_000 });
    await expect(b.page.getByRole('button', { name: 'Tạo phòng' })).toBeEnabled({ timeout: 15_000 });

    await a.page.getByRole('button', { name: 'Tạo phòng' }).click();
    const codeEl = a.page.getByTestId('pvp-room-code');
    await expect(codeEl).toBeVisible();
    const code = (await codeEl.innerText()).trim();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    await b.page.getByLabel('Nhập mã phòng').fill(code);
    const t0 = Date.now();
    await b.page.getByRole('button', { name: 'Vào phòng' }).click();

    // SC-001: từ lúc B nhập mã tới lúc nhận `start` (hiện đếm ngược) < 10 s.
    await Promise.all([
      expect(a.page.getByText(/Trận bắt đầu sau/)).toBeVisible({ timeout: 10_000 }),
      expect(b.page.getByText(/Trận bắt đầu sau/)).toBeVisible({ timeout: 10_000 }),
    ]);
    const toStartMs = Date.now() - t0;
    expect(toStartMs).toBeLessThan(10_000);
    test.info().annotations.push({ type: 'SC-001', description: `toStart=${toStartMs}ms` });

    // Hai màn hình vào sân và đá hết trận (hiệp 10 s autopilot).
    await Promise.all([
      expect(a.page.locator('.hud-score')).toBeVisible({ timeout: 20_000 }),
      expect(b.page.locator('.hud-score')).toBeVisible({ timeout: 20_000 }),
    ]);

    await Promise.all([
      expect(a.page.locator('#result-title')).toBeVisible({ timeout: 180_000 }),
      expect(b.page.locator('#result-title')).toBeVisible({ timeout: 180_000 }),
    ]);

    const scoreA = (await a.page.locator('.result__goals').innerText()).trim();
    const scoreB = (await b.page.locator('.result__goals').innerText()).trim();
    expect(scoreA).toBe(scoreB);
    await expect(a.page.getByText('Trận giao hữu, không có thưởng.')).toBeVisible();
    await expect(b.page.getByText('Trận giao hữu, không có thưởng.')).toBeVisible();
  } finally {
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  }
});

async function walletCoins(page: Page): Promise<number> {
  const label = await page.locator('.topbar .coin').getAttribute('aria-label');
  const coins = Number(label?.replace(/\D/g, ''));
  expect(Number.isFinite(coins), `không đọc được số xu từ "${label}"`).toBe(true);
  return coins;
}

test('kịch bản hàng chờ (US2): hai tài khoản cùng Tìm trận, đá hết trận và số dư xu tăng đúng', async ({
  browser,
}) => {
  const a = await setupPlayer(browser, 'pvpqa');
  const b = await setupPlayer(browser, 'pvpqb');

  try {
    await Promise.all([a.page.goto('/pvp'), b.page.goto('/pvp')]);
    await expect(a.page.getByRole('button', { name: 'Tìm trận' })).toBeEnabled({ timeout: 15_000 });
    await expect(b.page.getByRole('button', { name: 'Tìm trận' })).toBeEnabled({ timeout: 15_000 });

    const startCoinsA = await walletCoins(a.page);
    const startCoinsB = await walletCoins(b.page);

    await a.page.getByRole('button', { name: 'Tìm trận' }).click();
    await b.page.getByRole('button', { name: 'Tìm trận' }).click();

    await Promise.all([
      expect(a.page.locator('.hud-score')).toBeVisible({ timeout: 20_000 }),
      expect(b.page.locator('.hud-score')).toBeVisible({ timeout: 20_000 }),
    ]);

    await Promise.all([
      expect(a.page.locator('#result-title')).toBeVisible({ timeout: 180_000 }),
      expect(b.page.locator('#result-title')).toBeVisible({ timeout: 180_000 }),
    ]);

    const scoreA = (await a.page.locator('.result__goals').innerText()).trim();
    const scoreB = (await b.page.locator('.result__goals').innerText()).trim();
    expect(scoreA).toBe(scoreB);

    const readGain = async (page: Page) => {
      const txt = (await page.locator('.result-reward').innerText()).replace(/\s+/g, ' ');
      const m = /\+\s*([\d.]+)/.exec(txt);
      const gain = Number(m?.[1]?.replace(/\./g, ''));
      expect(gain, `thưởng trong "${txt}"`).toBeGreaterThan(0);
      return gain;
    };
    const gainA = await readGain(a.page);
    const gainB = await readGain(b.page);

    await Promise.all([
      a.page.getByRole('link', { name: 'Về trang chủ' }).click(),
      b.page.getByRole('link', { name: 'Về trang chủ' }).click(),
    ]);

    await expect(a.page.locator('.topbar .coin')).toHaveAttribute(
      'aria-label',
      `${startCoinsA + gainA} xu`,
    );
    await expect(b.page.locator('.topbar .coin')).toHaveAttribute(
      'aria-label',
      `${startCoinsB + gainB} xu`,
    );
  } finally {
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  }
});
