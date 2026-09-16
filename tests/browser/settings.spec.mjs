import { test, expect } from '@playwright/test';

test('provider selection clears the previous model and saves the selected route', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('模型 Provider', { exact: true }).selectOption('remote');
  const model = page.getByLabel('模型', { exact: true });
  await expect(model).toHaveValue('');
  await expect(model.locator('option')).toHaveText(['请选择模型', 'Remote Coder (remote-model)']);
  await model.selectOption('remote-model');
  await page.getByRole('button', { name: '保存配置' }).click();
  await page.reload();
  await expect(page.getByLabel('模型 Provider', { exact: true })).toHaveValue('remote');
  await expect(model).toHaveValue('remote-model');
});
test('unknown saved route survives catalog refresh and unrelated edits', async ({ page }) => {
  await page.goto('/?unknown');
  await expect(page.getByText('当前模型配置未出现在目录中', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '刷新模型列表' }).click();
  await expect(page.getByLabel('模型 Provider', { exact: true })).toHaveValue('removed');
  await expect(page.getByLabel('模型', { exact: true })).toHaveValue('old-model');
  await page.getByLabel('任务超时（毫秒）').fill('3000');
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.getByRole('status').filter({ hasText: '已保存到 DSH' })).toHaveText('已保存到 DSH，从下一次任务生效。');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fixture')).value.workerModel))
    .toEqual({ provider: 'removed', model: 'old-model' });
});
test('catalog failure preserves configuration and can retry', async ({ page }) => {
  await page.goto('/?catalog-failure');
  await expect(page.getByRole('alert')).toContainText('模型列表读取失败');
  await expect(page.getByLabel('模型', { exact: true })).toHaveValue('qwen3-coder');
  await expect(page.getByRole('button', { name: '保存配置' })).toBeDisabled();
  await page.getByRole('button', { name: '刷新模型列表' }).click();
  await expect(page.getByLabel('模型 Provider', { exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('empty and partially failed catalogs provide recovery guidance', async ({ page }) => {
  await page.goto('/?empty-catalog');
  await expect(page.getByText('尚无模型 Provider', { exact: false })).toBeVisible();
  await expect(page.getByLabel('模型', { exact: true })).toBeDisabled();
  await page.goto('/?partial-catalog');
  await expect(page.getByLabel('模型', { exact: true })).toBeEnabled();
  await page.getByLabel('模型 Provider', { exact: true }).selectOption('remote');
  await expect(page.getByRole('alert')).toContainText('此 Provider 的模型列表读取失败');
  await expect(page.getByLabel('模型', { exact: true })).toBeDisabled();
});

test('save, reload, discard and restore defaults', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('模型', { exact: true }).selectOption('new-model');
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.getByRole('status')).toHaveText('已保存到 DSH，从下一次任务生效。');
  await page.reload(); await expect(page.getByLabel('模型', { exact: true })).toHaveValue('new-model');
  await page.getByLabel('模型', { exact: true }).selectOption('unsaved');
  await page.getByRole('button', { name: '放弃修改' }).click();
  await expect(page.getByLabel('模型', { exact: true })).toHaveValue('new-model');
  await page.getByRole('button', { name: '恢复部署默认值' }).click();
  await expect(page.getByLabel('模型', { exact: true })).toHaveValue('qwen3-coder');
  expect(errors).toEqual([]);
});
test('autonomous page has no workflow gates and still requires an enabled model', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('验证命令（JSON）')).toHaveCount(0);
  await expect(page.getByLabel('强模型调用上限')).toHaveCount(0);
  await expect(page.getByLabel('规划 Provider')).toHaveCount(0);
  await page.getByLabel('模型', { exact: true }).selectOption('');
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.getByRole('alert')).toContainText('workerModel');
  expect(await page.evaluate(() => window.fixture.writes())).toBe(0);
});
test('pushed revision preserves draft and refuses stale save until reload', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('模型', { exact: true }).selectOption('my-draft');
  await page.evaluate(() => window.fixture.remoteChange());
  await expect(page.getByRole('alert')).toContainText('其他页面');
  await expect(page.getByLabel('模型', { exact: true })).toHaveValue('my-draft');
  await expect(page.getByRole('button', { name: '保存配置' })).toBeDisabled();
  await page.getByRole('button', { name: '载入最新配置' }).click();
  await expect(page.getByLabel('任务超时（毫秒）')).toHaveValue('5000');
});
for (const mode of ['refused', 'failure']) test(`${mode} save retains draft without a false success`, async ({ page }) => {
  await page.goto(`/?${mode}`);
  await page.getByLabel('模型', { exact: true }).selectOption('my-draft');
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('模型', { exact: true })).toHaveValue('my-draft');
  await expect(page.getByText('已保存到 DSH，从下一次任务生效。')).toHaveCount(0);
});
test('read-only and unavailable connections do not offer writes', async ({ page }) => {
  await page.goto('/?readonly');
  await expect(page.getByRole('button', { name: '保存配置' })).toBeDisabled();
  await expect(page.getByLabel('模型', { exact: true })).toBeDisabled();
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
