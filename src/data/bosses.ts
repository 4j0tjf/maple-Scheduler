/**
 * 주간·월간 보스와 결정석 판매가.
 *
 * - 이름(name)은 넥슨 스케줄러 Open API(scheduler/character-state)의 content_name 표기다. 맞출 때는 공백을 빼고 비교한다.
 * - 난이도 key는 API 값(easy · normal · hard · chaos · extreme)을 그대로 쓴다.
 * - 가격은 강렬한 힘의 결정 1인(솔로) 판매가다. 파티로 잡으면 floor(가격 ÷ 인원)을 받는다.
 * - 2026-09-17 패치 가격(검은 마법사는 2026-10-01부터). previous는 그 전 가격으로, 가격표 화면의 변동 표시에만 쓴다.
 *   커뮤니티 정리표 두 곳과 패치 기사 수치를 대조했다. 패치로 바뀌면 이 파일만 고친다.
 * - 힐라(하드)·핑크빈(카오스) 등 일간 보스로 바뀐 보스는 넣지 않는다.
 */
export const PRICE_BASIS = "2026-09-17 패치 기준 (검은 마법사 2026-10-01)";

export type Difficulty = "easy" | "normal" | "hard" | "chaos" | "extreme";
export const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard", "chaos", "extreme"];
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "이지", normal: "노멀", hard: "하드", chaos: "카오스", extreme: "익스트림" };
/** weekly: 목요일 0시 초기화 · monthly: 매월 1일 0시 초기화 · season: 시즌 보스(주간이지만 12마리 제한에 들지 않는다). */
export type Cycle = "weekly" | "monthly" | "season";
export const CYCLE_LABEL: Record<Cycle, string> = { weekly: "주간", monthly: "월간", season: "시즌" };

export type BossLevel = { difficulty: Difficulty; price: number; previous?: number };
export type Boss = {
  key: string; name: string; short: string; cycle: Cycle; level: number;
  /** 최대 파티 인원. 대부분 6인이다. 난이도별로 다르면 levels에서 덮는다. */
  maxParty: number; partyOverride?: Partial<Record<Difficulty, number>>;
  levels: BossLevel[]; note?: string;
};

/** 백만 단위 → 메소. 16.1 × 1e6 같은 소수 곱은 오차가 생기므로 반올림한다. */
const m = (value: number) => Math.round(value * 1_000_000);
export const BOSSES: Boss[] = [
  // 사용자가 저장한 나무위키 보스 목록 HTML의 등장 순서. 가격표·캐릭터 보스 목록·추가 목록이 함께 쓴다.
  { key: "zakum", name: "자쿰", short: "자쿰", cycle: "weekly", level: 90, maxParty: 6, levels: [{ difficulty: "chaos", price: 4_040_000, previous: 8_080_000 }] },
  { key: "magnus", name: "매그너스", short: "매그너스", cycle: "weekly", level: 175, maxParty: 6, levels: [{ difficulty: "hard", price: 4_280_000, previous: 8_560_000 }] },
  { key: "papulatus", name: "파풀라투스", short: "파풀", cycle: "weekly", level: 190, maxParty: 6, levels: [{ difficulty: "chaos", price: 6_550_000, previous: m(13.1) }] },
  { key: "von_bon", name: "반반", short: "반반", cycle: "weekly", level: 180, maxParty: 6, levels: [{ difficulty: "chaos", price: 4_070_000, previous: 8_150_000 }] },
  { key: "pierre", name: "피에르", short: "피에르", cycle: "weekly", level: 180, maxParty: 6, levels: [{ difficulty: "chaos", price: 4_080_000, previous: 8_170_000 }] },
  { key: "crimson_queen", name: "블러디퀸", short: "블러디퀸", cycle: "weekly", level: 180, maxParty: 6, levels: [{ difficulty: "chaos", price: 4_070_000, previous: 8_140_000 }] },
  { key: "vellum", name: "벨룸", short: "벨룸", cycle: "weekly", level: 180, maxParty: 6, levels: [{ difficulty: "chaos", price: 4_640_000, previous: 9_280_000 }] },
  { key: "lotus", name: "스우", short: "스우", cycle: "weekly", level: 190, maxParty: 6, partyOverride: { extreme: 2 }, levels: [
    { difficulty: "normal", price: 8_350_000, previous: m(16.7) }, { difficulty: "hard", price: m(48.9), previous: m(51.5) }, { difficulty: "extreme", price: m(545), previous: m(574) }] },
  { key: "damien", name: "데미안", short: "데미안", cycle: "weekly", level: 190, maxParty: 6, levels: [
    { difficulty: "normal", price: 8_750_000, previous: m(17.5) }, { difficulty: "hard", price: m(46.4), previous: m(48.9) }] },
  { key: "guardian_angel_slime", name: "가디언 엔젤 슬라임", short: "가엔슬", cycle: "weekly", level: 210, maxParty: 6, levels: [
    { difficulty: "normal", price: m(12.7), previous: m(25.5) }, { difficulty: "chaos", price: m(71.3), previous: m(75.1) }] },
  { key: "lucid", name: "루시드", short: "루시드", cycle: "weekly", level: 220, maxParty: 6, levels: [
    { difficulty: "easy", price: m(14.9), previous: m(29.8) }, { difficulty: "normal", price: m(17.8), previous: m(35.6) }, { difficulty: "hard", price: m(59.7), previous: m(62.9) }] },
  { key: "will", name: "윌", short: "윌", cycle: "weekly", level: 235, maxParty: 6, levels: [
    { difficulty: "easy", price: m(16.1), previous: m(32.3) }, { difficulty: "normal", price: m(20.5), previous: m(41.1) }, { difficulty: "hard", price: m(73.2), previous: m(77.1) }] },
  { key: "gloom", name: "더스크", short: "더스크", cycle: "weekly", level: 245, maxParty: 6, levels: [
    { difficulty: "normal", price: m(22), previous: m(44) }, { difficulty: "chaos", price: m(66.3), previous: m(69.8) }] },
  { key: "verus_hilla", name: "진 힐라", short: "진힐라", cycle: "weekly", level: 250, maxParty: 6, levels: [
    { difficulty: "normal", price: m(67.6), previous: m(71.2) }, { difficulty: "hard", price: m(100), previous: m(106) }] },
  { key: "darknell", name: "듄켈", short: "듄켈", cycle: "weekly", level: 255, maxParty: 6, levels: [
    { difficulty: "normal", price: m(23.7), previous: m(47.5) }, { difficulty: "hard", price: m(89.6), previous: m(94.4) }] },
  { key: "black_mage", name: "검은 마법사", short: "검마", cycle: "monthly", level: 255, maxParty: 6, levels: [
    { difficulty: "hard", price: m(465), previous: m(665) }, { difficulty: "extreme", price: m(5680), previous: m(8740) }] },
  { key: "chosen_seren", name: "선택받은 세렌", short: "세렌", cycle: "weekly", level: 260, maxParty: 6, levels: [
    { difficulty: "normal", price: m(167), previous: m(239) }, { difficulty: "hard", price: m(302), previous: m(356) }, { difficulty: "extreme", price: m(1840), previous: m(2835) }] },
  { key: "guardian_kalos", name: "감시자 칼로스", short: "칼로스", cycle: "weekly", level: 265, maxParty: 6, levels: [
    { difficulty: "easy", price: m(238), previous: m(280) }, { difficulty: "normal", price: m(479), previous: m(505) },
    { difficulty: "chaos", price: m(1230), previous: m(1273) }, { difficulty: "extreme", price: m(4104) }] },
  { key: "first_adversary", name: "최초의 대적자", short: "대적자", cycle: "weekly", level: 270, maxParty: 3, levels: [
    { difficulty: "easy", price: m(261), previous: m(308) }, { difficulty: "normal", price: m(532), previous: m(560) },
    { difficulty: "hard", price: m(1390), previous: m(1435) }, { difficulty: "extreme", price: m(4712) }] },
  { key: "kaling", name: "카링", short: "카링", cycle: "weekly", level: 275, maxParty: 6, levels: [
    { difficulty: "easy", price: m(320), previous: m(377) }, { difficulty: "normal", price: m(593), previous: m(678) },
    { difficulty: "hard", price: m(1560), previous: m(1739) }, { difficulty: "extreme", price: m(5387) }] },
  { key: "radiant_malefic_star", name: "찬란한 흉성", short: "흉성", cycle: "weekly", level: 280, maxParty: 3, levels: [
    { difficulty: "normal", price: m(576), previous: m(625) }, { difficulty: "hard", price: m(2678) }] },
  { key: "bellona", name: "벨로나", short: "벨로나", cycle: "weekly", level: 280, maxParty: 3, levels: [
    { difficulty: "easy", price: m(396), previous: m(440) }, { difficulty: "normal", price: m(824), previous: m(850) }, { difficulty: "hard", price: m(2950) }] },
  { key: "limbo", name: "림보", short: "림보", cycle: "weekly", level: 285, maxParty: 3, levels: [
    { difficulty: "normal", price: m(995), previous: m(1026) }, { difficulty: "hard", price: m(2385) }] },
  { key: "bardrix", name: "발드릭스", short: "발드릭스", cycle: "weekly", level: 290, maxParty: 3, levels: [
    { difficulty: "normal", price: m(1320), previous: m(1368) }, { difficulty: "hard", price: m(3078) }] },
  { key: "jupiter", name: "유피테르", short: "유피테르", cycle: "weekly", level: 295, maxParty: 3, levels: [
    { difficulty: "normal", price: m(1560), previous: m(1615) }, { difficulty: "hard", price: m(4845) }] },
  { key: "meirin", name: "시즌 보스 메이린", short: "메이린", cycle: "season", level: 270, maxParty: 1,
    note: "결정석이 아니라 황금 메소 주머니(1개 1,000만 메소) 가치로 계산합니다.", levels: [
      { difficulty: "normal", price: m(300) }, { difficulty: "hard", price: m(600) }] },
];

/** 캐릭터 한 명이 한 주에 결정석을 팔 수 있는 주간 보스 수. 넥슨 API의 weekly_boss_clear_limit_count가 있으면 그 값을 쓴다. */
export const WEEKLY_BOSS_LIMIT = 12;

const byKey = new Map(BOSSES.map(boss => [boss.key, boss]));
export const findBoss = (key: string | null | undefined) => (key ? byKey.get(key) : undefined);
/** API 이름 비교용. 넥슨이 띄어쓰기를 다르게 보내도(진힐라 · 진 힐라) 같은 보스로 본다. */
const comparable = (name: string) => name.normalize("NFC").replace(/\s+/g, "");
const byName = new Map<string, string>();
for (const boss of BOSSES) { byName.set(comparable(boss.name), boss.key); byName.set(comparable(boss.short), boss.key); }
byName.set(comparable("메이린"), "meirin");
export const bossKeyOfName = (name: string) => byName.get(comparable(name)) ?? null;
export const levelOf = (boss: Boss, difficulty: string | null | undefined) => boss.levels.find(level => level.difficulty === difficulty);
export const maxPartyOf = (boss: Boss, difficulty: string | null | undefined) => boss.partyOverride?.[difficulty as Difficulty] ?? boss.maxParty;
export const isDifficulty = (value: unknown): value is Difficulty => typeof value === "string" && (DIFFICULTIES as string[]).includes(value);
/** 파티원 1인이 받는 결정석 가격. 정가를 인원으로 나누고 소수점은 버린다. */
export const shareOf = (price: number, party: number) => Math.floor(price / Math.max(1, party));
/** 가격이 높은 순서로 정렬할 때 쓰는 그 보스의 대표 가격(가장 비싼 난이도). */
export const topPrice = (boss: Boss) => Math.max(...boss.levels.map(level => level.price));
