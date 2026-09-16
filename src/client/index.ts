import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type { Settings } from '../shared/config.js';
import { SettingsPage } from './SettingsPage.js';

export const inject = ['slots', 'settingsScope'];
export function apply(ctx: Context): void {
  const scope = ctx.settingsScope.bind<Settings>({ namespace: 'smart-dev' });
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'smart-dev', order: 30,
    label: () => 'Smart Dev', inject: () => ({ scope }),
  }, SettingsPage));
}
