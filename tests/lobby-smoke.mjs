// GAME_TEST_URL=http://127.0.0.1:5175 node tests/lobby-smoke.mjs
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const url = process.env.GAME_TEST_URL || 'http://127.0.0.1:5175';
const errors = [];
async function player(name, mobile = false) {
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.getByPlaceholder('输入你的昵称').fill(name);
  await expect(page.getByRole('button', { name: '开始快速游戏', exact: true })).toBeEnabled();
  return page;
}
async function skin(page, name, id) {
  await page.locator('.topbar-actions button').first().click();
  await page.locator('.skin-card').filter({ hasText: name }).click();
  await page.getByRole('dialog', { name: '选择皮肤' }).getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-skin', id);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}

try {
  const a = await player('等你起飞', true);
  const b = await player('晴空来客');
  for (const [id, name] of [['radar', '夜空雷达'], ['paper', '晴空纸面'], ['classic', '经典蓝']]) {
    await skin(b, name, id);
    await b.screenshot({ path: `/tmp/airplane-lobby-${id}.png`, fullPage: true });
    await skin(a, name, id);
    await a.screenshot({ path: `/tmp/airplane-lobby-mobile-${id}.png`, fullPage: true });
  }
  await skin(a, '夜空雷达', 'radar');
  await a.getByRole('button', { name: '开始快速游戏', exact: true }).click();
  await expect(a.locator('.match-status h2')).toHaveText('正在寻找对手');
  const code = (await a.locator('.room-code').innerText()).trim();
  await a.getByRole('button', { name: '准备', exact: true }).click();
  await expect(a.getByRole('button', { name: '重新布置' })).toBeVisible();
  await a.reload();
  await expect(a.locator('.match-status h2')).toHaveText('正在寻找对手');
  await expect(a.getByRole('button', { name: '重新布置' })).toBeVisible();
  await expect(a.locator('html')).toHaveAttribute('data-skin', 'radar');
  await expect(b.locator('.public-rooms li')).toContainText('等你起飞');
  await expect(b.locator('.public-rooms li')).toContainText('已准备');
  await b.locator('.public-rooms li').filter({ hasText: code }).getByRole('button', { name: '加入房间' }).click();
  await expect(b.locator('.room-code')).toHaveText(code);
  await expect(a.locator('.match-status h2')).toHaveText('已找到对手，准备出发');
  await a.screenshot({ path: '/tmp/airplane-matching-mobile.png', fullPage: true });
  await b.getByRole('button', { name: '准备', exact: true }).click();
  await expect(a.locator('.game-view')).toBeVisible();
  await expect(b.locator('.game-view')).toBeVisible();
  assert(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await a.locator('.game-status').getByRole('button', { name: '退出', exact: true }).click();
  await a.locator('.app-dialog').getByRole('button', { name: '退出', exact: true }).click();
  await expect(a.locator('.lobby')).toBeVisible();
  await b.getByRole('button', { name: '返回大厅' }).click();
  await expect(b.locator('.lobby')).toBeVisible();
  console.log('PASS three skins on desktop/mobile, public list, ready-layout refresh, automatic start, exit');

  await a.getByRole('button', { name: '创建房间', exact: true }).click();
  const friendCode = (await a.locator('.room-code').innerText()).trim();
  await expect(b.locator('.public-rooms')).not.toContainText(friendCode);
  await b.getByRole('button', { name: '开始快速游戏', exact: true }).click();
  await expect(b.locator('.match-status h2')).toHaveText('正在寻找对手');
  const publicCode = (await b.locator('.room-code').innerText()).trim();
  assert.notEqual(publicCode, friendCode);
  await b.getByRole('button', { name: '取消匹配', exact: true }).click();
  await expect(b.locator('.lobby')).toBeVisible();
  await expect(b.locator('.public-rooms')).not.toContainText(publicCode);
  await b.getByPlaceholder('输入好友的房间号').fill(friendCode);
  await b.getByRole('button', { name: '加入', exact: true }).click();
  await expect(b.locator('.room-code')).toHaveText(friendCode);
  await expect(b.locator('.match-status')).toHaveCount(0);
  await b.getByRole('button', { name: '离开房间', exact: true }).click();
  await expect(b.locator('.lobby')).toBeVisible();
  console.log('PASS private-room isolation, cancellation removes public room, room-code invitation');

  await b.getByRole('button', { name: '开始快速游戏', exact: true }).click();
  await expect(b.getByRole('button', { name: '改玩人机', exact: true })).toBeVisible({ timeout: 25000 });
  await b.getByRole('button', { name: '改玩人机', exact: true }).click();
  await expect(b.getByRole('button', { name: '准备并开始' })).toBeVisible();
  await expect(b.locator('.match-status')).toHaveCount(0);
  await expect(b.locator('.players')).toContainText('电脑');
  await b.getByRole('button', { name: '准备并开始' }).click();
  await expect(b.locator('.game-view')).toBeVisible();
  console.log('PASS explicit AI fallback after waiting, AI auto-start');
  assert.deepEqual(errors, []);
  console.log('PASS no browser runtime errors');
} finally {
  await browser.close();
}
