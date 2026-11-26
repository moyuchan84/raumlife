import { DEFAULT_AVATAR, sanitizeAvatar, type Avatar } from '../shared/avatar';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { Room, type Hub } from '../server/room';

/**
 * 서버 없이 브라우저 안에서 도는 전송 계층.
 * 서버와 같은 Room(규칙 엔진, 봇, 결정 요청)을 그대로 사용하므로 게임 규칙·화면이 완전히 동일하다.
 * 사람은 한 명(나)이고 나머지는 컴퓨터다.
 */
export class LocalNet {
  onMsg: (m: ServerMsg) => void = () => {};
  onStatus: (online: boolean) => void = () => {};
  private session = 'local-player';
  private name = '손님';
  private avatar: Avatar = { ...DEFAULT_AVATAR };
  private room: Room | null = null;

  constructor(private getHello: () => ClientMsg) {}

  private hub: Hub = {
    send: (_session, msg) => {
      // 서버 통신처럼 비동기로 전달한다 (엔진이 재진입하지 않도록)
      queueMicrotask(() => this.onMsg(msg));
    },
  };
  private emit(msg: ServerMsg) {
    queueMicrotask(() => this.onMsg(msg));
  }

  connect() {
    this.onStatus(true);
    this.send(this.getHello());
  }

  send(m: ClientMsg) {
    switch (m.t) {
      case 'hello':
        this.name = String(m.name ?? '').trim().slice(0, 12) || '손님';
        if (m.avatar) this.avatar = sanitizeAvatar(m.avatar);
        this.emit({ t: 'welcome', session: this.session, name: this.name });
        if (!this.room) this.emit({ t: 'lobby', room: null });
        else this.room.join(this.session, this.name, this.avatar);
        return;
      case 'createRoom': {
        if (this.room) return;
        const room = new Room('LOCAL', this.hub, () => {
          this.room = null;
        });
        this.room = room;
        if (/[?&]fast/.test(location.search)) room.pace = 0.1; // 연출을 줄여 빠르게 (테스트용)
        room.join(this.session, this.name, this.avatar);
        return;
      }
      case 'joinRoom':
        this.emit({ t: 'error', message: '이 버전은 혼자 컴퓨터와 하는 단독 실행판이라 다른 방에 들어갈 수 없어요' });
        return;
      case 'leaveRoom': {
        const room = this.room;
        this.room = null;
        room?.leave(this.session);
        this.emit({ t: 'lobby', room: null });
        return;
      }
      default:
    }
    const room = this.room;
    if (!room) return;
    const err = (e: string | null | void) => e && this.emit({ t: 'error', message: e });
    switch (m.t) {
      case 'settings':
        err(room.configure(this.session, m.settings ?? {}));
        break;
      case 'avatar':
        this.avatar = sanitizeAvatar(m.avatar);
        room.setAvatar(this.session, this.avatar);
        break;
      case 'addBot':
        err(room.addBot(this.session, m.kind));
        break;
      case 'removeSeat':
        err(room.removeSeat(this.session, Number(m.seat)));
        break;
      case 'setTeam':
        room.setTeam(this.session, Number(m.seat), Number(m.team));
        break;
      case 'start':
        void room.start(this.session).then(err);
        break;
      case 'answer':
        room.answer(this.session, Number(m.id), m.value);
        break;
      case 'backToLobby':
        room.broadcastLobby();
        break;
      default:
    }
  }
}
