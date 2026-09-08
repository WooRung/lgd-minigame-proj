import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BOMBER_LIMIT,
  type BomberState,
  createBomber,
  stepBomber,
} from '../core/bomber/game';
import { TICK_MS } from '../core/random';
import {
  createEndlessRunner,
  type EndlessState as RunnerState,
  stopEndlessRunner,
} from '../core/runner/endless';
import type { GameKind, Profile } from '../shared/contracts';
import { readHistory } from '../shared/rankings';
import { type Run, type RunMode, readRun } from '../shared/runs';
import { ApiError, api } from './api';
import { BomberStatus } from './BomberStatus';
import { RunnerCanvas } from './RunnerCanvas';
import { RunnerStatus } from './RunnerStatus';

function BomberCanvas({
  state,
  paused,
  onTick,
}: {
  state: BomberState;
  paused: boolean;
  onTick: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    pausedRef = useRef(paused),
    tickRef = useRef(onTick),
    stateRef = useRef(state);
  stateRef.current = state;
  pausedRef.current = paused;
  tickRef.current = onTick;
  useEffect(() => {
    let disposed = false;
    let game: import('phaser').Game | undefined;
    Promise.all([import('phaser'), import('../games/bomber/scene')]).then(
      ([{ default: Phaser }, { BomberScene }]) => {
        if (disposed || !host.current) return;
        let accumulator = 0;
        const scene = new BomberScene(
          () => stateRef.current,
          (delta, input) => {
            const state = stateRef.current;
            if (pausedRef.current || state.status !== 'playing') return true;
            accumulator += Math.min(delta, 250);
            const consumed = accumulator >= TICK_MS;
            while (accumulator >= TICK_MS) {
              stepBomber(state, { single: input });
              accumulator -= TICK_MS;
            }
            if (consumed) tickRef.current();
            return consumed;
          },
        );
        game = new Phaser.Game({
          type: Phaser.CANVAS,
          parent: host.current,
          width: 952,
          height: 728,
          backgroundColor: '#294d3c',
          scene: [scene],
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          audio: { noAudio: true },
        });
      },
    );
    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, []);
  return (
    <div
      ref={host}
      className="game-canvas"
      role="img"
      aria-label="폭탄 게임 경기장"
    />
  );
}

export function SingleGame({
  profile,
  onBack,
  onSaved,
  mode = 'normal',
  game = 'bomber',
}: {
  profile: Profile;
  mode?: RunMode;
  game?: GameKind;
  onBack: () => void;
  onSaved: () => void;
}) {
  const completed =
    profile.progress.find((p) => p.game === game)?.completed_stage ?? 0;
  const [stage, setStage] = useState(
    game === 'runner' ? 1 : mode === 'normal' ? Math.min(5, completed + 1) : 3,
  );
  const [run, setRun] = useState<Run | null>(null),
    [state, setState] = useState<BomberState | RunnerState | null>(null);
  const [paused, setPaused] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false),
    [version, setVersion] = useState(0);
  const submitted = useRef<string | null>(null);
  const onTick = useCallback(() => setVersion((v) => v + 1), []);
  async function start(retry = false, nextStage = stage) {
    setBusy(true);
    setError('');
    setSaved(false);
    setPaused(false);
    try {
      await Promise.all([
        import('phaser'),
        game === 'bomber'
          ? import('../games/bomber/scene')
          : import('../games/runner/scene'),
      ]);
      const r = readRun(
        await api('/runs', {
          game,
          mode,
          stage: nextStage,
          ...(retry && run ? { retryOf: run.id } : {}),
        }),
      );
      setRun(r);
      setStage(nextStage);
      setState(
        game === 'bomber'
          ? createBomber(r.seed, r.stage, ['single'])
          : createEndlessRunner(r.seed, ['single']),
      );
      submitted.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : '시작할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!run || !state) return;
    setBusy(true);
    setError('');
    try {
      await api(`/runs/${run.id}/finish`, {
        ticks: state.tick,
        score: state.players[0]?.score ?? 0,
        won: state.status === 'won',
        ...(state.kind === 'runner'
          ? { distance: state.players[0]?.distance ?? 0, reason: state.reason }
          : {}),
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      // 성공 응답만 유실된 재시도는 소유자 전용 기록 조회로 확인한다.
      if (e instanceof ApiError && e.status === 409) {
        try {
          const record = readHistory(await api(`/history?game=${game}`)).find(
            (h) => h.id === run.id,
          );
          if (
            record &&
            record.ticks === state.tick &&
            record.score === state.players[0]?.score &&
            record.outcome ===
              (state.kind === 'runner' && state.reason === 'manual'
                ? '종료'
                : state.status === 'won'
                  ? '완료'
                  : '실패') &&
            (state.kind !== 'runner' ||
              record.distance === state.players[0]?.distance)
          ) {
            setSaved(true);
            onSaved();
            return;
          }
        } catch {
          /* 원래 저장 오류를 표시하고 다시 시도할 수 있게 한다. */
        }
      }
      setError(e instanceof Error ? e.message : '저장할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      run &&
      state &&
      state.status !== 'playing' &&
      submitted.current !== run.id
    ) {
      submitted.current = run.id;
      void save();
    }
  }, [run, state, version, save]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  const ended = state && state.status !== 'playing';
  return (
    <>
      <div className="toolbar">
        <h1>
          {game === 'bomber' ? '팡팡 아레나' : '바람 러너'}{' '}
          <span className="muted">
            ·{' '}
            {mode === 'normal'
              ? '싱글'
              : mode === 'daily'
                ? '일간 도전'
                : '주간 도전'}
          </span>
        </h1>
        <button type="button" onClick={onBack}>
          {mode === 'normal' ? '로비로' : '기록으로'}
        </button>
      </div>
      {error && (
        <div role="alert" className="notice error">
          {error}
          {ended && !saved && (
            <button type="button" disabled={busy} onClick={() => void save()}>
              저장 재시도
            </button>
          )}
        </div>
      )}
      {!state ? (
        <section className="panel stack">
          <h2>
            {game === 'bomber'
              ? '출구까지 나만의 길을 만드세요.'
              : '새로운 풍경 속으로 끝없이 달려요.'}
          </h2>
          <p>
            {game === 'bomber'
              ? '금빛 출구 위 상자를 폭탄으로 부수고 도착하면 완료! 폭탄을 놓은 뒤에는 두 칸 밖으로 피하세요.'
              : '초원·동굴·하늘다리가 계속 이어집니다. 점프와 슬라이드로 장애물을 피하고 금빛 수집물로 기록을 높이세요.'}
          </p>
          {game === 'bomber' && (
            <div className="stages" aria-label="단계 선택">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={mode !== 'normal' || n > completed + 1}
                  className={stage === n ? 'selected' : ''}
                  onClick={() => setStage(n)}
                >
                  {n}단계{n <= completed ? ' ✓' : ''}
                </button>
              ))}
            </div>
          )}
          <p className="instructions">
            {game === 'bomber' ? (
              <>
                방향키: 이동 · Space: 폭탄 설치
                <br />
                폭탄은 1.8초 뒤 폭발합니다. 상자를 부수고 폭탄 수·범위·속도를
                강화하세요. 단계별 적은 3~7마리이며 4단계부터 위험 타일이
                등장합니다.
              </>
            ) : (
              <>
                Space 또는 ↑: 점프 · ↓ 누르는 동안: 슬라이드
                <br />
                점프·슬라이드·이동 장애물·발판을 조합한 12개 패턴이 이어집니다.
                점프는 다시 눌러야 발동합니다.
              </>
            )}
            <br />
            {game === 'bomber'
              ? '제한 시간 90초.'
              : '싱글은 시간 제한이 없습니다. 실패하거나 종료하면 기록을 저장합니다.'}
          </p>
          <div>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void start()}
            >
              {busy
                ? '준비 중…'
                : game === 'runner'
                  ? '무한 달리기 시작'
                  : `${stage}단계 시작`}
            </button>
          </div>
        </section>
      ) : (
        <div className="play-layout">
          <div>
            {state.kind === 'bomber' ? (
              <BomberCanvas state={state} paused={paused} onTick={onTick} />
            ) : (
              <RunnerCanvas state={state} paused={paused} onTick={onTick} />
            )}
            {ended && (
              <section className="result" role="status">
                <h2>
                  {state.kind === 'runner'
                    ? '이번 달리기 기록'
                    : state.status === 'won'
                      ? '스테이지 완료!'
                      : '다시 한번 도전해요'}
                </h2>
                <p>
                  {state.kind === 'runner'
                    ? `${((state.players[0]?.distance ?? 0) / 10).toFixed(1)}m · 수집 `
                    : ''}
                  {state.players[0]?.score ?? 0}점 ·{' '}
                  {saved
                    ? '기록 저장 완료'
                    : busy
                      ? '기록 저장 중…'
                      : '저장 상태를 확인해 주세요.'}
                </p>
                <div className="row" style={{ justifyContent: 'center' }}>
                  <button
                    type="button"
                    disabled={!saved || busy}
                    onClick={() => void start(true)}
                  >
                    같은 맵 재도전
                  </button>
                  {state.kind === 'bomber' &&
                    state.status === 'won' &&
                    stage < 5 &&
                    mode === 'normal' && (
                      <button
                        type="button"
                        className="primary"
                        disabled={!saved || busy}
                        onClick={() => void start(false, stage + 1)}
                      >
                        다음 단계
                      </button>
                    )}
                  {state.kind === 'bomber' &&
                    state.status === 'won' &&
                    stage === 5 &&
                    mode === 'normal' && (
                      <strong>5단계 정복! 모든 스테이지를 완료했어요.</strong>
                    )}
                </div>
              </section>
            )}
          </div>
          <aside className="panel">
            <h2>
              {state.kind === 'runner' ? '끝없는 달리기' : `${stage}단계 / 5`}
            </h2>
            <div className="stat" data-testid="time-left">
              {state.kind === 'runner'
                ? Math.floor(state.tick / 20)
                : Math.ceil((BOMBER_LIMIT - state.tick) / 20)}
              초 {state.kind === 'runner' ? '달리는 중' : ''}
            </div>
            <p>점수 {state.players[0]?.score ?? 0}</p>
            {state.kind === 'runner' ? (
              <RunnerStatus state={state} playerId="single" />
            ) : (
              <BomberStatus state={state} playerId="single" />
            )}
            <p className="instructions">
              {game === 'bomber' ? (
                <>
                  방향키 이동
                  <br />
                  Space 폭탄
                  <br />
                  금빛 출구에 도착하세요.
                </>
              ) : (
                <>
                  Space / ↑ 점프
                  <br />↓ 누르기 슬라이드
                  <br />
                  거리와 수집 점수에 도전하세요.
                </>
              )}
            </p>
            <p className="muted">
              맵 {run?.seed}
              <br />
              규칙 {run?.rulesVersion}
            </p>
            {!ended && (
              <button type="button" onClick={() => setPaused((p) => !p)}>
                {paused ? '계속하기' : '일시정지'}
              </button>
            )}
            {!ended && state.kind === 'runner' && (
              <button
                type="button"
                disabled={state.tick < 1}
                onClick={() => {
                  stopEndlessRunner(state);
                  onTick();
                }}
              >
                종료하고 저장
              </button>
            )}
            {paused && !ended && <p role="status">일시정지 중</p>}
          </aside>
        </div>
      )}
    </>
  );
}
