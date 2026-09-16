import { test, expect } from '@playwright/test';

test('save, reload, discard and restore defaults', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('模型 ID', { exact: true }).fill('new-model');
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.getByRole('status')).toHaveText('已保存到 DSH，从下一次任务生效。');
  await page.reload(); await expect(page.getByLabel('模型 ID', { exact: true })).toHaveValue('new-model');
  await page.getByLabel('模型 ID', { exact: true }).fill('unsaved');
  await page.getByRole('button', { name: '放弃修改' }).click();
  await expect(page.getByLabel('模型 ID', { exact: true })).toHaveValue('new-model');
  await page.getByRole('button', { name: '恢复部署默认值' }).click();
  await expect(page.getByLabel('模型 ID', { exact: true })).toHaveValue('qwen3-coder');
  expect(errors).toEqual([]);
});
test('invalid commands and missing enabled model never cross the wire', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('验证命令（JSON）').fill('npm test');
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.getByRole('alert')).toContainText('JSON');
  await page.getByLabel('验证命令（JSON）').fill('[["npm", "test"]]');
  await page.getByLabel('模型 ID', { exact: true }).fill('');
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.getByRole('alert')).toContainText('workerModel');
  expect(await page.evaluate(() => window.fixture.writes())).toBe(0);
});
test('pushed revision preserves draft and refuses stale save until reload', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('模型 ID', { exact: true }).fill('my-draft');
  await page.evaluate(() => window.fixture.remoteChange());
  await expect(page.getByRole('alert')).toContainText('其他页面');
  await expect(page.getByLabel('模型 ID', { exact: true })).toHaveValue('my-draft');
  await expect(page.getByRole('button', { name: '保存配置' })).toBeDisabled();
  await page.getByRole('button', { name: '载入最新配置' }).click();
  await expect(page.getByLabel('强模型调用上限')).toHaveValue('5');
});
for (const mode of ['refused', 'failure']) test(`${mode} save retains draft without a false success`, async ({ page }) => {
  await page.goto(`/?${mode}`);
  await page.getByLabel('模型 ID', { exact: true }).fill('my-draft');
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('模型 ID', { exact: true })).toHaveValue('my-draft');
  await expect(page.getByText('已保存到 DSH，从下一次任务生效。')).toHaveCount(0);
});
test('read-only and unavailable connections do not offer writes', async ({ page }) => {
  await page.goto('/?readonly');
  await expect(page.getByRole('button', { name: '保存配置' })).toBeDisabled();
  await expect(page.getByLabel('模型 ID', { exact: true })).toBeDisabled();
  await page.goto('/?unavailable'); await expect(page.getByRole('status')).toContainText('无法读取');
  await expect(page.getByRole('button', { name: '保存配置' })).toHaveCount(0);
  await page.goto('/?loading'); await expect(page.getByRole('status')).toContainText('正在载入');
});
test('desktop and narrow dark layout remain readable without horizontal overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1060, height: 1000 }); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Smart Dev', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ colorScheme: 'dark' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '保存配置' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('mobile-dark.png'), fullPage: true });
});
