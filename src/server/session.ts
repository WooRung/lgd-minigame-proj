import type { Player } from '../shared/contracts';
import type { Env } from './env';
import { HttpError } from './http';

const MAX_AGE = 60 * 60 * 24 * 180;
export function normalizeName(value: unknown): string {
  if (typeof value !== 'string')
    throw new HttpError(400, '이름을 입력해 주세요.');
  const name = value.trim().normalize('NFC');
  if (name.length < 1 || name.length > 16 || /[\p{C}<>]/u.test(name))
    throw new HttpError(400, '이름은 제어문자 없이 1~16자로 입력해 주세요.');
  return name;
}
async function hash(token: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function getPlayer(
  request: Request,
  env: Env,
): Promise<Player | null> {
  const token = request.headers
    .get('Cookie')
    ?.split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('arcade_session='))
    ?.slice(15);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return env.DB.prepare(
    'SELECT p.id, p.name FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = ? AND s.expires_at > ?',
  )
    .bind(await hash(token), Date.now())
    .first<Player>();
}
export async function requirePlayer(
  request: Request,
  env: Env,
): Promise<Player> {
  const player = await getPlayer(request, env);
  if (!player) throw new HttpError(401, '먼저 이름을 입력해 주세요.');
  return player;
}
export async function createPlayer(name: string, env: Env, secure: boolean) {
  const player = { id: crypto.randomUUID(), name };
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO players(id,name,created_at) VALUES(?,?,?)',
    ).bind(player.id, name, Date.now()),
    env.DB.prepare(
      'INSERT INTO sessions(token_hash,player_id,expires_at) VALUES(?,?,?)',
    ).bind(await hash(token), player.id, Date.now() + MAX_AGE * 1000),
  ]);
  return {
    player,
    cookie: `arcade_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE}${secure ? '; Secure' : ''}`,
  };
}
