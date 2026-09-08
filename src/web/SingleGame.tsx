import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BOMBER_LIMIT,
  type BomberState,
  createBomber,
  stepBomber,
} from '../core/bomber/game';
import { TICK_MS } from '../core/random';
import type { Profile } from '../shared/contracts';
import { type Run, readRun } from '../shared/runs';
import { api } from './api';

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
          type: Phaser.AUTO,
          parent: host.current,
          width: 640,
          height: 528,
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
}: {
  profile: Profile;
  onBack: () => void;
  onSaved: () => void;
}) {
  const completed =
    profile.progress.find((p) => p.game === 'bomber')?.completed_stage ?? 0;
  const [stage, setStage] = useState(Math.min(5, completed + 1));
  const [run, setRun] = useState<Run | null>(null),
    [state, setState] = useState<BomberState | null>(null);
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
      const r = readRun(
        await api('/runs', {
          game: 'bomber',
          stage: nextStage,
          ...(retry && run ? { retryOf: run.id } : {}),
        }),
      );
      setRun(r);
      setStage(nextStage);
      setState(createBomber(r.seed, r.stage, ['single']));
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
      });
      setSaved(true);
      onSaved();
    } catch (e) {
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
          팡팡 아레나 <span className="muted">· 싱글</span>
        </h1>
        <button type="button" onClick={onBack}>
          로비로
        </button>
      </div>
      {error && (
        <div role="alert" className="notice error">
          {error}
          {ended && !saved && (
            <button type="button" onClick={() => void save()}>
              저장 재시도
            </button>
          )}
        </div>
      )}
      {!state ? (
        <section className="panel stack">
          <h2>출구까지 나만의 길을 만드세요.</h2>
          <p>
            금빛 출구 위 상자를 폭탄으로 부수고 도착하면 완료! 폭탄을 놓은
            뒤에는 두 칸 밖으로 피하세요.
          </p>
          <div className="stages" aria-label="단계 선택">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                disabled={n > completed + 1}
                className={stage === n ? 'selected' : ''}
                onClick={() => setStage(n)}
              >
                {n}단계{n <= completed ? ' ✓' : ''}
              </button>
            ))}
          </div>
          <p className="instructions">
            방향키: 이동 · Space: 폭탄 설치
            <br />
            폭탄은 1.8초 뒤 십자 방향으로 두 칸 폭발합니다. 적과 불꽃을
            피하세요.
            <br />
            2단계부터 금빛 아이템(폭발 3칸), 4단계부터 깜박이는 위험 타일이
            등장합니다. 제한 시간 90초.
          </p>
          <div>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void start()}
            >
              {busy ? '준비 중…' : `${stage}단계 시작`}
            </button>
          </div>
        </section>
      ) : (
        <div className="play-layout">
          <div>
            <BomberCanvas state={state} paused={paused} onTick={onTick} />
            {ended && (
              <section className="result" role="status">
                <h2>
                  {state.status === 'won'
                    ? '스테이지 완료!'
                    : '다시 한번 도전해요'}
                </h2>
                <p>
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
                    disabled={busy}
                    onClick={() => void start(true)}
                  >
                    같은 맵 재도전
                  </button>
                  {state.status === 'won' && stage < 5 && (
                    <button
                      type="button"
                      className="primary"
                      disabled={!saved || busy}
                      onClick={() => void start(false, stage + 1)}
                    >
                      다음 단계
                    </button>
                  )}
                  {state.status === 'won' && stage === 5 && (
                    <strong>5단계 정복! 모든 스테이지를 완료했어요.</strong>
                  )}
                </div>
              </section>
            )}
          </div>
          <aside className="panel">
            <h2>{stage}단계 / 5</h2>
            <div className="stat" data-testid="time-left">
              {Math.ceil((BOMBER_LIMIT - state.tick) / 20)}초
            </div>
            <p>점수 {state.players[0]?.score ?? 0}</p>
            <p data-testid="player-position">
              위치 {(state.players[0]?.x ?? 0) + 1},{' '}
              {(state.players[0]?.y ?? 0) + 1}
            </p>
            <p className="instructions">
              방향키 이동
              <br />
              Space 폭탄
              <br />
              금빛 출구에 도착하세요.
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
            {paused && !ended && <p role="status">일시정지 중</p>}
          </aside>
        </div>
      )}
    </>
  );
}
