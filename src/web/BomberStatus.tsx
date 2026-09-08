import type { BomberState } from '../core/bomber/game';

const labels = { capacity: '폭탄 수', range: '폭발 범위', speed: '이동 속도' };
export function BomberStatus({
  state,
  playerId,
}: {
  state: BomberState;
  playerId: string;
}) {
  const p = state.players.find((p) => p.id === playerId);
  if (!p) return null;
  return (
    <div
      className="bomber-status"
      data-testid="bomber-status"
      data-x={p.x}
      data-y={p.y}
      data-alive={p.alive}
      data-tick={state.tick}
      data-capacity={p.capacity}
      data-range={p.range}
      data-speed={p.speed}
      data-items={JSON.stringify(state.map.items)}
      data-enemies={JSON.stringify(
        state.map.enemies.map(({ id, x, y }) => ({ id, x, y })),
      )}
    >
      <span
        data-testid={
          state.mode === 'single' ? 'player-position' : 'my-position'
        }
      >
        {state.mode === 'multi' ? '내 ' : ''}위치 {(p.x + 1).toFixed(2)},{' '}
        {(p.y + 1).toFixed(2)}
      </span>
      <p>
        폭탄 {p.capacity}개 · 범위 {p.range}칸 · 속도{' '}
        {(p.speed * 20).toFixed(1)}
      </p>
      {state.mode === 'single' && (
        <p>남은 적 {state.map.enemies.length}마리 · 맵 17 × 13</p>
      )}
      <p className="muted">
        상자를 터뜨리면 강화 아이템이 나와요. 불꽃이 꺼진 뒤 획득하세요.
      </p>
      <span role="status">
        {p.pickup && state.tick - p.pickupAt < 40
          ? labels[p.pickup] + ' 강화! +100점'
          : ''}
      </span>
    </div>
  );
}
