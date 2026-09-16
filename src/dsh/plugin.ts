import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-agent-presets';
import type {} from '@deepseek-ai/dsh-session-projection';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-subagent';
import type {} from '@deepseek-ai/dsh-tools';
import { Manager, locateProfile } from '../host/manager.js';
import { backends, type Request } from '../shared/types.js';
import { delegationGuidance } from '../shared/delegation.js';

export const name = 'smart-dev';
export const inject = ['connection', 'agentPresets', 'agents', 'tools', 'subagents', 'systemPrompt', 'sessionProjections'];
export async function apply(ctx: Context, raw: { profileDir?: string } = {}) {
  if (!raw || typeof raw !== 'object' || Object.keys(raw).some(key => key !== 'profileDir') || (raw.profileDir !== undefined && typeof raw.profileDir !== 'string')) throw new Error('Smart Dev 仅接受可选的 profileDir 部署配置');
  const manager = new Manager(await locateProfile(raw.profileDir), {
    presets: () => ctx.agentPresets.list(),
    registered: () => ctx.subagents.list(),
    agents: () => ctx.agents.list().map(agent => ({
      preset: ctx.sessionProjections.stateOf(agent.session, 'agentPreset') ?? '',
      tools: backends.filter(item => ctx.tools.get(item.tool, agent)).map(item => item.tool),
    })),
  });
  await manager.init();
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'smart-dev:delegation', order: 80,
    text: ({ agent }) => {
      if (!agent) return '';
      const preset = ctx.sessionProjections.stateOf(agent.session, 'agentPreset');
      return preset && manager.preferences.guidancePresets.includes(preset) ? delegationGuidance : '';
    },
  }));
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/smart-dev/manage', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return new Response('JSON required', { status: 415 });
      const body = await request.json().catch(() => null);
      if (!body || body.type !== 'client-request' || body.method !== 'smart-dev/manage' || typeof body.rpcId !== 'string') return new Response('Invalid request envelope', { status: 400 });
      let result;
      try { result = { ok: true, value: await manager.dispatch(body.payload as Request) }; }
      catch (error) { result = { ok: false, error: { code: 'smart-dev/operation', message: error instanceof Error ? error.message : String(error), details: {} } }; }
      return Response.json({ type: 'server-response', rpcId: body.rpcId, result });
    },
  }));
}
