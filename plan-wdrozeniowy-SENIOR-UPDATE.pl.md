# PLAN WDROŻENIOWY — S.E.N.I.O.R.U.P.D.A.T.E
## Novactorio → Produkcja AAA
### 21.05.2026 | Status: EXECUTION IN PROGRESS

---

## 1. CHARAKTERYSTYKA PROJEKTU

**Typ**: Gra przeglądarkowa (SPA) — factory-builder sandbox
**Stack**: TypeScript 5.5+ · React 18 · Vite 6 · Supabase · Canvas 2D
**Stan**: Przed refactorem — kod działa, ale amatorszczyzna typologiczna i architektoniczna
**Cel**: Doprowadzenie do standardu SENIOR + produkcja bez wyjątków

---

## 2. PROBLEMY DO ROZWIĄZANIA

### 🔴 Krytyczne (blokery bezpieczeństwa/działania)

| ID | Problem | Lokalizacja | Fix |
|---|---|---|---|
| P1 | **GameState — brak `export interface`** | `types.ts:209-240` | Dodać definicję interfejsu → osobny plik `types/game-state.ts` |
| P2 | **Fake auth — localStorage bez weryfikacji** | `lib/auth.ts` | Zastąpić Supabase `onAuthStateChange` → `AuthService.ts` |
| P3 | **Hardcoded Supabase credentials** | `lib/supabase.ts` | `.env` + `config/env.ts` z walidacją przy starcie |
| P4 | **Admin check przez username** | `App.tsx:306` | `.env` lista adminów + RLS policy |

### 🟡 Średnie (stabilność/utrzymanie)

| ID | Problem | Lokalizacja | Fix |
|---|---|---|---|
| P5 | **~80 wystąpień `as any`** | Cały kod | Type guards + branded types + satisfies |
| P6 | **Systemy w jednym pliku 1767 linii** | `systems.ts` | Split na 8 modułów w `core/systems/*` |
| P7 | **Renderer w jednym pliku 2305 linii** | `renderer.ts` | Split na 6 modułów w `render/*` |
| P8 | **Engine + input + co-op w jednym** | `engine.ts` + `App.tsx` | Split na `core/engine/*` + `services/realtime/*` |
| P9 | **Puste catch {} połykające błędy** | Cały kod | Result<T,E> pattern + AppError |

### 🟢 Niskie (DX/performance)

| ID | Problem | Lokalizacja | Fix |
|---|---|---|---|
| P10 | **Brak code splitting** | Router | React.lazy() dla paneli |
| P11 | **Particles bez pool'a** | Particle system | Object pool 2000 pre-alloc |
| P12 | **Static terrain renderuje co klatkę** | Renderer | Offscreen canvas cache |

---

## 3. ARCHITEKTURA DOCELOWA

```
src/
├── config/                      # 🔐 Konfiguracja (walidowana)
│   ├── env.ts                   # validated ENV, rzuca błędem przy starcie
│   └── admins.ts                # Lista adminów z .env
│
├── core/                        # ♥ Silnik gry — zero React/DOM
│   ├── types/                   # Type guards, branded types, satisfies
│   ├── engine/                  # GameLoop, InputManager, GameEngine
│   ├── systems/                 # 8 modułów produkcyjnych
│   └── constants/               # Stałe gry
│
├── render/                      # 🎨 Canvas 2D — decoupled
│   ├── layers/                  # Terrain, Buildings, Entities
│   ├── effects/                 # Particles, Weather, Lighting
│   └── helpers/                 # Kolory, cienie, util
│
├── services/                    # 🔌 Cienkie adaptery API
│   ├── auth/                    # AuthService z onAuthStateChange
│   ├── realtime/                # Co-op przez Supabase Realtime
│   └── storage/                 # localStorage + Supabase backup
│
├── ui/                          # 🖥️ React — tylko prezentacja
│   ├── screens/                 # Auth, Start, Game
│   ├── panels/                  # Build, Inventory, Research...
│   ├── hooks/                   # useGame, useCoop, useAutoSave
│   └── shared/                  # Buttony, badge'y, inputy
│
└── lib/                         # 🧰 Narzędzia
    ├── result.ts                # Result<T,E> — zero throw
    ├── errors.ts                # AppError discriminated union
    └── i18n.ts                  # 23 języki (bez zmian)
```

---

## 4. MODUŁY WYKONAWCZE

### MODUŁ 1: Config + Security Foundation

**Pliki**:
- `config/env.ts` — walidacja env, zwracanie typed ENV
- `config/admins.ts` — lista adminów z VITE_ADMIN_USERS
- `.env` + `.env.example`

**Kryterium akceptacji**:
- Brak env → build ERROR, nie ciche fallback
- Admin sprawdzany przez `admins.includes(username)` a nie magic string

### MODUŁ 2: Auth — Senior Security

**Pliki**:
- `services/auth/AuthService.ts` — klasa z lifecycle session
- `services/auth/AuthGuard.tsx` — React wrapper
- `services/auth/AdminGuard.tsx` — admin check
- `services/auth/RateLimiter.ts` — token bucket dla API calls

**Przepływ autoryzacji**:
```
App mount → AuthService.init()
  → sprawdza czy jest session w Supabase
  → jeśli NIE → AuthScreen (login/register)
  → jeśli TAK → GameScreen
  → onAuthStateChange → refresh token AUTO przez SDK
  → logout → czyści session, wraca do AuthScreen
```

**Zabezpieczenia**:
- Supabase anon key w `.env` (publiczny, ale nie hardcoded)
- service_role key NIGDY w kliencie
- RLS na każdą tabelę (już jest, tylko walidujemy)
- CSP headers na produkcji
- Rate limiter na kliencie (chat, save)

### MODUŁ 3: Type System — Hardcore TypeScript

**Rule #1**: Zero `as any` w kodzie produkcyjnym
**Rule #2**: Każda funkcja zwraca Result<T,E> jeśli może sypnąć
**Rule #3**: `satisfies` wymusza kompletność

### MODUŁ 4: Split Monolith — Systems

```
core/systems/
├── index.ts              // Re-export + Production orchestrator
├── production/           // Miner, Furnace, Assembler, Lab, Radar, Oil, Power, Conveyors
├── combat/               // EnemySystem, SpawnerSystem, TurretSystem
├── npc/                  // NPCSystem, SupplyChainSystem, BuildQueueSystem
├── world/                // ChunkSystem, PollutionSystem, WeatherSystem, EventSystem
├── research/             // ResearchSystem
├── player/               // MiningSystem, LevelSystem, AchievementSystem, VisibilitySystem
└── inventory/            // InventorySystem (add/remove, building I/O)
```

### MODUŁ 5: Split Monolith — Renderer

```
render/
├── Renderer.ts           // Orchestrator: composuje layery → canvas
├── layers/               // Terrain, Buildings, Entities
├── effects/              // Particles, Weather, Lighting, Ghost
└── helpers/              // Kolory, cienie
```

### MODUŁ 6: Engine + App — Separation

```
core/engine/
├── GameEngine.ts       // Loop + fixed timestep + state orchestrator
├── InputManager.ts     // Keyboard + Mouse + Touch → unified state
└── CoopManager.ts      // Supabase Realtime channel lifecycle

ui/
├── screens/GameScreen.tsx  // Główny ekran
├── hooks/
│   ├── useGame.ts          // Bridge engine ↔ React
│   └── useCoop.ts          // Co-op
```

### MODUŁ 7: Error Handling

```
lib/
├── result.ts             // Result<T,E>, Ok(), Err()
└── errors.ts             // AppError discriminated union
```

---

## 5. TIMELINE WYKONANIA

```
09:00 - 09:15  PLAN DOKUMENT
09:15 - 09:30  MODUŁ 1: Config + env
09:30 - 10:00  MODUŁ 2: Auth 
10:00 - 11:00  MODUŁ 3: Types + zero any
11:00 - 13:00  MODUŁ 4: Split Systems
13:00 - 13:30  LUNCH
13:30 - 14:30  MODUŁ 5: Split Renderer
14:30 - 15:00  MODUŁ 6: Engine + App
15:00 - 15:30  MODUŁ 7: Error handling
15:30 - 16:00  Build verification + fixes
16:00 - 16:30  Deploy
```

---

## 6. SECURITY CHECKLIST

- [x] Supabase anon key w `.env`, nie hardcoded
- [ ] `service_role` key NIGDY nie trafia do klienta
- [ ] Auth przez Supabase SDK → auto refresh token → onAuthStateChange
- [ ] Admin przez `.env` listę + RLS, nie magic string
- [ ] Rate limiter na kliencie (chat, save)
- [ ] RLS w Supabase — każde zapytanie ma `auth.uid()` check
- [ ] Brak `eval`, `innerHTML`, `dangerouslySetInnerHTML`
- [ ] CSP headers na produkcji
- [ ] `sourcemap: false/hidden` na build
- [ ] Input validation na każdym stringu od użytkownika (chat, username)

---

## 7. CZEGO NIE TYKAMY

- i18n — 23 języki działa, zostaje
- Supabase schema — RLS już jest, tylko env vars
- Stripe/Shop — zostaje na ten moment
- Ogólna mechanika gry (tick, systemy produkcyjne)
