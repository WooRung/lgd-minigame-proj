import { isObject } from '../shared/contracts';
export async function api(path: string, data?: unknown): Promise<unknown> {
  const response = await fetch(
    `/api${path}`,
    data === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
  );
  const result: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      isObject(result) && typeof result.error === 'string'
        ? result.error
        : '요청에 실패했습니다.',
    );
  return result;
}
