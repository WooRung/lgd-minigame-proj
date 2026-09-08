import type { EndlessState } from '../core/runner/endless';
import { runnerSpeed } from '../core/runner/physics';
import { SEGMENT_LENGTH } from '../core/runner/segments';

export function RunnerStatus({
  state,
  playerId,
}: {
  state: EndlessState;
  playerId: string;
}) {
  const player = state.players.find((p) => p.id === playerId);
  const x = player?.x ?? 0;
  const segment = state.course.segments.find(
    (s) => s.index === Math.floor(x / SEGMENT_LENGTH),
  );
  const next = state.course.segments
    .flatMap((s) => s.obstacles)
    .find((o) => o.x + o.width + 14 > x);
  return (
    <div
      data-testid="runner-status"
      data-distance={next ? next.x - x : 99999}
      data-obstacle={next?.kind ?? ''}
      data-grounded={player?.grounded ?? false}
      data-alive={player?.alive ?? false}
      data-sliding={player?.sliding ?? false}
      data-x={x}
      data-segment={segment?.index ?? 0}
      data-theme={segment?.theme ?? ''}
      data-pattern={segment?.pattern ?? ''}
    >
      <p>
        <strong>{((player?.distance ?? 0) / 10).toFixed(1)}m</strong> · 수집{' '}
        {player?.score ?? 0}점
      </p>
      <p>
        {segment?.theme === 'cavern'
          ? '반짝 동굴'
          : segment?.theme === 'skyway'
            ? '구름 다리'
            : '바람 초원'}{' '}
        · {(segment?.index ?? 0) + 1}구간
      </p>
      <p className="muted">
        {next
          ? `다음 ${next.kind === 'ceiling' ? '슬라이드 장애물' : next.kind === 'gap' ? '틈' : next.kind === 'moving' ? '이동 장애물' : '장애물'}까지 ${Math.max(0, Math.ceil((next.x - x) / 10))}m`
          : '다음 구간으로!'}{' '}
        · 속도 {(runnerSpeed(x) * 2).toFixed(1)}m/s
      </p>
    </div>
  );
}
