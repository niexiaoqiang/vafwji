// 隔离浏览器回归：先启动游戏服务和设置 VITE_WS_URL 的前端。
// GAME_TEST_URL=http://127.0.0.1:5174 node tests/ui-smoke.mjs
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const url = process.env.GAME_TEST_URL || 'http://127.0.0.1:5174';
const errors = [];
async function player(name, mobile = false) {
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.getByPlaceholder('输入你的昵称').fill(name);
  return page;
}
async function quit(page) {
  await page.locator('.game-status').getByRole('button', { name: '退出', exact: true }).click();
  await page.locator('.app-dialog').getByRole('button', { name: '退出', exact: true }).click();
  await expect(page.locator('.lobby')).toBeVisible();
}
async function stats(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('plane-stats-v1')));
}

try {
  const ai = await player('手机测试', true);
  await ai.getByRole('button', { name: '开始人机对战' }).click();
  await expect(ai.locator('.board-cell.cell-plane')).toHaveCount(30);
  const ready = ai.getByRole('button', { name: '准备并开始' });
  await expect(ready).toBeInViewport();
  await ai.screenshot({ path: '/tmp/airplane-setup-after.png', fullPage: true });
  await ready.click();
  await expect(ai.locator('.status-text')).toContainText('你的回合');
  const cell = ai.locator('button[aria-label="A1"]');
  await cell.click();
  await expect(cell).toHaveClass(/cell-selected-target/);
  await expect(cell).not.toHaveClass(/cell-(miss|hit|sink|pending)/);
  await ai.screenshot({ path: '/tmp/airplane-game-after.png', fullPage: true });
  await ai.getByRole('button', { name: '攻击 A1', exact: true }).click();
  await expect(cell).toHaveClass(/cell-(miss|hit|sink)/);
  assert(await ai.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await quit(ai);
  assert.equal((await stats(ai)).ai.normal.lose, 1);
  console.log('PASS mobile: pre-placement, visible ready button, auto-start, confirmed attack, exit loss');

  const a = await player('联机甲');
  const b = await player('联机乙');
  const roomId = `T${Date.now().toString().slice(-9)}`;
  await a.getByPlaceholder('自定义房间号（可选）').fill(roomId);
  await a.getByRole('button', { name: '创建房间', exact: true }).click();
  await expect(a.locator('.room-view')).toBeVisible();
  await b.getByPlaceholder('输入好友的房间号').fill(roomId);
  await b.locator('.row').getByRole('button', { name: '加入', exact: true }).click();
  await expect(b.locator('.room-view')).toBeVisible();
  await a.getByRole('button', { name: '准备', exact: true }).click();
  await expect(a.getByRole('button', { name: '重新布置' })).toBeVisible();
  const layout = await a.locator('.board-cell.cell-plane').evaluateAll((cells) => cells.map((c) => c.dataset.row + c.dataset.col));
  await a.reload();
  await expect(a.getByRole('button', { name: '重新布置' })).toBeVisible();
  assert.deepEqual(await a.locator('.board-cell.cell-plane').evaluateAll((cells) => cells.map((c) => c.dataset.row + c.dataset.col)), layout);
  await b.getByRole('button', { name: '准备', exact: true }).click();
  await a.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(a.locator('.game-view')).toBeVisible();
  await expect(b.locator('.game-view')).toBeVisible();
  const shooter = (await a.locator('.status-text').innerText()).includes('你的回合') ? a : b;
  const other = shooter === a ? b : a;
  await shooter.locator('button[aria-label="A1"]').click();
  await shooter.getByRole('button', { name: '攻击 A1', exact: true }).click();
  await expect(shooter.locator('button[aria-label="A1"]')).toHaveClass(/cell-(miss|hit|sink)/);
  const shotClass = await shooter.locator('button[aria-label="A1"]').getAttribute('class');
  await shooter.reload();
  await expect(shooter.locator('button[aria-label="A1"]')).toHaveAttribute('class', shotClass);
  await quit(shooter);
  await expect(other.locator('.game-result h2')).toHaveText('你赢了！');
  assert.equal((await stats(shooter)).online.lose, 1);
  await expect.poll(async () => (await stats(other))?.online.win).toBe(1);
  await other.reload();
  await expect(other.locator('.game-result h2')).toHaveText('你赢了！');
  assert.equal((await stats(other)).online.win, 1);
  await other.getByRole('button', { name: '查看棋盘' }).click();
  await expect(other.locator('.cell-revealed')).not.toHaveCount(0);
  await other.getByRole('button', { name: '再来一局' }).click();
  await expect(other.locator('.room-view')).toBeVisible();
  await other.reload();
  await expect(other.locator('.room-view')).toBeVisible();
  console.log('PASS online: prepared-layout restore, mid-game refresh, both results, revealed layout, deduplication, rematch');
  assert.deepEqual(errors, []);
  console.log('PASS no browser runtime errors');
} finally {
  await browser.close();
}
