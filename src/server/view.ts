import type { GameState } from '../engine';
import { goalCompletion, goalLabel, staminaCapFor } from '../engine';
import type { GoalView, PlayerView, StateView } from '../shared/protocol';
import type { Seat } from './room';

export function goalViews(s: GameState): GoalView[] {
  return s.goals.map((g) =>
    g.kind === 'stat'
      ? { label: goalLabel(g), kind: 'stat', stat: g.stat, target: g.target }
      : { label: goalLabel(g), kind: 'condition' },
  );
}

/** 보는 사람(viewer)에 맞춰 정보를 가린 상태 스냅샷 */
export function stateView(s: GameState, seats: Seat[], viewer: number): StateView {
  const me = s.players[viewer]!;
  const players: PlayerView[] = s.players.map((p) => {
    const seat = seats[p.id]!;
    const sameTeam = s.config.teams && p.team === me.team;
    const exact = p.id === viewer || !!sameTeam || s.finished;
    const completion = s.goals.map((g) => {
      const c = goalCompletion(p, g);
      return exact ? c : Math.floor(c * 10) / 10;
    });
    return {
      id: p.id,
      name: seat.name,
      avatar: seat.avatar,
      team: p.team,
      isBot: seat.kind === 'bot',
      connected: seat.kind === 'bot' || seat.connected,
      pos: p.pos,
      stamina: p.stamina,
      staminaCap: Math.min(s.tuning.maxStamina, staminaCapFor(s.tuning.staminaCap, s.board.tiles[p.pos]!.zone)),
      cp: p.cp,
      life: { ...p.life },
      arrived: p.arrived,
      arrivalRank: p.arrivalRank,
      stats: exact ? { ...p.stats } : null,
      completion,
      exact,
    };
  });
  return {
    round: s.round,
    current: s.current,
    countdownLeft: s.countdownLeft,
    finished: s.finished,
    players,
    pathSlots: { ...s.pathSlots },
    me: viewer,
  };
}
