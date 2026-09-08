import { DurableObject } from 'cloudflare:workers';
import {
  type BomberInput,
  createBomber,
  stepBomber,
} from '../../core/bomber/game';
import { TICK_MS } from '../../core/random';
import {
  createEndlessRunner,
  rankEndlessRunners,
  stepEndlessRunner,
} from '../../core/runner/endless';
import { isGame, isObject } from '../../shared/contracts';
import { rulesForGame } from '../../shared/game-rules';
import {
  IDLE_MS,
  parseCommand,
  RECONNECT_MS,
  type RoomView,
} from '../../shared/room';
import type { Env } from '../env';
import { body, HttpError, json } from '../http';
import { checkJoin, checkStart } from './rules';

interface Attachment {
  id: string;
  seq: number;
  window: number;
  count: number;
}
function attachment(ws: WebSocket): Attachment {
  const a: unknown = ws.deserializeAttachment();
  if (
    !isObject(a) ||
    typeof a.id !== 'string' ||
    typeof a.seq !== 'number' ||
    typeof a.window !== 'number' ||
    typeof a.count !== 'number'
  )
    throw Error('연결 정보를 확인할 수 없습니다.');
  return { id: a.id, seq: a.seq, window: a.window, count: a.count };
}
export class GameRoom extends DurableObject<Env> {
  private room: RoomView | null = null;
  private loop: ReturnType<typeof setInterval> | undefined;
  private inputs: Record<string, { value: BomberInput; at: number }> = {};
  private expiresAt = 0;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomView>('room')) ?? null;
      if (this.room && !this.room.rulesVersion)
        this.room.rulesVersion =
          this.room.state?.kind === 'runner'
            ? this.room.state.course.rulesVersion
            : this.room.state?.kind === 'bomber'
              ? this.room.state.map.rulesVersion
              : rulesForGame(this.room.game);
      if (
        this.room?.state?.kind === 'runner' &&
        this.room.state.course.rulesVersion !== rulesForGame('runner')
      )
        this.room.state = null;
      this.expiresAt = (await ctx.storage.get<number>('expiresAt')) ?? 0;
      if (
        this.room &&
        (this.room.phase === 'playing' || this.room.phase === 'countdown')
      )
        await this.finish(true);
    });
  }
  private async persist() {
    await this.ctx.storage.put({ room: this.room, expiresAt: this.expiresAt });
  }
  private send() {
    if (!this.room) return;
    const data = JSON.stringify({ type: 'room', room: this.room });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        /* 닫힌 소켓은 close 이벤트에서 정리한다. */
      }
    }
  }
  private error(ws: WebSocket, message: string) {
    try {
      ws.send(JSON.stringify({ type: 'error', error: message }));
    } catch {
      /* 이미 닫힌 연결 */
    }
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const path = new URL(request.url).pathname;
      const id = request.headers.get('X-Player-Id'),
        encodedName = request.headers.get('X-Player-Name');
      if (!id || !encodedName) throw new HttpError(401, '세션이 필요합니다.');
      const name = decodeURIComponent(encodedName);
      if (path === '/create') {
        if (this.room)
          throw new HttpError(409, '초대 코드를 다시 발급해 주세요.');
        const data = await body(request);
        if (!isGame(data.game) || typeof data.code !== 'string')
          throw new HttpError(400, '게임을 선택해 주세요.');
        this.room = {
          code: data.code,
          rulesVersion: rulesForGame(data.game),
          game: data.game,
          hostId: id,
          members: [],
          phase: 'waiting',
          seed: crypto.getRandomValues(new Uint32Array(1))[0] ?? 1,
          matchId: null,
          startedAt: 0,
          state: null,
          results: [],
          saved: false,
          notice: '',
        };
        this.expiresAt = Date.now() + IDLE_MS;
      }
      const room = this.room;
      if (!room) throw new HttpError(404, '초대 코드를 찾을 수 없습니다.');
      this.expireMembers();
      if (path === '/create' || path === '/join') {
        checkJoin(room, id, Date.now());
        if (!room.members.some((m) => m.id === id && !m.left)) {
          room.members = room.members.filter((m) => !m.left);
          const slot =
            [0, 1, 2, 3].find((n) => !room.members.some((m) => m.slot === n)) ??
            0;
          room.members.push({
            id,
            name,
            slot,
            ready: false,
            connected: false,
            disconnectedAt: Date.now(),
            left: false,
          });
        }
        this.expiresAt = Date.now() + IDLE_MS;
        await this.persist();
        await this.schedule();
        this.send();
        return json(room, path === '/create' ? 201 : 200);
      }
      if (path === '/leave' && request.method === 'POST') {
        this.remove(id);
        await this.persist();
        this.send();
        await this.schedule();
        return json({ left: true });
      }
      const member = room.members.find((m) => m.id === id && !m.left);
      if (!member) throw new HttpError(403, '먼저 이 방에 참가해 주세요.');
      if (path === '/view') return json(room);
      if (path === '/ws' && request.headers.get('Upgrade') === 'websocket') {
        checkJoin(room, id, Date.now());
        for (const previous of this.ctx.getWebSockets(id))
          previous.close(4001, '다른 탭에서 연결했습니다.');
        const pair = new WebSocketPair(),
          client = pair[0],
          server = pair[1];
        this.ctx.acceptWebSocket(server, [id]);
        server.serializeAttachment({
          id,
          seq: 0,
          window: Date.now(),
          count: 0,
        });
        member.connected = true;
        member.disconnectedAt = null;
        await this.persist();
        this.send();
        await this.schedule();
        return new Response(null, { status: 101, webSocket: client });
      }
      throw new HttpError(404, '방 요청을 확인해 주세요.');
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : '방 연결 오류' },
        e instanceof HttpError ? e.status : 400,
      );
    }
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      if (
        typeof message !== 'string' ||
        new TextEncoder().encode(message).length > 512
      ) {
        ws.close(1009, '메시지가 너무 큽니다.');
        return;
      }
      const a = attachment(ws),
        now = Date.now();
      if (now - a.window >= 1000) {
        a.window = now;
        a.count = 0;
      }
      a.count++;
      if (a.count > 40) {
        ws.close(1008, '입력 빈도를 초과했습니다.');
        return;
      }
      ws.serializeAttachment(a);
      const command = parseCommand(JSON.parse(message));
      const room = this.room,
        member = room?.members.find((m) => m.id === a.id && !m.left);
      if (!room || !member || !member.connected)
        throw Error('방 참가 상태를 확인해 주세요.');
      if (command.type === 'input') {
        if (room.phase !== 'playing' || command.seq <= a.seq) return;
        a.seq = command.seq;
        ws.serializeAttachment(a);
        this.inputs[a.id] = { value: command.input, at: now };
        return;
      }
      if (command.type === 'ready') {
        if (room.phase !== 'waiting')
          throw Error('대기실에서 준비할 수 있습니다.');
        member.ready = command.ready;
      }
      if (command.type === 'start') {
        checkStart(room, a.id);
        room.members = room.members
          .filter((m) => !m.left)
          .sort((a, b) => a.slot - b.slot);
        room.phase = 'countdown';
        room.rulesVersion = rulesForGame(room.game);
        room.matchId = crypto.randomUUID();
        room.startedAt = Date.now() + 2000;
        room.state =
          room.game === 'bomber'
            ? createBomber(
                room.seed,
                1,
                room.members.map((m) => m.id),
                true,
              )
            : createEndlessRunner(
                room.seed,
                room.members.map((m) => m.id),
                true,
              );
        room.results = [];
        room.saved = false;
        room.notice = '모두 같은 시각에 시작합니다.';
        this.inputs = {};
        await this.persist();
        this.loop = setInterval(() => this.tick(), TICK_MS);
      }
      if (command.type === 'rematch') {
        if (a.id !== room.hostId || room.phase !== 'ended' || !room.saved)
          throw Error('결과 저장 후 방장만 재대결을 열 수 있습니다.');
        room.phase = 'waiting';
        room.state = null;
        room.matchId = null;
        room.results = [];
        room.saved = false;
        room.notice = '전원이 다시 준비하면 시작할 수 있어요.';
        room.members = room.members.filter((m) => !m.left);
        for (const m of room.members) m.ready = false;
        if (!command.sameMap)
          room.seed =
            (room.seed + 1 + Math.floor(Math.random() * 4294967294)) >>> 0;
        this.expiresAt = Date.now() + IDLE_MS;
      }
      await this.persist();
      await this.schedule();
      this.send();
    } catch (e) {
      this.error(
        ws,
        e instanceof Error ? e.message : '올바른 입력이 아닙니다.',
      );
    }
  }
  async webSocketClose(ws: WebSocket) {
    const a = attachment(ws);
    const member = this.room?.members.find((m) => m.id === a.id);
    // 교체된 이전 소켓의 close 이벤트가 새 연결을 끊지 않도록 구분한다.
    if (
      member &&
      this.ctx.getWebSockets(a.id).filter((s) => s !== ws && s.readyState === 1)
        .length === 0
    ) {
      member.connected = false;
      member.ready = false;
      member.disconnectedAt = Date.now();
      delete this.inputs[a.id];
      await this.persist();
      this.send();
      await this.schedule();
    }
  }
  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }
  private remove(id: string) {
    const room = this.room;
    if (!room) return;
    const member = room.members.find((m) => m.id === id);
    if (!member) return;
    member.left = true;
    member.connected = false;
    member.ready = false;
    delete this.inputs[id];
    const player = room.state?.players.find((p) => p.id === id);
    if (player) player.alive = false;
    for (const ws of this.ctx.getWebSockets(id))
      ws.close(1000, '방에서 나갔습니다.');
    if (room.hostId === id)
      room.hostId =
        room.members.find((m) => !m.left && m.connected)?.id ??
        room.members.find((m) => !m.left)?.id ??
        '';
  }
  private expireMembers() {
    const now = Date.now();
    for (const member of this.room?.members ?? [])
      if (
        !member.left &&
        member.disconnectedAt !== null &&
        now - member.disconnectedAt >= RECONNECT_MS
      )
        this.remove(member.id);
  }
  private tick() {
    const room = this.room;
    if (!room?.state) return;
    this.expireMembers();
    const elapsed = Date.now() - room.startedAt;
    if (elapsed < 0) return;
    room.phase = 'playing';
    const target = Math.floor(elapsed / TICK_MS);
    if (target - room.state.tick > 100) {
      void this.finish(true);
      return;
    }
    while (room.state.tick < target && room.state.status === 'playing') {
      const inputs: Record<string, BomberInput> = {};
      for (const [id, input] of Object.entries(this.inputs))
        if (Date.now() - input.at < 250) inputs[id] = input.value;
      if (room.state.kind === 'bomber') stepBomber(room.state, inputs);
      else stepEndlessRunner(room.state, inputs);
    }
    if (room.state.status !== 'playing') {
      void this.finish(false);
      return;
    }
    if (room.state.tick % 2 === 0) this.send();
  }
  private async finish(aborted: boolean) {
    if (this.loop) {
      clearInterval(this.loop);
      this.loop = undefined;
    }
    const room = this.room;
    if (!room || room.phase === 'ended') return;
    room.phase = 'ended';
    room.notice = aborted
      ? '서버 실행이 중단되어 승패 없이 종료했습니다.'
      : '친선 경기가 끝났어요.';
    const runnerRanks =
      room.state?.kind === 'runner' ? rankEndlessRunners(room.state) : null;
    room.results = room.members.map((m) => {
      const p = room.state?.players.find((p) => p.id === m.id);
      const win = room.state?.winners.includes(m.id) ?? false;
      const draw = room.state?.status === 'draw';
      return {
        playerId: m.id,
        name: m.name,
        rank: aborted
          ? 1
          : (runnerRanks?.find((r) => r.id === m.id)?.rank ??
            (draw ? 1 : win ? 1 : 2)),
        score: p?.score ?? 0,
        distance: p && 'distance' in p ? p.distance : null,
        outcome: aborted
          ? 'aborted'
          : draw && (!runnerRanks || win)
            ? 'draw'
            : win
              ? 'win'
              : 'loss',
      };
    });
    await this.persist();
    this.send();
    await this.saveResult();
  }
  private async saveResult() {
    const room = this.room;
    if (!room?.matchId || room.saved) return;
    try {
      await this.env.DB.batch([
        this.env.DB.prepare(
          'INSERT OR IGNORE INTO matches(id,game,seed,rules_version,ended_at,status) VALUES(?,?,?,?,?,?)',
        ).bind(
          room.matchId,
          room.game,
          room.seed,
          room.rulesVersion ?? rulesForGame(room.game),
          Date.now(),
          room.results.some((r) => r.outcome === 'aborted')
            ? 'aborted'
            : 'finished',
        ),
        ...room.results.map((r) =>
          this.env.DB.prepare(
            'INSERT OR IGNORE INTO match_results(match_id,player_id,rank,score,outcome,distance) VALUES(?,?,?,?,?,?)',
          ).bind(
            room.matchId,
            r.playerId,
            r.rank,
            r.score,
            r.outcome,
            r.distance ?? null,
          ),
        ),
      ]);
      room.saved = true;
      await this.persist();
      this.send();
      await this.schedule();
    } catch {
      room.notice = '결과 저장을 다시 시도하고 있습니다.';
      this.send();
      await this.ctx.storage.setAlarm(Date.now() + 5000);
    }
  }
  private async schedule() {
    const room = this.room;
    if (!room) return;
    const deadlines = room.members
      .filter((m) => !m.left && m.disconnectedAt !== null)
      .map((m) => (m.disconnectedAt ?? Date.now()) + RECONNECT_MS);
    if (room.phase === 'ended' && !room.saved)
      deadlines.push(Date.now() + 5000);
    if (room.members.every((m) => m.left)) deadlines.push(Date.now() + 1000);
    deadlines.push(
      room.phase === 'playing' || room.phase === 'countdown'
        ? room.startedAt + (room.game === 'runner' ? 210000 : 120000)
        : this.expiresAt,
    );
    await this.ctx.storage.setAlarm(
      Math.max(Date.now() + 1000, Math.min(...deadlines)),
    );
  }
  async alarm() {
    if (!this.room) return;
    this.expireMembers();
    if (
      this.room.members.every((m) => m.left) &&
      (this.room.phase === 'playing' || this.room.phase === 'countdown')
    )
      await this.finish(true);
    if (this.room.phase === 'ended' && !this.room.saved) {
      await this.saveResult();
      return;
    }
    if (
      this.room.members.every((m) => m.left) ||
      (Date.now() >= this.expiresAt &&
        this.room.phase !== 'playing' &&
        this.room.phase !== 'countdown')
    ) {
      if (this.loop) {
        clearInterval(this.loop);
        this.loop = undefined;
      }
      for (const ws of this.ctx.getWebSockets())
        ws.close(1000, '방이 만료되었습니다.');
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    await this.persist();
    this.send();
    await this.schedule();
  }
}
