<img src="https://capsule-render.vercel.app/api?type=transparent&color=0:f0883e,50:d29922,100:0d1117&height=140&section=header&text=Novactorio&fontSize=38&fontColor=f0883e&desc=browser%20factory%20automation%20%C2%B7%20custom%20Canvas%202D%20engine%20%C2%B7%20co-op&descSize=15&descAlignY=72" width="100%" />

<div align="center">

[![npm](https://img.shields.io/npm/v/novactorio?style=for-the-badge&logo=nodedotjs)](https://www.npmjs.com/package/novactorio)
[![GHCR](https://img.shields.io/badge/GHCR-image-2496ED?style=for-the-badge&logo=docker)](https://github.com/BartoszOsiej/Factorio-web-game/pkgs/container/factorio-web-game)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)

**A browser-based factory automation game (inspired by Factorio) — written
from scratch in TypeScript with its own Canvas 2D engine.**

</div>

## 🎮 Demo



<!-- VHS auto-rendered — run: vhs demos/factorio.tape -->



![Factorio Web Demo](assets/factorio-demo.gif)




## Highlights

| Feature | Description |
|-------|------|
| **Custom game engine** | ~2500 lines of Canvas 2D renderer, no frameworks (no Phaser, no Pixi) |
| **TypeScript strict** | `strict: true`, zero `tsc --noEmit` errors |
| **Factorio-like** | conveyors, inserters, pipe networks, research tree, pollution, enemy evolution |
| **23 languages** | i18n with dynamic switching, Polish and English complete |
| **Supabase** | Auth, Realtime co-op, cloud saves, RLS |
| **Stripe** | Premium subscriptions via Deno Edge Functions |
| **Co-op** | Multiplayer collaboration via Supabase Realtime broadcast |
| **Mobile-ready** | Responsive UI, touch controls |

<details>
<summary><b>🏗️ Architecture</b></summary>

### Game engine (`src/game/`)
- `engine.ts` — game loop (update/render), building logic, inventory, combat, particles
- `renderer.ts` — 10 extracted render methods (sky, ground, entities, damage numbers…)
- `systems.ts` — supply chains, conveyor belts, pipe networks, enemy AI, pollution
- `world.ts` / `noise.ts` — chunk-based world generation (Perlin noise), infinite scrolling

### UI (`src/components/`)
- React 18 as overlay UI (menu, statistics, shop, chat)
- Full screen routing: Auth → Start → Game

### Backend (Supabase + Stripe)
- **Auth** — registration/login via Supabase Auth
- **Realtime** — co-op (position broadcast, build place/remove)
- **Cloud saves** — backup in `world_snapshots.save_data`
- **Stripe** — Checkout + webhook updating `profiles.premium_tier` via Deno Edge Functions

</details>

## Running

```bash
npm install
npm run dev          # Vite dev server (localhost:5173)
npm run build        # production build
```

<details>
<summary><b>⚙️ Type checking & Edge Functions</b></summary>

```bash
# TypeScript (FAT32 workaround)
node node_modules/typescript/bin/tsc --noEmit

# Edge Functions (requires Stripe keys)
supabase functions serve stripe-checkout --env-file .env.local
supabase functions serve stripe-webhook --env-file .env.local
```

</details>

---

<div align="center">

**Part of [BartoszOsiej](https://github.com/BartoszOsiej)'s portfolio** · [Live docs](https://bartoszosiej.github.io/Docs/projects/factorio-web-game/)

MIT © 2026 Bartosz Osiej

</div>
