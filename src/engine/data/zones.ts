export interface ZoneInfo {
  id: number;
  name: string;
  ages: string;
  scenery: string;
  /** 12 = 표준, 8 = 짧은 구간(첫/끝) */
  length: 8 | 12;
  milestone: string;
  /** 진로 칸 선택지 3개 (효과는 PATH_ARCHETYPES 순서와 대응) */
  pathNames: [string, string, string];
  lodgeName: string;
  summitName?: string;
}

export const ZONES: ZoneInfo[] = [
  { id: 1, name: '갓난아기~유아', ages: '0~6', scenery: '꽃밭 언덕', length: 8, milestone: '유치원 입학',
    pathNames: ['그림책 읽기', '장난감 가게 놀이', '동네 친구 사귀기'], lodgeName: '내 방 꾸미기' },
  { id: 2, name: '초등', ages: '7~12', scenery: '숲속', length: 12, milestone: '초등학교 졸업',
    pathNames: ['독서반', '용돈 벼룩시장', '축구 동아리'], lodgeName: '비밀 아지트' },
  { id: 3, name: '중등', ages: '13~15', scenery: '계곡', length: 12, milestone: '중학교 졸업',
    pathNames: ['학원', '아르바이트 체험', '밴드 동아리'], lodgeName: '내 책상 장만' },
  { id: 4, name: '고등', ages: '16~18', scenery: '절벽길', length: 12, milestone: '수능·졸업',
    pathNames: ['입시 반', '아르바이트', '학생회'], lodgeName: '독서실 자리' },
  { id: 5, name: '성인 초반', ages: '19~29', scenery: '능선', length: 12, milestone: '독립',
    pathNames: ['대학·대학원', '취업', '여행·창업 도전'], lodgeName: '첫 자취방' },
  { id: 6, name: '성인 중반', ages: '30~44', scenery: '초원 고원', length: 12, milestone: '내 집 마련 기념일',
    pathNames: ['전문가 과정', '승진 코스', '동네 모임 리더'], lodgeName: '내 집 장만' },
  { id: 7, name: '성인 말기', ages: '45~64', scenery: '설선 지대', length: 12, milestone: '은퇴 준비 완료',
    pathNames: ['관리자 전환', '재테크 정비', '지역 봉사'], lodgeName: '별장·텃밭' },
  { id: 8, name: '노년 초반', ages: '65~74', scenery: '바위 능선', length: 12, milestone: '은퇴',
    pathNames: ['배움터 수강', '소일거리', '친구 모임'], lodgeName: '편한 보금자리' },
  { id: 9, name: '노년 중반', ages: '75~84', scenery: '구름 위', length: 12, milestone: '고희 잔치',
    pathNames: ['회고록 쓰기', '유산 정리', '손주 돌보기'], lodgeName: '볕 좋은 마루' },
  { id: 10, name: '노년 말기 (끝)', ages: '85~', scenery: '정상', length: 8, milestone: '마지막 일출',
    pathNames: ['지혜 나누기', '재산 나누기', '인사 전하기'], lodgeName: '정상 쉼터', summitName: '마지막 일출' },
];

/** 진로 선택지의 효과 원형 (이름은 구간별로 다르지만 효과 구조는 같다) */
export const PATH_ARCHETYPES: { asset?: number; happy?: number; network?: number; growth?: number }[] = [
  { growth: 3, asset: 1 },
  { asset: 3, growth: 1 },
  { network: 3, happy: 1 },
];
