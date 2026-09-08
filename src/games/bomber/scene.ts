import Phaser from 'phaser';
import { type BomberInput, type BomberState } from '../../core/bomber/game';
import { HEIGHT, index, WIDTH } from '../../core/bomber/map';
export const COLORS = [0xef7045, 0x168577, 0x537bd1, 0xba69a6];
export class BomberScene extends Phaser.Scene {
  private actionQueued = false;
  private displayPositions = new Map<string, { x: number; y: number }>();
  private frameDelta = 16;
  private graphics?: Phaser.GameObjects.Graphics;
  private keys?: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    action: Phaser.Input.Keyboard.Key;
  };
  constructor(
    private getState: () => BomberState,
    private onFrame: (delta: number, input: BomberInput) => boolean,
    private onReady: () => void = () => {},
  ) {
    super('bomber');
  }
  create() {
    this.graphics = this.add.graphics();
    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.on('keydown-SPACE', () => {
        this.actionQueued = true;
      });
      this.keys = {
        left: keyboard.addKey('LEFT'),
        right: keyboard.addKey('RIGHT'),
        up: keyboard.addKey('UP'),
        down: keyboard.addKey('DOWN'),
        action: keyboard.addKey('SPACE'),
      };
    }
    this.onReady();
  }
  update(_time: number, delta: number) {
    this.frameDelta = delta;
    const k = this.keys;
    const consumed = this.onFrame(delta, {
      dx: k?.left.isDown ? -1 : k?.right.isDown ? 1 : 0,
      dy: k?.up.isDown ? -1 : k?.down.isDown ? 1 : 0,
      action: this.actionQueued || (k?.action.isDown ?? false),
    });
    if (consumed) this.actionQueued = false;
    this.draw(this.getState());
  }
  private draw(s: BomberState) {
    const g = this.graphics;
    if (!g) return;
    g.clear();
    const t = 56,
      ox = 12,
      oy = 12;
    for (let y = 0; y < HEIGHT; y++)
      for (let x = 0; x < WIDTH; x++) {
        const px = ox + x * t,
          py = oy + y * t,
          tile = s.map.tiles[index(x, y)];
        g.fillStyle((x + y) % 2 === 0 ? 0x88b866 : 0x7cae5e);
        g.fillRect(px, py, t, t);
        if (tile === 1) {
          g.fillStyle(0x567b70);
          g.fillRoundedRect(px + 3, py + 6, t - 6, t - 8, 5);
          g.fillStyle(0x97ada2);
          g.fillRoundedRect(px + 3, py + 2, t - 6, t - 10, 5);
          g.lineStyle(3, 0xbbcdc1);
          g.lineBetween(px + 10, py + 9, px + t - 10, py + 9);
        }
        if (tile === 2) {
          g.fillStyle(0x966639);
          g.fillRoundedRect(px + 5, py + 7, t - 10, t - 10, 3);
          g.fillStyle(0xcb9554);
          g.fillRect(px + 5, py + 3, t - 10, t - 12);
          g.lineStyle(4, 0xe7bd80);
          g.strokeRect(px + 10, py + 8, t - 20, t - 22);
          g.lineBetween(px + 12, py + t - 16, px + t - 12, py + 12);
        }
      }
    if (s.mode === 'single') {
      g.lineStyle(4, 0xfff1ab);
      g.strokeCircle(
        ox + s.map.exit.x * t + t / 2,
        oy + s.map.exit.y * t + t / 2,
        17,
      );
    }
    for (const h of s.map.hazards) {
      g.fillStyle(s.tick % 80 >= 60 ? 0xee603c : 0xcbb96b);
      g.fillTriangle(
        ox + h.x * t + 12,
        oy + h.y * t + 42,
        ox + h.x * t + 28,
        oy + h.y * t + 12,
        ox + h.x * t + 44,
        oy + h.y * t + 42,
      );
    }
    for (const item of s.map.items) {
      g.fillStyle(0xffda65);
      const x = ox + item.x * t + 28,
        y = oy + item.y * t + 28;
      g.fillTriangle(x, y - 14, x + 14, y, x, y + 14);
      g.fillTriangle(x, y - 14, x - 14, y, x, y + 14);
    }
    for (const f of s.flames) {
      g.fillStyle(0xf18b34);
      g.fillRoundedRect(ox + f.x * t + 1, oy + f.y * t + 1, t - 2, t - 2, 14);
      g.fillStyle(0xffe17e);
      g.fillRoundedRect(
        ox + f.x * t + 10,
        oy + f.y * t + 10,
        t - 20,
        t - 20,
        10,
      );
    }
    for (const b of s.bombs) {
      const x = ox + b.x * t + 28,
        y = oy + b.y * t + 29;
      g.fillStyle(0x233f45);
      g.fillCircle(x, y, 17 + (b.fuse % 8 < 4 ? 1 : 0));
      g.fillStyle(0x587074);
      g.fillCircle(x - 5, y - 6, 5);
      g.lineStyle(3, 0xffe092);
      g.lineBetween(x + 5, y - 15, x + 9, y - 24);
      g.fillStyle(0xffe092);
      g.fillCircle(x + 9, y - 24, 4);
    }
    for (const e of s.map.enemies) {
      const x = ox + e.x * t + 28,
        y = oy + e.y * t + 28;
      g.fillStyle(0x746295);
      g.fillRoundedRect(x - 16, y - 15, 32, 32, 10);
      g.fillStyle(0xfff3d2);
      g.fillCircle(x - 6, y - 2, 4);
      g.fillCircle(x + 6, y - 2, 4);
    }
    s.players.forEach((p, i) => {
      const display = this.displayPositions.get(p.id) ?? { x: p.x, y: p.y };
      const factor = Math.min(1, this.frameDelta / 60);
      display.x += (p.x - display.x) * factor;
      display.y += (p.y - display.y) * factor;
      this.displayPositions.set(p.id, display);
      const x = ox + display.x * t + 28,
        y = oy + display.y * t + 27;
      g.fillStyle(0x244c39, 0.2);
      g.fillEllipse(x, y + 19, 35, 12);
      g.fillStyle(
        p.alive ? (COLORS[i] ?? 0xef7045) : 0x9caba0,
        p.alive ? 1 : 0.55,
      );
      g.fillRoundedRect(x - 17, y - 20, 34, 39, 10);
      g.fillStyle(0xfff9e9, p.alive ? 1 : 0.6);
      g.fillRoundedRect(x - 12, y - 12, 24, 24, 6);
      g.lineStyle(3, 0x243e37);
      g.lineBetween(x - 5, y - 5, x - 5, y + 1);
      g.lineBetween(x + 5, y - 5, x + 5, y + 1);
      g.lineStyle(6, 0x243e37);
      g.lineBetween(x - 9, y + 19, x - 9, y + 24);
      g.lineBetween(x + 9, y + 19, x + 9, y + 24);
    });
  }
}
