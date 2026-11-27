import type { CardDeck, CardOption, Cost, Effect, Gate, JourneyCard, Mood, Req, Scene, SceneBg, StatKey } from '../types';

type E = Effect;

/*
 * 카드는 모두 "그 나이에 실제로 겪는 일"이다. 카드마다 장면 그림이 있고, 상황(원인 포함)이 이야기로 나오며,
 * 서로 다른 대응 방식(돈, 인맥, 직접 부딪치기, 참기 …)을 고를 수 있다. 문구는 성별 역할을 가정하지 않는다.
 */

const sc = (bg: SceneBg, props: string, mood: Mood = 'neutral', others = ''): Scene => ({ bg, props, mood, ...(others ? { others } : {}) });

/** 결과가 정해진 선택지 */
const o = (label: string, text: string, effect: E, cost?: Cost, gate?: Gate): CardOption => ({
  label,
  ...(cost ? { cost } : {}),
  ...(gate ? { gate } : {}),
  win: { text, effect },
});
/** 주사위로 성공/실패가 갈리는 선택지 */
const r = (label: string, dc: number, stat: StatKey | undefined, text: string, effect: E, loseText: string, loseEffect: E, cost?: Cost, gate?: Gate): CardOption => ({
  label,
  roll: { dc, ...(stat ? { stat } : {}) },
  ...(cost ? { cost } : {}),
  ...(gate ? { gate } : {}),
  win: { text, effect },
  lose: { text: loseText, effect: loseEffect },
});
const J = (zone: number, title: string, scene: Scene, story: string, options: CardOption[], requires?: Req): JourneyCard => ({
  id: '',
  zone,
  title,
  scene,
  story,
  options,
  ...(requires ? { requires } : {}),
});

const KEYS = ['asset', 'happy', 'network', 'growth', 'stamina'] as const;
/** 피해를 절반으로 (올림) */
const half = (e: E): E => {
  const out: E = {};
  for (const k of KEYS) if (e[k]) out[k] = e[k]! < 0 ? Math.ceil(e[k]! / 2) : e[k]!;
  return out;
};
/** 피해를 1.5배로 (내림) */
const worse = (e: E): E => {
  const out: E = {};
  for (const k of KEYS) if (e[k]) out[k] = e[k]! < 0 ? Math.floor(e[k]! * 1.5) : e[k]!;
  return out;
};

interface TroubleSpec {
  /** 직접 부딪쳐 해결 (주사위, 체력 1) */
  tackle: string;
  /** 주변에 도움 요청 (어른은 인맥 3 이상 필요) */
  help: string;
  /** 돈으로 해결 [라벨, 비용] */
  pay?: [string, number];
  /** 직접 해결할 때 도움이 되는 스탯 */
  stat?: StatKey;
  /** 어린 나이: 보호자가 도와주므로 도움 요청에 조건이 없다 */
  kid?: boolean;
}
/**
 * 트러블: 원인이 있는 사건. 대응이 서로 다르다.
 * 견딘다 = 피해 그대로 / 부딪친다 = 주사위(성공하면 피하고 배움, 실패하면 더 아픔) / 도움 = 피해 절반+인맥 / 돈 = 피해 없음
 */
const T = (zone: number, title: string, scene: Scene, story: string, hit: E, spec: TroubleSpec, requires?: Req): JourneyCard =>
  J(
    zone,
    title,
    scene,
    story,
    [
      o('그냥 견딘다', '참고 넘겼지만 피해가 그대로 남았어요.', hit),
      r(spec.tackle, 4, spec.stat, '직접 부딪쳐 해결했어요! 오히려 배운 게 있어요.', { [spec.stat ?? 'growth']: 1 }, '해결하려다 일이 더 커졌어요.', worse(hit), { stamina: 1 }),
      o(spec.help, spec.kid ? '어른이 달려와 도와줬어요.' : '주변의 도움 덕분에 한결 가벼워졌어요.', { ...half(hit), network: 1 }, undefined, spec.kid ? undefined : { network: 3 }),
      ...(spec.pay ? [o(spec.pay[0], '돈으로 깔끔하게 정리했어요.', {}, { asset: spec.pay[1] })] : []),
    ],
    requires,
  );

interface ActSpec {
  join: string;
  friend: string;
  watch: string;
  stat?: StatKey;
}
/** 액티비티: 직접 참가(주사위) / 친구와 함께(인맥 2 이상, 더 쉬움) / 구경 */
const A = (zone: number, title: string, scene: Scene, story: string, win: E, spec: ActSpec): JourneyCard =>
  J(zone, title, scene, story, [
    r(spec.join, 3, spec.stat, '온 힘을 다해 참가했어요! 정말 즐거웠어요.', win, '아쉽게 잘 안 됐지만 즐거웠어요.', { happy: 1 }, { stamina: 2 }),
    r(spec.friend, 2, 'network', '친구와 함께라 훨씬 수월했어요!', { ...win, network: (win.network ?? 0) + 1 }, '손발이 안 맞았지만 같이 웃었어요.', { happy: 1 }, { stamina: 1 }, { network: 2 }),
    o(spec.watch, '구경하는 것만으로도 즐거웠어요.', { happy: 1 }),
  ]);

// ═════════ 여정 카드 (일상의 선택) ═════════
const JOURNEY: JourneyCard[] = [
  // ── 1 갓난아기~유아
  J(1, '첫 걸음마', sc('park', '🧸👣', 'happy', '👨‍👩‍👧'), '일어서 보려는데 다리가 후들거려요. 부모님이 두 팔을 벌리고 기다려요.', [
    o('부모님 손을 잡고 천천히 걷는다', '손을 꼭 잡고 한 걸음씩 걸었어요.', { growth: 1, happy: 1 }),
    r('혼자 힘으로 걸어 본다', 3, 'growth', '비틀비틀하지만 해냈어요! 모두 박수를 쳐요.', { growth: 3, happy: 2 }, '엉덩방아를 찧고 울음이 터졌어요.', { happy: -1 }, { stamina: 1 }),
    o('기어서 장난감까지 간다', '안전하게 기어서 도착했어요.', { stamina: 1, happy: 1 }),
  ]),
  J(1, '이유식 먹기', sc('kitchen', '🥣🥄', 'neutral', '🧑‍🍳'), '새로 시작한 이유식이에요. 처음 보는 초록색 음식이 낯설어요.', [
    o('한 입 먹어 본다', '낯선 맛이지만 먹어 봤어요.', { growth: 1, stamina: 1 }),
    r('스스로 숟가락을 잡아 본다', 3, 'growth', '엉망이 됐지만 혼자 먹었어요!', { growth: 3, happy: 1 }, '온통 쏟아 버렸어요.', { happy: -1 }),
    o('입을 꼭 다문다', '안 먹겠다고 버텼더니 배가 고파요.', { stamina: -1, happy: 1 }),
  ]),
  J(1, '그림책 읽는 시간', sc('home', '📖🧸', 'happy', '👨‍👧'), '잠자리에서 부모님이 그림책을 읽어 줘요.', [
    o('귀 기울여 듣는다', '이야기에 푹 빠졌어요.', { growth: 2 }),
    r('따라서 소리 내어 읽어 본다', 3, 'growth', '첫 낱말을 따라 했어요!', { growth: 3, happy: 2 }, '옹알이만 나왔어요.', {}),
    o('그냥 눈을 감고 잔다', '포근하게 잠들어 체력을 채웠어요.', { stamina: 2 }),
  ]),
  J(1, '낯선 아이를 만났어요', sc('playground', '🪣🧸', 'neutral', '🧒'), '놀이터에서 처음 보는 아이가 내 모래 장난감을 빤히 쳐다봐요.', [
    o('보호자 뒤에 숨는다', '조금 겁이 났지만 안전했어요.', { stamina: 1 }),
    r('먼저 손을 내밀어 본다', 4, 'network', '금세 친구가 됐어요!', { network: 3, happy: 1 }, '아이가 울어 버려 당황했어요.', { happy: -1 }),
    o('장난감을 나눠 준다', '장난감 덕분에 친해졌어요.', { network: 1, happy: 1 }),
  ]),
  // ── 2 초등
  J(2, '받아쓰기 시험', sc('school', '📝✏️', 'neutral', '👩‍🏫'), '내일은 받아쓰기 시험이에요. 오늘 저녁을 어떻게 보낼까요?', [
    r('밤늦게까지 외운다', 3, 'growth', '만점을 받았어요!', { growth: 3, happy: 1 }, '졸려서 오히려 다 틀렸어요.', { stamina: -1 }, { stamina: 1 }),
    o('조금만 보고 논다', '적당히 공부하고 신나게 놀았어요.', { growth: 1, happy: 1 }),
    o('친구와 서로 문제를 내 준다', '함께 외우며 더 친해졌어요.', { growth: 1, network: 1 }, undefined, { network: 2 }),
  ]),
  J(2, '용돈이 생겼어요', sc('market', '💰🍬', 'happy', '🧒'), '명절에 용돈을 받았어요. 문방구 앞을 지나가고 있어요.', [
    o('저금통에 모은다', '차곡차곡 모았어요.', { asset: 2 }),
    o('친구들과 간식을 사 먹는다', '맛있고 즐거웠어요.', { asset: -1, happy: 2, network: 1 }),
    r('문방구 뽑기에 도전한다', 4, undefined, '특별한 장난감이 나왔어요!', { asset: 1, happy: 3 }, '꽝이었어요.', { happy: -1 }, { asset: 1 }),
  ]),
  J(2, '반장 선거', sc('school', '🗳️🙋', 'neutral', '🧒🧒'), '새 학기에 반장을 뽑아요. 친구들이 나를 추천했어요.', [
    r('후보로 나선다', 4, 'network', '반장이 됐어요! 책임감이 생겨요.', { network: 3, growth: 1 }, '떨어졌지만 용기를 낸 게 뿌듯해요.', { happy: -1, growth: 1 }),
    o('친한 친구를 응원한다', '친구가 반장이 됐어요.', { network: 2 }),
    o('투표만 한다', '조용히 한 표를 던졌어요.', { growth: 1 }),
  ]),
  // ── 3 중등
  J(3, '학원 vs 동아리', sc('school', '📚🎸', 'neutral', '🧒'), '수업이 끝났어요. 학원에 갈지, 동아리에 갈지 고민이에요.', [
    o('학원에 간다', '성적이 조금 올랐지만 피곤해요.', { growth: 2, happy: -1 }),
    o('동아리에 간다', '친구들과 즐거웠어요.', { network: 2, happy: 1 }),
    r('둘 다 해 보려 한다', 4, 'growth', '힘들었지만 둘 다 해냈어요!', { growth: 2, network: 2 }, '지쳐서 둘 다 놓쳤어요.', { stamina: -1, happy: -1 }, { stamina: 1 }),
  ]),
  J(3, '사춘기, 부모님과의 대화', sc('home', '🗣️💬', 'sad', '🧑‍🧑‍🧒'), '요즘 방문을 닫고 지내요. 부모님이 대화를 청해요.', [
    o('솔직하게 이야기한다', '마음이 한결 가벼워졌어요.', { happy: 2, network: 1 }),
    o('"몰라도 돼요" 하고 방에 들어간다', '잠깐은 편했지만 서먹해졌어요.', { happy: -1, network: -1, stamina: 1 }),
    r('편지를 써서 전한다', 3, 'growth', '편지를 읽고 부모님이 눈시울을 붉혔어요.', { happy: 2, growth: 1, network: 1 }, '쑥스러워서 전하지 못했어요.', {}),
  ]),
  J(3, '수학여행', sc('park', '🚌🎒', 'happy', '🧒🧒'), '친구들과 함께 가는 첫 수학여행이에요. 밤에 숙소에서 무엇을 할까요?', [
    o('친구들과 밤새 이야기한다', '평생 기억에 남을 밤이에요.', { network: 3, stamina: -1 }),
    o('일찍 자고 체력을 아낀다', '내일 일정을 개운하게 소화했어요.', { stamina: 2, happy: 1 }),
    r('장기자랑에 나가 본다', 4, 'network', '반 전체가 환호했어요!', { happy: 3, network: 2 }, '긴장해서 대사를 잊었어요.', { happy: -1 }),
  ]),
  // ── 4 고등
  J(4, '진로 상담', sc('school', '🧭📋', 'neutral', '👩‍🏫'), '졸업이 다가와요. 선생님이 앞으로의 길을 물으셨어요.', [
    o('대학 입시에 집중한다', '성적을 올리는 데 매진했어요.', { growth: 3, happy: -1 }),
    o('하고 싶은 일을 찾아본다', '다양한 경험을 쌓았어요.', { growth: 1, happy: 2 }),
    r('아르바이트로 일찍 돈을 번다', 3, undefined, '용돈과 경험을 얻었어요.', { asset: 3, growth: 1 }, '일이 고돼 지쳐 버렸어요.', { stamina: -1, asset: 1 }, { stamina: 1 }),
  ]),
  J(4, '시험이 끝난 날', sc('street', '🎡🍕', 'happy', '🧒🧒🧒'), '긴 시험이 끝났어요. 친구들이 놀러 가자고 해요.', [
    o('함께 놀러 간다', '시험 스트레스를 날렸어요.', { happy: 2, network: 2 }, { asset: 1 }),
    o('집에서 푹 쉰다', '밀린 잠을 잤어요.', { stamina: 2, happy: 1 }),
    r('도서관에서 못 다한 공부를 한다', 3, 'growth', '집중이 잘 됐어요.', { growth: 3 }, '졸다가 시간만 보냈어요.', { stamina: -1 }),
  ]),
  J(4, '대입 원서 접수', sc('school', '🖥️📄', 'neutral', '👩‍🏫'), '원서를 쓸 시간이에요. 어느 대학에 지원할까요?', [
    r('목표보다 높은 대학에 도전한다', 4, 'growth', '합격 소식이 왔어요!', { growth: 3, happy: 2 }, '아쉽게 불합격했어요.', { happy: -2 }),
    o('안정적으로 지원한다', '무난하게 합격했어요.', { growth: 2 }),
    o('전문대·기술 교육을 알아본다', '실무 중심 교육을 선택했어요.', { growth: 1, asset: 1 }),
  ]),
  // ── 5 성인 초반
  J(5, '자취방 구하기', sc('street', '🏢🔑', 'neutral', '🧑‍💼'), '독립을 앞두고 방을 구해야 해요. 보증금이 부담돼요.', [
    o('월세 원룸을 얻는다', '작지만 내 공간이 생겼어요.', { happy: 2 }, { asset: 1 }),
    r('발품을 팔아 저렴한 방을 찾는다', 4, 'growth', '보증금이 싸고 채광 좋은 방을 찾았어요!', { asset: 1, happy: 2 }, '하루 종일 걸었지만 마땅한 방이 없었어요.', { stamina: -1 }, { stamina: 1 }),
    o('룸메이트와 합친다', '월세를 나눴지만 신경 쓸 게 많아요.', { network: 1, happy: -1 }, undefined, { network: 2 }),
    o('부모님 집에서 지낸다', '돈은 아꼈지만 독립은 미뤄졌어요.', { asset: 1, happy: -1 }),
  ]),
  J(5, '첫 월급', sc('bank', '💳💰', 'happy'), '드디어 첫 월급이 들어왔어요. 어떻게 쓸까요?', [
    o('저축한다', '차곡차곡 모았어요.', { asset: 3 }),
    o('부모님께 선물을 드린다', '효도를 했어요.', { asset: -1, happy: 2, network: 1 }),
    r('주식·투자에 도전한다', 4, 'growth', '수익이 났어요!', { asset: 4, growth: 1 }, '손실을 봤어요.', { asset: -2 }, { asset: 1 }),
  ]),
  J(5, '해외 여행 제안', sc('street', '✈️🧳', 'happy', '🧑🧑'), '친구들이 해외여행을 가자고 해요. 휴가는 얼마 안 남았어요.', [
    o('다녀온다', '견문이 넓어졌어요.', { happy: 3, growth: 1, asset: -2 }),
    o('돈을 모은다', '다음 기회를 기약해요.', { asset: 2 }),
    r('워킹홀리데이로 일하며 간다', 4, 'growth', '돈도 벌고 경험도 쌓았어요.', { asset: 2, growth: 2, happy: 2 }, '적응이 힘들었어요.', { stamina: -2, happy: -1 }, { stamina: 1 }),
  ]),
  J(5, '인턴 지원', sc('office', '🖥️📨', 'neutral', '🧑‍💼'), '관심 있는 회사가 인턴을 뽑아요. 지원서를 낼까요?', [
    r('희망 기업에 지원한다', 4, 'growth', '합격! 값진 경험이에요.', { growth: 3, asset: 1 }, '서류에서 탈락했어요.', { happy: -1 }),
    o('자격증 공부를 먼저 한다', '실력을 쌓았어요.', { growth: 2 }),
    o('친구 소개로 일해 본다', '가볍게 일을 시작했어요.', { asset: 1, network: 1 }),
  ]),
  J(5, '소개팅', sc('street', '☕💬', 'happy', '🧑'), '친구가 소개팅을 주선했어요. 사람 만나는 게 조금 부담스러워요.', [
    r('용기를 내어 나간다', 4, 'network', '마음이 통했어요!', { happy: 2, network: 2, life: { partner: true } }, '분위기가 어색했어요.', { happy: -1 }),
    o('친구들과 모임을 즐긴다', '편한 사람들과 즐거웠어요.', { network: 2, happy: 1 }),
    o('혼자만의 시간을 가진다', '나를 돌아볼 시간이었어요.', { growth: 1, stamina: 1 }),
  ], { noPartner: true }),
  // ── 6 성인 중반
  J(6, '투자 제안', sc('bank', '📊🤝', 'neutral', '🧑‍💼'), '지인이 투자를 권해요. 수익이 날 수도, 손해를 볼 수도 있어요.', [
    r('여윳돈을 투자한다', 4, 'growth', '수익을 냈어요!', { asset: 5 }, '손실이 났어요.', { asset: -2 }, { asset: 1 }),
    o('안전하게 적금을 든다', '안정적으로 모았어요.', { asset: 2 }),
    o('거절하고 가족과 시간을 보낸다', '돈보다 소중한 시간이에요.', { happy: 2 }),
  ]),
  J(6, '직장 회식', sc('office', '🍻🥩', 'happy', '🧑‍💼🧑‍💼'), '팀 회식이에요. 내일 아침 중요한 회의가 있어요.', [
    o('끝까지 함께한다', '동료와 가까워졌지만 피곤해요.', { network: 3, stamina: -1 }),
    o('일찍 일어난다', '집에서 쉬며 회의를 준비했어요.', { stamina: 1, growth: 1 }),
    r('분위기를 이끌어 본다', 3, 'network', '회식의 주인공! 팀장님이 눈여겨봐요.', { network: 3, growth: 1 }, '어색한 침묵이 흘렀어요.', { happy: -1 }),
  ]),
  J(6, '야간 대학원', sc('campus', '🎓🌙', 'tired'), '일과 병행해서 대학원에 다닐 수 있어요. 시간과 체력이 걱정이에요.', [
    r('학위에 도전한다', 4, 'growth', '학위를 받았어요! 연봉 협상에 유리해요.', { growth: 4 }, '과제에 지쳐 중도 포기했어요.', { stamina: -2 }, { stamina: 2 }),
    o('온라인 강의만 듣는다', '가볍게 배웠어요.', { growth: 1 }),
    o('가족과 시간을 보낸다', '쉬는 게 필요했어요.', { happy: 2, stamina: 1 }),
  ]),
  J(6, '이직 제안', sc('office', '🤝📄', 'surprised', '🧑‍💼'), '다른 회사에서 더 높은 연봉으로 이직 제안이 왔어요.', [
    r('이직한다', 4, 'growth', '연봉이 올랐어요!', { growth: 1, asset: 2, life: { raise: 1 } }, '새 직장에 적응하기가 어려워요.', { happy: -1 }, { stamina: 1 }),
    o('현재 직장에서 협상한다', '지금 자리에서 대우를 받았어요.', { asset: 1 }),
    o('제안을 거절한다', '안정을 택했어요.', { happy: 1 }),
  ], { career: true }),
  J(6, '가정을 꾸릴 기회', sc('home', '👶🍼', 'happy', '🧑‍🤝‍🧑'), '동반자와 아이를 맞이할 이야기를 나눠요.', [
    r('아이를 맞이한다', 3, undefined, '새 가족이 생겼어요!', { happy: 3, network: 1, life: { children: 1 } }, '아쉽게도 인연이 닿지 않았어요.', { stamina: -1 }, { stamina: 1 }),
    o('조금 더 미룬다', '경제적 준비를 더 해요.', { asset: 1 }),
    o('둘만의 여행을 떠난다', '둘만의 시간을 즐겨요.', { happy: 2, asset: -1 }),
  ], { partner: true, childrenLt: 2 }),
  J(6, '학부모 상담', sc('school', '👩‍🏫📋', 'neutral'), '선생님이 아이 일로 면담을 요청하셨어요.', [
    o('경청하며 듣는다', '선생님과 아이를 더 이해했어요.', { network: 1, happy: 1 }),
    r('아이를 위해 적극 요청한다', 4, 'network', '학교와 협력이 잘 됐어요.', { happy: 2, network: 2 }, '부담을 준 것 같아 마음이 무거워요.', { happy: -1 }),
    o('아이의 자율성을 믿는다', '아이가 스스로 해 나가요.', { growth: 1 }),
  ], { children: 1 }),
  J(6, '집 보러 다니기', sc('street', '🏘️🔑', 'neutral', '🧑‍💼'), '내 집 마련을 위해 부동산을 둘러봐요.', [
    o('발품을 팔아 정보를 모은다', '집 시장을 파악했어요.', { growth: 2 }),
    r('급매를 노려 본다', 4, 'growth', '싸고 좋은 물건을 알아냈어요!', { asset: 2, growth: 1 }, '타이밍을 놓치고 말았어요.', { stamina: -1 }),
    o('지금은 전세에 만족한다', '당분간 안정적으로 살아요.', { happy: 1 }),
  ], { noHome: true }),
  // ── 7 성인 말기
  J(7, '건강 검진 결과', sc('hospital', '🩺📊', 'neutral', '🧑‍⚕️'), '혈압과 혈당이 경계 수치래요. 일이 바빠 운동할 시간이 없었어요.', [
    r('운동과 식단을 바꾼다', 4, undefined, '수치가 좋아졌어요!', { stamina: 3, happy: 1 }, '작심삼일로 끝났어요.', { happy: -1 }, { stamina: 1 }),
    o('약을 처방받는다', '약으로 관리하기로 했어요.', { stamina: 1 }, { asset: 1 }),
    o('바빠서 다음으로 미룬다', '일단 일에 집중했어요.', { asset: 1, stamina: -1 }),
  ]),
  J(7, '오랜만의 동창회', sc('street', '🍻🥂', 'happy', '🧑🧑🧑'), '졸업 후 처음 동창회가 열려요. 연락이 끊긴 친구도 많아요.', [
    o('참석해서 어울린다', '옛 이야기로 밤새 웃었어요.', { network: 3, happy: 1 }, { asset: 1 }),
    o('가지 않고 쉰다', '조용히 집에서 쉬었어요.', { stamina: 1, happy: 1 }),
    r('총무를 맡아 모임을 이끈다', 4, 'network', '모두 고마워했어요!', { network: 4, happy: 1 }, '의견이 갈려 힘들었어요.', { happy: -1 }),
  ]),
  J(7, '노후 준비 상담', sc('bank', '🏦📈', 'neutral', '🧑‍💼'), '은퇴가 가까워져요. 은행에서 노후 자금 상담을 해 준대요.', [
    o('연금 상품에 가입한다', '든든한 노후 자금을 쌓았어요.', { asset: 3 }),
    r('공부해서 직접 굴려 본다', 4, 'growth', '운용이 잘돼 수익이 났어요.', { asset: 4, growth: 1 }, '시장이 나빠 손실을 봤어요.', { asset: -2 }),
    o('지금을 즐기며 쓴다', '오늘의 행복을 택했어요.', { happy: 2, asset: -1 }),
  ]),
  J(7, '자녀 독립 준비', sc('home', '📦🔑', 'neutral', '🧑‍🧒'), '아이가 독립하겠다고 해요. 짐을 싸고 방을 구하는 걸 도와야 해요.', [
    o('전세 보증금을 보태 준다', '아이가 든든해해요.', { happy: 2, network: 1 }, { asset: 2 }),
    o('응원만 해 준다', '스스로 해내길 믿어요.', { happy: 1, network: 1 }),
    r('이사와 집안일을 함께 거든다', 3, undefined, '함께한 시간이 값져요.', { happy: 3, network: 1 }, '허리를 삐끗해 며칠 고생했어요.', { stamina: -2 }, { stamina: 1 }),
  ], { children: 1 }),
  J(7, '자녀 대학 입학', sc('campus', '🎓🌸', 'happy', '🧑‍🧒'), '아이가 그토록 바라던 대학에 합격했어요! 온 가족이 기쁜 소식을 기다리고 있었어요.', [
    o('가족과 축하 파티를 연다', '온 가족이 기뻐했어요.', { happy: 3, network: 1 }, { asset: 1 }),
    o('조용히 마음으로 축하한다', '대견하고 뿌듯해요.', { happy: 2 }),
    r('입학식에서 친구들에게 자랑한다', 3, 'network', '다들 부러워하며 축하해 줬어요.', { network: 3, happy: 1 }, '조금 쑥스러웠어요.', {}),
  ], { children: 1 }),
  J(7, '승진 심사', sc('office', '📊🏅', 'neutral', '🧑‍💼'), '임원 승진 심사가 있어요. 준비할 시간이 얼마 없어요.', [
    r('밤새 준비해 발표한다', 4, 'growth', '승진했어요! 연봉이 올랐어요.', { growth: 2, asset: 2, life: { raise: 1 } }, '발표에서 실수를 했어요.', { happy: -1, stamina: -1 }, { stamina: 1 }),
    o('동료에게 도움을 청한다', '함께 준비해 무난히 마쳤어요.', { network: 1, growth: 1 }, undefined, { network: 3 }),
    o('이번에는 포기한다', '다음을 기약해요.', { happy: 1 }),
  ], { career: true }),
  // ── 8 노년 초반
  J(8, '경로당 모임', sc('park', '🍵🎴', 'happy', '👵👴'), '동네 경로당에서 어르신들이 모여 있어요.', [
    o('자주 나가 어울린다', '새 친구들이 생겼어요.', { network: 2, happy: 1 }),
    o('집에서 혼자 쉰다', '조용한 하루를 보냈어요.', { stamina: 1 }),
    r('노래 자랑에 나가 본다', 3, 'network', '박수갈채를 받았어요!', { happy: 3, network: 1 }, '목이 잠겨 버렸어요.', { happy: -1 }),
  ]),
  J(8, '연금 수령 상담', sc('bank', '🏦📄', 'neutral', '🧑‍💼'), '연금을 받기 시작했어요. 수령 방식을 고를 수 있어요.', [
    o('매달 안정적으로 받는다', '꾸준한 수입이 생겼어요.', { asset: 2 }),
    r('일부를 투자에 쓴다', 4, 'growth', '운용이 잘됐어요.', { asset: 3, growth: 1 }, '조금 손해를 봤어요.', { asset: -1 }),
    o('자녀들에게 나눠 준다', '마음이 뿌듯해요.', { asset: -1, happy: 2, network: 1 }),
  ]),
  J(8, '산책 친구 만들기', sc('park', '🚶🌳', 'happy', '👵'), '아침 공원에서 매일 마주치는 분이 인사를 건네요.', [
    o('같이 걷기로 한다', '건강도 챙기고 친구도 생겼어요.', { network: 2, stamina: 1 }),
    r('먼저 차를 권한다', 3, 'network', '오랜 벗이 될 것 같아요.', { network: 3, happy: 1 }, '조금 쑥스러운 분위기였어요.', {}),
    o('혼자 걷는 게 편하다', '고요한 아침을 즐겼어요.', { happy: 1, stamina: 1 }),
  ]),
  J(8, '손자의 부탁', sc('home', '🧸🎈', 'happy', '🧒'), '손주가 놀러 와서 "할머니·할아버지, 같이 놀아요!" 하고 졸라요.', [
    o('몸으로 놀아 준다', '지치지만 행복해요.', { happy: 3, stamina: -1 }),
    o('책을 읽어 준다', '무릎에 앉혀 이야기를 들려줬어요.', { happy: 2, growth: 1 }),
    r('함께 요리를 해 본다', 3, undefined, '손주가 처음 만든 요리에 모두 웃었어요.', { happy: 3, network: 1 }, '부엌이 난장판이 됐어요.', { stamina: -1 }),
  ], { grandchildren: 1 }),
  J(8, '손주 탄생', sc('hospital', '👶🎀', 'happy', '👨‍👩‍👧'), '아이가 손주를 안겨 줬어요!', [
    o('한걸음에 달려간다', '작은 생명을 품에 안았어요.', { happy: 3, network: 1, life: { grandchildren: 1 } }),
    r('손수 만든 선물을 준비한다', 3, 'growth', '정성에 모두 감동했어요.', { happy: 3, network: 2, life: { grandchildren: 1 } }, '시간이 모자라 기본 선물로 대신했어요.', { happy: 1, life: { grandchildren: 1 } }),
    o('전화로 축하한다', '멀리서 마음을 전했어요.', { happy: 2, life: { grandchildren: 1 } }),
  ], { children: 1, grandchildrenLt: 2 }),
  J(8, '은퇴 기념 모임', sc('office', '🥂🎖️', 'happy', '🧑‍💼🧑‍💼'), '정든 직장을 떠나는 날, 동료들이 모임을 열어 줬어요.', [
    o('감사 인사를 전한다', '눈시울이 붉어졌어요.', { network: 3, happy: 1 }),
    r('짧은 회고 연설을 한다', 3, 'network', '모두 박수를 쳤어요.', { network: 3, happy: 2 }, '목이 메어 말을 잇지 못했어요.', { happy: 1 }),
    o('조용히 마무리한다', '담담하게 인사했어요.', { happy: 1 }),
  ], { career: true }),
  // ── 9 노년 중반
  J(9, '옛 친구의 편지', sc('home', '✉️🌿', 'happy', '👴'), '오래 연락이 끊겼던 친구에게서 편지가 왔어요.', [
    o('바로 답장을 쓴다', '오랜 벗과 다시 이어졌어요.', { network: 3, happy: 2 }),
    r('직접 찾아가 만난다', 4, 'network', '수십 년 만에 부둥켜안았어요.', { network: 3, happy: 3 }, '길이 멀어 지치고 말았어요.', { stamina: -2 }, { stamina: 1 }),
    o('마음속에만 담아 둔다', '추억을 곱씹으며 하루를 보냈어요.', { happy: 1 }),
  ]),
  J(9, '병원 정기검진', sc('hospital', '🩺💊', 'neutral', '🧑‍⚕️'), '나이가 들어 정기검진을 받아야 해요. 검사가 번거로워요.', [
    o('꼬박꼬박 받는다', '이상이 없어 마음이 놓여요.', { stamina: 2, happy: 1 }, { asset: 1 }),
    r('걷기와 식단으로 스스로 관리한다', 3, undefined, '꾸준히 챙긴 덕에 몸이 가벼워졌어요.', { stamina: 2 }, '며칠 하다 흐지부지됐어요.', {}, { stamina: 1 }),
    o('귀찮아서 미룬다', '괜찮겠지 하고 넘겼어요.', { asset: 1, stamina: -1 }),
  ]),
  J(9, '자서전 쓰기', sc('home', '📔✒️', 'happy', '👴'), '지나온 삶을 글로 남겨 보고 싶어요.', [
    r('끝까지 써 본다', 4, 'growth', '한 권의 책이 완성됐어요!', { growth: 3, happy: 2 }, '절반쯤 쓰다 지쳤어요.', { stamina: -1 }, { stamina: 1 }),
    o('가족에게 말로 들려준다', '이야기를 들은 가족이 눈시울을 붉혔어요.', { network: 2, happy: 2 }),
    o('사진첩을 정리한다', '추억이 정리됐어요.', { happy: 2 }),
  ]),
  J(9, '손주 재롱잔치', sc('stage', '🎤🎈', 'happy', '🧒👏'), '손주가 유치원 재롱잔치에서 무대에 올라요.', [
    o('최대한 가까이서 응원한다', '손주의 환한 얼굴을 눈에 담았어요.', { happy: 3 }),
    o('영상을 찍어 간직한다', '두고두고 돌려 볼 영상이 생겼어요.', { happy: 2, growth: 1 }),
    r('깜짝 꽃다발을 준비한다', 3, undefined, '손주가 활짝 웃었어요!', { happy: 3, network: 1 }, '꽃집이 문을 닫아 빈손이 됐어요.', {}),
  ], { grandchildren: 1 }),
  // ── 10 노년 말기
  J(10, '마지막 편지 쓰기', sc('home', '✉️🕯️', 'happy', '👴'), '소중한 사람들에게 마음을 남기고 싶어요.', [
    o('가족에게 쓴다', '고마움을 한 글자씩 눌러 담았어요.', { happy: 3, network: 1 }),
    o('오랜 친구에게 쓴다', '긴 우정에 감사를 전했어요.', { network: 3, happy: 1 }),
    r('모두에게 짧게 한 장씩 쓴다', 4, 'network', '모두가 편지를 읽고 울었어요.', { happy: 3, network: 3 }, '기운이 달려 다 쓰지 못했어요.', { stamina: -1 }, { stamina: 1 }),
  ]),
  J(10, '옛 사진첩 정리', sc('home', '📷🖼️', 'happy', '👴'), '서랍 속 낡은 사진첩을 발견했어요.', [
    o('천천히 넘겨 본다', '웃음과 눈물이 함께 나요.', { happy: 3 }),
    r('사진마다 이야기를 적어 둔다', 3, 'growth', '한 권의 기록이 완성됐어요.', { happy: 2, growth: 2 }, '손이 떨려 몇 장밖에 못 적었어요.', { happy: 1 }, { stamina: 1 }),
    o('가족을 불러 함께 본다', '사진 속 이야기를 들려줬어요.', { network: 2, happy: 1 }, undefined, { network: 2 }),
    o('지금은 덮어 둔다', '아직은 마음의 준비가 필요해요.', { stamina: 1 }),
  ]),
  J(10, '고향 방문', sc('farm', '🏡🌾', 'happy', '👴'), '어린 시절을 보낸 고향에 가 보고 싶어요.', [
    o('가족과 함께 간다', '추억의 골목을 함께 걸었어요.', { happy: 3, network: 1 }, { asset: 1 }),
    r('혼자 천천히 다녀온다', 4, 'happy', '그리운 풍경에 마음이 포근해졌어요.', { happy: 4 }, '길이 많이 변해 길을 잃었어요.', { stamina: -1 }, { stamina: 1 }),
    o('사진으로만 그린다', '기억 속 고향을 떠올렸어요.', { happy: 1 }),
  ]),
  J(10, '가족과의 마지막 식사', sc('kitchen', '🍲🥢', 'happy', '👨‍👩‍👧'), '온 가족이 한자리에 모였어요.', [
    r('손수 음식을 준비해 대접한다', 3, undefined, '정성 가득한 식탁에 모두 행복했어요.', { happy: 4, network: 1 }, '힘이 달려 간단한 상으로 대신했어요.', { happy: 1, stamina: -1 }, { stamina: 1 }),
    o('음식을 주문해 이야기에 집중한다', '웃음이 끊이지 않았어요.', { happy: 3, network: 1 }, { asset: 1 }),
    o('조용히 지켜본다', '그저 곁에 있는 것만으로 행복해요.', { happy: 2, stamina: 1 }),
  ], { family: true }),
];
export const CARDS: JourneyCard[] = JOURNEY.map((card, i) => ({ ...card, id: `j-${i + 1}` }));

// ═════════ 액티비티 카드: 참가하면 보상이 크다 ═════════
const ACTIVITY: JourneyCard[] = [
  A(1, '모래성 쌓기', sc('beach', '🏖️🏰', 'happy', '🧒'), '바닷가 모래밭에서 아이들이 모래성을 쌓고 있어요.', { happy: 2, growth: 2, network: 1 }, { join: '큰 성에 도전한다', friend: '친구와 함께 쌓는다', watch: '모래 구경만 한다', stat: 'growth' }),
  A(1, '물장구 놀이', sc('beach', '🌊🦆', 'happy', '👨‍👧'), '얕은 물에서 오리 튜브를 타고 놀아요.', { happy: 3, stamina: 1, network: 1 }, { join: '첨벙첨벙 뛰어든다', friend: '친구와 물을 튀긴다', watch: '발만 담근다' }),
  A(2, '학교 소풍', sc('park', '🎒🌲', 'happy', '🧒🧒'), '봄 소풍날, 보물찾기 놀이가 열렸어요.', { growth: 2, network: 2, happy: 1 }, { join: '보물찾기에 나선다', friend: '친구와 짝을 이룬다', watch: '도시락만 먹는다', stat: 'growth' }),
  A(2, '운동회 달리기', sc('playground', '🏃🏅', 'happy', '🧒🧒'), '가을 운동회, 반 대표로 달리기 선수가 됐어요.', { happy: 3, network: 2 }, { join: '1등을 목표로 달린다', friend: '이어달리기를 함께한다', watch: '응원석에서 응원한다' }),
  A(3, '학교 축제 무대', sc('stage', '🎤🎸', 'happy', '🧒🧒'), '축제에서 반 대표로 무대에 설 기회가 왔어요.', { happy: 3, network: 2 }, { join: '무대에 올라 노래한다', friend: '친구들과 함께 공연한다', watch: '객석에서 즐긴다', stat: 'network' }),
  A(3, '동아리 대회', sc('school', '🏆🎨', 'happy', '🧒🧒'), '동아리 대회에 출전할 팀을 뽑아요.', { growth: 3, network: 2 }, { join: '대표로 출전한다', friend: '팀을 꾸려 함께 나간다', watch: '응원단으로 참여한다', stat: 'growth' }),
  A(4, '체험학습 현장', sc('campus', '🔬🏭', 'happy', '🧑‍🏫'), '직업 현장을 직접 체험해 볼 수 있는 날이에요.', { growth: 3, happy: 2 }, { join: '직접 체험에 나선다', friend: '친구와 조를 짜서 한다', watch: '견학만 한다', stat: 'growth' }),
  A(4, '봉사활동', sc('park', '🤝🧹', 'happy', '🧒🧒'), '지역 봉사활동에 참여할 사람을 모집해요.', { network: 3, growth: 1, happy: 1 }, { join: '맡은 일을 열심히 한다', friend: '친구들과 함께한다', watch: '사진만 찍는다', stat: 'network' }),
  A(5, '배낭여행', sc('beach', '🎒🗺️', 'happy', '🧑'), '짧은 휴가를 이용해 낯선 도시를 여행할 수 있어요.', { growth: 3, happy: 2 }, { join: '혼자 길을 개척한다', friend: '친구와 함께 떠난다', watch: '여행 영상을 본다', stat: 'growth' }),
  A(5, '동호회 모임', sc('park', '⚽🍻', 'happy', '🧑🧑'), '퇴근 후 동호회 모임에 나갈 수 있어요.', { network: 3, happy: 2 }, { join: '주전으로 뛴다', friend: '동료와 함께 간다', watch: '뒤풀이만 간다', stat: 'network' }),
  A(6, '동네 벼룩시장', sc('market', '🛍️🧺', 'happy', '🧑🧑'), '주말 벼룩시장에 물건을 내놓을 수 있어요.', { asset: 3, network: 2 }, { join: '좌판을 열고 팔아 본다', friend: '이웃과 함께 판다', watch: '구경만 한다', stat: 'network' }),
  A(6, '가족 캠핑', sc('mountain', '⛺🔥', 'happy', '👨‍👩‍👧'), '주말에 가족과 캠핑을 갈 수 있어요.', { happy: 3, network: 2 }, { join: '텐트와 요리를 책임진다', friend: '다른 가족과 함께 간다', watch: '집에서 쉰다' }),
  A(7, '등산 모임', sc('mountain', '🥾⛰️', 'happy', '🧑🧑'), '지인들이 주말 등산을 가자고 해요.', { happy: 3, network: 2 }, { join: '정상까지 오른다', friend: '친구와 함께 오른다', watch: '아래서 기다린다' }),
  A(7, '주말농장 수확', sc('farm', '🥬🍅', 'happy', '🧑'), '분양받은 주말농장에서 수확철이 왔어요.', { asset: 2, happy: 2, stamina: 1 }, { join: '직접 수확하고 나눈다', friend: '이웃과 함께 거둔다', watch: '텃밭 구경만 한다' }),
  A(8, '걷기 모임', sc('park', '🚶🌳', 'happy', '👵👴'), '매일 아침 공원에서 걷기 모임이 열려요.', { network: 3, happy: 2 }, { join: '선두에서 걷는다', friend: '벗과 같이 걷는다', watch: '벤치에서 쉰다' }),
  A(8, '노인대학 수업', sc('campus', '📚🖋️', 'happy', '👵👴'), '노인대학에서 새 강좌를 열었어요.', { growth: 3, network: 2 }, { join: '열심히 수강한다', friend: '친구와 같이 듣는다', watch: '청강만 한다', stat: 'growth' }),
  A(9, '복지관 노래 교실', sc('stage', '🎶🎤', 'happy', '👵👴'), '복지관에서 노래 교실 발표회를 준비해요.', { happy: 3, growth: 2 }, { join: '무대에 선다', friend: '합창단에 합류한다', watch: '객석에서 듣는다' }),
  A(9, '가족 사진 찍기', sc('home', '📸👨‍👩‍👧‍👦', 'happy', '👨‍👩‍👧‍👦'), '온 가족이 모여 가족사진을 찍기로 했어요.', { happy: 3, network: 2 }, { join: '한복을 입고 찍는다', friend: '다 함께 모여 찍는다', watch: '사진사 옆에서 지켜본다' }),
  A(10, '노을 아래 작별 파티', sc('beach', '🌅🥂', 'happy', '🧑🧑🧑'), '해 질 녘 바닷가에서 소중한 사람들과 모였어요.', { network: 3, happy: 3 }, { join: '건배 제의를 한다', friend: '사람들과 어깨동무한다', watch: '노을만 바라본다' }),
  A(10, '손편지 낭독회', sc('home', '✉️🕯️', 'happy', '🧑🧑'), '가족과 친구들 앞에서 편지를 읽을 기회가 왔어요.', { happy: 3, network: 2 }, { join: '직접 읽어 준다', friend: '함께 돌아가며 읽는다', watch: '조용히 듣는다' }),
];
export const ACTIVITY_CARDS: JourneyCard[] = ACTIVITY.map((card, i) => ({ ...card, id: `a-${i + 1}` }));

// ═════════ 트러블 카드: 원인이 있는 어려움. 대응에 따라 결과가 달라진다 ═════════
const TROUBLE: JourneyCard[] = [
  // 1 갓난아기~유아
  T(1, '열감기', sc('home', '🌡️🛏️', 'sick', '🧑‍⚕️'), '어린이집에 감기가 돌았고, 밤에 이불을 걷어찼어요. 열이 펄펄 끓어요.', { stamina: -2, happy: -1 }, { tackle: '약을 먹고 푹 쉬어 본다', help: '보호자가 밤새 곁을 지켜 준다', pay: ['병원에 가서 진료를 받는다', 1], kid: true }),
  T(1, '분리불안', sc('home', '🚪🧸', 'sad', '🧑‍🏫'), '어린이집 첫날, 보호자가 돌아서자 불안이 몰려와요.', { happy: -2 }, { tackle: '곰 인형을 안고 버텨 본다', help: '선생님 품에 안긴다', kid: true }),
  T(1, '장난감을 뺏겼어요', sc('playground', '🧸😠', 'sad', '🧒'), '같이 놀던 아이가 내 장난감을 확 가져갔어요.', { happy: -1, network: -1 }, { tackle: '"내 거야!" 하고 말해 본다', help: '선생님께 이른다', stat: 'network', kid: true }),
  // 2 초등
  T(2, '숙제를 못 했어요', sc('school', '📓😰', 'sad', '👩‍🏫'), '어제 게임에 빠져 숙제를 못 했어요. 선생님이 검사한다고 해요.', { growth: -1, happy: -1 }, { tackle: '쉬는 시간에 급하게 해 본다', help: '솔직하게 말씀드린다', kid: true }),
  T(2, '친구가 놀려요', sc('school', '🗯️😢', 'sad', '🧒🧒'), '체육 시간에 넘어진 모습을 반 친구들이 놀려요.', { happy: -2 }, { tackle: '"그만해!" 하고 말한다', help: '선생님께 말씀드린다', stat: 'network', kid: true }),
  T(2, '충치 치료', sc('hospital', '🦷🪥', 'sick', '🧑‍⚕️'), '단것을 많이 먹고 양치를 소홀히 했더니 이가 욱신거려요.', { stamina: -2 }, { tackle: '꾹 참고 치과 의자에 앉는다', help: '보호자에게 말씀드린다', pay: ['편안한 치과에서 받는다', 1], kid: true }),
  // 3 중등
  T(3, '친구와 다툼', sc('school', '💢🗯️', 'sad', '🧒'), '사소한 오해가 쌓여 가장 친한 친구와 말다툼을 했어요.', { network: -2, happy: -1 }, { tackle: '먼저 사과한다', help: '다른 친구들과 화해 자리를 만든다', stat: 'network', kid: true }),
  T(3, '성적이 떨어졌어요', sc('home', '📉📝', 'sad', '🧑‍🧑‍🧒'), '게임과 SNS에 빠져 공부를 소홀히 했더니 성적이 뚝 떨어졌어요.', { growth: -2, happy: -1 }, { tackle: '공부 계획표를 짜서 매달린다', help: '선생님께 질문하러 간다', pay: ['학원 특강을 끊는다', 1], stat: 'growth', kid: true }),
  T(3, '외모 고민', sc('home', '🪞😞', 'sad'), 'SNS 속 친구들과 나를 비교하게 되고 사진 찍는 게 싫어졌어요.', { happy: -2 }, { tackle: '운동하며 자신감을 키운다', help: '친구에게 고민을 털어놓는다', kid: true }),
  // 4 고등
  T(4, '시험을 망쳤어요', sc('school', '📝❌', 'sad'), '밤새 외웠지만 긴장해서 머리가 하얘졌어요.', { growth: -1, happy: -2 }, { tackle: '오답 노트를 만들어 다시 도전한다', help: '선생님께 풀이를 부탁한다', stat: 'growth', kid: true }),
  T(4, '입시 스트레스', sc('night', '📚😵', 'tired'), '새벽까지 공부하니 잠이 모자라고 가슴이 답답해요.', { happy: -2, stamina: -1 }, { tackle: '산책하며 마음을 다잡는다', help: '친구와 속마음을 나눈다', pay: ['하루 쉬며 맛있는 걸 먹는다', 1], kid: true }),
  T(4, '진로가 막막해요', sc('home', '❓📑', 'sad'), '하고 싶은 일이 뭔지 모르겠어요. 친구들은 벌써 정한 것 같아요.', { growth: -1, happy: -1 }, { tackle: '직업 체험 프로그램을 신청한다', help: '선배에게 조언을 구한다', stat: 'growth', kid: true }),
  // 5 성인 초반
  T(5, '월세가 올랐어요', sc('home', '🏠📈', 'sad', '🧑‍💼'), '집주인이 월세를 올리겠다고 해요. 월급은 그대로인데 물가는 오르고 있어요.', { asset: -2 }, { tackle: '집주인과 협상해 본다', help: '친구에게 방을 나눠 쓰자고 한다', stat: 'network' }),
  T(5, '취업에 떨어졌어요', sc('office', '📩❌', 'sad'), '서류를 20곳에 냈지만 전부 탈락했어요. 내세울 경험이 부족했나 봐요.', { happy: -2 }, { tackle: '피드백을 받아 자기소개서를 고친다', help: '선배에게 모의 면접을 부탁한다', pay: ['취업 컨설팅을 받는다', 1], stat: 'growth' }),
  T(5, '번아웃', sc('office', '🔥😵', 'tired'), '야근이 이어지고 휴일에도 업무 연락이 와서 몸과 마음이 방전됐어요.', { stamina: -2, happy: -1 }, { tackle: '휴가를 내고 푹 쉰다', help: '동료에게 일을 나눠 달라고 한다', pay: ['마사지·휴양에 돈을 쓴다', 1] }),
  T(5, '연인과의 다툼', sc('street', '💔🌧️', 'sad', '🧑'), '서로 바빠 연락이 뜸해지자 오해가 쌓여 크게 다퉜어요.', { happy: -2 }, { tackle: '먼저 연락해 대화를 청한다', help: '친구에게 조언을 구한다', stat: 'network' }, { partner: true }),
  // 6 성인 중반
  T(6, '층간소음 갈등', sc('home', '🔊😠', 'tired'), '윗집에 아이가 이사 오면서 밤낮으로 발소리가 들려요. 잠을 못 자요.', { happy: -2, stamina: -1 }, { tackle: '이웃에게 정중히 이야기한다', help: '관리사무소에 중재를 요청한다', pay: ['방음 매트를 깐다', 1], stat: 'network' }),
  T(6, '전세 보증금 문제', sc('bank', '🏠📉', 'sad', '🧑‍💼'), '집주인의 사정으로 전세 보증금을 돌려받기 어려워졌어요.', { asset: -2, happy: -1 }, { tackle: '법률 지식을 찾아 직접 대응한다', help: '지인 변호사에게 도움을 청한다', stat: 'growth' }),
  T(6, '과로로 쓰러졌어요', sc('hospital', '🏥💫', 'sick', '🧑‍⚕️'), '프로젝트 마감에 연일 야근을 하다가 회사에서 쓰러졌어요.', { stamina: -3, happy: -1 }, { tackle: '일을 줄이고 회복에 집중한다', help: '가족과 동료가 일을 나눠 준다', pay: ['종합 검진과 요양을 받는다', 2] }),
  T(6, '야근과 육아 사이', sc('home', '🌙👶', 'tired', '👶'), '회사 일이 쌓였는데 아이가 열이 나요. 맡길 곳이 마땅치 않아요.', { happy: -2, stamina: -1 }, { tackle: '재택으로 돌려 둘 다 챙긴다', help: '가족에게 아이를 부탁한다', pay: ['돌봄 서비스를 이용한다', 1] }, { children: 1 }),
  T(6, '아이가 아파요', sc('hospital', '🤒🏥', 'sick', '👶🧑‍⚕️'), '아이가 어린이집에서 감염병에 걸려 입원해야 해요.', { happy: -2, stamina: -2 }, { tackle: '직접 간호하며 곁을 지킨다', help: '가족과 돌아가며 돌본다', pay: ['큰 병원에서 치료한다', 2] }, { children: 1 }),
  T(6, '실직 위기', sc('office', '📦😰', 'sad', '🧑‍💼'), '회사 사정이 어려워져 감원 소문이 돌아요. 내 자리도 안전하지 않아요.', { asset: -2, happy: -1 }, { tackle: '새 기술을 배워 대비한다', help: '인맥을 통해 일자리를 알아본다', stat: 'growth' }, { career: true }),
  T(6, '대출 이자 부담', sc('bank', '🏠📈', 'tired', '🧑‍💼'), '금리가 올라 대출 이자가 크게 늘었어요.', { asset: -2 }, { tackle: '허리띠를 졸라매고 줄여 본다', help: '가족과 상의해 상환 계획을 바꾼다' }, { home: true }),
  // 7 성인 말기
  T(7, '부모님 간병', sc('hospital', '🛏️🧓', 'tired', '🧓'), '연로한 부모님이 쓰러지셔서 간병을 맡게 됐어요.', { stamina: -2, happy: -1 }, { tackle: '직접 정성껏 돌본다', help: '형제·가족과 간병을 나눈다', pay: ['간병인을 구한다', 2] }),
  T(7, '갱년기 불면', sc('night', '🌙😵', 'tired'), '호르몬 변화로 밤마다 잠을 설치고 쉽게 지쳐요.', { stamina: -1, happy: -1 }, { tackle: '운동과 규칙적인 생활로 관리한다', help: '같은 또래와 고민을 나눈다', pay: ['병원에서 치료를 받는다', 1] }),
  T(7, '배우자의 건강 이상', sc('hospital', '🩺🧑‍⚕️', 'sad', '🧑‍⚕️'), '건강 검진에서 배우자에게 이상이 발견됐어요.', { happy: -2, stamina: -1 }, { tackle: '병간호하며 식단을 챙긴다', help: '가족이 함께 돌본다', pay: ['정밀 검사와 치료를 받는다', 2] }, { partner: true }),
  T(7, '구조조정 소문', sc('office', '📉😟', 'sad', '🧑‍💼'), '회사가 어려워져 명예퇴직을 권하고 있어요.', { asset: -2 }, { tackle: '재취업을 위해 자격증을 딴다', help: '인맥을 통해 새 자리를 알아본다', stat: 'growth' }, { career: true }),
  T(7, '자녀 학비 부담', sc('bank', '🎓💸', 'tired', '🧑‍🧒'), '아이의 대학 등록금과 생활비가 한꺼번에 들어가요.', { asset: -2 }, { tackle: '추가 수입을 알아본다', help: '가족과 비용을 나눈다' }, { children: 1 }),
  // 8 노년 초반
  T(8, '보이스피싱 전화', sc('home', '📞😨', 'surprised', '🕵️'), '"자녀가 사고를 당했다"는 전화가 걸려 왔어요. 당황해서 판단이 흐려져요.', { asset: -2, happy: -1 }, { tackle: '침착하게 끊고 직접 확인한다', help: '가족에게 바로 전화한다', pay: ['보안 서비스에 가입한다', 1] }),
  T(8, '낙상 사고', sc('home', '🦴🤕', 'sick'), '비 오는 날 현관에서 미끄러져 넘어졌어요. 다리 힘이 예전 같지 않아요.', { stamina: -2, happy: -1 }, { tackle: '재활 운동을 열심히 한다', help: '이웃이 병원까지 데려다준다', pay: ['정형외과에서 치료받는다', 1] }),
  T(8, '친구의 부고', sc('park', '🕯️🥀', 'sad', '👵'), '오랜 친구가 세상을 떠났다는 소식을 들었어요. 장례식장에 가야 해요.', { happy: -2, network: -1 }, { tackle: '직접 조문하며 마음을 정리한다', help: '친구들과 함께 서로 위로한다' }),
  T(8, '자녀와 연락이 뜸', sc('home', '📱🌙', 'sad'), '바쁜 자녀가 몇 달째 전화를 못 하고 있어요. 서운한 마음이 커져요.', { happy: -2 }, { tackle: '먼저 안부 전화를 걸어 본다', help: '손주 소식을 통해 연락을 이어 간다' }, { children: 1 }),
  // 9 노년 중반
  T(9, '집 수리비', sc('home', '🔧🏚️', 'tired'), '오래된 집의 지붕에서 비가 새요. 수리비가 만만치 않아요.', { asset: -2 }, { tackle: '직접 손을 봐 본다', help: '동네 이웃이 솜씨를 빌려준다', stat: 'network' }),
  T(9, '병원에 입원했어요', sc('hospital', '🏥🛏️', 'sick', '🧑‍⚕️'), '감기가 폐렴으로 번져 입원하게 됐어요. 면역력이 약해진 탓이에요.', { stamina: -2, happy: -1 }, { tackle: '의료진 말을 따르며 빨리 회복하려 한다', help: '가족이 번갈아 병실을 지킨다', pay: ['1인실에서 쉬며 치료받는다', 2] }),
  T(9, '외로운 밤', sc('night', '🌙🕯️', 'sad', '👴'), '배우자와 친구들이 하나둘 곁을 떠나고 집이 너무 조용해요.', { happy: -2 }, { tackle: '새로운 모임에 나가 본다', help: '가족에게 전화해 마음을 나눈다' }),
  // 10 노년 말기
  T(10, '마지막 후회', sc('night', '🕯️💭', 'sad', '👴'), '이루지 못한 일들이 자꾸 떠올라 밤잠을 설쳐요.', { happy: -2 }, { tackle: '지금이라도 해 볼 수 있는 일을 해 본다', help: '가족에게 속마음을 털어놓는다' }),
  T(10, '기력이 쇠했어요', sc('home', '🪑😮‍💨', 'tired', '👴'), '이제는 작은 일에도 숨이 차고 기력이 없어요.', { stamina: -2, happy: -1 }, { tackle: '가벼운 스트레칭으로 몸을 풀어 본다', help: '가족이 곁에서 도와준다', pay: ['방문 요양 서비스를 받는다', 1] }),
  T(10, '친구들을 먼저 보내다', sc('park', '🥀🕯️', 'sad', '👴'), '함께 늙어 가던 벗들을 하나둘 먼저 떠나보냈어요.', { happy: -2, network: -1 }, { tackle: '추억을 글로 남기며 마음을 달랜다', help: '남은 친구들과 서로 의지한다' }),
];
export const TROUBLE_CARDS: JourneyCard[] = TROUBLE.map((card, i) => ({ ...card, id: `t-${i + 1}` }));

export const DECKS: Record<CardDeck, JourneyCard[]> = {
  journey: CARDS,
  activity: ACTIVITY_CARDS,
  trouble: TROUBLE_CARDS,
};
