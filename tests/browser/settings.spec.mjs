import { test, expect } from '@playwright/test';
test('shows distinct states and requires an explicit target preset', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/已安装 0.1.5-rc.1/)).toContainText('当前宿主：未注册');
  await expect(page.getByRole('button', { name: '启用 Codex 工具', exact: true })).toBeDisabled();
  await page.getByLabel('Agent 预设').selectOption('user');
  await expect(page.getByRole('button', { name: '启用 Codex 工具', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '启用 Claude Code 工具', exact: true })).toBeDisabled();
});
test('enables tools, preserves selected preset and displays restart requirement', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('Agent 预设').selectOption('user');
  await page.getByRole('button', { name: '启用 Codex 工具', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('重启 DSH');
  await expect(page.getByLabel('Agent 预设')).toHaveValue('user');
  await expect(page.getByRole('button', { name: '启用 Codex 工具', exact: true })).toBeDisabled();
});
test('guidance persists across reload and can be switched off', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('Agent 预设').selectOption('user');
  await page.getByLabel('注入分工指引').check();
  await expect(page.getByLabel('注入分工指引')).toBeChecked();
  await page.reload(); await page.getByLabel('Agent 预设').selectOption('user');
  await expect(page.getByLabel('注入分工指引')).toBeChecked();
  await page.getByLabel('注入分工指引').uncheck();
  await expect(page.getByLabel('注入分工指引')).not.toBeChecked();
});
test('read-only presets cannot change tools or guidance', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('Agent 预设').selectOption('standard');
  await expect(page.getByLabel('注入分工指引')).toBeDisabled();
  await expect(page.getByRole('button', { name: '启用 Codex 工具', exact: true })).toBeDisabled();
});
test('conflicts do not claim success or enable a switch', async ({ page }) => {
  await page.goto('/?conflict'); await page.getByLabel('Agent 预设').selectOption('user');
  await page.getByLabel('注入分工指引').click();
  await expect(page.getByRole('alert')).toContainText('预设已更改');
  await expect(page.getByLabel('注入分工指引')).not.toBeChecked();
});
test('connection errors are actionable and refresh remains available', async ({ page }) => {
  await page.goto('/?failure'); await expect(page.getByRole('alert')).toContainText('宿主连接失败');
  await expect(page.getByRole('button', { name: '刷新状态' })).toBeEnabled();
});
test('unknown authentication does not appear as logged in', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '检测 Codex 登录', exact: true }).click();
  await expect(page.getByText(/未知。无法确认登录状态/)).toBeVisible();
});
test('mobile layout has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByLabel('Agent 预设').selectOption('user');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('built-in preset can create collaboration copy and shows switching instructions', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('Agent 预设').selectOption('standard');
  await page.getByRole('button', { name:'创建协作版并启用' }).click();
  await expect(page.getByLabel('Agent 预设')).toHaveValue('smart-dev-standard');
  await expect(page.getByLabel('注入分工指引')).toBeChecked();
  await expect(page.getByRole('status')).toContainText('新建会话');
  await expect(page.getByRole('status')).toContainText('当前会话模式不会自动改变');
});
test('custom guidance saves, survives reload, and restores default', async ({page}) => {
  await page.goto('/'); await page.getByLabel('Agent 预设').selectOption('user');
  const original = await page.getByLabel('指引内容', {exact:true}).inputValue();
  await page.getByLabel('指引内容', {exact:true}).fill('按任务需要自主决定如何委派');
  await page.getByRole('button',{name:'保存指引',exact:true}).click();
  await expect(page.getByLabel('注入分工指引')).not.toBeChecked();
  await page.reload(); await page.getByLabel('Agent 预设').selectOption('user');
  await expect(page.getByLabel('指引内容',{exact:true})).toHaveValue('按任务需要自主决定如何委派');
  await page.getByRole('button',{name:'恢复默认指引',exact:true}).click();
  await expect(page.getByLabel('指引内容',{exact:true})).toHaveValue(original);
});
test('failed guidance save preserves the draft', async ({page}) => {
  await page.goto('/?conflict'); await page.getByLabel('Agent 预设').selectOption('user');
  await page.getByLabel('指引内容',{exact:true}).fill('保留这个草稿');
  await page.getByRole('button',{name:'保存指引',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('预设已更改');
  await expect(page.getByLabel('指引内容',{exact:true})).toHaveValue('保留这个草稿');
});
