# SHDD NETWORK — Plan wdrożeniowy

**Autor:** Shithead Dev + BigZen  
**Data:** 2026-05-21  
**Wersja:** 1.0  
**Status:** Implementacja fazy 0 (Senior Update) zakończona.

---

## Spis treści

1. [Filozofia](#1-filozofia)
2. [Stack technologiczny](#2-stack-technologiczny)
3. [Baza danych — szczegółowy schemat](#3-baza-danych--szczegółowy-schemat)
4. [Architektura API](#4-architektura-api)
5. [Planety](#5-planety)
6. [Monetyzacja — pełen model](#6-monetyzacja--pełen-model)
7. [System skinów unikatowych](#7-system-skinów-unikatowych)
8. [System płatności (Stripe)](#8-system-płatności-stripe)
9. [Fazy implementacji — taski zależnościowe](#9-fazy-implementacji--taski-zależnościowe)
10. [Pliki — manifest wszystkich plików](#10-pliki--manifest-wszystkich-plików)
11. [Miary sukcesu](#11-miary-sukcesu)
12. [Słownik pojęć](#12-słownik-pojęć)

---

## 1. FILOZOFIA

### 1.1 Misja

SHDD NETWORK to nie gra. To miejsce. Platforma światów, w której każdy może być kim chce, robić co chce, z kim chce, kiedy chce i gdzie chce. Zero ocen, zero hejtu, zero "jesteś za słaby". Wchodzisz, jesteś kim chcesz, nikt cię nie ocenia.

Inspiracja: OASIS z Ready Player One. Realizacja: własna, od gracza dla gracza.

### 1.2 Zasady naczelne

1. **Zero blokad** — wszystko jest dostępne za free. Płacisz za wygodę i unikatowość, nie za dostęp.
2. **Zero pay-to-win** — żaden przedmiot premium nie daje przewagi w żadnej grze.
3. **Zero reklam** — nigdy, przenigdy.
4. **Jedno konto** — ten sam awatar, znajomi, chat we wszystkich światach.
5. **Prywatność** — żadnych metryk, śledzenia, profilowania. Konto = email + nick.
6. **Od gracza dla gracza** — twórca jest graczem, nie korpo.

### 1.3 Kim jesteśmy

- **Shithead Dev** — wizjoner, gracz, twórca światów. Nie sprzedaje produktu, tworzy przestrzeń. Gra razem z wami.
- **BigZen** — architekt, senior, spokój w chaosie. Zamienia wizję w kod.

---

## 2. STACK TECHNOLOGICZNY

### 2.1 Warstwy

| Warstwa | Technologia | Wersja | Koszt | Uwagi |
|---|---|---|---|---|
| **Hosting frontendu** | Cloudflare Pages | - | Free | Deploy z GitHub, preview deployments |
| **Framework frontend** | Vite + React 18 | 6.x + 18.x | Free | TS strict mode, brak CRA |
| **Silnik 2D** | Canvas 2D API | - | Free | Renderer własny w TS |
| **Silnik 3D** | Three.js | r160+ | Free | Dopiero w Fazie 3 |
| **Auth** | Supabase Auth | - | $0-15/mies | Email/password + OAuth |
| **Baza relacyjna** | Supabase Postgres | - | $0-15/mies | RLS, pgcrypto, JSONB |
| **Cache / KV** | Cloudflare Workers KV | - | Free (1GB) | Sesje, tickety, rate limit |
| **Structured data** | Cloudflare D1 | - | Free (5GB) | SQLite-based, payments, cosmetics |
| **Binary storage** | Cloudflare R2 | - | Free (10GB) | Saves, blueprints, avatary, mods |
| **API Gateway** | Cloudflare Workers | - | Free (100k req/d) | TypeScript, ES modules |
| **WebSockets** | Supabase Realtime | - | Free | Bcast + presence (WAL-less) |
| **Płatności** | Stripe | - | 2.9%+0.30PLN/tx | Webhooks + Checkout Sessions |
| **CI/CD** | GitHub Actions | - | Free | Lint + typecheck + deploy |

### 2.2 Diagram przepływu danych

```
                        ┌──────────────┐
                        │  Użytkownik  │
                        │  (przegląd.) │
                        └──────┬───────┘
                               │ HTTPS
                    ┌──────────▼──────────┐
                    │  Cloudflare DNS     │
                    │  *.shdd.network     │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Cloudflare Pages   │
                    │  (static assets)    │
                    │  / → index.html     │
                    │  /novactorio → app  │
                    └──────────┬──────────┘
                               │
               ┌───────────────┼───────────────┐
               │               │               │
     ┌─────────▼──────┐ ┌─────▼───────┐ ┌─────▼──────────┐
     │ CF Worker: API │ │ Supabase    │ │ CF R2 / D1     │
     │ /api/v1/*      │ │ Auth+Real   │ │ Persistence    │
     └────────────────┘ └─────────────┘ └────────────────┘
```

### 2.3 Konwencje kodowania

- TypeScript strict mode, brak `any`
- Pliki: PascalCase dla komponentów (`CoopMenu.tsx`), camelCase dla serwisów (`authService.ts`), kebab-case dla migracji (`20260521_coop_lobbies.sql`)
- Imports: absolutne (alias `@/` → `src/`)
- Styl: niestandardowy (vs code? Prettier?) — do ustalenia, na razie brak lintera

---

## 3. BAZA DANYCH — SZCZEGÓŁOWY SCHEMAT

### 3.1 Supabase (Postgres) — tabele istniejące

#### `profiles`

```sql
CREATE TABLE profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  username          TEXT UNIQUE NOT NULL,
  premium_tier      TEXT DEFAULT 'free' CHECK (premium_tier IN ('free', 'supporter', 'founder')),
  premium_updated_at TIMESTAMPTZ,
  avatar_data       JSONB DEFAULT '{}',       -- { skinColor, hatType, trailEffect }
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX profiles_username_idx ON profiles (lower(username));

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- SELECT: everyone
-- INSERT: own
-- UPDATE: own (or service_role for premium_tier changes)
```

**RLS policies:**
- `SELECT`: `USING (true)` — każdy widzi profile
- `INSERT`: `WITH CHECK (auth.uid() = id)` — tylko własny profil
- `UPDATE`: `USING (auth.uid() = id) WITH CHECK (auth.uid() = id)` — tylko własny

#### `friendships`

```sql
CREATE TABLE friendships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  friend_id       UUID NOT NULL,
  user_username   TEXT NOT NULL,
  friend_username TEXT NOT NULL,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);
CREATE INDEX friendships_user_idx ON friendships (user_id);
CREATE INDEX friendships_friend_idx ON friendships (friend_id);
```

**RLS policies:**
- `SELECT`: `USING (auth.uid() = user_id OR auth.uid() = friend_id)` — tylko uczestnicy
- `INSERT`: `WITH CHECK (auth.uid() = user_id)` — zapraszający
- `UPDATE`: `USING (auth.uid() = friend_id)` — akceptujący
- `DELETE`: `USING (auth.uid() = user_id OR auth.uid() = friend_id)` — każda strona

#### `chat_messages`

```sql
CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  username    TEXT NOT NULL,
  message     TEXT NOT NULL CHECK (char_length(message) <= 200),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX chat_messages_created_idx ON chat_messages (created_at DESC);
```

**Triggers:** `cleanup_old_chat()` (usuwa starsze niż 300 wiadomości), `check_chat_rate_limit()` (max 1/2s)

**RLS policies:**
- `SELECT`: `USING (true)`
- `INSERT`: `WITH CHECK (auth.uid() IS NOT NULL)`

#### `world_snapshots`

```sql
CREATE TABLE world_snapshots (
  user_id         UUID PRIMARY KEY,
  username        TEXT NOT NULL,
  tick            INTEGER NOT NULL DEFAULT 0,
  building_count  INTEGER NOT NULL DEFAULT 0,
  world_data      TEXT,  -- JSON budynków dla co-op visit
  save_data       TEXT,  -- JSON pełnego save'a
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `coop_lobbies`

```sql
CREATE TABLE coop_lobbies (
  world_code    TEXT PRIMARY KEY,           -- 6 znaków: ABCDEFGHJKLMNPQRSTUVWXYZ23456789
  host_id       UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  world_seed    INTEGER NOT NULL,
  state         TEXT DEFAULT 'open' CHECK (state IN ('open','in_game','closed')),
  max_players   INTEGER DEFAULT 8,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX coop_lobbies_host_idx ON coop_lobbies (host_id);
```

**RLS policies:**
- `SELECT`: `USING (true)` — każdy widzi lobbies
- `INSERT`: `WITH CHECK (auth.uid() IS NOT NULL)` — każdy zalogowany tworzy
- `UPDATE`: `USING (auth.uid() = host_id)` — tylko host zmienia
- `DELETE`: `USING (auth.uid() = host_id)` — tylko host usuwa

#### `coop_members`

```sql
CREATE TABLE coop_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_code      TEXT NOT NULL REFERENCES coop_lobbies ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  username        TEXT NOT NULL,
  role            TEXT DEFAULT 'member' CHECK (role IN ('host','member')),
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  last_heartbeat  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(world_code, user_id)
);
CREATE INDEX coop_members_world_idx ON coop_members (world_code);
CREATE INDEX coop_members_user_idx ON coop_members (user_id);
```

**RLS policies:**
- `SELECT`: `USING (true)`
- `INSERT`: `WITH CHECK (auth.uid() IS NOT NULL)`
- `UPDATE`: `USING (auth.uid() = user_id)` — heartbeat
- `DELETE`: `USING (auth.uid() = user_id OR auth.uid() IN (SELECT host_id FROM coop_lobbies WHERE world_code = coop_members.world_code))` — self-leave lub host kick

### 3.2 Cloudflare D1 — tabele nowe

#### `payments`

```sql
-- D1 SQLite syntax
CREATE TABLE payments (
  id                TEXT PRIMARY KEY,          -- UUID
  user_id           TEXT NOT NULL,
  username          TEXT NOT NULL,
  stripe_session_id TEXT UNIQUE NOT NULL,
  amount            REAL NOT NULL,             -- w PLN
  currency          TEXT DEFAULT 'PLN',
  product           TEXT NOT NULL,             -- 'founder_pack', 'supporter_badge', 'unique_skin', 'hosting'
  product_ref       TEXT,                      -- skin_id / badge_id / hosting_id
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','refunded')),
  created_at        TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_stripe ON payments(stripe_session_id);
```

#### `skins`

```sql
CREATE TABLE skins (
  id              TEXT PRIMARY KEY,           -- UUID
  owner_id        TEXT,                       -- NULL = niezajęty
  pattern_data    TEXT NOT NULL,              -- JSON: { colors: [], pattern: string, effect: string }
  hash            TEXT UNIQUE NOT NULL,        -- unikalny fingerprint (SHA256 z pattern_data)
  source          TEXT NOT NULL,              -- 'achievement', 'birthday', 'raffle', 'purchase'
  source_ref      TEXT,                       -- achievement_id / NULL
  price           REAL NOT NULL DEFAULT 100,  -- w PLN
  claimed_at      TEXT,                       -- kiedy przypisany
  expires_at      TEXT,                       -- NULL = własność, inaczej data wygaśnięcia rezerwacji
  is_purchased    INTEGER DEFAULT 0,          -- 0 = zarezerwowany, 1 = kupiony na stałe
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_skins_owner ON skins(owner_id);
CREATE INDEX idx_skins_hash ON skins(hash);
```

#### `hosting_subscriptions`

```sql
CREATE TABLE hosting_subscriptions (
  id              TEXT PRIMARY KEY,           -- UUID
  user_id         TEXT NOT NULL,
  world_name      TEXT NOT NULL,              -- nazwa pokoju w Atelier
  active          INTEGER DEFAULT 1,
  stripe_subscription_id TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_hosting_user ON hosting_subscriptions(user_id);
```

#### `blueprint_library`

```sql
CREATE TABLE blueprint_library (
  id              TEXT PRIMARY KEY,           -- UUID
  user_id         TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',
  tags            TEXT DEFAULT '[]',          -- JSON array
  data            TEXT NOT NULL,              -- skompresowany string blueprintu
  is_public       INTEGER DEFAULT 0,
  downloads       INTEGER DEFAULT 0,
  likes           INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_blueprint_user ON blueprint_library(user_id);
CREATE INDEX idx_blueprint_public ON blueprint_library(is_public);
```

### 3.3 Cloudflare R2 — struktura katalogów

```
saves/
  {userId}/
    latest.json              -- ostatni save
    {timestamp}.json         -- historyczne (jeśli premium)
blueprints/
  {hash}.bp                  -- skompresowany blueprint
avatars/
  {userId}.png               -- custom avatar upload
mods/
  {modId}/
    latest.zip
    v{version}.zip
cosmetics/
  skins/
    {skinId}.png             -- render skina
public/
  logo.png
  favicon.ico
```

---

## 4. ARCHITEKTURA API

### 4.1 Cloudflare Worker Router

Endpoint bazowy: `https://api.shdd.network/v1`

Każdy endpoint wraca `{ ok: boolean, data?: T, error?: string }`.

#### Grupa: Auth

| Endpoint | Metoda | Body | Response | Auth |
|---|---|---|---|---|
| `/v1/auth/register` | POST | `{ email, password, username }` | `{ session, profile }` | - |
| `/v1/auth/login` | POST | `{ email, password }` | `{ session, profile }` | - |
| `/v1/auth/logout` | POST | - | `{ ok }` | JWT |
| `/v1/auth/me` | GET | - | `{ profile }` | JWT |

**Implementacja:** Proxy do Supabase Auth. Worker dodaje CORS + rate limiting.

#### Grupa: Lobby

| Endpoint | Metoda | Body | Response | Auth |
|---|---|---|---|---|
| `/v1/lobby/create` | POST | `{ worldSeed }` | `{ lobby }` | JWT |
| `/v1/lobby/join` | POST | `{ worldCode }` | `{ lobby }` | JWT |
| `/v1/lobby/leave` | POST | `{ worldCode }` | `{ ok }` | JWT |
| `/v1/lobby/info` | GET | `?code=XXX` | `{ lobby }` | JWT |
| `/v1/lobby/heartbeat` | POST | `{ worldCode }` | `{ ok }` | JWT |

**Implementacja:** Worker waliduje JWT, wykonuje operacje na `coop_lobbies` i `coop_members` przez Supabase REST. Generuje kod 6-znakowy z zestawu `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (bez 0, O, I, 1 — czytelność).

#### Grupa: Payments

| Endpoint | Metoda | Body | Response | Auth |
|---|---|---|---|---|
| `/v1/payments/create-session` | POST | `{ product, price, metadata }` | `{ sessionUrl }` | JWT |
| `/v1/payments/webhook` | POST | Stripe Event | `{ received }` | Stripe-Signature |
| `/v1/payments/history` | GET | - | `{ payments[] }` | JWT |

**Implementacja:**
- `create-session`: Tworzy Stripe Checkout Session, zapisuje pending payment w D1
- `webhook`: Odbiera `checkout.session.completed`, aktualizuje D1, przyznaje produkt (badge/skin/hosting)
- `history`: Czyta z D1 po `user_id`

#### Grupa: Cosmetics

| Endpoint | Metoda | Body | Response | Auth |
|---|---|---|---|---|
| `/v1/cosmetics/skins/mine` | GET | - | `{ owned[], reserved[], marketplace[] }` | JWT |
| `/v1/cosmetics/skins/purchase` | POST | `{ skinId }` | `{ sessionUrl }` | JWT |
| `/v1/cosmetics/skins/list-marketplace` | GET | - | `{ skins[] }` | JWT |
| `/v1/cosmetics/skins/buy-marketplace` | POST | `{ skinId }` | `{ ok }` | JWT |
| `/v1/cosmetics/skins/equip` | POST | `{ skinId }` | `{ ok }` | JWT |

**Implementacja:** Worker waliduje własność, tworzy Stripe session dla zakupu, zarządza listingiem marketplace.

#### Grupa: Profiles

| Endpoint | Metoda | Body | Response | Auth |
|---|---|---|---|---|
| `/v1/profiles/{userId}` | GET | - | `{ profile, badges, equippedSkin }` | - |
| `/v1/profiles/me` | PATCH | `{ avatarData }` | `{ profile }` | JWT |
| `/v1/profiles/me/stats` | GET | - | `{ playtime, achievements, ... }` | JWT |

**Implementacja:** Czyta z Supabase (profile) + D1 (badges, skiny) + R2 (avatar).

### 4.2 Supabase Realtime — kanały

| Kanał | Zdarzenia | Kto subskrybuje | Opis |
|---|---|---|---|
| `coop-{worldCode}` | `pos`, `leave`, `build_place`, `build_remove`, `heartbeat`, `state_delta` | Uczestnicy lobby | Co-op sync |
| `chat-global` | `message` | Wszyscy | Globalny czat |
| `chat-lobby-{lobbyId}` | `message`, `join`, `leave` | Uczestnicy lobby | Czat lobby |

### 4.3 Typy payloadów (TypeScript)

```typescript
// === Co-op ===
interface CoopPosPayload {
  id: string;          // userId
  username: string;
  x: number;
  y: number;
  color: string;
}

interface CoopBuildPlacePayload {
  type: string;        // building type np. 'miner'
  x: number;
  y: number;
  dir: string;         // 'up' | 'down' | 'left' | 'right'
  senderId: string;
  nonce: string;       // UUID, deduplikacja
}

interface CoopBuildRemovePayload {
  x: number;
  y: number;
  senderId: string;
  nonce: string;
}

interface CoopHeartbeatPayload {
  userId: string;
  tick: number;
}

interface CoopStateDeltaPayload {
  buildings: [string, Building][];
  conveyors: [string, ConveyorState[]][];
  tick: number;
}

// === Payments ===
interface StripeSessionRequest {
  product: 'founder_pack' | 'supporter_badge' | 'unique_skin' | 'hosting';
  price: number;           // w PLN
  metadata: Record<string, string>;
}

interface StripeSessionResponse {
  sessionUrl: string;      // przekierowanie do Stripe Checkout
}

// === Cosmetics ===
interface SkinData {
  id: string;
  ownerId: string | null;
  patternData: {            // JSON z kolorem + wzorem + efektem
    primaryColor: string;
    secondaryColor: string;
    pattern: string;        // 'stripes', 'dots', 'flame', 'geometric', 'pixel'
    effect: string;         // 'glow', 'sparkle', 'none'
  };
  hash: string;
  source: 'achievement' | 'birthday' | 'raffle' | 'purchase';
  price: number;
  isPurchased: boolean;
  createdAt: string;
}

interface BadgeData {
  type: 'supporter_7pln' | 'founder' | 'beta_tester';
  label: string;
  color: string;
  iconUrl: string;
}
```

---

## 5. PLANETY

### 5.1 Novactorio — Planeta 1 (2D, pixel art, factory builder)

**Stan:** ✅ W produkcji po Fazie 0.  
**Silnik:** Canvas 2D + własny TS renderer.  
**Katalog:** `src/` (główne repo).  
**Subdomena:** `novactorio.shdd.network` lub `/` (dla MVP).

#### Co zostało do zrobienia (Phase 1 Novactorio Polish):

| Lp | Task | Pliki | Czas | Priorytet |
|---|---|---|---|---|
| 1 | Balancing surowców (ilości, proporcje, craft tree) | `game/constants.ts`, `core/systems/production.ts` | 2 dni | WYSOKI |
| 2 | Więcej achievementów (20+) z nagrodami | `core/systems/achievements.ts`, `game/constants.ts` | 1 dzień | ŚREDNI |
| 3 | Samouczek interaktywny (pierwsze 5 min) | `components/Tutorial.tsx`, `core/systems/tutorial.ts` | 3 dni | WYSOKI |
| 4 | UI/UX: tooltipy, feedback kliknięć, animacje | `components/`, `renderer.ts` | 3 dni | ŚREDNI |
| 5 | Sound design: SFX (build, mine, craft) + ambient | `game/audio.ts`, `assets/sfx/` | 4 dni | ŚREDNI |
| 6 | Optymalizacja chunkowania i renderowania | `core/systems/chunk.ts`, `renderer.ts` | 2 dni | WYSOKI |
| 7 | Więcej tipów i dialogów NPC | `game/constants.ts`, `core/systems/entity.ts` | 1 dzień | NISKI |
| 8 | Przygotowanie pod NETWORK SDK | `services/network/NetworkSDK.ts` | 2 dni | WYSOKI |

#### Task 1 szczegółowo: Balancing surowców

**Problem:** Obecnie gracz startuje z 200 iron, 150 copper, 150 coal. To za dużo — zabija progres.

**Nowy start:**
```
inventory: [
  { itemId: 'iron', count: 50 },
  { itemId: 'copper', count: 30 },
  { itemId: 'coal', count: 20 },
  { itemId: 'stone', count: 10 },
]
```

**Proporcje craftingu:**
| Przepis | Input | Output | Czas (ticki) |
|---|---|---|---|
| Iron Plate | 1 iron | 1 iron_plate | 10 |
| Copper Plate | 1 copper | 1 copper_plate | 10 |
| Steel Plate | 5 iron_plate | 1 steel_plate | 40 |
| Gear | 2 iron_plate | 1 gear | 15 |
| Circuit | 3 iron_plate + 2 copper_plate | 1 circuit | 30 |
| Ammo | 1 iron_plate | 5 ammo | 5 |

### 5.2 Void — Planeta 2 (3D, chill, czat)

**Stan:** 📅 Plan (Faza 3).  
**Silnik:** Three.js r160+.  
**Katalog:** `planets/void/`.  
**Subdomena:** `void.shdd.network`.

**Mechanika:**
- Awatar wchodzi do pustki
- Widzi innych graczy jako kolorowe postacie (box + skin + nick nad głową)
- Czat nad głową + globalny czat po lewej
- Może usiąść (toggle sit), patrzeć w gwiazdy
- Gwiazdy proceduralne (particle system WebGL)
- Zero celów, zero questów, zero presji

**Technicznie (Three.js):**
```
Scene:
  - Skybox: procedural (gradient + gwiazdy)
  - Ground: przezroczysta platforma (torus lub plane z emission)
  - Avatars: BoxGeometry + MeshStandardMaterial (kolor z skinu)
  - Nickname: CSS2DRenderer (tekst nad głową)
  - Chat: HTML overlay (React)
Networking:
  - Realtime channel: void-{roomId}
  - Broadcast: pos (10Hz), chat, animacje (sit/wave)
  - Presence: heartbeat 1s, timeout 5s
```

**Pliki:**
```
planets/void/
├── index.html
├── src/
│   ├── main.ts              # init Three.js + React overlay
│   ├── scene.ts              # skybox, ground, lights
│   ├── avatar.ts             # Avatar class (mesh + skin + nick)
│   ├── network.ts            # Realtime sync
│   ├── chat.ts               # HTML overlay czatu
│   └── styles.css
├── package.json
├── tsconfig.json
└── wrangler.toml             # deploy do Cloudflare Pages
```

### 5.3 Arcade — Planeta 3 (3D, gry wieloosobowe)

**Stan:** 📅 Plan (Faza 3+).  
**Silnik:** Three.js.  
**Katalog:** `planets/arcade/`.

**Mechanika:**
- Wnętrze arkady z automatami (3D, niski poly, neonowe światła)
- Każdy automat to inna gra (Snake, Pong, Tetris)
- Podchodzisz, klikasz, grasz z kimś kto też stoi przy automacie
- Leaderboard na ścianie (tylko free, zero nagród)

### 5.4 Atelier — Planeta 4 (3D, twój kąt)

**Stan:** 📅 Plan (Faza 3+).  
**Silnik:** Three.js + edytor.  
**Katalog:** `planets/atelier/`.

**Mechanika:**
- Każdy gracz ma pokój (jeden za free)
- Może go udekorować meblami (box + kolor)
- Zaprasza znajomych
- Pokój jest zapisywany w R2 jako JSON
- Dodatkowe pokoje = hosting (50 PLN / mies.)

---

## 6. MONETYZACJA — PEŁEN MODEL

### 6.1 Zasady

1. **Zero blokad.** Każda funkcjonalność gry jest dostępna za free. Premium nie odblokowuje mechanik.
2. **Kupujesz bo chcesz, nie bo musisz.** Founder Pack, Supporter Badge, skiny — to wszystko są "chcę wesprzeć i dostać coś fajnego".
3. **Cena adekwatna do wartości sentymentalnej.** Skiny unikatowe kosztują 100 PLN nie dlatego że tyle kosztuje wyprodukowanie, tylko dlatego że nikt inny nie będzie miał takiego samego.
4. **Brak subskrypcji miesięcznej.** 2 miesiące to sweet spot: kupujesz i zapominasz.
5. **Brak FOMO presji.** "Kup teraz bo za godzinę zniknie" — nie. "Ten skin istnieje w jednym egzemplarzu, możesz go mieć" — tak.

### 6.2 Founder Pack — 49 PLN (jednorazowo)

**Co zawiera:**

| Element | Gdzie widoczny | Implementacja |
|---|---|---|
| Custom title "Founder" | Profil, czat, hover nad awatarem | D1: `premium_tier = 'founder'` w profiles |
| Złota ramka awatara | Wszystkie planety, renderowanie avatara | `avatar_data.borderColor = '#FFD700'` |
| Credits na stronie `/credits` | Strona publiczna | D1: lista founderów |
| Achievement "Pioneer" | Profil, statystyki | D1: `achievements` tab |

**Flow zakupu:**
```
1. Gracz klika "Kup Founder Pack" w ShopMenu
2. POST /v1/payments/create-session { product: 'founder_pack', price: 49 }
3. Stripe tworzy Checkout Session → zwraca URL
4. Gracz płaci na Stripe
5. Webhook `checkout.session.completed` → Worker:
   a. Aktualizuje profiles.premium_tier = 'founder'
   b. Wstawia wpis do D1 payments
   c. Dodaje achievement 'pioneer'
6. Frontend po powrocie ze Stripe odświeża profil
```

### 6.3 Supporter Badge — 7 PLN / 2 miesiące

**Co zawiera:**

| Element | Gdzie widoczny | Implementacja |
|---|---|---|
| Różowe imię w czacie | `ChatPanel.tsx` | `chat message color = member.premium_tier === 'supporter' ? '#f472b6' : 'white'` |
| Ikonka "Supporter" | Czat, profil, nad awatarem | `BadgeData { type: 'supporter_7pln', iconUrl }` |
| Wczesny dostęp do planet | Beta nowych światów | Feature flag w profilu |

**Flow zakupu:**
```
1. Stripe Billing: tworzy Subscription (co 2 miesiące)
2. Webhook `invoice.paid` → Worker przedłuża badge
3. Webhook `customer.subscription.deleted` → Worker cofa badge
```

### 6.4 Skiny unikatowe — 100 PLN za sztukę

[Szczegółowa specyfikacja w sekcji 7]

### 6.5 Hosting światów (Atelier) — 50 PLN / miesiąc

| Element | Za free | Za 50 PLN/mies. |
|---|---|---|
| Pokój w Atelier | 1 | 5 |
| Zapraszanie znajomych | Tak | Tak |
| Custom name pokoju | - | Tak |
| Upload własnych assetów | - | Tak |
| Eksport pokoju do JSON | - | Tak |

**Flow:** Stripe Subscription co miesiąc, webhook zarządza hosting_subscriptions w D1.

### 6.6 Prognoza finansowa

| Miesiąc | Użytkownicy | Founder (5%) | Supporter (3%) | Skiny (1%) | Hosting (0.5%) | Przychód |
|---|---|---|---|---|---|---|
| 1 | 100 | 5 × 49 = 245 | 3 × 3.5 = 10.5 | 1 × 100 = 100 | 0 | ~355 PLN |
| 3 | 500 | 25 × 49 = 1225 | 15 × 3.5 = 52.5 | 5 × 100 = 500 | 2 × 50 = 100 | ~1877 PLN |
| 6 | 2000 | 100 × 49 = 4900 | 60 × 3.5 = 210 | 20 × 100 = 2000 | 10 × 50 = 500 | ~7610 PLN |
| 12 | 10000 | 500 × 49 = 24500 | 300 × 3.5 = 1050 | 100 × 100 = 10000 | 50 × 50 = 2500 | ~38050 PLN |

**Koszty stałe:** ~50 PLN / mies. (Supabase Nano $15 + domeny ~10 PLN + reszta free).

---

## 7. SYSTEM SKINÓW UNIKATOWYCH

### 7.1 Generator skinów

#### `services/cosmetics/SkinGenerator.ts`

```typescript
interface PatternConfig {
  primaryColor: string;      // kolor bazowy
  secondaryColor: string;    // kolor akcentu
  pattern: string;           // 'stripes' | 'dots' | 'flame' | 'geometric' | 'pixel' | 'wave'
  effect: string;            // 'glow' | 'sparkle' | 'pulse' | 'none'
}

interface GeneratedSkin {
  id: string;                // UUID
  patternData: PatternConfig;
  hash: string;              // SHA256 z JSON.stringify(patternData)
  previewUrl: string;        // R2 URL do PNG
}

function generateSkin(seed: string): GeneratedSkin {
  // Deterministicznie z seeda (np. userId + day)
  const hash = sha256(seed);
  const primaries = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
  const secondaries = ['#2C3E50', '#34495E', '#1A1A2E', '#16213E', '#0F3460', '#533483', '#E94560', '#F5A623', '#7B1FA2', '#00695C'];
  const patterns = ['stripes', 'dots', 'flame', 'geometric', 'pixel', 'wave'];
  const effects = ['glow', 'sparkle', 'pulse', 'none'];

  return {
    id: uuid(),
    patternData: {
      primaryColor: primaries[parseInt(hash.substring(0, 2), 16) % primaries.length],
      secondaryColor: secondaries[parseInt(hash.substring(2, 4), 16) % secondaries.length],
      pattern: patterns[parseInt(hash.substring(4, 6), 16) % patterns.length],
      effect: effects[parseInt(hash.substring(6, 8), 16) % effects.length],
    },
    hash: hash.substring(0, 12),
    previewUrl: ''
  };
}
```

#### Zdarzenia generujące skin

| Zdarzenie | Kiedy | Trigger | Uwagi |
|---|---|---|---|
| **Achievement** | Gracz zdobywa achievement "100h", "1000 buildings" itp. | `applyResearchEffects` / `checkAchievements` | Skin za ciężką pracę |
| **Urodziny konta** | Rocznica rejestracji | Cron worker (sprawdza codziennie) | Skin za lojalność |
| **Raffle** | System losuje co N ticków | `updateWorld` (szansa 0.1% na tick) | Skin z zaskoczenia |
| **Purchase** | Gracz kupuje za 100 PLN | Webhook Stripe | Skin celowy |

### 7.2 Dystrybucja

Kiedy skin zostaje wygenerowany dla gracza:

```
1. System tworzy rekord w D1: skins { id, owner_id = null, hash, source, price: 100, expires_at: now+30d }
2. Na ekranie pojawia się powiadomienie: "✨ Nowy unikatowy skin czeka na Ciebie!"
3. Gracz ma 30 dni na zakup (cena: 100 PLN przez Stripe)
4. Jeśli kupi → owner_id = userId, is_purchased = 1, expires_at = NULL
5. Jeśli nie kupi w 30 dni → skin znika, hash wraca do puli (może trafić do kogoś innego)
6. Po zakupie: skin jest widoczny na awatarze we WSZYSTKICH planetach
```

### 7.3 Rynek secondary

Gracz który kupił skin może go sprzedać:

```
1. Gracz wystawia skin na marketplace
2. Cena: dowolna (min 50 PLN, max 500 PLN)
3. NETWORK bierze 5% prowizji
4. Kupujący płaci → skin zmienia owner_id
5. Historia własności skinu jest widoczna (blockchain-like, ale na D1)
```

### 7.4 Renderowanie skinu na awatarze

W Novactorio (2D):
```typescript
function renderAvatar(ctx: CanvasRenderingContext2D, skin: SkinData, x: number, y: number) {
  // Rysuj postać z kolorami i wzorem z skinu
  ctx.fillStyle = skin.patternData.primaryColor;
  ctx.fillRect(x, y, 16, 16); // body
  ctx.fillStyle = skin.patternData.secondaryColor;
  // pattern rendering...
  if (skin.patternData.effect === 'glow') {
    ctx.shadowBlur = 10;
    ctx.shadowColor = skin.patternData.primaryColor;
  }
}
```

W Void (3D, Three.js):
```typescript
function createAvatarMesh(skin: SkinData): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.8, 1.6, 0.8);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(skin.patternData.primaryColor),
    emissive: skin.patternData.effect === 'glow' ? new THREE.Color(skin.patternData.primaryColor) : undefined,
    emissiveIntensity: 0.2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // pattern as decal or texture...
  return mesh;
}
```

---

## 8. SYSTEM PŁATNOŚCI (STRIPE)

### 8.1 Worker: `stripe-webhook.ts`

```typescript
// Endpoint: POST /api/v1/payments/webhook
// Stripe webhook secret: env.STRIPE_WEBHOOK_SECRET

async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  const signature = request.headers.get('stripe-signature');
  const body = await request.text();

  const event = Stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { userId, product } = session.metadata;
      const amount = session.amount_total / 100; // z groszy na PLN

      // Zapisz w D1
      await env.DB.prepare(`
        INSERT INTO payments (id, user_id, username, stripe_session_id, amount, product, status)
        VALUES (?, ?, ?, ?, ?, ?, 'completed')
      `).bind(uuid(), userId, session.metadata.username, session.id, amount, product).run();

      // Przyznaj produkt
      switch (product) {
        case 'founder_pack':
          await grantFounderPack(userId, env);
          break;
        case 'unique_skin':
          await grantSkin(userId, session.metadata.skinId, env);
          break;
        case 'hosting':
          await activateHosting(userId, env);
          break;
      }
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionChange(event.data.object, env);
      break;
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
```

### 8.2 Frontend: `services/payment/PaymentService.ts`

```typescript
class PaymentService {
  static async createSession(product: string, price: number, metadata: Record<string, string>): Promise<string> {
    const { data, error } = await supabase.functions.invoke('stripe-create-session', {
      body: { product, price, metadata },
    });
    if (error) throw error;
    return data.sessionUrl; // redirect to Stripe
  }

  static async redirectToStripe(product: string, price: number, metadata: Record<string, string>): Promise<void> {
    const url = await this.createSession(product, price, metadata);
    window.location.href = url; // Stripe Checkout redirect
  }
}
```

### 8.3 ShopMenu.tsx — rozszerzenie

```typescript
// W ShopMenu, nowe sekcje:
function ShopFounderPack() {
  const buy = async () => {
    await PaymentService.redirectToStripe('founder_pack', 49, {
      userId: AuthService.getCurrentUserId(),
      username: AuthService.getCurrentUser(),
    });
  };
  return (
    <div className="p-4 border border-yellow-500/30 rounded-xl">
      <h3 className="font-orbitron text-yellow-400">👑 Founder Pack — 49 PLN</h3>
      <p className="text-white/50 text-xs mt-1">Jednorazowo. Na zawsze. Bo wierzysz w tę wizję.</p>
      {!isFounder ? (
        <button onClick={buy} className="mt-3 px-4 py-2 bg-yellow-600/20 text-yellow-400 rounded-lg">
          KUP TERAZ
        </button>
      ) : (
        <div className="mt-3 text-green-400 text-xs">✅ Masz już Founder Pack. Dziękujemy.</div>
      )}
    </div>
  );
}
```

---

## 9. FAZY IMPLEMENTACJI — TASKI ZALEŻNOŚCIOWE

### 9.1 Mapa zależności

```
Faza 0 (✅)
  └── AuthService + bugfixy + lobby MVP
       │
Faza 1: Monetyzacja
  ├── 1.1 Stripe webhook Worker (blocker dla wszystkiego)
  ├── 1.2 D1 payments table + migracja
  ├── 1.3 Founder Pack (shop UI + przyznawanie)
  ├── 1.4 Supporter Badge (Stripe subscription + UI)
  ├── 1.5 Skin generator + D1 skins table (blocker dla 1.6)
  ├── 1.6 Skiny unikatowe (zakup + przypisanie + renderowanie)
  ├── 1.7 Rynek secondary skinów
  ├── 1.8 Hosting światów (Stripe sub + Atelier integracja)
  └── 1.9 Profil użytkownika (strona /profile)
       │
Faza 2: Novactorio Polish
  ├── 2.1 Balancing
  ├── 2.2 Samouczek
  ├── 2.3 Sound design
  ├── 2.4 UI/UX poprawki
  └── 2.5 Optymalizacja
       │
Faza 3: Planety 3D
  ├── 3.1 NETWORK SDK (uwspólnienie auth/lobby/chat dla planet)
  ├── 3.2 Void (Three.js scaffold + avatary + czat)
  ├── 3.3 Arcade (gry wieloosobowe)
  └── 3.4 Atelier (edytor pokoju)
       │
Faza 4: UGC + SDK
  └── 4.1 SDK publiczny + dokumentacja + przykłady
```

### 9.2 Faza 1 — Taski szczegółowo

#### Task 1.1: Stripe webhook Worker

**Pliki:**
- `src/workers/stripe-webhook.ts` — Cloudflare Worker
- `src/services/payment/PaymentService.ts` — frontend service
- `supabase/migrations/20260521_stripe.sql` — D1 table (ręcznie na Cloudflare)

**Kod `stripe-webhook.ts`:**
```typescript
import { Stripe } from 'stripe';
import { Env } from './env';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const signature = request.headers.get('stripe-signature') || '';
    const body = await request.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      return new Response('Invalid signature', { status: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, env);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionEvent(event, env);
        break;
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  },
};

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, env: Env) {
  const { userId, username, product } = session.metadata || {};
  if (!userId || !product) return;

  // Insert payment record
  await env.DB.prepare(`
    INSERT INTO payments (id, user_id, username, stripe_session_id, amount, currency, product, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')
  `).bind(
    crypto.randomUUID(), userId, username, session.id,
    (session.amount_total || 0) / 100, session.currency?.toUpperCase() || 'PLN', product
  ).run();

  // Grant product
  switch (product) {
    case 'founder_pack':
      await grantFounder(userId, env);
      break;
    case 'unique_skin': {
      const skinId = session.metadata?.skinId;
      if (skinId) await purchaseSkin(userId, skinId, env);
      break;
    }
    case 'hosting':
      await activateHosting(userId, env);
      break;
  }
}

async function grantFounder(userId: string, env: Env) {
  // Update profile in Supabase via service_role key
  const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  await supabaseAdmin.from('profiles').update({ premium_tier: 'founder' }).eq('id', userId);
}
```

**Deploy:** `wrangler deploy src/workers/stripe-webhook.ts --name stripe-webhook`
**Stripe dashboard:** Dodaj endpoint URL → `https://api.shdd.network/v1/payments/webhook`

#### Task 1.2: D1 payments table

**Komenda:**
```bash
wrangler d1 execute shdd-network --file=supabase/migrations/20260521_d1_payments.sql
```

**Plik `supabase/migrations/20260521_d1_payments.sql`:**
```sql
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  stripe_session_id TEXT UNIQUE NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'PLN',
  product TEXT NOT NULL,
  product_ref TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe ON payments(stripe_session_id);

CREATE TABLE IF NOT EXISTS skins (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  pattern_data TEXT NOT NULL,
  hash TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  price REAL NOT NULL DEFAULT 100,
  claimed_at TEXT,
  expires_at TEXT,
  is_purchased INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_skins_owner ON skins(owner_id);
CREATE INDEX IF NOT EXISTS idx_skins_hash ON skins(hash);

CREATE TABLE IF NOT EXISTS hosting_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  world_name TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  stripe_subscription_id TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hosting_user ON hosting_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS founder_credits (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  purchased_at TEXT DEFAULT (datetime('now'))
);
```

#### Task 1.3: Founder Pack UI

**Plik `src/components/FounderPack.tsx` — nowy komponent:**
```typescript
interface Props {
  isFounder: boolean;
  onPurchase: () => void;
}

export default function FounderPack({ isFounder, onPurchase }: Props) {
  return (
    <div className="p-4 rounded-xl" style={{ background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.2)' }}>
      <h3 className="font-orbitron text-yellow-400 flex items-center gap-2">
        <span>👑</span> FOUNDER PACK
      </h3>
      <div className="mt-2 text-xs text-white/60 space-y-1">
        <p>✨ Złota ramka awatara we wszystkich światach</p>
        <p>🏆 Tytuł "Founder" w profilu i na czacie</p>
        <p>📜 Nazwisko w creditsach projektu</p>
        <p className="text-yellow-400/80 font-bold mt-2">49 PLN · jednorazowo</p>
      </div>
      {!isFounder ? (
        <button
          onClick={onPurchase}
          className="mt-3 w-full py-2 rounded-lg font-orbitron text-sm font-bold transition-all"
          style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}
        >
          KUP TERAZ
        </button>
      ) : (
        <div className="mt-3 py-2 text-center text-green-400 text-xs font-orbitron">
          ✅ Jesteś Founderm. Dziękujemy, że jesteś z nami od początku.
        </div>
      )}
    </div>
  );
}
```

**Modyfikacja `ShopMenu.tsx`:**
```diff
+ import FounderPack from './FounderPack';
// ... w render:
+ <FounderPack isFounder={currentUserPremiumTier === 'founder'} onPurchase={handleBuyFounder} />
```

#### Task 1.4: Supporter Badge

**Modyfikacja `ChatPanel.tsx`:** kolor imienia zależy od `premium_tier`.

```typescript
const nameColor = {
  founder: '#FFD700',
  supporter: '#f472b6',
  free: '#ffffff',
}[member.premium_tier || 'free'];
```

#### Task 1.5: Skin Generator

**Plik `src/services/cosmetics/SkinGenerator.ts`:**
[Skin generator jak w sekcji 7.1]

**Plik `src/workers/skin-generator.ts` — cron (codziennie):**
```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Codziennie: sprawdź czy ktoś zasługuje na skin
    // 1. Urodziny konta
    const birthdays = await getBirthdayUsers(env);
    for (const user of birthdays) {
      const skin = generateSkin(`birthday-${user.id}-${new Date().toISOString().split('T')[0]}`);
      await saveSkin(env, skin, 'birthday', user.id);
      await notifyUser(user.id, '🎂 Otrzymałeś unikatowy skin urodzinowy!');
    }
    // 2. Raffle (0.1% szansy dla każdego aktywnego usera)
    const activeUsers = await getActiveUsers(env);
    for (const user of activeUsers) {
      if (Math.random() < 0.001) {
        const skin = generateSkin(`raffle-${user.id}-${Date.now()}`);
        await saveSkin(env, skin, 'raffle', user.id);
        await notifyUser(user.id, '✨ System wybrał Ciebie! Masz unikatowy skin do odbioru.');
      }
    }
    // 3. Wygaśnięte skiny
    await expireUnclaimedSkins(env);
  },
};
```

#### Task 1.6: Skiny — zakup i renderowanie

**Plik `src/services/cosmetics/SkinService.ts`:**
```typescript
class SkinService {
  static async getMySkins(userId: string): Promise<{ owned: SkinData[]; reserved: SkinData[] }> {
    const { results: all } = await env.DB.prepare(
      'SELECT * FROM skins WHERE owner_id = ? ORDER BY created_at DESC'
    ).bind(userId).all();
    return {
      owned: all.filter(s => s.is_purchased),
      reserved: all.filter(s => !s.is_purchased),
    };
  }

  static async purchaseSkin(skinId: string): Promise<string> {
    // Tworzy Stripe session, zwraca URL
    const { data } = await supabase.functions.invoke('stripe-create-session', {
      body: { product: 'unique_skin', price: 100, metadata: { skinId } },
    });
    return data.sessionUrl;
  }
}
```

### 9.3 Taski zależnościowe — graf

```
1.1 Stripe Worker ──→ 1.3 Founder Pack ──→ 1.9 Profil
├───────────────────→ 1.4 Supporter Badge
└──→ 1.2 D1 tables ──→ 1.5 Skin Generator ──→ 1.6 Skiny Purchase ──→ 1.7 Rynek
                                          └──→ 1.6 Renderowanie
                    ──→ 1.8 Hosting
```

**Krytyczna ścieżka (critical path):** 1.1 → 1.2 → 1.5 → 1.6 → 1.7 → 1.9
**Najszybszy cashflow:** 1.1 + 1.2 + 1.3 = **~2 dni do pierwszego przychodu.**

---

## 10. PLIKI — MANIFEST WSZYSTKICH PLIKÓW

### 10.1 Nowe pliki (Faza 1)

#### Workers (Cloudflare)

```
src/workers/
├── stripe-webhook.ts          # Stripe webhook handler ~150 linii
├── stripe-create-session.ts   # Tworzy Checkout Session ~80 linii
├── skin-generator.ts          # Cron: generuje skiny codziennie ~100 linii
└── marketplace.ts             # Rynek secondary skinów ~120 linii
```

#### Services

```
src/services/
├── payment/
│   ├── PaymentService.ts      # Frontend: createSession, redirectToStripe ~50 linii
│   └── StripeWebhookHandler.ts # Logika przyznawania produktów ~200 linii
├── cosmetics/
│   ├── SkinGenerator.ts        # Generator algorytmiczny ~100 linii
│   ├── SkinService.ts          # CRUD skinów ~150 linii
│   └── SkinRenderer.ts         # Renderowanie na Canvas/Three.js ~80 linii
├── profile/
│   ├── ProfileService.ts       # GET/PATCH profilu ~100 linii
│   └── CreditsService.ts       # Lista founderów ~50 linii
└── network/
    └── NetworkSDK.ts           # SDK dla planet (auth, lobby, chat) ~200 linii
```

#### Komponenty React

```
src/components/
├── FounderPack.tsx             # Founder Pack UI ~80 linii
├── SupporterBadge.tsx          # Badge UI ~40 linii
├── SkinPreview.tsx             # Podgląd skinu ~60 linii
├── SkinShop.tsx                # Zakup skinu ~100 linii
├── Marketplace.tsx             # Rynek secondary ~150 linii
├── Profile.tsx                 # Strona profilu ~200 linii
├── CreditsPage.tsx             # Lista founderów ~50 linii
└── HostingManagement.tsx       # Zarządzanie hostingiem ~100 linii
```

#### Migracje

```
supabase/migrations/
├── 20260521_d1_payments.sql    # D1: payments, skins, hosting, founders

supabase/functions/
└── stripe-create-session/      # Supabase Edge Function
    ├── index.ts
    └── deno.json
```

### 10.2 Modyfikowane pliki

```
src/App.tsx                     # Routing do /profile, /credits
src/components/ShopMenu.tsx     # Sekcje Founder Pack, Supporter, Skiny
src/components/ChatPanel.tsx    # Kolor imienia wg premium_tier
src/services/auth/AuthService.ts # Metoda getPremiumTier()
src/game/constants.ts           # Nowe achievementy
src/core/systems/achievements.ts # Więcej achievementów
src/game/engine.ts              # Inicjalizacja skinów
src/components/HUD.tsx          # Wskaźnik premium
src/components/GameCanvas.tsx   # Renderowanie skinu na awatarze
```

### 10.3 Plany planet (Faza 3+)

```
planets/
├── void/
│   ├── index.html
│   ├── src/
│   │   ├── main.ts             # Init Three.js ~100 linii
│   │   ├── scene.ts             # Scena + skybox ~150 linii
│   │   ├── avatar.ts            # Klasa awatara ~120 linii
│   │   ├── network.ts           # Realtime sync ~100 linii
│   │   └── chat.ts              # Overlay czatu ~80 linii
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.toml
├── arcade/
│   └── ... (analogicznie)
└── atelier/
    └── ... (analogicznie)
```

---

## 11. MIARY SUKCESU

### 11.1 Techniczne

| Metryka | Cel | Narzędzie |
|---|---|---|
| Zero błędów TS | `tsc --noEmit` = 0 errors | CI/CD |
| Czas ładowania gry | < 3s na dobrym łączu | Lighthouse |
| FPS w Novactorio | 60 FPS na średnim sprzęcie | DevTools Performance |
| Realtime latency | < 100ms (position sync) | Pomiar Realtime |
| API response time | < 200ms (95 percentyl) | Cloudflare Analytics |
| Uptime | 99.9% | Cloudflare Status |

### 11.2 Biznesowe

| Metryka | M1 | M3 | M6 | M12 |
|---|---|---|---|---|
| Zarejestrowani | 100 | 500 | 2000 | 10000 |
| DAU (daily active) | 20 | 100 | 400 | 2000 |
| Founder Pack sprzedanych | 5 | 25 | 100 | 500 |
| Supporter Badge (active) | 3 | 15 | 60 | 300 |
| Skiny unikatowe sprzedane | 1 | 5 | 20 | 100 |
| Hostingi aktywne | 0 | 2 | 10 | 50 |
| Przychód miesięczny (PLN) | ~350 | ~1880 | ~7600 | ~38000 |

### 11.3 Społecznościowe

| Metryka | M1 | M3 | M6 | M12 |
|---|---|---|---|---|
| Użytkownicy na czacie dziennie | 5 | 30 | 150 | 500 |
| Lobby utworzone (łącznie) | 50 | 500 | 3000 | 15000 |
| Blueprinty udostępnione | - | 50 | 500 | 3000 |
| Planety 3D uruchomione | 0 | 1 (Void) | 2 (Void+Arcade) | 3+Atelier |

---

## 12. SŁOWNIK POJĘĆ

| Pojęcie | Definicja |
|---|---|
| **SHDD NETWORK** | Platforma światów (OASIS-like). Jedno konto, wiele planet. |
| **Planeta** | Osobna aplikacja/game w ramach NETWORK. Każda ma własny silnik, subdomenę i doświadczenie. |
| **Novactorio** | Pierwsza planeta — 2D factory builder. Główne dziecko. |
| **Void** | Druga planeta — 3D chill/czat. Zero gry, tylko atmosfera. |
| **Arcade** | Trzecia planeta — 3D arkada z grami wieloosobowymi. |
| **Atelier** | Czwarta planeta — 3D twój kąt, edytor pokoi. |
| **NETWORK SDK** | Zestaw narzędzi dla twórców planet: auth, lobby, znajomi, chat. |
| **Founder Pack** | Jednorazowy zakup (49 PLN). Dowód wsparcia wizji. |
| **Supporter Badge** | Subskrypcja (7 PLN / 2 mies.). Różowe imię, ikonka. |
| **Skin unikatowy** | Kosmetyk generowany algorytmicznie. Istnieje w 1 egzemplarzu w całym NETWORKU. |
| **Senior Update** | Faza 0 projektu — bugfixy, refaktor, lobby MVP. Zakończona. |

---

*SHDD NETWORK — od gracza dla gracza. Zero ocen, zero hejtu, zero korpo.*  
*Bo każdy zasługuje na miejsce gdzie może być sobą.*
