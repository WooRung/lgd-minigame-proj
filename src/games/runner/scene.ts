import Phaser from 'phaser';
import type { BomberInput } from '../../core/bomber/game';
import { platformHeight } from '../../core/runner/course';
import type { RunnerState } from '../../core/runner/game';
import { COLORS } from '../bomber/scene';
export class RunnerScene extends Phaser.Scene {
  private graphics?: Phaser.GameObjects.Graphics;
  private jump?: Phaser.Input.Keyboard.Key;
  private up?: Phaser.Input.Keyboard.Key;
  private down?: Phaser.Input.Keyboard.Key;
  private queued = false;
  private cameraX = 0;
  constructor(
    private getState: () => RunnerState,
    private playerId: string,
    private onFrame: (delta: number, input: BomberInput) => boolean,
    private onReady: () => void = () => {},
  ) {
    super('runner');
  }
  create() {
    this.graphics = this.add.graphics();
    const k = this.input.keyboard;
    if (k) {
      this.jump = k.addKey('SPACE');
      this.up = k.addKey('UP');
      this.down = k.addKey('DOWN');
      k.on('keydown-SPACE', () => {
        this.queued = true;
      });
    }
    this.onReady();
  }
  update(_time: number, delta: number) {
    const consumed = this.onFrame(delta, {
      dx: 0,
      dy: this.up?.isDown ? -1 : this.down?.isDown ? 1 : 0,
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
  private draw(s: RunnerState) {
    const g = this.graphics;
    if (!g) return;
    g.clear();
    const camera = this.cameraX;
    g.fillStyle(0xb7e4e0);
    g.fillRect(0, 0, 896, 480);
    g.fillStyle(0xffefb2);
    g.fillCircle(746, 64, 30);
    for (let i = -1; i < 5; i++) {
      const x = i * 300 - ((camera * 0.12) % 300);
      g.fillStyle(0x8cbeb1);
      g.fillEllipse(x + 80, 260, 360, 240);
      g.fillStyle(0x6ea794);
      g.fillEllipse(x + 220, 300, 280, 230);
      g.fillStyle(0xeff8eb);
      g.fillRoundedRect(x + 50, 70 + (i % 2) * 25, 80, 18, 9);
    }
    for (const lane of [0, 1] as const) {
      const ground = lane === 0 ? 278 : 420;
      g.fillStyle(lane === 0 ? 0x827257 : 0x596c50);
      g.fillRect(0, ground, 896, lane === 0 ? 60 : 60);
      g.fillStyle(lane === 0 ? 0x87b856 : 0x589365);
      g.fillRect(0, ground, 896, 12);
      for (const o of s.course.obstacles.filter((o) => o.lane === lane)) {
        const x = o.x - camera;
        if (x > 930 || x + o.width < 0) continue;
        if (o.kind === 'gap') {
          g.fillStyle(0xb7e4e0);
          g.fillRect(x, ground, o.width, 60);
          g.fillStyle(0x426e69);
          g.fillRect(x, ground + 45, o.width, 15);
        } else {
          g.fillStyle(0xa96045);
          g.fillRoundedRect(x, ground - o.height, o.width, o.height, 4);
          g.fillStyle(0xe29d64);
          g.fillRoundedRect(x, ground - o.height, o.width, 8, 3);
          g.lineStyle(3, 0xf1bf83);
          g.lineBetween(
            x + 8,
            ground - 8,
            x + o.width - 8,
            ground - o.height + 8,
          );
        }
      }
      for (const p of s.course.platforms.filter((p) => p.lane === lane)) {
        const x = p.x - camera,
          y = ground - platformHeight(p, s.tick);
        if (x > 950 || x + p.width < 0) continue;
        g.fillStyle(0xd4ad65);
        g.fillRoundedRect(x, y, p.width, 10, 4);
        g.lineStyle(2, 0x89764f);
        g.lineBetween(x + 8, y + 10, x + 8, ground + 30);
      }
      for (const f of s.course.forks) {
        const x = f.start - camera;
        if (x > 920 || x + 500 < 0) continue;
        g.lineStyle(2, 0xe8e9aa, 0.8);
        g.lineBetween(x, ground - 10, x + 500, ground - 10);
        g.fillStyle(0xffe08c);
        g.fillTriangle(
          x + 20,
          ground - 20,
          x + 35,
          ground - 30,
          x + 35,
          ground - 10,
        );
      }
      const me = s.players.find((p) => p.id === this.playerId);
      for (const c of s.course.coins.filter(
        (c) => c.lane === lane && !me?.collected.includes(c.id),
      )) {
        const x = c.x - camera,
          y = ground - c.y;
        if (x > 930 || x < -30) continue;
        g.fillStyle(0xf6c95b);
        g.fillTriangle(x, y - 11, x + 9, y, x, y + 11);
        g.fillTriangle(x, y - 11, x - 9, y, x, y + 11);
      }
      const finish = s.course.length - camera;
      if (finish < 940) {
        g.lineStyle(4, 0xfff9e9);
        g.lineBetween(finish, ground, finish, ground - 110);
        for (let row = 0; row < 4; row++)
          for (let col = 0; col < 4; col++) {
            g.fillStyle((row + col) % 2 ? 0x283f37 : 0xfff9e9);
            g.fillRect(finish + col * 10, ground - 110 + row * 10, 10, 10);
          }
      }
    }
    s.players.forEach((p, i) => {
      const x = p.x - camera,
        y = (p.lane === 0 ? 278 : 420) - p.y - 20 - i * 3;
      if (x < -50 || x > 950) return;
      g.fillStyle(0x284d38, 0.2);
      g.fillEllipse(x, (p.lane === 0 ? 278 : 420) - 2, 32, 8);
      g.fillStyle(
        p.alive ? (COLORS[i] ?? 0x168577) : 0x8c9c8a,
        p.alive ? 1 : 0.5,
      );
      g.fillRoundedRect(x - 14, y - 18, 28, 34, 9);
      g.fillStyle(0xfff9e9, p.alive ? 1 : 0.6);
      g.fillRoundedRect(x - 11, y - 10, 22, 22, 6);
      g.lineStyle(3, 0x243e37);
      g.lineBetween(x - 4, y - 3, x - 4, y + 3);
      g.lineBetween(x + 4, y - 3, x + 4, y + 3);
      g.lineStyle(5, 0x243e37);
      const swing = p.grounded ? Math.sin(s.tick * 0.9) * 5 : 4;
      g.lineBetween(x - 6, y + 16, x - 7 - swing, y + 21);
      g.lineBetween(x + 6, y + 16, x + 7 + swing, y + 21);
      if (p.boost > 0) {
        g.lineStyle(3, 0xffe18f);
        g.lineBetween(x - 33, y, x - 22, y);
        g.lineBetween(x - 38, y + 9, x - 22, y + 9);
      }
    });
  }
}
