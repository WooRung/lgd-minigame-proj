import { isObject } from '../shared/contracts';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  const out = new Headers(headers);
  out.set('Content-Type', 'application/json; charset=utf-8');
  out.set('Cache-Control', 'no-store');
  out.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(value), { status, headers: out });
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new HttpError(415, 'JSON 요청이 필요합니다.');
  if (Number(request.headers.get('content-length')) > 4096)
    throw new HttpError(413, '요청이 너무 큽니다.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '내용을 입력해 주세요.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4096) {
      await reader.cancel();
      throw new HttpError(413, '요청이 너무 큽니다.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'JSON 내용을 확인해 주세요.');
  }
  if (!isObject(parsed)) throw new HttpError(400, '요청 내용을 확인해 주세요.');
  return parsed;
}
export function checkOrigin(request: Request) {
  if (
    !['GET', 'HEAD'].includes(request.method) ||
    request.headers.get('Upgrade') === 'websocket'
  ) {
    if (request.headers.get('Origin') !== new URL(request.url).origin)
      throw new HttpError(403, '같은 사이트에서 요청해 주세요.');
  }
}
