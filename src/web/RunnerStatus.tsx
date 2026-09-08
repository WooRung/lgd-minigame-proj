import type { RunnerState } from '../core/runner/game';
export function RunnerStatus({
  state,
  playerId,
}: {
  state: RunnerState;
  playerId: string;
}) {
  const player = state.players.find((p) => p.id === playerId);
  const next = state.course.obstacles.find(
    (o) => o.lane === player?.lane && o.x + o.width > (player?.x ?? 0),
  );
  return (
    <div
      data-testid="runner-status"
      data-distance={next ? next.x - (player?.x ?? 0) : 99999}
      data-grounded={player?.grounded ?? false}
      data-alive={player?.alive ?? false}
      data-finished={player?.finishedAt !== null}
      data-x={player?.x ?? 0}
    >
      <p>
        <strong>
          {Math.floor((player?.x ?? 0) / 10)} /{' '}
          {Math.floor(state.course.length / 10)}m
        </strong>{' '}
        · {player?.lane === 0 ? '윗길' : '아랫길'}
      </p>
      <p className="muted">
        {next
          ? `다음 ${next.kind === 'gap' ? '틈' : '장애물'}까지 ${Math.max(0, Math.ceil((next.x - (player?.x ?? 0)) / 10))}m`
          : '결승선이 보여요!'}{' '}
        · 수집 {player?.collected.length ?? 0}개
      </p>
    </div>
  );
}
