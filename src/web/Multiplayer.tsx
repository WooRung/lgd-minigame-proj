import { useCallback, useEffect, useRef, useState } from 'react';
import type { BomberInput, BomberState } from '../core/bomber/game';
import { isObject, type Player } from '../shared/contracts';
import { type RoomCommand, type RoomView, readRoom } from '../shared/room';
import { api } from './api';

function Arena({
  state,
  send,
  active,
}: {
  state: BomberState;
  send: (input: BomberInput) => void;
  active: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    current = useRef({ state, send, active });
  current.current = { state, send, active };
  useEffect(() => {
    let disposed = false;
    let game: import('phaser').Game | undefined;
    Promise.all([import('phaser'), import('../games/bomber/scene')]).then(
      ([{ default: Phaser }, { BomberScene }]) => {
        if (disposed || !host.current) return;
        let elapsed = 0;
        const scene = new BomberScene(
          () => current.current.state,
          (delta, input) => {
            elapsed += delta;
            if (elapsed < 50) return false;
            elapsed = 0;
            if (current.current.active) current.current.send(input);
            return true;
          },
          () => {
            if (host.current) host.current.dataset.ready = 'true';
          },
        );
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: host.current,
          width: 640,
          height: 528,
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
      aria-label="실시간 폭탄 경기장"
    />
  );
}
export function Multiplayer({
  player,
  onBack,
}: {
  player: Player;
  onBack: () => void;
}) {
  const [code, setCode] = useState(
    () => new URL(location.href).searchParams.get('room') ?? '',
  );
  const [room, setRoom] = useState<RoomView | null>(null),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false),
    [connection, setConnection] = useState(0);
  const socket = useRef<WebSocket | null>(null),
    seq = useRef(0);
  const roomCode = room?.code;
  useEffect(() => {
    if (!roomCode) return;
    let disposed = false,
      retry: ReturnType<typeof setTimeout> | undefined,
      attempts = 0;
    const connect = () => {
      setStatus('연결 중…');
      const ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/rooms/${roomCode}/ws`,
      );
      socket.current = ws;
      seq.current = 0;
      ws.onopen = () => {
        attempts = 0;
        setStatus('연결됨');
      };
      ws.onmessage = (e) => {
        try {
          const message: unknown = JSON.parse(String(e.data));
          if (!isObject(message)) throw Error('응답 오류');
          if (message.type === 'room') {
            setRoom(readRoom(message.room));
          } else if (typeof message.error === 'string') setError(message.error);
        } catch (e) {
          setError(e instanceof Error ? e.message : '메시지 오류');
        }
      };
      ws.onerror = () => setStatus('연결을 확인하고 있습니다.');
      ws.onclose = (e) => {
        if (disposed) return;
        setStatus('연결 끊김');
        if (e.code === 4001) {
          setError(
            '다른 탭에서 이 플레이어가 접속했습니다. 한 탭에서 플레이해 주세요.',
          );
          return;
        }
        if (e.code === 1000) return;
        if (attempts++ < 5) retry = setTimeout(connect, 1500);
        else
          setError(
            '재접속하지 못했습니다. 15초 유예가 지났다면 로비에서 새 방을 만들어 주세요.',
          );
      };
    };
    connect();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      socket.current?.close(1000, '화면 이탈');
      socket.current = null;
    };
  }, [roomCode, connection]);
  const send = useCallback((command: RoomCommand) => {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify(command));
  }, []);
  const input = useCallback(
    (input: BomberInput) => send({ type: 'input', seq: ++seq.current, input }),
    [send],
  );
  async function join(create = false) {
    setBusy(true);
    setError('');
    try {
      const r = readRoom(
        await api(
          create ? '/rooms' : `/rooms/${code.trim().toUpperCase()}/join`,
          create ? { game: 'bomber' } : {},
        ),
      );
      setRoom(r);
      setCode(r.code);
      history.replaceState(null, '', `?room=${r.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '방에 들어갈 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    setBusy(true);
    setError('');
    try {
      if (room) await api(`/rooms/${room.code}/leave`, {});
      history.replaceState(null, '', '/');
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : '퇴장할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }
  const me = room?.members.find((m) => m.id === player.id),
    host = room?.hostId === player.id;
  const live = room?.phase === 'playing' || room?.phase === 'countdown';
  const alive =
    room?.state?.players.find((p) => p.id === player.id)?.alive ?? true;
  return (
    <>
      <div className="toolbar">
        <h1>
          팡팡 아레나 <span className="muted">· 친구와 대전</span>
        </h1>
        <button type="button" disabled={busy} onClick={() => void leave()}>
          로비로 나가기
        </button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {!room ? (
        <section className="panel stack">
          <h2>같이하면 더 즐거운 한 판.</h2>
          <p>
            2~4명, 초대 코드 하나로 모여요. 같은 조건에서 펼치는 친선
            경기입니다.
          </p>
          <div>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void join(true)}
            >
              새 방 만들기
            </button>
          </div>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
          >
            <label htmlFor="invite">초대 코드</label>
            <input
              id="invite"
              style={{ maxWidth: 230 }}
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="8자리 초대 코드"
            />
            <button type="submit" disabled={busy || code.trim().length !== 8}>
              참가하기
            </button>
          </form>
        </section>
      ) : (
        <>
          <div className="room-top row">
            <span>
              초대 코드{' '}
              <strong data-testid="room-code" className="invite-code">
                {room.code}
              </strong>
            </span>
            <span data-testid="connection-status">{status}</span>
            <span className="spacer" data-testid="room-phase">
              {room.phase === 'waiting'
                ? '대기실'
                : room.phase === 'countdown'
                  ? '곧 시작합니다'
                  : room.phase === 'playing'
                    ? '경기 중'
                    : '경기 종료'}
            </span>
            {status !== '연결됨' && (
              <button type="button" onClick={() => setConnection((c) => c + 1)}>
                재접속
              </button>
            )}
          </div>
          <div className="members" aria-label="참가자">
            {room.members
              .filter((m) => !m.left)
              .map((m, i) => (
                <div
                  className={`member color-${i}`}
                  key={m.id}
                  data-testid={`member-${m.id}`}
                >
                  <strong>
                    {i + 1}. {m.name}
                    {m.id === player.id ? ' (나)' : ''}
                  </strong>
                  <span>
                    {m.id === room.hostId ? '방장 · ' : ''}
                    {m.connected
                      ? live
                        ? room.state?.players.find((p) => p.id === m.id)?.alive
                          ? '생존'
                          : '탈락 · 관전'
                        : m.ready
                          ? '준비 완료'
                          : '준비 대기'
                      : '재접속 대기 (15초)'}
                  </span>
                </div>
              ))}
          </div>
          <p className="muted" data-testid="room-seed">
            공통 맵 {room.seed} · 최대 4인 · 90초
          </p>
          {room.phase === 'waiting' && (
            <section className="panel stack">
              <h2>모두 준비되면 시작해요.</h2>
              <div className="row">
                <button
                  type="button"
                  className="primary"
                  disabled={status !== '연결됨'}
                  onClick={() => {
                    setError('');
                    send({ type: 'ready', ready: !me?.ready });
                  }}
                >
                  {me?.ready ? '준비 취소' : '준비하기'}
                </button>
                {host && (
                  <button
                    type="button"
                    disabled={
                      room.members.filter((m) => !m.left).length < 2 ||
                      room.members.some(
                        (m) => !m.left && (!m.ready || !m.connected),
                      )
                    }
                    onClick={() => send({ type: 'start' })}
                  >
                    경기 시작
                  </button>
                )}
              </div>
              <p>
                방향키 이동 · Space 폭탄. 마지막 생존자가 승리합니다.
                <br />
                동시 전멸 또는 90초 시간 초과는 무승부입니다.
              </p>
            </section>
          )}
          {room.state && (
            <>
              <div className="row">
                <strong data-testid="multiplayer-time">
                  {Math.max(0, 90 - Math.floor(room.state.tick / 20))}초
                </strong>
                <span data-testid="my-position">
                  내 위치{' '}
                  {(room.state.players.find((p) => p.id === player.id)?.x ??
                    0) + 1}
                  ,{' '}
                  {(room.state.players.find((p) => p.id === player.id)?.y ??
                    0) + 1}
                </span>
                {!alive && <strong>탈락했습니다. 관전 중입니다.</strong>}
              </div>
              <Arena
                state={room.state}
                send={input}
                active={
                  room.phase === 'playing' && alive && status === '연결됨'
                }
              />
            </>
          )}
          {room.phase === 'ended' && (
            <section className="result" role="status">
              <h2>경기 결과</h2>
              <p>
                {room.notice} {room.saved ? '기록 저장 완료' : '기록 저장 중…'}
              </p>
              <ol className="result-list">
                {room.results.map((r) => (
                  <li key={r.playerId}>
                    {r.name} ·{' '}
                    {r.outcome === 'win'
                      ? '승리'
                      : r.outcome === 'loss'
                        ? '패배'
                        : r.outcome === 'draw'
                          ? '무승부'
                          : '중단'}{' '}
                    · {r.score}점
                  </li>
                ))}
              </ol>
              {host && (
                <div className="row" style={{ justifyContent: 'center' }}>
                  <button
                    type="button"
                    disabled={!room.saved}
                    onClick={() => send({ type: 'rematch', sameMap: true })}
                  >
                    같은 맵 재대결
                  </button>
                  <button
                    type="button"
                    disabled={!room.saved}
                    onClick={() => send({ type: 'rematch', sameMap: false })}
                  >
                    새 맵 재대결
                  </button>
                </div>
              )}
            </section>
          )}
          <p className="instructions">
            연결이 끊겨도 경기는 계속됩니다. 15초 안에 돌아오면 기존 상태로
            이어가며 탈락은 취소되지 않습니다. 유예 만료·자발적 퇴장은 탈락
            처리합니다. 방장 퇴장 시 남은 참가자가 방장을 이어받습니다.
          </p>
        </>
      )}
    </>
  );
}
