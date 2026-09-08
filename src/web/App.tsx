import { useCallback, useEffect, useState } from 'react';
import { type GameKind, type Profile, readProfile } from '../shared/contracts';
import type { RunMode } from '../shared/runs';
import { api } from './api';
import { Multiplayer } from './Multiplayer';
import { Records } from './Records';
import { SingleGame } from './SingleGame';

export function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [selectedGame, setSelectedGame] = useState<GameKind>('bomber');
  const [runMode, setRunMode] = useState<RunMode>('normal');
  const [screen, setScreen] = useState<
    'lobby' | 'bomber' | 'multi' | 'records'
  >(new URL(location.href).searchParams.has('room') ? 'multi' : 'lobby');
  const refresh = useCallback(() => {
    api('/me')
      .then(readProfile)
      .then(setProfile)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    api('/me')
      .then(readProfile)
      .then((p) => {
        if (active) setProfile(p);
      })
      .catch((e) => {
        if (active) setError(String(e.message));
      });
    return () => {
      active = false;
    };
  }, []);
  async function enter(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      setProfile(readProfile(await api('/session', { name })));
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="틈새 오락실 홈">
          <span className="brand-mark">✦</span> 틈새 <span>오락실</span>
        </a>
        <span className="player-label">
          {profile?.player
            ? `${profile.player.name} 님`
            : '가볍게, 즐겁게, 한 판'}
        </span>
      </header>
      <main>
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button type="button" onClick={() => location.reload()}>
              다시 연결
            </button>
          </div>
        )}
        {!profile ? (
          <p role="status">오락실 문을 여는 중…</p>
        ) : !profile.player ? (
          <section className="welcome">
            <div className="welcome-copy">
              <h1>
                잠깐의 <em>틈,</em>
                <br />한 판의 즐거움.
              </h1>
              <p>
                폭탄을 놓거나, 끝까지 달리거나.
                <br />
                이름 하나면 준비 끝이에요.
              </p>
              <img
                className="welcome-art"
                src="/arcade.svg"
                alt="폭탄 경기장과 초록 언덕을 달리는 캐릭터"
              />
            </div>
            <form className="entry-form" onSubmit={enter}>
              <h2>반가워요, 플레이어!</h2>
              <p>오락실에서 사용할 이름을 알려 주세요.</p>
              <label htmlFor="player-name">플레이어 이름</label>
              <input
                id="player-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={16}
                autoComplete="nickname"
                placeholder="1~16자"
                required
              />
              <button
                type="submit"
                className="primary"
                disabled={busy || !name.trim()}
              >
                {busy ? '입장하는 중…' : '오락실 입장 →'}
              </button>
              <small>
                같은 브라우저에서는 기록이 이어집니다.
                <br />
                사이트 데이터를 지우거나 기기를 바꾸면 복구할 수 없어요. 이름은
                중복될 수 있습니다.
              </small>
            </form>
          </section>
        ) : screen === 'records' ? (
          <Records
            initialGame={selectedGame}
            profile={profile}
            onBack={() => setScreen('lobby')}
            onChallenge={(game, mode) => {
              setSelectedGame(game);
              setRunMode(mode);
              setScreen('bomber');
            }}
          />
        ) : screen === 'multi' ? (
          <Multiplayer
            game={selectedGame}
            player={profile.player}
            onBack={() => {
              setScreen('lobby');
              refresh();
            }}
          />
        ) : screen === 'bomber' ? (
          <SingleGame
            key={`${selectedGame}:${runMode}`}
            game={selectedGame}
            mode={runMode}
            profile={profile}
            onBack={() => {
              setScreen(runMode === 'normal' ? 'lobby' : 'records');
              refresh();
            }}
            onSaved={refresh}
          />
        ) : (
          <>
            <section className="intro">
              <h1>
                잠깐의 <em>틈,</em> 한 판의 즐거움.
              </h1>
              <p>
                폭탄을 놓거나, 끝까지 달리거나. 오늘의 기록을 만들어 보세요.
              </p>
            </section>
            <section className="game-grid" aria-label="게임 선택">
              {(['bomber', 'runner'] as const).map((game) => (
                <article className={`game-card ${game}`} key={game}>
                  <div
                    className={`game-art ${game}`}
                    role="img"
                    aria-label={
                      game === 'bomber'
                        ? '격자 경기장과 폭탄'
                        : '언덕 위 러닝 코스'
                    }
                  >
                    <img src="/arcade.svg" alt="" />
                  </div>
                  <div className="game-info">
                    <div>
                      <h2>{game === 'bomber' ? '팡팡 아레나' : '바람 러너'}</h2>
                      <p>
                        {game === 'bomber'
                          ? '폭탄으로 길을 만들고, 마지막까지 살아남으세요.'
                          : '점프와 슬라이드로 새로운 풍경 속을 끝없이 달려요.'}
                      </p>
                    </div>
                    <div className="game-actions">
                      <button
                        type="button"
                        className="primary"
                        onClick={() => {
                          setSelectedGame(game);
                          setRunMode('normal');
                          setScreen('bomber');
                        }}
                      >
                        싱글 플레이
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedGame(game);
                          setScreen('multi');
                        }}
                      >
                        친구와 대전
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
            <section className="summary-grid">
              <div>
                <h2>오늘의 기록</h2>
                <button type="button" onClick={() => setScreen('records')}>
                  기록과 랭킹 보기 →
                </button>
                <p className="empty">
                  같은 맵, 같은 조건의 기록 경쟁.
                  <span>일간·주간 도전에 도전해 보세요.</span>
                </p>
              </div>
              <div>
                <h2>내 진행도</h2>
                <p className="empty">
                  {profile.progress.length
                    ? profile.progress
                        .map(
                          (p) =>
                            `${p.game === 'bomber' ? '팡팡 아레나' : '이전 바람 러너'} ${p.completed_stage}/5단계 완료`,
                        )
                        .join(' · ')
                    : '첫 모험을 기다리고 있어요.'}
                  <span>완료한 단계는 자동으로 저장됩니다.</span>
                </p>
              </div>
            </section>
          </>
        )}
      </main>
      <footer>
        <strong>PC 키보드 조작 안내</strong>
        <span>
          <b>팡팡 아레나</b> 방향키 이동 · Space 폭탄
        </span>
        <span>
          <b>바람 러너</b> Space/↑ 점프 · ↓ 슬라이드
        </span>
        <small>좋은 게임이 틈새를 더 즐겁게 만듭니다.</small>
      </footer>
    </div>
  );
}
