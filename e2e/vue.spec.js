import { test, expect } from '@playwright/test';

test('大厅可以开始人机对战', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('全民打飞机');
  await page.getByPlaceholder('输入你的昵称').fill('测试玩家');
  await page.getByRole('button', { name: '开始人机对战' }).click();
  await expect(page.getByRole('heading', { name: '人机对战' })).toBeVisible();
});
