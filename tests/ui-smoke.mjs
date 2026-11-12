// 隔离浏览器回归：先启动游戏服务和设置 VITE_WS_URL 的前端。
// GAME_TEST_URL=http://127.0.0.1:5174 node tests/ui-smoke.mjs
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const url = process.env.GAME_TEST_URL || 'http://127.0.0.1:5174';
const errors = [];
async function player(name, mobile = false) {
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
  // 已看过新手教程，避免首次进入时的教程弹窗挡住后续操作
  await context.addInitScript(() => localStorage.setItem('tutorial-seen', '1'));
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
  // 新手教程：首次进入自动弹出，练习击落后可直接开始人机练习；看完不再自动弹出
  for (const mobile of [false, true]) {
    const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    const tut = page.locator('.tut');
    await expect(tut).toBeVisible();
    await expect(tut.locator('h2')).toHaveText('目标：先击落对方 3 架飞机');
    await tut.getByRole('button', { name: '下一步' }).click();
    await tut.getByRole('button', { name: '下一步' }).click();
    await expect(tut.getByRole('button', { name: '先击落飞机' })).toBeDisabled();
    await tut.locator('.pcell').nth(0).click();
    await expect(tut.locator('.pcell').nth(0)).toHaveClass(/miss/);
    await tut.locator('.pcell').nth(15).click();
    await expect(tut.locator('.pcell').nth(15)).toHaveClass(/hit/);
    await tut.locator('.pcell').nth(10).click();
    await expect(tut.locator('.coach')).toContainText('击落');
    await tut.getByRole('button', { name: '下一步' }).click();
    await tut.getByRole('button', { name: '下一步' }).click();
    await tut.getByRole('button', { name: '开始人机练习（简单）' }).click();
    await expect(page.locator('.room-view')).toBeVisible();
    await expect(page.locator('.crumb')).toContainText('简单');
    await page.reload();
    await expect(page.locator('.lobby')).toBeVisible();
    await page.waitForTimeout(800);
    await expect(tut).toHaveCount(0);
    await page.getByRole('button', { name: '教程' }).click();
    await expect(tut).toBeVisible();
    await context.close();
  }
  console.log('PASS tutorial: first-visit popup, practice sink, start easy AI, not shown again, reopen');

  const ai = await player('手机测试', true);
  await ai.getByRole('button', { name: '开始人机对战' }).click();
  await expect(ai.locator('.board-cell.cell-plane')).toHaveCount(30);
  const ready = ai.getByRole('button', { name: '准备并开始' });
  await expect(ready).toBeInViewport();
  await ai.screenshot({ path: '/tmp/airplane-setup-after.png', fullPage: true });
  await ready.click();
  await expect(ai.locator('.status-text')).toContainText('你的回合');
  // 快速攻击默认开启，这里关掉以覆盖“先选坐标再确认”的流程
  await ai.locator('.quick-toggle input').uncheck();
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
  // 默认快速攻击：点格子即攻击
  await shooter.locator('button[aria-label="A1"]').click();
  await expect(shooter.locator('button[aria-label="A1"]')).toHaveClass(/cell-(miss|hit|sink)/);
  // fx-* 是短暂的受击动效 class，比较刷新前后的格子状态时忽略
  const stableClass = async () => (await shooter.locator('button[aria-label="A1"]').getAttribute('class'))
    .split(/\s+/).filter((c) => c && !c.startsWith('fx-')).join(' ');
  const shotClass = await stableClass();
  await shooter.reload();
  await expect.poll(stableClass).toBe(shotClass);
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
