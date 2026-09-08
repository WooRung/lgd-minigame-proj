import type { Player } from '../../shared/contracts';
import type { Env } from '../env';
import { body, HttpError } from '../http';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export async function roomRequest(
  request: Request,
  env: Env,
  player: Player,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const headers = new Headers({
    'X-Player-Id': player.id,
    'X-Player-Name': encodeURIComponent(player.name),
    'Content-Type': 'application/json',
  });
  if (path === '/api/rooms' && request.method === 'POST') {
    const data = await body(request);
    const code = Array.from(
      crypto.getRandomValues(new Uint8Array(8)),
      (v) => ALPHABET[v % ALPHABET.length],
    ).join('');
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(
      new Request('https://room/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({ game: data.game, code }),
      }),
    );
  }
  const match =
    /^\/api\/rooms\/([A-HJ-NP-Z2-9]{8})\/(join|leave|view|ws)$/.exec(path);
  if (!match?.[1] || !match[2])
    throw new HttpError(400, '8자리 초대 코드를 확인해 주세요.');
  const action = match[2];
  if (
    (['join', 'leave'].includes(action) && request.method !== 'POST') ||
    (['view', 'ws'].includes(action) && request.method !== 'GET')
  )
    throw new HttpError(405, '지원하지 않는 요청입니다.');
  if (action === 'ws')
    headers.set('Upgrade', request.headers.get('Upgrade') ?? '');
  return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(
    new Request(`https://room/${action}`, { method: request.method, headers }),
  );
}
