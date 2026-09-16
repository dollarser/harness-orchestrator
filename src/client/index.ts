import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import { SettingsPage } from './SettingsPage.js';
import type { Api, Reply } from '../shared/types.js';
export const inject = ['slots', 'connection'];
export function apply(ctx: Context) {
  const api: Api = async request => {
    const result = await (ctx.connection.rpc as unknown as ClientConnectionRpc).call('/api', 'smart-dev/manage', request);
    if (!result.ok) throw new Error(result.error.message);
    return result.value as Reply;
  };
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'smart-dev', order: 30,
    label: () => 'Smart Dev', inject: () => ({ api }),
  }, SettingsPage));
}
