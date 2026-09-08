import type { Env } from './env';
import { HttpError } from './http';

export const RATE_SQL = `INSERT INTO rate_limits(subject,count,resets_at) VALUES(?,1,?)
ON CONFLICT(subject) DO UPDATE SET
 count = CASE WHEN resets_at <= ? THEN 1 ELSE count + 1 END,
 resets_at = CASE WHEN resets_at <= ? THEN excluded.resets_at ELSE resets_at END
WHERE resets_at <= ? OR count < ? RETURNING count`;

let nextCleanup = 0;
export async function limitSubmission(
  env: Env,
  subject: string,
  max: number,
  now = Date.now(),
) {
  const row = await env.DB.prepare(RATE_SQL)
    .bind(subject, now + 60000, now, now, now, max)
    .first();
  if (!row)
    throw new HttpError(429, '요청이 많습니다. 1분 후 다시 시도해 주세요.');
  // 제한 판정은 D1의 원자적 갱신으로 수행한다. 이 값은 청소 빈도만 줄인다.
  if (now >= nextCleanup) {
    nextCleanup = now + 600000;
    await env.DB.prepare(
      'DELETE FROM rate_limits WHERE subject IN (SELECT subject FROM rate_limits WHERE resets_at < ? LIMIT 100)',
    )
      .bind(now - 3600000)
      .run();
  }
}
export async function sessionSubject(request: Request) {
  // 운영에서는 Cloudflare가 설정한 접속 IP만 사용한다. 임의의 전달 헤더는 믿지 않는다.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(ip),
  );
  return `session:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
