import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { json } from '../http';
export class GameRoom extends DurableObject<Env> {
  async fetch() {
    return json({ error: '대전은 준비 중입니다.' }, 501);
  }
}
