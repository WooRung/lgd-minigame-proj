import { isObject } from '../shared/contracts';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api(path: string, data?: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api${path}`, {
      signal: controller.signal,
      ...(data === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          }),
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        response.status,
        isObject(result) && typeof result.error === 'string'
          ? result.error
          : '서버 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      );
    if (result === null) throw new Error('서버 응답을 확인할 수 없습니다.');
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error(
      '서버 연결을 확인해 주세요. 잠시 후 다시 시도할 수 있습니다.',
    );
  } finally {
    clearTimeout(timer);
  }
}
