import { describe, expect, it } from 'vitest';
import { checkOrigin } from './http';
import { normalizeName } from './session';

describe('플레이어 입력과 출처', () => {
  it('이름을 정규화하고 표시값만 받는다', () => {
    expect(normalizeName('  플레이어  ')).toBe('플레이어');
  });
  it.each(['', 'a'.repeat(17), 'a\nb', '<script>'])(
    '잘못된 이름을 거절한다: %s',
    (name) => {
      expect(() => normalizeName(name)).toThrow();
    },
  );
  it('다른 사이트의 세션 생성 요청을 거절한다', () => {
    expect(() =>
      checkOrigin(
        new Request('http://localhost/api/session', {
          method: 'POST',
          headers: { Origin: 'https://evil.example' },
        }),
      ),
    ).toThrow();
  });
});
