import { RECONNECT_MS, type RoomView } from '../../shared/room';
import { HttpError } from '../http';
export function checkJoin(room: RoomView, id: string, now: number) {
  if (room.phase === 'closed')
    throw new HttpError(410, '종료된 방입니다. 새 방을 만들어 주세요.');
  const member = room.members.find((m) => m.id === id && !m.left);
  if (member) {
    if (
      member.disconnectedAt !== null &&
      now - member.disconnectedAt >= RECONNECT_MS
    )
      throw new HttpError(410, '재접속 유예가 끝났습니다.');
    return;
  }
  if (room.phase !== 'waiting')
    throw new HttpError(409, '이미 시작한 경기에는 새로 참가할 수 없습니다.');
  if (room.members.filter((m) => !m.left).length >= 4)
    throw new HttpError(
      409,
      '방이 가득 찼습니다. 최대 4명까지 참가할 수 있어요.',
    );
}
export function checkStart(room: RoomView, id: string) {
  if (id !== room.hostId)
    throw new HttpError(403, '방장만 시작할 수 있습니다.');
  if (room.phase !== 'waiting')
    throw new HttpError(409, '대기 중인 방만 시작할 수 있습니다.');
  const members = room.members.filter((m) => !m.left);
  if (
    members.length < 2 ||
    members.length > 4 ||
    members.some((m) => !m.connected || !m.ready)
  )
    throw new HttpError(
      409,
      '2~4명 전원이 연결하고 준비해야 시작할 수 있습니다.',
    );
}
