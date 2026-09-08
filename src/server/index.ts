import type { Progress } from '../shared/contracts';
import type { Env } from './env';
import { body, checkOrigin, HttpError, json } from './http';
import { finishRun, issueRun } from './runs';
import {
  createPlayer,
  getPlayer,
  normalizeName,
  requirePlayer,
} from './session';

export { GameRoom } from './rooms/game-room';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      checkOrigin(request);
      const path = new URL(request.url).pathname;
      if (path === '/api/me' && request.method === 'GET') {
        const player = await getPlayer(request, env);
        const progress = player
          ? (
              await env.DB.prepare(
                'SELECT game, completed_stage, best_score FROM progress WHERE player_id = ?',
              )
                .bind(player.id)
                .all<Progress>()
            ).results
          : [];
        return json({ player, progress });
      }
      if (path === '/api/session' && request.method === 'POST') {
        const name = normalizeName((await body(request)).name);
        const existing = await getPlayer(request, env);
        if (existing)
          return json({
            player: existing,
            progress: (
              await env.DB.prepare(
                'SELECT game, completed_stage, best_score FROM progress WHERE player_id = ?',
              )
                .bind(existing.id)
                .all<Progress>()
            ).results,
          });
        const { player, cookie } = await createPlayer(
          name,
          env,
          new URL(request.url).protocol === 'https:',
        );
        return json({ player, progress: [] }, 201, { 'Set-Cookie': cookie });
      }
      if (path === '/api/runs' && request.method === 'POST')
        return await issueRun(request, env, await requirePlayer(request, env));
      const finish = /^\/api\/runs\/([a-zA-Z0-9-]+)\/finish$/.exec(path);
      if (finish?.[1] && request.method === 'POST')
        return await finishRun(
          request,
          env,
          await requirePlayer(request, env),
          finish[1],
        );
      return json({ error: '요청한 기능을 찾을 수 없습니다.' }, 404);
    } catch (error) {
      return json(
        {
          error:
            error instanceof HttpError
              ? error.message
              : '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        },
        error instanceof HttpError ? error.status : 500,
      );
    }
  },
} satisfies ExportedHandler<Env>;
