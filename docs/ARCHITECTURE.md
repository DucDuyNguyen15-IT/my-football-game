# Kiến trúc — MFG (My Football Game)

_Phiên bản 1.3 — 2026-11-25 (rà C6 khớp code) — 1.2 2026-11-24 (thêm PvP đá trực tiếp, ADR-0012) — 1.1 2026-11-16 (rà B6 khớp code) — bản đầu 2026-10-10, Giai đoạn 3. Nguồn: `docs/PRD.md`, ADR-0001…0012._
_Tài liệu này mô tả **hình dạng** hệ thống. Số liệu kinh tế (giá, tỉ lệ, thưởng) nằm trong PRD và file config server, không lặp lại ở đây._

---

## 1. Tổng quan

Ba nguyên tắc chi phối mọi quyết định bên dưới:

1. **Server quyết định mọi thứ có giá trị**: gacha, ép thẻ, ví xu, thưởng trận. Client chỉ gửi ý định ("mua gói X") và hiển thị kết quả.
2. **Mô phỏng trận là code thuần, tất định** (`packages/sim`, 60 tick/s, PRNG có seed). Three.js chỉ vẽ lại state (ADR-0009); server chạy lại cùng code để xác minh trận vs máy (ADR-0011) và chạy sim bóng riêng cho PvP đá trực tiếp (ADR-0012).
3. **Một contract cho mỗi ranh giới**: schema Zod trong `packages/shared/src/api` là nguồn sự thật duy nhất cho request/response giữa web và server.

## 2. Sơ đồ module

```mermaid
flowchart LR
  subgraph Browser["Trình duyệt"]
    UI["apps/web — UI React<br/>(router, màn kho/đội hình/cửa hàng,<br/>TanStack Query)"]
    GAME["apps/web/src/game — Client game<br/>(Three.js: MatchCanvas, MatchRenderer,<br/>input bàn phím, nội suy render)"]
    SIM_C["packages/sim<br/>(vật lý, luật, AI, stats→params)"]
    UI -- "mount/unmount<br/>truyền đội hình" --> GAME
    GAME -- "step(state, input)" --> SIM_C
  end

  subgraph Server["apps/server — API (Fastify)"]
    ROUTES["routes/* — HTTP + Zod validate"]
    DOMAIN["domain/* — logic thuần<br/>(gacha, upgrade, rewards, missions)"]
    SERVICES["services/* — transaction DB,<br/>khoá dòng, ghi ledger"]
    SIM_S["packages/sim<br/>(xác minh log input ADR-0011,<br/>sim bóng PvP ADR-0012)"]
    PVP["routes/pvp + services/pvp<br/>(WebSocket, hàng chờ, phòng,<br/>phiên lockstep 60 Hz)"]
    ROUTES --> SERVICES --> DOMAIN
    SERVICES -.-> SIM_S
    PVP --> SIM_S
    PVP --> SERVICES
  end

  SHARED["packages/shared<br/>(contract API Zod, enum,<br/>công thức OVR, sơ đồ chiến thuật)"]
  DB[("PostgreSQL 16<br/>Drizzle ORM")]

  UI -- "REST /api/v1 (JSON, cookie phiên)" --> ROUTES
  GAME <-- "WebSocket /api/v1/pvp/ws<br/>(chỉ PvP: input ↑, khung f ↓)" --> PVP
  SERVICES --> DB
  UI -.import.-> SHARED
  ROUTES -.import.-> SHARED
  SIM_C -.import.-> SHARED
```

| Module | Vai trò | Được phép import | Cấm |
|---|---|---|---|
| `apps/web` (UI) | Màn ngoài trận, gọi API, quản lý cache | `shared`, `sim`, React, TanStack Query, dnd-kit | Tự tính kết quả gacha/ví |
| `apps/web/src/game` (client game) | Render trận 3D bằng Three.js (camera truyền hình), đọc input, nội suy giữa 2 tick | `sim`, Three.js | Logic vật lý/luật (phải nằm trong `sim`) |
| `packages/sim` | `createMatch(setup)`, `step(state, inputs)` thuần; vật lý, luật, AI, thể lực | `shared` | Three.js/Phaser, React, DOM, `node:*`, `Math.random` (lint chặn) |
| `packages/shared` | Contract API (Zod), enum, công thức OVR/hệ số sai vị trí, sơ đồ | `zod` | Code chạy I/O |
| `apps/server` | REST API, WebSocket PvP (`routes/pvp.ts`, `services/pvp/`), session, transaction, CSPRNG | `shared`, `sim`, Fastify, Drizzle, argon2 | `Math.random` (lint chặn) |
| PostgreSQL | Lưu trữ, ràng buộc toàn vẹn cuối cùng (`CHECK`, `FK`, `UNIQUE`) | — | — |

**Không có "game server" riêng** (ADR-0006): trận vs máy chạy ở client; vai trò "game server" do `apps/server` đảm nhận qua match token + kiểm tra kết quả (§5.2). PvP đá trực tiếp (ADR-0012) cũng nằm trong cùng tiến trình `apps/server` (WebSocket qua `@fastify/websocket`, §5.4), **không dùng Colyseus** — ADR-0012 thay phần realtime của ADR-0006.

### 2.1 Cấu trúc thư mục hiện tại

```
apps/
  web/src/
    app/            router, providers (QueryClient), layout
    api/            fetch wrapper: parse response bằng schema trong @pitch/shared
    components/     thành phần dùng chung (thẻ, avatar `card/Avatar.tsx`, …)
    features/       account/ admin/ auth/ collection/ home/ intro/ legal/ missions/ onboarding/ play/ pvp/ (sảnh, useNetMatch — client WS) shop/ squad/ upgrade/
    game/           MatchCanvas.tsx, bridge.ts, three/ (MatchRenderer.ts, …), render/, input/
    i18n/           vi.ts, en.ts (song ngữ)
    styles/         token, theme sáng/tối, CSS dùng chung
  server/src/
    app.ts          buildApp() — đăng ký plugin + routes (test bằng inject)
    server.ts       listen
    config/         economy.ts (giá, tỉ lệ, thưởng — PRD §6–7), env.ts
    plugins/        db, session/auth, error-handler, rate-limit
    routes/         auth, cards, player-cards, packs, squad, matches, missions, admin, pvp (WS)
    services/       transaction + khoá dòng; gọi domain
    services/pvp/   hub (hàng chờ, phòng, phiên trong bộ nhớ), session (sim bóng), ticker (nhịp 60 Hz), finish (ghi kết quả + thưởng)
    domain/         gacha.ts, upgrade.ts, rewards.ts, missions.ts — thuần, nhận rng làm tham số
    db/             schema.ts, migrate.ts, seed/
  drizzle/          migration SQL 0000…0008 (+ meta/): 0004 `cards.foot`, 0005 `cards.weak_foot`, 0006 `users.terms_accepted_at`, 0007 khoá thiết bị quen, 0008 `pvp_matches` + cột PvP của `matches`
packages/
  sim/src/          math/ physics/ rules/ ai/ stats/ actions/ rng.ts tick.ts hash.ts replay.ts match.ts
  shared/src/       domain.ts (enum, OVR, formation) · api/*.ts (contract từng nhóm endpoint)
```

## 3. Schema database

Quy ước (theo `postgres-patterns`): khoá chính `bigint generated always as identity`; chuỗi dùng `text`; thời gian `timestamptz`; xu là **số nguyên** (`bigint` cho số dư, `integer` cho biến động); tên bảng số nhiều, `snake_case`. Mọi FK đều có index.

Ánh xạ tên trong đề bài → bảng (PvP thêm `pvp_matches`, §3.2): `user`→`users`, `card`→`cards`, `player_card`→`player_cards`, `pack`→`pack_boxes` + `pack_openings` (danh mục gói nằm trong config, §3.3), `squad`→`squads` + `squad_slots`, `match`→`matches`, `transaction`→`coin_transactions`.

```mermaid
erDiagram
  users ||--o{ sessions : has
  users ||--|| pack_boxes : owns
  users ||--o{ pack_openings : makes
  users ||--o{ player_cards : owns
  cards ||--o{ player_cards : "is template of"
  users ||--|| squads : has
  squads ||--o{ squad_slots : contains
  player_cards ||--o| squad_slots : "placed in"
  users ||--o{ matches : plays
  users ||--o{ pvp_matches : "plays (home/away)"
  pvp_matches ||--o{ matches : "1 dòng mỗi người"
  users ||--o{ coin_transactions : ledger
  users ||--o{ card_upgrades : performs
  users ||--o{ daily_missions : has
  users ||--o{ analytics_events : emits
```

### 3.1 Enum (Postgres `CREATE TYPE … AS ENUM`)

| Enum | Giá trị |
|---|---|
| `position` | `GK`, `DF`, `MF`, `FW` |
| `rarity` | `bronze`, `silver`, `gold`, `legend` |
| `formation` | `2-3-1`, `3-2-1`, `2-2-2` |
| `difficulty` | `easy`, `hard` |
| `match_status` | `started`, `finished`, `expired` |
| `match_outcome` | `win`, `draw`, `loss`, `shootout_win`, `shootout_loss` |
| `match_mode` | `cpu`, `pvp_ranked`, `pvp_friendly` (cột `matches.mode`) |
| `pvp_kind` | `ranked` (ghép ngẫu nhiên), `friendly` (mã phòng) |
| `pvp_status` | `live`, `finished`, `cancelled` |
| `pvp_end_reason` | `full_time`, `forfeit_disconnect`, `forfeit_desync`, `void_desync`, `void_both_left`, `void_not_ready`, `server_restart` |
| `card_source` | `starter`, `pack` |
| `coin_tx_type` | `starter_grant`, `pack_purchase`, `card_sale`, `upgrade_fee`, `match_reward`, `mission_reward`, `admin_adjust` |

### 3.2 Bảng

**`users`** — tài khoản và ví
| Cột | Kiểu | Ràng buộc / ghi chú |
|---|---|---|
| id | bigint identity | PK |
| username | text | NOT NULL; `UNIQUE (lower(username))`; 3–20 ký tự `[a-zA-Z0-9_]` (validate ở Zod) |
| password_hash | text | argon2id; NULL = tài khoản chỉ đăng nhập Google (ADR-0010) |
| google_sub | text | NULL; `UNIQUE` — `sub` của tài khoản Google đã gắn (ADR-0010, migration `0002_google_sign_in.sql`). `CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL)` |
| email | text | NULL (tuỳ chọn) |
| terms_accepted_at | timestamptz | NULL — lúc đồng ý Điều khoản + Chính sách khi đăng ký (migration 0006); NULL = tài khoản tạo trước khi có ô đồng ý |
| coins | bigint | NOT NULL DEFAULT 0, **`CHECK (coins >= 0)`** |
| free_pack5_credits | smallint | NOT NULL DEFAULT 0, `CHECK (>= 0)` — gói 5 miễn phí của quà tân thủ |
| failed_login_count | smallint | NOT NULL DEFAULT 0 |
| failed_login_window_start | timestamptz | NULL |
| locked_until | timestamptz | NULL — khoá 15 phút sau 5 lần sai (PRD §8) |
| trusted_failed_count / trusted_failed_window_start / trusted_locked_until | smallint / timestamptz / timestamptz | Bộ đếm + khoá riêng cho request mang cookie thiết bị quen `did` hợp lệ của đúng user (SEC-13a); cùng luật 5 lần/15' |
| is_admin | boolean | NOT NULL DEFAULT false |
| created_at | timestamptz | NOT NULL DEFAULT now() |

**`sessions`**
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | text | PK = **SHA-256 của token** (cookie giữ token gốc 32 byte ngẫu nhiên; lộ DB không lộ phiên) |
| user_id | bigint | FK → users ON DELETE CASCADE; index |
| expires_at | timestamptz | NOT NULL; index để dọn phiên hết hạn; ≤ `created_at` + 90 ngày (SEC-14) |
| created_at | timestamptz | NOT NULL |

**`cards`** — ~150 mẫu thẻ hư cấu (seed, chỉ đọc lúc chạy)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | integer | PK (cố định theo seed để ổn định giữa các môi trường) |
| code | text | UNIQUE, VD `FW-0042` |
| name, nickname | text | Tên hư cấu + biệt danh lối chơi |
| position | position | |
| foot, weak_foot | foot / smallint | Chân thuận (`right`/`left`/`both`) và chân nghịch 2–5 (migration 0004/0005) |
| rarity | rarity | index `(rarity)` để bốc ngẫu nhiên đều trong độ hiếm |
| pace, shooting, passing, dribbling, defending, stamina | smallint | `CHECK BETWEEN 1 AND 99`; thủ môn vẫn có (dùng cho di chuyển/thể lực) |
| reflexes, handling, positioning, kicking | smallint | `CHECK BETWEEN 1 AND 99`; cầu thủ ngoài sân có giá trị thấp |
| ovr | smallint | Tính bằng công thức trong `@pitch/shared` lúc sinh seed; test đảm bảo khớp và nằm trong khoảng OVR của độ hiếm |
| avatar_seed | text | Tham số sinh ảnh đại diện (không dùng ảnh thật) |

**`player_cards`** — thẻ người chơi sở hữu
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | bigint identity | PK |
| user_id | bigint | FK → users; index `(user_id, card_id)` |
| card_id | integer | FK → cards |
| level | smallint | NOT NULL DEFAULT 0, `CHECK BETWEEN 0 AND 5` (cấp +) |
| luck | smallint | NOT NULL DEFAULT 0, `CHECK BETWEEN 0 AND 100` (điểm may mắn %, PRD §6.5) |
| source | card_source | |
| acquired_at | timestamptz | NOT NULL |

Bán thẻ / làm nguyên liệu ép → **xoá dòng**. Lịch sử nằm ở `coin_transactions`/`card_upgrades`.

**`pack_boxes`** — hộp 100 phiếu riêng mỗi người (PRD §6.3)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| user_id | bigint | PK, FK → users |
| bronze_left, silver_left, gold_left, legend_left | smallint | `CHECK (>= 0)`; khởi tạo theo config (58/30/10/2) |
| cycle | integer | NOT NULL DEFAULT 1 — tăng mỗi lần hộp tự làm mới |
| updated_at | timestamptz | |

`CHECK (bronze_left + silver_left + gold_left + legend_left BETWEEN 0 AND 100)`. Hộp được tạo cùng lúc với user.

**`pack_openings`** — lịch sử mở gói + khoá idempotency
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | bigint identity | PK |
| user_id | bigint | FK → users |
| idempotency_key | uuid | **`UNIQUE (user_id, idempotency_key)`** |
| pack_code | text | `pack1` / `pack5` (khớp config) |
| payment | text | `coins` / `free_credit` |
| price | integer | Số xu đã trừ (0 nếu dùng lượt miễn phí) |
| result | jsonb | Nguyên `data` của response lần đầu (`{ cards, box, balance, freePack5Credits }`) — trả lại nguyên văn khi request lặp (task 6.5) |
| box_cycle | integer | Hộp nào được bốc (kiểm toán) |
| created_at | timestamptz | index `(user_id, created_at)` |

**`squads`** + **`squad_slots`** — 1 đội hình / người trong MVP
| Bảng.cột | Kiểu | Ghi chú |
|---|---|---|
| squads.user_id | bigint | PK, FK → users |
| squads.formation | formation | DEFAULT `2-3-1` |
| squads.updated_at | timestamptz | |
| squad_slots.user_id | bigint | FK → squads; PK `(user_id, slot)` |
| squad_slots.slot | text | `GK`, `P1`…`P6` (đá chính, vai trò ô suy từ sơ đồ), `B1`…`B5` (dự bị); `CHECK` theo danh sách |
| squad_slots.player_card_id | bigint | **UNIQUE** (một thẻ chỉ ở một ô); FK → player_cards **ON DELETE RESTRICT** |

`ON DELETE RESTRICT` là chốt chặn cuối ở DB cho luật "thẻ trong đội hình không được bán/ép" (PRD §6.4); service vẫn kiểm trước để trả lỗi `card_in_squad` rõ ràng.

**`matches`** — mỗi người chơi một dòng cho mỗi trận: trận vs máy (match token) hoặc trận PvP (cột PvP ở cuối bảng)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | bigint identity | PK |
| user_id | bigint | FK; index `(user_id, started_at)` |
| token_hash | text | UNIQUE — SHA-256 của match token (token chỉ trả cho client 1 lần) |
| difficulty | difficulty | |
| status | match_status | `started` → `finished` (một lần) |
| seed | bigint | Seed PRNG của sim (để tái hiện / xác minh sau MVP) |
| squad_snapshot | jsonb | Đội hình + chỉ số lúc bắt đầu (bằng chứng, dùng cho xác minh sau) |
| reward_eligible | boolean | Tính lúc bắt đầu: còn trong 15 trận có thưởng/ngày không |
| started_at, finished_at | timestamptz | |
| home_goals, away_goals | smallint | `CHECK BETWEEN 0 AND 20` (PRD §7) |
| outcome | match_outcome | NULL khi chưa xong |
| reward | integer | NOT NULL DEFAULT 0 |
| reward_day | date | Ngày GMT+7 **của lúc nộp kết quả**; partial index `(user_id, reward_day) WHERE reward > 0 OR consumes_daily_cap` để đếm trần 15 trận |
| mode | match_mode | NOT NULL DEFAULT `cpu`. `pvp_ranked` / `pvp_friendly` cho dòng PvP |
| pvp_match_id | bigint | FK → `pvp_matches`, NULL với `cpu`; `UNIQUE (pvp_match_id, user_id)` — mỗi người một dòng mỗi trận nên thưởng đúng một lần |
| opponent_user_id | bigint | FK → `users`, NULL với `cpu` (lưu sẵn cho trang lịch sử trận, đang ở BACKLOG) |
| consumes_daily_cap | boolean | NOT NULL DEFAULT false; true cho người bị xử thua ở trận ranked (không xu nhưng vẫn mất 1 lượt/ngày) |

Dòng PvP: `token_hash` là SHA-256 của 32 byte ngẫu nhiên không bao giờ phát ra; `difficulty` luôn `hard` (dùng chung `matchReward`); `home_goals/away_goals` ghi theo góc nhìn của người đó. Trận bị huỷ vẫn tạo đủ hai dòng `expired`, thưởng 0.

**`pvp_matches`** — mỗi trận PvP một dòng (xem `docs/specs/pvp-realtime/data-model.md`)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | bigint identity | PK |
| kind | pvp_kind | |
| home_user_id, away_user_id | bigint | FK → `users`; `CHECK (home_user_id <> away_user_id)`. Home/away chọn ngẫu nhiên lúc dựng trận (tung đồng xu trong `startPvpMatch`) |
| seed | bigint | `node:crypto` |
| squad_snapshot | jsonb | `{formation_home, formation_away, home, away}` chụp lúc vào trận |
| status | pvp_status | `live` → `finished` / `cancelled`; khi server khởi động mọi dòng `live` thành `cancelled/server_restart` |
| end_reason | pvp_end_reason | NULL khi `live` |
| forfeit_user_id | bigint | FK → `users`, chỉ có khi có người bị xử thua |
| home_goals, away_goals | smallint | `CHECK BETWEEN 0 AND 20`; NULL khi `live` hoặc bị huỷ |
| input_log | text | Nhật ký v2 (base64url) do **server** ghi, để kiểm lại |
| started_at, finished_at | timestamptz | Index `(home_user_id, started_at)`, `(away_user_id, started_at)`, và partial `(kind, finished_at) WHERE kind='ranked' AND status='finished'` (đếm trùng cặp/ngày) |

**`coin_transactions`** — sổ cái, **append-only**
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | bigint identity | PK |
| user_id | bigint | FK; index `(user_id, id)` |
| type | coin_tx_type | |
| amount | integer | Có dấu: dương = cộng, âm = trừ; `CHECK (amount <> 0)` |
| balance_after | bigint | `CHECK (>= 0)` — số dư ngay sau giao dịch |
| ref_type | text | `match` / `pack_opening` / `card_upgrade` / `player_card` / NULL |
| ref_id | bigint | Không FK (dòng tham chiếu có thể đã bị xoá, VD thẻ đã bán) |
| created_at | timestamptz | |

Trigger `BEFORE UPDATE OR DELETE` → `RAISE EXCEPTION` để bảo đảm append-only. Bất biến đối soát: `users.coins = SUM(amount)` theo user (PRD §7 tiêu chí).
Quà tân thủ hiện không tặng xu nên không sinh dòng ledger (vì `amount <> 0`); thẻ khởi đầu ghi nhận qua `player_cards.source = 'starter'`. Loại `starter_grant` để dành nếu config sau này tặng xu khởi đầu.

**`card_upgrades`** — lịch sử ép thẻ (Should, F10)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | bigint identity | PK |
| user_id | bigint | FK; index |
| player_card_id | bigint | Không FK (giữ lịch sử) |
| material_player_card_id | bigint | Thẻ nguyên liệu đã tiêu (không FK) — dùng phát hiện "cùng key khác body" |
| material_card_id | integer | Mẫu thẻ nguyên liệu (kiểm toán) |
| result | jsonb | `{ success, level, luck, rate, fee, balance }` — trả lại nguyên văn khi request lặp |
| from_level, to_level | smallint | |
| rate | smallint | Tỉ lệ đã áp (cơ bản + may mắn) |
| success | boolean | |
| idempotency_key | uuid | `UNIQUE (user_id, idempotency_key)` |
| created_at | timestamptz | |

**`daily_missions`** (Should, F12)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| user_id | bigint | FK |
| day | date | Ngày GMT+7 |
| mission_code | text | Khớp danh sách nhiệm vụ trong config |
| progress, target | smallint | |
| reward | integer | |
| claimed_at | timestamptz | NULL cho tới khi nhận |
| | | PK `(user_id, day, mission_code)` |

**`analytics_events`** (Should, F13)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | bigint identity | PK |
| user_id | bigint | NULL được (VD đăng ký thất bại không ghi) |
| name | text | `register`, `login`, `session_seen`, `match_start`, `match_end`, `match_replay_mismatch`, `pack_open`, `upgrade`, `mission_claim`, và sáu sự kiện PvP `pvp_matched`, `pvp_start`, `pvp_end`, `pvp_disconnect`, `pvp_forfeit`, `pvp_desync` (danh sách đủ ở `services/analytics.ts`) |
| props | jsonb | |
| created_at | timestamptz | **BRIN** index (chuỗi thời gian, chỉ thêm) + index `(name, created_at)` |

**Hiện thực (task 6.1b):** `apps/server/src/db/schema.ts` + migration `apps/server/drizzle/` (trigger append-only ở `0001_coin_tx_append_only.sql`). Thêm so với bảng trên, cùng tinh thần: `CHECK` cho `pack_openings.payment` (`coins`/`free_credit`) và `price ≥ 0`, `coin_transactions.ref_type` theo danh sách, `matches.reward ≥ 0`, `daily_missions.progress ≥ 0`; index `analytics_events(user_id)` và `player_cards(card_id)` (mọi FK có index). Mã lỗi Postgres: CHECK `23514`, UNIQUE `23505`, FK RESTRICT `23503`, trigger append-only `23001`.

### 3.3 Dữ liệu ở config thay vì DB

Danh mục gói (`pack1`, `pack5`), thành phần hộp 100 phiếu, bảng thưởng trận, trần 15 trận/ngày, bảng ép thẻ, giá bán thẻ, danh sách nhiệm vụ → `apps/server/src/config/economy.ts` (PRD §7.4: "mọi con số nằm trong file config phía server"). Client lấy các số cần hiển thị qua API (`GET /packs`, `GET /config/economy`), **không** import trực tiếp.
Công thức OVR, danh sách sơ đồ, hệ số phạt sai vị trí (−15%), **bảng cộng chỉ số theo cấp + (`LEVEL_STAT_BONUS`)** → `packages/shared` vì cả `sim`, web và server đều cần, và đây là luật game chứ không phải số kinh tế.

### 3.4 Khoá và đồng thời

- **Thứ tự khoá cố định** (ADR-0005): `users` → `pack_boxes` → `player_cards` (theo `id` tăng dần) → `squads`. Mọi service tuân theo để tránh deadlock.
- Mọi thao tác **ghi** dữ liệu người chơi (xu, thẻ, đội hình, trận, nhiệm vụ) bắt đầu bằng `SELECT … FROM users WHERE id = $1 FOR UPDATE` — tuần tự hoá mọi giao dịch của cùng một người chơi; người chơi khác không chặn nhau.
- Mức cô lập mặc định `READ COMMITTED` là đủ vì đã khoá dòng tường minh.
- `idle_in_transaction_session_timeout = 30s`, `statement_timeout = 10s` cho role ứng dụng.
- **Thời gian nghiệp vụ** (khoá đăng nhập, 6 phút tối thiểu, ngày GMT+7, reset nhiệm vụ, cohort) luôn lấy từ `app.clock.now()` (tiêm qua `buildApp`, test thay bằng đồng hồ giả) và truyền vào SQL làm tham số. `DEFAULT now()` chỉ dùng cho cột kiểm toán (`created_at`).

## 4. API

### 4.1 Quy ước

- Tiền tố **`/api/v1`**, JSON, URL số nhiều + kebab-case, field JSON **camelCase**.
- **Contract:** mỗi endpoint có schema Zod request/response trong `packages/shared/src/api/<nhóm>.ts`. Server validate request bằng schema đó và có test kiểm response bằng `schema.parse`; web parse response bằng cùng schema. Đổi API = sửa schema trước (quy trình `contract-first`).
- Thành công: `{ "data": … }`. Lỗi: `{ "error": { "code", "message", "details?" } }` (`ApiError` trong `@pitch/shared`).
- ID trong JSON là **chuỗi số** (DB `bigint`).
- Xác thực: cookie `sid` — `HttpOnly; Secure; SameSite=Lax; Path=/`, hạn trượt 30 ngày (gia hạn mỗi lần dùng), tối đa tuyệt đối 90 ngày kể từ lúc đăng nhập (`SESSION_MAX_AGE_MS`, SEC-14). Cookie `did` (thiết bị quen, SEC-13a): `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`, 1 năm, giá trị `userId.nonce.HMAC-SHA256(SESSION_SECRET)`, đặt sau đăng nhập/đăng ký; đăng nhập mật khẩu mang `did` hợp lệ của đúng user dùng bộ đếm khoá riêng. Mọi request đổi dữ liệu phải có `Content-Type: application/json` (chặn form CSRF đơn giản) và kiểm `Origin` khớp host. Endpoint không cần dữ liệu (logout, claim) vẫn gửi body `{}` — `apiFetch` của web luôn làm vậy.
- Endpoint gây tốn xu/thẻ nhận header **`Idempotency-Key: <uuid>`** (bắt buộc).
- Rate limit (`@fastify/rate-limit`): 100 req/phút/người dùng; `/auth/*` 10 req/phút/IP.
- Không phân trang trong MVP: kho thẻ một người dự kiến < 500 dòng. Thêm cursor (`?cursor=&limit=`) khi vượt ngưỡng — thay đổi không phá vỡ.

### 4.2 Mã lỗi

| HTTP | `code` | Khi nào |
|---|---|---|
| 400 | `validation_error` | Body/query sai schema (kèm `details[]`) |
| 415 | `validation_error` | Request đổi dữ liệu thiếu `Content-Type: application/json` |
| 401 | `unauthenticated` | Thiếu/hết hạn phiên |
| 401 | `invalid_credentials` | Sai tên đăng nhập hoặc mật khẩu (không nói rõ cái nào) |
| 403 | `forbidden` | Không phải admin; `Origin` không khớp host (tài nguyên của người khác trả 404, xem §7) |
| 404 | `not_found` | Tài nguyên không tồn tại **hoặc không thuộc người gọi** (không lộ sự tồn tại) |
| 409 | `username_taken` | Đăng ký trùng tên |
| 409 | `insufficient_coins` | Không đủ xu |
| 409 | `card_in_squad` | Bán/ép thẻ đang trong đội hình |
| 409 | `mission_already_claimed` | Nhiệm vụ đã nhận thưởng |
| 409 | `idempotency_conflict` | Cùng key nhưng body khác |
| 422 | `invalid_material`, `max_level`, `invalid_squad` | Vi phạm luật nghiệp vụ |
| 422 | `mission_incomplete` | Nhận thưởng nhiệm vụ chưa hoàn thành |
| 422 | `match_token_invalid` | Token sai/đã dùng/hết hạn/chưa đủ 6 phút/tỉ số vô lý |
| 429 | `login_locked`, `rate_limited` | Khoá đăng nhập; vượt giới hạn (kèm `Retry-After`) |
| 500 | `internal_error` | Lỗi không lường trước (không lộ chi tiết) |
| 503 | `internal_error` | DB hỏng ở `/health`; replay trận quá thời gian hoặc worker lỗi (ADR-0011) |

### 4.3 Danh sách endpoint

| # | Method & path | Auth | Request | Response `data` | Ghi chú / PRD |
|---|---|---|---|---|---|
| 1 | `GET /health` | — | — | `{ status }` | Đã có trong skeleton |
| 2 | `POST /auth/register` | — | `{ username, password, email?, acceptTerms: true }` | `Me` | 201. Thiếu `acceptTerms` → 400; lưu `users.terms_accepted_at`. Mật khẩu 8–72 ký tự; mức Đồng (quá yếu) → 400 `validation_error` "Mật khẩu quá yếu" (cùng hàm `evaluatePasswordStrength` trong `packages/shared` với thanh độ mạnh trên web). Tạo user + hộp + đội hình mặc định + 11 thẻ khởi đầu + 1 lượt gói 5 miễn phí, **một transaction**. Đặt cookie. F8, F9 |
| 3 | `POST /auth/login` | — | `{ username, password }` | `Me` | Khoá 15' sau 5 lần sai/15'. F8 |
| 4 | `POST /auth/logout` | ✔ | — | — | 204, xoá session |
| 5 | `GET /me` | ✔ | — | `Me` = `{ id, username, coins, freePack5Credits, rewardedMatchesToday, rewardedMatchesLimit }` | |
| 5b | `DELETE /me` | ✔ | `{ username, password? }` | 204, xoá cookie | Xoá tài khoản (NĐ 13) = ẩn danh hoá: tên → `deleted-<id>`, bỏ mật khẩu/email/Google, xoá phiên + analytics; thẻ/trận/sổ cái giữ lại. Sai xác nhận 403 `invalid_credentials`, sai mật khẩu đếm chung khoá đăng nhập (2026-11-16). Tài khoản chỉ Google: phiên phải tạo trong 10 phút gần nhất, không thì 403 `reauth_required` |
| 6 | `GET /cards` | — | — | `Card[]` (toàn bộ ~150 mẫu) | Cache dài (`ETag`). Client dùng để hiển thị theo `cardId` |
| 7 | `GET /player-cards` | ✔ | `?position=&rarity=&sort=ovr\|-ovr\|acquired\|-acquired` | `PlayerCard[]` = `{ id, cardId, level, luck, inSquad, effectiveStats }` | F5 kho thẻ |
| 8 | `POST /player-cards/sell` | ✔ | `{ playerCardIds: Id[] (1–50) }` | `{ coinsGained, balance }` | Tất cả hoặc không. Xác nhận Vàng+/thẻ + là việc của UI. F11 |
| 9 | `POST /player-cards/:id/upgrade` | ✔ + Idem | `{ materialId: Id }` | `{ success, level, luck, rate, fee, balance }` | F10 |
| 10 | `GET /config/economy` | — | — | Bảng ép thẻ, giá bán, thưởng trận, trần/ngày | Để UI hiển thị tỉ lệ & giá (đọc từ config server) |
| 11 | `GET /packs` | ✔ | — | `{ packs: [{ code, size, price, guaranteeAvailable }], box: { left: {bronze,silver,gold,legend}, total, nextOdds, cycle } }` | US-04: số phiếu còn & tỉ lệ lần bốc kế |
| 12 | `POST /packs/:code/open` | ✔ + Idem | `{ payment: 'coins' \| 'free_credit' }` | `{ cards: PlayerCard[], box, balance, freePack5Credits }` | 200. Luồng chi tiết ở §5.1. F5 |
| 13 | `GET /squad` | ✔ | — | `{ formation, slots: { [slot]: Id \| null }, teamRating, warnings[] }` | F6 |
| 14 | `PUT /squad` | ✔ | `{ formation, slots }` | như #13 | Thay toàn bộ (idempotent). Kiểm sở hữu, trùng thẻ, ≤ 5 dự bị |
| 15 | `POST /matches` | ✔ | `{ difficulty }` | `{ matchId, token, seed, rewardEligible, home: MatchTeam, away: MatchTeam }` | 201. Kiểm có GK + đủ 7 người (`invalid_squad`). Đội máy sinh ở server. §5.2 |
| 16 | `POST /matches/:id/result` | ✔ | `{ token, homeGoals, awayGoals, shootout?: { home, away }, inputLog: string (base64url, ≤ 56.000 ký tự) }` | `{ outcome, reward, balance, missions: MissionProgress[] }` | Token dùng 1 lần; nộp lại đúng token cho trận đã `finished` → trả kết quả cũ (không cộng lần 2). Tỉ số client báo chỉ để đối chiếu; server chạy lại `inputLog` (SEC-07, ADR-0011), lệch → 422 `match_token_invalid`; replay quá thời gian/worker lỗi → 503 `internal_error`. F7 |
| 17 | `GET /missions/today` | ✔ | — | `MissionProgress[]` | Tự tạo 3 nhiệm vụ cho ngày GMT+7 nếu chưa có. F12 |
| 18 | `POST /missions/:code/claim` | ✔ | — | `{ reward, balance }` | Một lần/ngày/nhiệm vụ |
| 18b | `POST /missions/expired/claim` | ✔ | — | `{ items, balance }` | Tự nhận nhiệm vụ ngày cũ đã xong mà chưa nhận; `items` chỉ trả đúng một lần (client hiện bảng thông báo khi vào game). Quyết định 15/11/2026 |
| 19 | `GET /admin/retention` | admin | `?from=&to=` | `[{ cohortDay, registered, d1, d7 }]` | F13 |
| 20 | `GET /admin/onboarding` | admin | `?from=&to=` | Số liệu phễu tân thủ | Task 7.6 |
| 21 | `GET /config/auth` | — | — | `{ googleClientId \| null }` | null → ẩn nút Google. ADR-0010 |
| 22 | `POST /auth/google` | — | `{ idToken, username?, acceptTerms? }` (có `username` thì bắt buộc `acceptTerms: true`) | `{ status: 'signed_in', me } \| { status: 'needs_username', suggestedUsername }` | 404 khi chưa cấu hình Google. 201 khi vừa tạo tài khoản. ADR-0010 |
| 23 | `POST /dev/grant-coins` | ✔ | `{ amount }` | `{ balance }` | **Chỉ đăng ký khi `ENABLE_DEV_ROUTES=1`** (dev/E2E) |
| 24 | `GET /pvp/ws` (WebSocket upgrade) | ✔ cookie + `Origin` cùng `Host` | tin nhắn JSON `{ t, … }` | tin nhắn JSON | Không theo khuôn `data` của REST. Giao thức đầy đủ: `docs/specs/pvp-realtime/contracts/ws-protocol.md`, schema Zod `packages/shared/src/api/pvp.ts`. Thiếu/sai `Origin` 403, chưa đăng nhập 401 (trước upgrade). Tối đa 4 kết nối/IP, 512 byte/tin client→server, 120 tin/s. §5.4 |

`MatchTeam = { formation, players: [{ slot, cardId, level, position, stats (đã áp cấp + và phạt sai vị trí) }] }` — sim nhận thẳng cấu trúc này, client không tự tính chỉ số hiệu lực.

## 5. Luồng phía server

### 5.1 Mở gói thẻ (`POST /packs/:code/open`)

```mermaid
sequenceDiagram
  autonumber
  participant C as Web client
  participant R as Route (Fastify)
  participant S as PackService
  participant G as domain/gacha (thuần)
  participant DB as PostgreSQL

  C->>R: POST /packs/pack5/open {payment} + Idempotency-Key + cookie
  R->>R: auth (session) · Zod validate · tra pack trong config
  R->>S: openPack(userId, packCode, payment, key)
  S->>DB: BEGIN
  S->>DB: SELECT … FROM users WHERE id=$1 FOR UPDATE
  S->>DB: SELECT … FROM pack_openings WHERE user_id=$1 AND idempotency_key=$2
  alt Đã có (request lặp)
    S->>DB: COMMIT
    S-->>R: kết quả cũ (result jsonb) — không trừ xu lần 2
  else Lần đầu
    S->>S: kiểm xu ≥ giá (hoặc free_pack5_credits ≥ 1) → nếu không: ROLLBACK, 409
    S->>DB: SELECT … FROM pack_boxes WHERE user_id=$1 FOR UPDATE
    S->>G: drawTickets(box, size, guarantee, rng=crypto.randomInt)
    G-->>S: rarities[], box mới (đã tự làm mới nếu hết phiếu)
    S->>S: với mỗi rarity: chọn đều 1 mẫu trong cards cache theo rarity (crypto.randomInt)
    S->>DB: UPDATE users SET coins = coins - price (hoặc credits - 1)
    S->>DB: INSERT coin_transactions (pack_purchase, -price, balance_after) — bỏ qua nếu price = 0
    S->>DB: UPDATE pack_boxes · INSERT player_cards (×size)
    S->>DB: INSERT pack_openings (key, result) · INSERT analytics_events (pack_open)
    S->>DB: COMMIT
    S-->>R: { cards, box, balance }
  end
  R-->>C: 200 { data }
```

**`drawTickets` (thuần, test được bằng rng giả):**
1. Với mỗi lượt `i` trong `size`: nếu tổng phiếu = 0 → làm mới hộp về 58/30/10/2, `cycle += 1`.
2. Nếu `i` là lượt cuối của gói 5, mọi lượt trước đều `bronze`, và hộp còn phiếu Bạc+ → bốc trong nhóm Bạc+ theo tỉ lệ số còn lại. Ngược lại bốc trên toàn hộp theo tỉ lệ số còn lại.
3. Bốc = `r = randomInt(0, total)`, đi qua `[legend, gold, silver, bronze]` cộng dồn cho tới khi `r < cumulative`; trừ 1 phiếu ở độ hiếm đó.

**Bất biến được test** (PRD §6.3): mở hết 100 phiếu → đúng 2/10/30/58; 10.000 hộp → chi-bình phương p > 0,01 theo từng vị trí bốc; gói 5 không bao giờ ra 5 Đồng khi hộp còn Bạc+; 2 request song song với cùng/khác key → không âm xu, không mở trùng; random chỉ đến từ `node:crypto`.

**Lỗi và hoàn tác:** mọi lỗi giữa `BEGIN` và `COMMIT` → `ROLLBACK`, không trạng thái nào thay đổi. Vi phạm `UNIQUE (user_id, idempotency_key)` do race (không thể xảy ra khi đã khoá `users`, nhưng là chốt chặn) → đọc lại kết quả cũ.

### 5.2 Trận đấu vs máy (match token)

1. `POST /matches`: khoá `users`, đếm trận có thưởng hôm nay (GMT+7) → `reward_eligible`; sinh token 32 byte, lưu `token_hash`, `seed`, `squad_snapshot`; sinh đội máy theo độ khó (OVR ~60 / ~78, từ `cards`).
2. Client chạy `sim` với `home`, `away`, `seed` (dựng bằng `buildMatchSetup` dùng chung với server); Three.js render. `InputRecorder` ghi input THEO TICK + lượt thay người (`packages/sim/src/replay.ts`, ADR-0011).
3. `POST /matches/:id/result`: khoá `users` rồi `matches … FOR UPDATE`; nếu `status = finished` và token khớp → trả lại kết quả đã lưu (client retry khi mất response); kiểm `status = started`, `hash(token) = token_hash`, `now - started_at ≥ 6 phút` (cấu hình được cho test), tỉ số ≤ 20, `shootout` chỉ có khi hoà; tính `outcome` + `reward` (`domain/rewards.ts`), đếm lại trần 15 trận theo `reward_day` = ngày GMT+7 của **lúc nộp** trong cùng transaction; cập nhật xu + ledger + nhiệm vụ + analytics; `status = finished`.
   **Xác minh (SEC-07):** body có `inputLog` (base64url). Server kiểm token/hạn/thời lượng trong một transaction ngắn, rồi chạy `replayMatch` trong `worker_threads` (timeout 5 s, ngoài transaction), tỉ số/luân lưu = kết quả replay; số client báo lệch, log hỏng, chưa tới `full_time` hoặc log dài hơn thời gian thực đã trôi → 422 `match_token_invalid` + analytics `match_replay_mismatch`. Sau đó mở transaction khoá `users` → `matches`, kiểm lại trạng thái (nộp đồng thời/lại vẫn chỉ cộng một lần) rồi cộng thưởng theo tỉ số replay.
4. Trận bỏ dở không nộp → `expired` sau 2 giờ (dọn lười khi người chơi bắt đầu trận mới).

### 5.3 Ép thẻ, bán thẻ

Cùng khuôn với §5.1: `BEGIN` → khoá `users` → khoá `player_cards` của thẻ đích + nguyên liệu (theo `id` tăng dần) → kiểm sở hữu/không trong đội hình/cùng độ hiếm trở lên/chưa +5 → `domain/upgrade.ts` quay tỉ lệ bằng `crypto.randomInt(0, 100) < rate` → xoá nguyên liệu, cập nhật `level`/`luck`, trừ phí, ghi `coin_transactions` + `card_upgrades` → `COMMIT`.

### 5.4 PvP đá trực tiếp (lockstep, ADR-0012)

Nguồn sự thật là **sim bóng của server** (`services/pvp/session.ts`). Server không gửi state xuống client, chỉ gửi **input của hai đội theo từng tick**; hai trình duyệt chạy cùng `stepBoth` tất định nên thấy cùng diễn biến.

```mermaid
sequenceDiagram
  participant A as Trình duyệt A (home hoặc away, tung đồng xu)
  participant S as apps/server (hub + phiên + sim bóng)
  participant B as Trình duyệt B (đội còn lại)
  A->>S: room_create / queue_join
  B->>S: room_join(code) / queue_join
  S-->>A: matched (side, opponent, setup)
  S-->>B: matched
  A->>S: ready (đã tải sân)
  B->>S: ready
  S-->>A: start (countdownMs 3000)
  S-->>B: start
  loop mỗi tick 60 Hz (một vòng lặp chung cho mọi phiên)
    A->>S: input c (chỉ khi đổi; mất focus gửi c=0)
    B->>S: input c
    S->>S: stepBoth(state, {home, away}) — input cuối nhận được
    S-->>A: f [tick, homeCode, awayCode, subs?]
    S-->>B: f [tick, homeCode, awayCode, subs?]
    Note over A,B: client chạy stepBoth trong onmessage, vòng vẽ trễ 3–6 khung
  end
  A->>S: hash (tick bội số 60, h) — so với stateHash của sim bóng
  S-->>A: end (reason, home, away, you: {outcome, reward}) khi sim tới full_time
  S-->>B: end
```

- **Nhịp:** MỘT `PvpTicker` chung (`services/pvp/ticker.ts`), tick theo mốc tuyệt đối `t0 + n·1000/60`, trễ thì chạy bù tối đa 5 tick/lượt (`MAX_CATCHUP_TICKS`), trễ hơn thì bỏ nhịp và ghi analytics. Trận không bao giờ đứng chờ người mạng chậm: chưa có input mới thì giữ input cũ. Giới hạn `PVP_MAX_SESSIONS` = 50 (hằng trong `services/pvp/hub.ts`, đổi bằng sửa code, không phải biến môi trường; theo số đo p99 của `stepBoth`, research R11); quá thì `server_busy`.
- **Phòng và hàng chờ:** nằm trong bộ nhớ một tiến trình (`shortcut:` trong `hub.ts`, nâng cấp khi chạy nhiều instance — BACKLOG). Phòng: mã 6 ký tự không có 0/O/1/I, hạn 10 phút. Hàng chờ FIFO, 60 s thì `offerCpu`, 5 phút thì `queue_timeout`. Mỗi user tối đa một mục trong (hàng chờ ∪ phòng đang chờ ∪ phiên live); socket thứ hai không đẩy socket cũ ra mà chỉ được `rejoin` (`busy` nếu socket cũ còn sống).
- **Rớt mạng:** heartbeat ping mỗi 2 s, quá 5 s không pong là rớt. Cầu thủ người rớt đứng yên, trận chạy tiếp; mỗi lần rớt tối đa 30 s, cộng dồn tối đa 60 s, quá thì xử thua 3-0 (giữ tỉ số nếu người ở lại dẫn hơn). Vào lại bằng `rejoin` và nhận `catchup` (setup + nhật ký v2) để client dựng lại state.
- **Lệch đồng bộ:** client gửi `hash` mỗi 60 tick, server so với `serverHashes`. Lần lệch đầu của một bên thì ép dựng lại bằng `catchup`; lần hai của cùng bên thì `forfeit_desync`; cả hai cùng lần hai thì `void_desync` (huỷ, không thưởng).
- **Thay người:** client gửi `sub`, server kiểm cấu trúc bằng `checkSubStructure` rồi xếp lệnh chờ tới bóng chết và phát kèm khung `f` ở tick đó; client không tự áp dụng.
- **Nghỉ giữa hiệp:** như đá máy nhưng cả hai đội phải bấm chuyền mới đá tiếp, không thì tự đá sau `HALF_TIME_MAX_TICKS` (30 s).
- **Kết thúc:** `services/pvp/finish.ts` chạy cho mọi cách kết thúc, idempotent, trong một transaction: khoá `pvp_matches` (`FOR UPDATE`) rồi hai `users` theo id tăng dần (như §3.4), cập nhật `pvp_matches`, tạo hai dòng `matches`, cộng thưởng đúng một lần (`UNIQUE (pvp_match_id, user_id)`), nhiệm vụ (`applyMissionEvent`, `mode: 'pvp'`), analytics `pvp_end`. Năm sự kiện analytics còn lại (`pvp_matched`, `pvp_start`, `pvp_disconnect`, `pvp_forfeit`, `pvp_desync`) ghi ở hub/phiên. Khi server khởi động, mọi `pvp_matches` còn `live` bị huỷ `server_restart`.
- **Bảo mật WS:** hook `preValidation` kiểm cookie phiên và `Origin` cùng `Host` TRƯỚC khi upgrade (chống CSWSH); tối đa 4 kết nối/IP (`WS_MAX_PER_IP`), tin client→server ≤ 512 byte (`WS_MAX_PAYLOAD`), 120 tin/s (`WS_MAX_MSG_PER_SEC`), bộ đệm gửi > 256 KB thì đóng 4408 (`WS_MAX_BUFFERED`); đăng xuất / xoá tài khoản đóng mọi WS PvP của user. Tin hỏng thì `error` + đóng 4400.

## 6. Mô phỏng trận (`packages/sim`)

- API: `createMatch(setup: { home, away, seed, difficulty, halfLengthSec }) → MatchState`; `step(state, inputs: PlayerInput) → MatchState` (thuần, không đọc đồng hồ); `getEvents(state)` cho HUD/âm thanh.
- Bước cố định `TICK_DT = 1/60`. Client gom thời gian thực vào accumulator, chạy đủ số tick, Three.js nội suy vị trí giữa tick trước và tick hiện tại.
- PRNG: mulberry32 (hoặc tương đương) có seed, nằm trong state → cùng seed + cùng chuỗi input = cùng kết quả (PRD §5 tiêu chí).
- Tầng: `physics/` (bóng có độ cao z, ma sát, va chạm cột) · `rules/` (biên, góc, phát bóng, phạm lỗi, thẻ, luân lưu, đồng hồ) · `ai/` (tầng đội: đội hình/trạng thái tấn–thủ; tầng cầu thủ: steering + quyết định chuyền/sút/rê) · `stats/` (chỉ số thẻ → tham số gameplay, thể lực).
- Test mô phỏng headless bằng Vitest: AI-vs-AI 100 trận, 1.000 cú sút — chạy trong Node, không cần trình duyệt.
- **PvP (ADR-0012, chỉ thêm, đường chạy một người chơi giữ nguyên):** `stepBoth(state, { home, away })` chạy một tick với input riêng của mỗi đội người (`step` = `stepBoth` với đội khách không input); `MatchState` có `humans` cho biết đội nào do người điều khiển; `stateHash(state)` (`hash.ts`, FNV-1a 32-bit) băm một phép chiếu cố định (tick, tỉ số, phase, bóng, từng cầu thủ id/pos/vel) nên đổi cấu trúc state không đổi hash; nhật ký replay v2 (tiền tố `v2.`) ghi input của cả hai đội + thay người, đọc được cả v1; `checkSubStructure` tách phần kiểm cấu trúc khỏi `substitute`. Golden hash của trận một người (`golden-hash.json`) giữ nguyên, kiểm tất định trên Chromium/Firefox/WebKit bằng `pnpm e2e:determinism`.

## 7. Bảo mật (tóm tắt)

| Mối đe doạ | Biện pháp |
|---|---|
| Sửa request để tự cộng xu/thẻ | Client không gửi số xu/thẻ; server tính từ config + DB. Response không chứa gì client có thể "gửi lại" để có lợi |
| Mở gói 2 lần (double click, retry) | `Idempotency-Key` + `UNIQUE` + khoá `users` |
| Race làm âm xu | `FOR UPDATE` + `CHECK (coins >= 0)` |
| Gian lận kết quả trận vs máy | Match token 1 lần, ≥ 6 phút, tỉ số ≤ 20, trần 15 trận/ngày; server chạy lại sim từ log input và tự tính tỉ số (SEC-07, ADR-0011, §5.2) |
| Gian lận trận PvP (báo tỉ số sai, cố ý lệch mã băm, thoát để né thua) | Tỉ số do sim bóng của server chốt, client không báo kết quả; so mã băm mỗi 60 tick, lệch lần hai bị xử thua; rớt > 30 s/lần hoặc > 60 s/trận bị xử thua; thưởng đúng một lần (`UNIQUE (pvp_match_id, user_id)`), trần 15 trận/ngày, tối đa 3 trận/ngày cho mỗi cặp tài khoản |
| Chiếm kết nối WebSocket từ trang khác (CSWSH), làm ngập WS | `Origin` bắt buộc trùng `Host` + cookie phiên kiểm trước upgrade; 4 kết nối/IP, 512 byte/tin, 120 tin/s, `PVP_MAX_SESSIONS` = 50 (§5.4) |
| Đoán tỉ lệ / RNG | `node:crypto`; lint cấm `Math.random` ở server |
| Chiếm phiên | Cookie HttpOnly/Secure/SameSite=Lax, lưu hash token, xoay token khi đăng nhập; hạn trượt 30 ngày nhưng tối đa 90 ngày tuyệt đối (SEC-14) |
| Dò mật khẩu | argon2id, khoá 15' sau 5 lần sai, rate limit `/auth/*` |
| IDOR | Mọi truy vấn lọc theo `user_id` của phiên; trả 404 thay vì 403 cho tài nguyên người khác |

## 8. Môi trường & vận hành

| Môi trường | Thành phần |
|---|---|
| Dev | `pnpm dev`: Vite :5173 (proxy `/api` → :3000, có `ws: true` cho WebSocket PvP) + Fastify :3000 (`tsx watch`). Postgres 16 chạy bằng Docker (`docker compose -f docker-compose.dev.yml up -d`, thêm ở task 6.1) |
| Test | Vitest. Test DB-integration dùng Postgres thật qua `DATABASE_URL_TEST`; mỗi test chạy trong transaction rồi rollback, hoặc truncate giữa các file |
| Prod | `docker compose up -d --build` (`docker-compose.yml`, `Dockerfile`, `deploy/`, ADR-0007): Caddy (HTTPS tự động, file tĩnh web, reverse proxy `/api`, header bảo mật + CSP có `connect-src … wss:` cho WebSocket PvP) + server (user `node`, healthcheck `/api/v1/health`) + Postgres (không mở cổng ra ngoài). Dịch vụ một lần `migrate` chạy migration + seed thẻ bằng role chủ `pitch_owner` rồi mới bật server; server dùng role `pitch_app` chỉ có SELECT/INSERT/UPDATE/DELETE (`deploy/postgres-init/01-app-role.sh`). Trước khi cập nhật bản có migration mới: `pg_dump` |

Biến môi trường (server): `DATABASE_URL`, `SESSION_SECRET`, `PORT`, `HOST`, `NODE_ENV`, `MATCH_MIN_DURATION_SEC` (mặc định 360; test đặt nhỏ), `ENABLE_DEV_ROUTES` (chỉ bật route `/api/v1/dev/*` khi `=1`; mặc định tắt — không suy ra từ `NODE_ENV`), `DATABASE_URL_TEST` (DB cho test), `TRUST_PROXY` (`=1` chỉ khi chạy sau Caddy — đọc IP thật từ `X-Forwarded-For`), `GOOGLE_CLIENT_ID` (thiếu thì tắt đăng nhập Google), `REPLAY_TEST_HALF_LENGTH_SEC` và `REPLAY_TEST_AUTOPILOT` (chỉ cho e2e: server replay trận `?half=…&autopilot=1`; cấm ở production, `config/env.ts`). Production bắt buộc đặt `DATABASE_URL` và `SESSION_SECRET` (`config/env.ts`).
Quyền admin: cột `users.is_admin`, bật bằng script `pnpm --filter @pitch/server admin:grant <username>` (không có API cấp quyền).

## 9. Quyết định mở (chưa cần ADR)

- ~~Animation lật thẻ~~ → CSS 3D + Web Animations API ([ADR-0008](adr/0008-card-reveal-css-waapi.md)).
- ~~Cách sinh ảnh đại diện thẻ~~ → avatar vector SVG sinh từ `avatar_seed` (`apps/web/src/components/card/Avatar.tsx`).
- Có cần cursor pagination cho kho thẻ → khi kho > 500 thẻ.
