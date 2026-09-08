import { useEffect, useRef } from 'react';
import type { BomberInput } from '../core/bomber/game';
import { TICK_MS } from '../core/random';
import {
  type EndlessState as RunnerState,
  stepEndlessRunner as stepRunner,
} from '../core/runner/endless';
export function RunnerCanvas({
  state,
  paused,
  onTick,
  send,
  playerId = 'single',
}: {
  state: RunnerState;
  paused: boolean;
  onTick: () => void;
  send?: (input: BomberInput) => void;
  playerId?: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    current = useRef({ state, paused, onTick, send });
  current.current = { state, paused, onTick, send };
  useEffect(() => {
    let disposed = false,
      game: import('phaser').Game | undefined;
    Promise.all([import('phaser'), import('../games/runner/scene')]).then(
      ([{ default: Phaser }, { RunnerScene }]) => {
        if (disposed || !host.current) return;
        let elapsed = 0;
        const scene = new RunnerScene(
          () => current.current.state,
          playerId,
          (delta, input) => {
            const { state, paused, onTick, send } = current.current;
            if (paused || state.status !== 'playing') return true;
            elapsed += Math.min(delta, 250);
            const consumed = elapsed >= TICK_MS;
            while (elapsed >= TICK_MS) {
              if (send) send(input);
              else stepRunner(state, { single: input });
              elapsed -= TICK_MS;
            }
            if (consumed) onTick();
            return consumed;
          },
          () => {
            if (host.current) host.current.dataset.ready = 'true';
          },
        );
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: host.current,
          width: 896,
          height: 480,
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
  }, [playerId]);
  return (
    <div
      ref={host}
      className="game-canvas runner-canvas"
      role="img"
      aria-label="러닝 게임 코스"
    />
  );
}
