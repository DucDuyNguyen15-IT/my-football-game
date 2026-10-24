// Sinh danh mục ~150 thẻ hư cấu, tất định theo seed (task 6.2). Không dùng tên cầu thủ thật hay tên nhại:
// tên ghép từ âm tiết theo "quốc tịch" hư cấu, biệt danh theo lối chơi.
import { computeOvr, OVR_RANGE, type PlayerStats, type Position, type Rarity } from '@pitch/shared';

/** Một dòng của `src/db/seed/cards.json` = một dòng bảng `cards`. */
export interface CardSeedRow extends PlayerStats {
  id: number;
  code: string;
  name: string;
  nickname: string;
  position: Position;
  rarity: Rarity;
  ovr: number;
  avatarSeed: string;
}

export const CARD_SEED = 20261025;

/** Số mẫu thẻ theo độ hiếm (PRD §6.1). */
export const RARITY_COUNTS: Record<Rarity, number> = {
  bronze: 60,
  silver: 45,
  gold: 30,
  legend: 15,
};

/** Tỉ lệ vị trí trong mỗi độ hiếm (PRD §6.1). */
export const POSITION_SHARE: Record<Position, number> = { GK: 0.12, DF: 0.3, MF: 0.3, FW: 0.28 };

const POSITIONS: readonly Position[] = ['GK', 'DF', 'MF', 'FW'];
const RARITIES: readonly Rarity[] = ['bronze', 'silver', 'gold', 'legend'];
const OUTFIELD = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'stamina'] as const;
const KEEPING = ['reflexes', 'handling', 'positioning', 'kicking'] as const;
type Stat = keyof PlayerStats;

/** mulberry32 — PRNG 32 bit đủ cho dữ liệu seed (không dùng cho gacha). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chia `total` theo tỉ lệ vị trí bằng phương pháp dư lớn nhất (tổng luôn đúng). */
export function positionCounts(total: number): Record<Position, number> {
  const raw = POSITIONS.map((p) => total * POSITION_SHARE[p]);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((x, y) => y[0] - x[0]);
  for (const [, i] of order) {
    if (left-- <= 0) break;
    out[i]!++;
  }
  return { GK: out[0]!, DF: out[1]!, MF: out[2]!, FW: out[3]! };
}

// ---------- Tên ----------

/** Mỗi "quốc tịch" hư cấu: tên = ghép một âm tiết từ mỗi nhóm. */
interface Culture {
  given: readonly (readonly string[])[];
  family: readonly (readonly string[])[];
}

const CULTURES: readonly Culture[] = [
  {
    // Bồ Đào Nha / Brazil
    given: [
      ['Ra', 'Ze', 'Lu', 'Te', 'Da', 'Ge', 'Ri', 'Fa', 'Cle', 'Ju'],
      ['finho', 'velino', 'dinho', 'raldo', 'mério', 'nilson', 'valdo', 'cinho'],
    ],
    family: [
      ['Du', 'Mo', 'Fal', 'Bran', 'Cas', 'Tei', 'Sou', 'Pe', 'Al', 'Ro'],
      ['arte', 'reira', 'cão', 'velo', 'tinha', 'zeira', 'queda', 'mares'],
    ],
  },
  {
    // Tây Ban Nha / Nam Mỹ
    given: [
      ['Ma', 'Al', 'Ser', 'Joa', 'Ni', 'Ra', 'Fe', 'Ig', 'Lo', 'Es'],
      ['riano', 'varo', 'gio', 'quín', 'colás', 'món', 'derico', 'nacio', 'renzo', 'teban'],
    ],
    family: [
      ['Ca', 'Me', 'Fer', 'Ri', 'Bar', 'Que', 'Iba', 'Sa', 'Vi', 'Al'],
      ['rrega', 'ndral', 'stillo', 'lverde', 'marro', 'zquín', 'ltierra', 'cedo'],
    ],
  },
  {
    // Ý
    given: [
      ['Lu', 'Ma', 'Ste', 'Gia', 'Fa', 'Ro', 'Pie', 'Da', 'Ce', 'Ot'],
      ['cano', 'ssimo', 'fano', 'como', 'brizio', 'berto', 'rino', 'niele', 'sare', 'tavio'],
    ],
    family: [
      ['Bel', 'Fan', 'Ros', 'Mar', 'Ver', 'Sar', 'Lom', 'Tor', 'Gal', 'Ca'],
      ['lini', 'etti', 'zzoni', 'cello', 'rasco', 'tano', 'dolfi', 'vacchi'],
    ],
  },
  {
    // Slav / Balkan
    given: [
      ['Mi', 'Vla', 'Bo', 'Dra', 'Ni', 'Sta', 'Ra', 'Ve', 'Lu', 'Zo'],
      ['roslav', 'dimir', 'gdan', 'gan', 'kola', 'nko', 'domir', 'selin', 'kan', 'ran'],
    ],
    family: [
      ['Kov', 'Petr', 'Drag', 'Mar', 'Rad', 'Vuk', 'Bor', 'Stoj', 'Jank', 'Zel'],
      ['anić', 'ović', 'enko', 'ovski', 'etić', 'ulja', 'arek', 'inov'],
    ],
  },
  {
    // Bắc Âu
    given: [
      ['Ar', 'Bjør', 'Ei', 'Hal', 'Ing', 'Kjel', 'Lei', 'Od', 'Rag', 'Sig'],
      ['var', 'n', 'rik', 'dor', 'e', 'mund', 'stein', 'ar', 'vald', 'ulf'],
    ],
    family: [
      ['Lund', 'Berg', 'Holm', 'Strand', 'Dahl', 'Fjell', 'Sol', 'Vik', 'Hag', 'Ny'],
      ['gren', 'qvist', 'stad', 'heim', 'sen', 'ström', 'vall', 'by'],
    ],
  },
  {
    // Tây Phi
    given: [
      ['Ko', 'A', 'Se', 'Ba', 'Ma', 'Ou', 'Ib', 'Ka', 'Ya', 'Dji'],
      ['kou', 'madou', 'ydou', 'bacar', 'massa', 'sman', 'rahim', 'rim', 'ssine', 'bril'],
    ],
    family: [
      ['Dia', 'Tou', 'Ke', 'Ba', 'Kou', 'Ndi', 'Sa', 'Ma', 'Tra', 'Oke'],
      ['ssa', 'ré', 'ita', 'mba', 'yaté', 'koro', 'nde', 'ongo'],
    ],
  },
];

// ---------- Lối chơi ----------

interface Archetype {
  nicknames: readonly string[];
  /** Độ lệch so với OVR mục tiêu cho từng chỉ số. */
  bias: Partial<Record<Stat, number>>;
}

const ARCHETYPES: Record<Position, readonly Archetype[]> = {
  FW: [
    {
      nicknames: ['Ma tốc độ', 'Tia chớp', 'Mũi tên'],
      bias: { pace: 9, shooting: 2, defending: -15 },
    },
    {
      nicknames: ['Sát thủ vòng cấm', 'Họng pháo', 'Pháo thủ'],
      bias: { shooting: 9, pace: -3, defending: -15 },
    },
    {
      nicknames: ['Ảo thuật gia', 'Vũ công', 'Phù thuỷ rê bóng'],
      bias: { dribbling: 9, passing: 3, defending: -18 },
    },
  ],
  MF: [
    {
      nicknames: ['Nhạc trưởng', 'Bộ não', 'Kiến trúc sư'],
      bias: { passing: 8, dribbling: 3, stamina: -3 },
    },
    {
      nicknames: ['Lá phổi thép', 'Máy chạy', 'Con thoi'],
      bias: { stamina: 9, defending: 4, shooting: -4 },
    },
    {
      nicknames: ['Sấm sét tầm xa', 'Cú nã đại bác', 'Chân pháo'],
      bias: { shooting: 9, passing: 1, defending: -6 },
    },
  ],
  DF: [
    {
      nicknames: ['Bức tường', 'Tảng đá', 'Lá chắn thép'],
      bias: { defending: 7, pace: -4, dribbling: -10 },
    },
    {
      nicknames: ['Cơn lốc biên', 'Hậu vệ bay', 'Đôi chân lửa'],
      bias: { pace: 8, stamina: 4, defending: -3 },
    },
    {
      nicknames: ['Người kiến thiết', 'Chốt chặn thông minh', 'Thép mềm'],
      bias: { passing: 8, dribbling: 2, pace: -3 },
    },
  ],
  GK: [
    { nicknames: ['Mèo rừng', 'Bàn tay vàng', 'Lò xo'], bias: { reflexes: 7, kicking: -6 } },
    {
      nicknames: ['Người gác đền', 'Bức màn sắt', 'Thủ môn quét'],
      bias: { positioning: 7, handling: 3, reflexes: -3 },
    },
    {
      nicknames: ['Bệ phóng', 'Đại bác khung thành', 'Người khởi đầu'],
      bias: { kicking: 10, passing: 6, reflexes: -3 },
    },
  ],
};

/** Mức (so với OVR) của chỉ số ngoài sân không thuộc vai trò. */
const OFF_ROLE: Record<Position, Partial<Record<Stat, number>>> = {
  FW: {},
  MF: {},
  DF: { shooting: -22 },
  GK: { pace: -25, shooting: -40, passing: -18, dribbling: -32, defending: -30, stamina: -15 },
};

/** Chỉ số có trọng số trong OVR của vị trí (PRD §6.2) — dùng để chỉnh OVR về đúng mục tiêu. */
const OVR_STATS: Record<Position, readonly Stat[]> = {
  FW: OUTFIELD,
  MF: OUTFIELD,
  DF: ['pace', 'passing', 'dribbling', 'defending', 'stamina'],
  GK: KEEPING,
};

const clampStat = (v: number) => Math.min(99, Math.max(1, Math.round(v)));

// ---------- Sinh ----------

export function generateCards(seed = CARD_SEED): CardSeedRow[] {
  const rand = seededRandom(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

  const usedNames = new Set<string>();
  const makeName = (): string => {
    for (;;) {
      const c = pick(CULTURES);
      const part = (groups: readonly (readonly string[])[]) => groups.map(pick).join('');
      const name = `${part(c.given)} ${part(c.family)}`;
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
    }
  };

  const makeStats = (position: Position, target: number, arch: Archetype): PlayerStats => {
    const stats = {} as PlayerStats;
    for (const s of OUTFIELD) {
      stats[s] = clampStat(
        target + (OFF_ROLE[position][s] ?? 0) + (arch.bias[s] ?? 0) + int(-5, 5),
      );
    }
    for (const s of KEEPING) {
      stats[s] =
        position === 'GK'
          ? clampStat(target + (arch.bias[s] ?? 0) + int(-4, 4))
          : clampStat(int(8, 22) + (s === 'kicking' ? int(0, 15) : 0));
    }
    for (let guard = 0; guard < 1000; guard++) {
      const diff = target - computeOvr(position, stats);
      if (diff === 0) return stats;
      const s = pick(OVR_STATS[position]);
      stats[s] = clampStat(stats[s] + Math.sign(diff));
    }
    throw new Error(`Không chỉnh được OVR ${target} cho ${position}`);
  };

  const rows: CardSeedRow[] = [];
  for (const rarity of RARITIES) {
    const counts = positionCounts(RARITY_COUNTS[rarity]);
    const [lo, hi] = OVR_RANGE[rarity];
    for (const position of POSITIONS) {
      for (let i = 0; i < counts[position]; i++) {
        const id = rows.length + 1;
        const arch = pick(ARCHETYPES[position]);
        const ovr = int(lo, hi);
        rows.push({
          id,
          code: `${position}-${String(id).padStart(4, '0')}`,
          name: makeName(),
          nickname: pick(arch.nicknames),
          position,
          rarity,
          ...makeStats(position, ovr, arch),
          ovr,
          avatarSeed: Math.floor(rand() * 0x100000000)
            .toString(16)
            .padStart(8, '0'),
        });
      }
    }
  }
  return rows;
}
