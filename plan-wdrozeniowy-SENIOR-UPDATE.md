# IMPLEMENTATION PLAN — S.E.N.I.O.R.U.P.D.A.T.E
## Novactorio → AAA Production
### 21.05.2026 | Status: EXECUTION IN PROGRESS

---

## 1. PROJECT PROFILE

**Type**: Browser game (SPA) — factory-builder sandbox
**Stack**: TypeScript 5.5+ · React 18 · Vite 6 · Supabase · Canvas 2D
**State**: Pre-refactor — the code works, but is amateurish in typing and architecture
**Goal**: Bring it up to SENIOR standard + production without exceptions

---

## 2. PROBLEMS TO SOLVE

### 🔴 Critical (security/operation blockers)

| ID | Problem | Location | Fix |
|---|---|---|---|
| P1 | **GameState — missing `export interface`** | `types.ts:209-240` | Add interface definition → separate file `types/game-state.ts` |
| P2 | **Fake auth — localStorage without verification** | `lib/auth.ts` | Replace with Supabase `onAuthStateChange` → `AuthService.ts` |
| P3 | **Hardcoded Supabase credentials** | `lib/supabase.ts` | `.env` + `config/env.ts` with validation at startup |
| P4 | **Admin check by username** | `App.tsx:306` | `.env` admin list + RLS policy |

### 🟡 Medium (stability/maintenance)

| ID | Problem | Location | Fix |
|---|---|---|---|
| P5 | **~80 occurrences of `as any`** | Whole codebase | Type guards + branded types + satisfies |
| P6 | **Systems in one 1767-line file** | `systems.ts` | Split into 8 modules in `core/systems/*` |
| P7 | **Renderer in one 2305-line file** | `renderer.ts` | Split into 6 modules in `render/*` |
| P8 | **Engine + input + co-op in one place** | `engine.ts` + `App.tsx` | Split into `core/engine/*` + `services/realtime/*` |
| P9 | **Empty catch {} swallowing errors** | Whole codebase | Result<T,E> pattern + AppError |

### 🟢 Low (DX/performance)

| ID | Problem | Location | Fix |
|---|---|---|---|
| P10 | **No code splitting** | Router | React.lazy() for panels |
| P11 | **Particles without a pool** | Particle system | Object pool, 2000 pre-allocated |
| P12 | **Static terrain re-rendered every frame** | Renderer | Offscreen canvas cache |

---

## 3. TARGET ARCHITECTURE

```
src/
├── config/                      # 🔐 Configuration (validated)
│   ├── env.ts                   # validated ENV, throws at startup
│   └── admins.ts                # Admin list from .env
│
├── core/                        # ♥ Game engine — zero React/DOM
│   ├── types/                   # Type guards, branded types, satisfies
│   ├── engine/                  # GameLoop, InputManager, GameEngine
│   ├── systems/                 # 8 production modules
│   └── constants/               # Game constants
│
├── render/                      # 🎨 Canvas 2D — decoupled
│   ├── layers/                  # Terrain, Buildings, Entities
│   ├── effects/                 # Particles, Weather, Lighting
│   └── helpers/                 # Colors, shadows, utils
│
├── services/                    # 🔌 Thin API adapters
│   ├── auth/                    # AuthService with onAuthStateChange
│   ├── realtime/                # Co-op via Supabase Realtime
│   └── storage/                 # localStorage + Supabase backup
│
├── ui/                          # 🖥️ React — presentation only
│   ├── screens/                 # Auth, Start, Game
│   ├── panels/                  # Build, Inventory, Research...
│   ├── hooks/                   # useGame, useCoop, useAutoSave
│   └── shared/                  # Buttons, badges, inputs
│
└── lib/                         # 🧰 Utilities
    ├── result.ts                # Result<T,E> — zero throw
    ├── errors.ts                # AppError discriminated union
    └── i18n.ts                  # 23 languages (unchanged)
```

---

## 4. EXECUTION MODULES

### MODULE 1: Config + Security Foundation

**Files**:
- `config/env.ts` — env validation, returns typed ENV
- `config/admins.ts` — admin list from VITE_ADMIN_USERS
- `.env` + `.env.example`

**Acceptance criteria**:
- Missing env → build ERROR, no silent fallback
- Admin checked via `admins.includes(username)` instead of a magic string

### MODULE 2: Auth — Senior Security

**Files**:
- `services/auth/AuthService.ts` — class with session lifecycle
- `services/auth/AuthGuard.tsx` — React wrapper
- `services/auth/AdminGuard.tsx` — admin check
- `services/auth/RateLimiter.ts` — token bucket for API calls

**Authorization flow**:
```
App mount → AuthService.init()
  → checks whether a Supabase session exists
  → if NO → AuthScreen (login/register)
  → if YES → GameScreen
  → onAuthStateChange → token refresh AUTO via SDK
  → logout → clears session, back to AuthScreen
```

**Security measures**:
- Supabase anon key in `.env` (public, but not hardcoded)
- service_role key NEVER in the client
- RLS on every table (already in place, we only validate)
- CSP headers in production
- Client-side rate limiter (chat, save)

### MODULE 3: Type System — Hardcore TypeScript

**Rule #1**: Zero `as any` in production code
**Rule #2**: Every function returns Result<T,E> if it can fail
**Rule #3**: `satisfies` enforces completeness

### MODULE 4: Split Monolith — Systems

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

### MODULE 5: Split Monolith — Renderer

```
render/
├── Renderer.ts           // Orchestrator: composes layers → canvas
├── layers/               // Terrain, Buildings, Entities
├── effects/              // Particles, Weather, Lighting, Ghost
└── helpers/              // Colors, shadows
```

### MODULE 6: Engine + App — Separation

```
core/engine/
├── GameEngine.ts       // Loop + fixed timestep + state orchestrator
├── InputManager.ts     // Keyboard + Mouse + Touch → unified state
└── CoopManager.ts      // Supabase Realtime channel lifecycle

ui/
├── screens/GameScreen.tsx  // Main screen
├── hooks/
│   ├── useGame.ts          // Engine ↔ React bridge
│   └── useCoop.ts          // Co-op
```

### MODULE 7: Error Handling

```
lib/
├── result.ts             // Result<T,E>, Ok(), Err()
└── errors.ts             // AppError discriminated union
```

---

## 5. EXECUTION TIMELINE

```
09:00 - 09:15  PLAN DOCUMENT
09:15 - 09:30  MODULE 1: Config + env
09:30 - 10:00  MODULE 2: Auth
10:00 - 11:00  MODULE 3: Types + zero any
11:00 - 13:00  MODULE 4: Split Systems
13:00 - 13:30  LUNCH
13:30 - 14:30  MODULE 5: Split Renderer
14:30 - 15:00  MODULE 6: Engine + App
15:00 - 15:30  MODULE 7: Error handling
15:30 - 16:00  Build verification + fixes
16:00 - 16:30  Deploy
```

---

## 6. SECURITY CHECKLIST

- [x] Supabase anon key in `.env`, not hardcoded
- [ ] `service_role` key NEVER reaches the client
- [ ] Auth via Supabase SDK → auto token refresh → onAuthStateChange
- [ ] Admin via `.env` list + RLS, not a magic string
- [ ] Rate limiter on the client (chat, save)
- [ ] RLS in Supabase — every query has an `auth.uid()` check
- [ ] No `eval`, `innerHTML`, `dangerouslySetInnerHTML`
- [ ] CSP headers in production
- [ ] `sourcemap: false/hidden` on build
- [ ] Input validation on every user-supplied string (chat, username)

---

## 7. WHAT WE DON'T TOUCH

- i18n — 23 languages work, stays as is
- Supabase schema — RLS already exists, only env vars
- Stripe/Shop — stays for now
- Core game mechanics (tick, production systems)
