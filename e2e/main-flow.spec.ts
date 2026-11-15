/**
 * E2E luồng chính (task 8.1, PRD §9): đăng ký → luồng tân thủ sang Cửa hàng → mở gói miễn phí →
 * đưa 1 thẻ mới vào đội và lưu → đá trận Dễ (`?autopilot=1&half=10`, task 5.10) → nhận thưởng trận →
 * nhiệm vụ ngày → đăng xuất → đăng nhập lại: thẻ và xu còn nguyên.
 */
import { expect, test, type Page } from '@playwright/test';

const STARTER_CARDS = 11;
const FREE_PACK_CARDS = 5;
const PROGRESS = /^\d+\/\d+$/;

/** Số xu đang hiện trên thanh trên (`aria-label="<n> xu"`). */
async function walletCoins(page: Page): Promise<number> {
  const label = await page.locator('.topbar .coin').getAttribute('aria-label');
  const coins = Number(label?.replace(/\D/g, ''));
  expect(Number.isFinite(coins), `không đọc được số xu từ "${label}"`).toBe(true);
  return coins;
}

async function expectWallet(page: Page, coins: number): Promise<void> {
  await expect(page.locator('.topbar .coin')).toHaveAttribute('aria-label', `${coins} xu`);
}

test('luồng chính: đăng ký → mở gói → xếp đội → đá trận → nhận thưởng → đăng nhập lại', async ({
  page,
}) => {
  // Tên duy nhất theo thời gian (≤ 20 ký tự: chữ, số, gạch dưới).
  const username = `e2e_${Date.now().toString(36)}`;
  const password = 'e2e-mat-khau-123';

  await page.addInitScript(() => {
    // Bỏ intro 3D; đồ hoạ Thấp + tắt phát lại bàn thắng để trận ngắn và ổn định trên WebGL phần mềm.
    window.sessionStorage.setItem('mfg.introSeen', '1');
    window.localStorage.setItem(
      'pitch.gfx',
      JSON.stringify({ preset: 'low', overrides: { replay: false } }),
    );
  });

  let coins = 0;

  await test.step('đăng ký tài khoản mới → luồng tân thủ đưa sang Cửa hàng', async () => {
    await page.goto('/login?mode=register');
    await expect(page.getByRole('tab', { name: 'Đăng ký' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByLabel('Tên đăng nhập').fill(username);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    // Chưa tick đồng ý Điều khoản + Chính sách → không tạo tài khoản.
    await page.getByRole('button', { name: 'Tạo tài khoản & nhận quà' }).click();
    await expect(page.getByText('Cần đồng ý Điều khoản và Chính sách')).toBeVisible();
    await page.getByRole('checkbox', { name: /Tôi đồng ý/ }).check();
    await page.getByRole('button', { name: 'Tạo tài khoản & nhận quà' }).click();

    await expect(page).toHaveURL(/\/shop\?onboarding=1$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Cửa hàng' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Luồng tân thủ 4 bước' })).toBeVisible();
    await expect(page.locator('.topbar .user__name')).toHaveText(username);
    coins = await walletCoins(page);
  });

  await test.step('mở gói 5 thẻ miễn phí', async () => {
    const free = page.getByRole('region', { name: 'Gói 5 thẻ miễn phí' });
    await free.getByRole('button', { name: 'Mở miễn phí' }).click();
    // Gói có hiệu ứng "thở" lặp vô hạn nên không bao giờ đứng yên để click chuột → xé bằng bàn phím.
    await page.getByRole('button', { name: 'Xé gói 5 thẻ' }).press('Enter');
    await page.getByRole('button', { name: 'Lật tất cả' }).click();
    await expect(page.getByText(`Đã nhận ${FREE_PACK_CARDS} thẻ`)).toBeVisible();
    // Gói miễn phí không trừ xu.
    await expectWallet(page, coins);
    await page.getByRole('button', { name: 'Xếp đội' }).click();
  });

  await test.step('đưa 1 thẻ mới vào đội hình và lưu', async () => {
    await expect(page).toHaveURL(/\/squad\?onboarding=1$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Đội hình' })).toBeVisible();
    // Tên nút đổi thành "Lưu có thay đổi chưa lưu" khi đội hình có sửa đổi.
    const save = page.getByRole('main').getByRole('button', { name: /^Lưu/ });
    await expect(save).toBeDisabled();

    // Bấm ô dự bị đầu tiên → bấm thẻ đầu tiên trong Kho (thẻ chưa nằm trong đội) để xếp vào ô đó.
    const bench = page.getByRole('region', { name: /^Dự bị/ });
    const benchSlot = bench.getByRole('button', { name: /^Ô \S+ \(dự bị\)/ }).first();
    const before = (await benchSlot.getAttribute('aria-label')) ?? '';
    await benchSlot.click();
    await expect(benchSlot).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('region', { name: /^Kho/ }).locator('.sq-pool__card').first().click();
    await expect(benchSlot).not.toHaveAttribute('aria-label', before);
    await expect(benchSlot).not.toHaveAttribute('aria-label', /: trống$/);
    const after = (await benchSlot.getAttribute('aria-label')) ?? '';

    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText('Đã lưu đội hình')).toBeVisible();
    await expect(save).toBeDisabled();

    // Server đã lưu thật: tải lại trang vẫn thấy thẻ ở ô đó.
    await page.reload();
    await expect(
      page
        .getByRole('region', { name: /^Dự bị/ })
        .getByRole('button', { name: /^Ô \S+ \(dự bị\)/ })
        .first(),
    ).toHaveAttribute('aria-label', after);
  });

  await test.step('đá trận Dễ bằng autopilot → màn kết quả cộng xu', async () => {
    await page.goto('/play?difficulty=easy&autopilot=1&half=10');
    await expect(page.getByRole('button', { name: 'Esc · Tạm dừng' })).toBeVisible({
      timeout: 60_000,
    });
    // Hết 2 hiệp (và luân lưu nếu hoà) → màn kết quả.
    await expect(page.locator('#result-title')).toBeVisible({ timeout: 270_000 });
    await expect(page.getByText(/Kết thúc · vs Máy mức Dễ/)).toBeVisible();

    const reward = page.locator('.result-reward');
    await expect(reward).toContainText('ví:', { timeout: 30_000 });
    const text = (await reward.innerText()).replace(/\s+/g, ' ');
    const gained = Number(/\+\s*([\d.]+)/.exec(text)?.[1]?.replace(/\./g, ''));
    const balance = Number(/ví: ([\d.]+) xu/.exec(text)?.[1]?.replace(/\./g, ''));
    expect(gained, `thưởng trận trong "${text}"`).toBeGreaterThan(0);
    expect(balance, `số dư trong "${text}"`).toBe(coins + gained);
    await expect(reward).toContainText('trận có thưởng 1/');
    coins = balance;
  });

  await test.step('nhiệm vụ ngày hiện tiến độ; nhận thưởng nhiệm vụ đã xong', async () => {
    // Màn kết quả liệt kê nhiệm vụ vừa tăng.
    const resultMissions = page.getByRole('region', { name: 'Nhiệm vụ vừa tăng' });
    await expect(resultMissions.locator('.missions__row')).toHaveCount(3);

    await page.getByRole('link', { name: 'Về trang chủ' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Đá với máy' })).toBeVisible();
    await expectWallet(page, coins);

    const missions = page.getByRole('region', { name: /^Nhiệm vụ ngày/ });
    await expect(missions.locator('.missions__count')).toHaveText([PROGRESS, PROGRESS, PROGRESS]);

    // Bộ 3 nhiệm vụ chọn theo (người chơi, ngày) nên số nhiệm vụ đã xong thay đổi theo lần chạy.
    const claimButtons = missions.getByRole('button', { name: /^Nhận/ });
    const claimable = await claimButtons.count();
    for (let left = claimable; left > 0; left--) {
      const button = claimButtons.first();
      const bonus = Number((await button.innerText()).replace(/\D/g, ''));
      expect(bonus).toBeGreaterThan(0);
      await button.click();
      coins += bonus;
      await expectWallet(page, coins);
      await expect(claimButtons).toHaveCount(left - 1);
    }
    await expect(missions.getByText('Đã nhận')).toHaveCount(claimable);
    test.info().annotations.push({
      type: 'nhiệm vụ',
      description: `${claimable} nhiệm vụ đã nhận thưởng`,
    });
  });

  await test.step('đăng xuất → đăng nhập lại: kho thẻ và số xu còn nguyên', async () => {
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('tab', { name: 'Đăng nhập' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByLabel('Tên đăng nhập').fill(username);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.locator('#auth-form').getByRole('button', { name: 'Đăng nhập' }).click();

    await expect(page.locator('.topbar .user__name')).toHaveText(username);
    await expectWallet(page, coins);
    await expect(page.getByRole('link', { name: /^Kho thẻ/ }).last()).toContainText(
      `${STARTER_CARDS + FREE_PACK_CARDS} thẻ`,
    );

    await page.getByRole('link', { name: 'Kho thẻ', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kho thẻ' })).toBeVisible();
    await expectWallet(page, coins);
  });

  await test.step('xoá tài khoản → về màn đăng nhập, không đăng nhập lại được', async () => {
    await page.getByRole('link', { name: `Tài khoản ${username}` }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tài khoản' })).toBeVisible();
    const submit = page.getByRole('button', { name: 'Xoá vĩnh viễn tài khoản' });
    await expect(submit).toBeDisabled();
    await page.getByLabel('Gõ lại tên đăng nhập để xác nhận').fill(username);
    await page.getByLabel(/^Mật khẩu/).fill(password);
    await submit.click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Tên đăng nhập').fill(username);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.locator('#auth-form').getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.getByText('Sai tên đăng nhập hoặc mật khẩu')).toBeVisible();
  });
});
