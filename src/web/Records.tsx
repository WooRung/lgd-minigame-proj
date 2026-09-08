import { useEffect, useState } from 'react';
import type { GameKind, Profile } from '../shared/contracts';
import {
  type HistoryRow,
  type Leaderboard,
  type RankedRecord,
  readHistory,
  readLeaderboard,
} from '../shared/rankings';
import type { RunMode } from '../shared/runs';
import { api } from './api';

function Table({
  rows,
  myId,
  game,
}: {
  rows: RankedRecord[];
  myId: string;
  game: GameKind;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>순위</th>
          <th>플레이어</th>
          <th>{game === 'runner' ? '거리' : '점수'}</th>
          <th>{game === 'runner' ? '수집 점수' : '완주 시간'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.playerId} className={r.playerId === myId ? 'mine' : ''}>
            <td>{r.rank}위</td>
            <td>
              {r.name}
              {r.playerId === myId ? ' (나)' : ''}
            </td>
            <td>
              {game === 'runner'
                ? `${((r.distance ?? 0) / 10).toFixed(1)}m`
                : r.score.toLocaleString()}
            </td>
            <td>
              {game === 'runner'
                ? `${r.score}점`
                : `${(r.ticks / 20).toFixed(2)}초`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export function Records({
  profile,
  onBack,
  onChallenge,
  initialGame = 'bomber',
}: {
  profile: Profile;
  initialGame?: GameKind;
  onBack: () => void;
  onChallenge: (game: GameKind, mode: RunMode) => void;
}) {
  const [game, setGame] = useState<GameKind>(initialGame),
    [mode, setMode] = useState<RunMode>(
      initialGame === 'runner' ? 'normal' : 'daily',
    ),
    [board, setBoard] = useState<Leaderboard | null>(null),
    [history, setHistory] = useState<HistoryRow[]>([]),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setBoard(null);
    setHistory([]);
    setError('');
    Promise.all([
      api(`/rankings?game=${game}&mode=${mode}`).then(readLeaderboard),
      api(`/history?game=${game}`).then(readHistory),
    ])
      .then(([b, h]) => {
        if (active) {
          setBoard(b);
          setHistory(h);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [game, mode, refresh]);
  const progress = profile.progress.find((p) => p.game === game);
  return (
    <>
      <div className="toolbar">
        <h1>기록과 랭킹</h1>
        <button type="button" onClick={onBack}>
          로비로
        </button>
      </div>
      <div className="row">
        <label>
          게임{' '}
          <select
            value={game}
            onChange={(e) => {
              setGame(e.target.value === 'runner' ? 'runner' : 'bomber');
              if (e.target.value === 'bomber' && mode === 'normal')
                setMode('daily');
            }}
          >
            <option value="bomber">팡팡 아레나</option>
            <option value="runner">바람 러너</option>
          </select>
        </label>
        <label>
          도전 기간{' '}
          <select
            value={mode}
            onChange={(e) =>
              setMode(
                e.target.value === 'normal' && game === 'runner'
                  ? 'normal'
                  : e.target.value === 'weekly'
                    ? 'weekly'
                    : 'daily',
              )
            }
          >
            {game === 'runner' && (
              <option value="normal">일반 무한 달리기</option>
            )}
            <option value="daily">일간 도전</option>
            <option value="weekly">주간 도전</option>
          </select>
        </label>
        <button type="button" onClick={() => setRefresh((v) => v + 1)}>
          새로고침
        </button>
        <button
          type="button"
          className="primary spacer"
          onClick={() => onChallenge(game, mode)}
        >
          이 조건으로 도전
        </button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {!board && !error ? (
        <p role="status">기록을 불러오는 중…</p>
      ) : (
        board && (
          <>
            <p>
              {mode === 'normal'
                ? '일반 무한 달리기 · 다양한 시드'
                : `${mode === 'daily' ? '오늘' : '이번 주'}의 공통 조건 · ${board.period} · 시드 ${board.seed}`}{' '}
              · {game === 'bomber' ? `${board.stage}단계 · ` : ''}규칙{' '}
              {board.rulesVersion}
              <br />
              <small>
                한국 시간 기준, 주간은 월요일 시작.{' '}
                {game === 'bomber'
                  ? '점수 내림차순, 같은 점수는 완주 시간 오름차순'
                  : '거리 내림차순, 같은 거리는 수집 점수 내림차순'}
                . 두 값이 같으면 공동 순위입니다.
              </small>
            </p>
            <div className="records-layout">
              <section className="panel">
                <h2>
                  상위 기록 <small>{board.total}명</small>
                </h2>
                {board.top.length ? (
                  <Table
                    game={game}
                    rows={board.top}
                    myId={profile.player?.id ?? ''}
                  />
                ) : (
                  <p className="empty">
                    아직 기록이 없어요.<span>첫 기록을 남겨 보세요.</span>
                  </p>
                )}
              </section>
              <section className="panel">
                <h2>내 최고 기록</h2>
                {board.mine ? (
                  <p className="stat" data-testid="my-rank">
                    {board.mine.rank}위 ·{' '}
                    {game === 'runner'
                      ? `${((board.mine.distance ?? 0) / 10).toFixed(1)}m · 수집 `
                      : ''}
                    {board.mine.score.toLocaleString()}점
                    <small style={{ display: 'block', fontSize: 14 }}>
                      {(board.mine.ticks / 20).toFixed(2)}초
                    </small>
                  </p>
                ) : (
                  <p>이 도전의 기록이 아직 없어요.</p>
                )}
                <p>
                  {game === 'runner' ? '이전 규칙의 러너' : '일반 싱글'} 진행{' '}
                  {progress?.completed_stage ?? 0}/5단계
                  <br />
                  {game === 'runner'
                    ? '이전 규칙의 개인 최고'
                    : '일반 싱글 개인 최고'}{' '}
                  {(game === 'runner'
                    ? progress?.best_score
                    : progress?.current_best_score) ?? 0}
                  점
                  {game === 'bomber' && (
                    <small style={{ display: 'block' }}>
                      이전 규칙의 개인 최고 {progress?.best_score ?? 0}점 · 새
                      기록과 분리 보관
                    </small>
                  )}
                </p>
                <small>
                  {game === 'runner'
                    ? '이전 5단계 진행도와 기록은 보존되며 무한 러너 랭킹에 합산되지 않습니다.'
                    : '일반 싱글 개인 최고는 내 진행 참고용입니다. 공통 코스 랭킹과 합산하지 않습니다.'}
                </small>
              </section>
            </div>
            <section className="panel" style={{ marginTop: 20 }}>
              <h2>내 순위 주변</h2>
              {board.nearby.length ? (
                <Table
                  game={game}
                  rows={board.nearby}
                  myId={profile.player?.id ?? ''}
                />
              ) : (
                <p>기록을 저장하면 내 순위 주변이 표시됩니다.</p>
              )}
            </section>
          </>
        )
      )}
      <section className="panel" style={{ marginTop: 20 }}>
        <h2>최근 플레이</h2>
        {history.length ? (
          <ul className="history-list">
            {history.map((h) => (
              <li key={`${h.mode}-${h.id}`}>
                <strong>
                  {h.mode === 'friendly'
                    ? '친선 대전'
                    : h.mode === 'normal'
                      ? game === 'runner' && h.rulesVersion !== '1'
                        ? '무한 달리기'
                        : `싱글 ${h.stage}단계`
                      : h.mode === 'daily'
                        ? '일간 도전'
                        : '주간 도전'}
                </strong>
                <span>
                  {{
                    win: '승리',
                    loss: '패배',
                    draw: '무승부',
                    aborted: '중단',
                  }[h.outcome] ?? h.outcome}{' '}
                  ·{' '}
                  {h.distance !== null
                    ? `${(h.distance / 10).toFixed(1)}m · 수집 `
                    : ''}
                  {h.score}점 · 규칙 {h.rulesVersion}
                </span>
                <time>
                  {new Date(h.endedAt).toLocaleString('ko-KR', {
                    timeZone: 'Asia/Seoul',
                  })}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p>아직 플레이 기록이 없습니다.</p>
        )}
      </section>
      <p className="instructions">
        친선 대전은 실력 등급전이 아닙니다. 싱글은 서버가 도전·시간·점수 범위와
        중복을 검사하지만 정교한 클라이언트 조작을 완전히 차단하지는 않습니다.
        보상이 없는 가벼운 기록 경쟁으로 즐겨 주세요.
        <br />
        세션이 만료되거나 사이트 데이터 삭제·기기 변경 시 기존 기록의 소유권을
        복구할 수 없습니다.
      </p>
    </>
  );
}
