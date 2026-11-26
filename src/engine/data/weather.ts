import type { WeatherCard } from '../types';

export const WEATHER: WeatherCard[] = [
  { id: 'w-recession', title: '불황의 바람', effect: { asset: -1 } },
  { id: 'w-boom', title: '풍년', effect: { asset: 1 } },
  { id: 'w-festival', title: '산마루 축제', effect: { happy: 1 } },
  { id: 'w-snow', title: '폭설', effect: { stamina: -2 } },
  { id: 'w-spring', title: '봄바람', effect: { stamina: 1 } },
  { id: 'w-fog', title: '짙은 안개', effect: { network: -1 } },
  { id: 'w-meet', title: '길손의 모임', effect: { network: 1 } },
  { id: 'w-lesson', title: '떠돌이 스승', effect: { growth: 1 } },
];
