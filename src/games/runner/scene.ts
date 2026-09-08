import Phaser from 'phaser';
import type { BomberInput } from '../../core/bomber/game';
import type { EndlessState } from '../../core/runner/endless';
import {
  obstacleBottom,
  runnerHeight,
  runnerPlatformHeight,
} from '../../core/runner/physics';
import { type RunnerTheme, SEGMENT_LENGTH } from '../../core/runner/segments';
import { COLORS } from '../bomber/scene';

const GROUND = 378;
export class RunnerScene extends Phaser.Scene {
  private graphics?: Phaser.GameObjects.Graphics;
  private jump?: Phaser.Input.Keyboard.Key;
  private up?: Phaser.Input.Keyboard.Key;
  private down?: Phaser.Input.Keyboard.Key;
  private queued = false;
  private cameraX = 0;
  constructor(
    private getState: () => EndlessState,
    private playerId: string,
    private onFrame: (delta: number, input: BomberInput) => boolean,
    private onReady: () => void = () => {},
  ) {
    super('runner');
  }
  create() {
    this.graphics = this.add.graphics();
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.jump = keyboard.addKey('SPACE');
      this.up = keyboard.addKey('UP');
      this.down = keyboard.addKey('DOWN');
      keyboard.on('keydown-SPACE', () => {
        this.queued = true;
      });
      keyboard.on('keydown-UP', () => {
        this.queued = true;
      });
    }
    this.onReady();
  }
  update(_time: number, delta: number) {
    const consumed = this.onFrame(delta, {
      dx: 0,
      dy: this.down?.isDown ? 1 : this.up?.isDown ? -1 : 0,
      action: this.queued || (this.jump?.isDown ?? false),
    });
    if (consumed) this.queued = false;
    const state = this.getState();
    const me = state.players.find((p) => p.id === this.playerId);
    const target = me?.alive
      ? me
      : (state.players.filter((p) => p.alive).sort((a, b) => b.x - a.x)[0] ??
        me);
    const camera = Math.max(0, (target?.x ?? 0) - 160);
    if (state.tick < 3) this.cameraX = camera;
    else this.cameraX += (camera - this.cameraX) * Math.min(1, delta / 55);
    this.draw(state);
  }
  private background(theme: RunnerTheme) {
    const g = this.graphics;
    if (!g) return;
    const shift = (this.cameraX * 0.15) % 300;
    g.fillStyle(
      theme === 'cavern' ? 0x292b4b : theme === 'skyway' ? 0xc8e5f5 : 0xb7e4e0,
    );
    g.fillRect(0, 0, 896, 480);
    for (let i = -1; i < 5; i++) {
      const x = i * 300 - shift;
      if (theme === 'cavern') {
        g.fillStyle(0x444065);
        g.fillTriangle(x, 0, x + 90, 145, x + 155, 0);
        g.fillTriangle(x + 120, 0, x + 175, 80, x + 230, 0);
        g.fillStyle(0x786799);
        g.fillTriangle(x + 40, 350, x + 72, 245, x + 105, 350);
        g.fillStyle(0xa8d8e7);
        g.fillTriangle(x + 60, 305, x + 72, 257, x + 78, 305);
      } else if (theme === 'skyway') {
        g.fillStyle(0xf6fbff);
        g.fillEllipse(x + 100, 140 + (i % 2) * 30, 200, 65);
        g.fillStyle(0x91bddb);
        g.fillRoundedRect(x + 40, 300, 70, 180, 14);
        g.fillStyle(0xe9f6fb);
        g.fillRoundedRect(x + 25, 286, 100, 25, 8);
      } else {
        g.fillStyle(0x8cbeb1);
        g.fillEllipse(x + 80, 325, 360, 240);
        g.fillStyle(0x6ea794);
        g.fillEllipse(x + 220, 350, 280, 230);
        g.fillStyle(0xeff8eb);
        g.fillRoundedRect(x + 50, 80 + (i % 2) * 25, 80, 18, 9);
        g.fillStyle(0x467953);
        g.fillTriangle(x + 45, 335, x + 70, 245, x + 95, 335);
      }
    }
  }
  private draw(state: EndlessState) {
    const g = this.graphics;
    if (!g) return;
    g.clear();
    const camera = this.cameraX;
    const visible = state.course.segments.find(
      (s) => s.index === Math.floor((camera + 160) / SEGMENT_LENGTH),
    );
    this.background(visible?.theme ?? 'meadow');
    const me = state.players.find((p) => p.id === this.playerId);
    for (const segment of state.course.segments) {
      const left = segment.start - camera;
      if (left > 930 || left + SEGMENT_LENGTH < 0) continue;
      const groundColor =
        segment.theme === 'cavern'
          ? 0x655674
          : segment.theme === 'skyway'
            ? 0xba9d78
            : 0x827257;
      g.fillStyle(groundColor);
      g.fillRect(left, GROUND, SEGMENT_LENGTH, 102);
      g.fillStyle(
        segment.theme === 'meadow'
          ? 0x87b856
          : segment.theme === 'cavern'
            ? 0xa99bbd
            : 0xffecc0,
      );
      g.fillRect(left, GROUND, SEGMENT_LENGTH, 12);
      if (segment.theme === 'skyway') {
        g.lineStyle(2, 0x806951);
        for (
          let x = Math.max(left, Math.floor(camera / 40) * 40 - camera);
          x < Math.min(930, left + SEGMENT_LENGTH);
          x += 40
        )
          g.lineBetween(x, GROUND + 12, x, GROUND + 65);
      }
      for (const o of segment.obstacles) {
        const x = o.x - camera;
        if (x > 930 || x + o.width < 0) continue;
        if (o.kind === 'gap') {
          g.fillStyle(0x243b53);
          g.fillRect(x, GROUND, o.width, 102);
          g.lineStyle(3, 0xffd78a);
          g.lineBetween(x - 5, GROUND, x - 5, GROUND + 16);
          g.lineBetween(x + o.width + 5, GROUND, x + o.width + 5, GROUND + 16);
        } else {
          const bottom = obstacleBottom(o, state.tick);
          g.fillStyle(
            o.kind === 'ceiling'
              ? 0x62557c
              : o.kind === 'moving'
                ? 0xd27059
                : 0xa96045,
          );
          g.fillRoundedRect(
            x,
            GROUND - bottom - o.height,
            o.width,
            o.height,
            5,
          );
          g.fillStyle(o.kind === 'ceiling' ? 0xffd18a : 0xe8ba83);
          g.fillRect(x, GROUND - bottom - 6, o.width, 6);
          if (o.kind === 'ceiling') {
            g.fillTriangle(
              x + o.width / 2 - 8,
              GROUND - bottom - 32,
              x + o.width / 2 + 8,
              GROUND - bottom - 32,
              x + o.width / 2,
              GROUND - bottom - 19,
            );
          } else if (o.kind === 'moving') {
            g.fillStyle(0x3a3c50);
            g.fillCircle(x + 8, GROUND - bottom, 7);
            g.fillCircle(x + o.width - 8, GROUND - bottom, 7);
          } else {
            g.lineStyle(3, 0xf1bf83);
            g.lineBetween(
              x + 8,
              GROUND - 8,
              x + o.width - 8,
              GROUND - o.height + 8,
            );
          }
        }
      }
      for (const platform of segment.platforms) {
        const x = platform.x - camera,
          y = GROUND - runnerPlatformHeight(platform, state.tick);
        if (x > 930 || x + platform.width < 0) continue;
        g.fillStyle(0xe8bd64);
        g.fillRoundedRect(x, y, platform.width, 10, 4);
        g.fillStyle(0xffeac5);
        g.fillRect(x + 5, y, platform.width - 10, 3);
      }
      for (const coin of segment.coins) {
        const x = coin.x - camera,
          y = GROUND - coin.y;
        if (x > 930 || x < -30 || me?.collected.includes(coin.id)) continue;
        g.fillStyle(0xf6c95b);
        g.fillTriangle(x, y - 9, x + 8, y, x, y + 9);
        g.fillTriangle(x, y - 9, x - 8, y, x, y + 9);
      }
    }
    state.players.forEach((p, i) => {
      const x = p.x - camera,
        height = runnerHeight(p),
        foot = GROUND - p.y;
      if (x < -50 || x > 950) return;
      const mine = p.id === this.playerId;
      g.fillStyle(0x284d38, 0.2);
      g.fillEllipse(x, GROUND - 2, 32, 8);
      g.fillStyle(
        p.alive ? (COLORS[i] ?? 0x168577) : 0x8c9c8a,
        p.alive ? (mine ? 1 : 0.55) : 0.4,
      );
      g.fillRoundedRect(x - 12, foot - height, 24, height, 7);
      g.fillStyle(0xfff9e9, mine ? 1 : 0.6);
      g.fillRoundedRect(x - 9, foot - height + 4, 18, height - 9, 5);
      g.lineStyle(2, 0x243e37);
      g.lineBetween(x + 1, foot - height + 7, x + 1, foot - height + 11);
      g.lineBetween(x + 7, foot - height + 7, x + 7, foot - height + 11);
      if (mine) {
        g.fillStyle(0xef704a);
        g.fillTriangle(
          x - 6,
          foot - height - 15,
          x + 6,
          foot - height - 15,
          x,
          foot - height - 7,
        );
      }
    });
  }
}
