# Novactorio

A browser-based factory automation game (inspired by Factorio) — written from
scratch in TypeScript with its own Canvas 2D engine.

**Stack:** TypeScript 5.5 (strict), React 18, Vite 6, Supabase, Stripe, Deno Edge Functions.

---

## Architecture

### Game engine (`src/game/`)
- **Custom 2D engine** on the Canvas API — no external libraries (Phaser, Pixi, etc.)
- `engine.ts` – game loop (update/render), building logic, inventory, combat, particles
- `renderer.ts` – 10 extracted render methods (sky, ground, entities, damage numbers, etc.)
- `systems.ts` – supply chains, conveyor belts, pipe networks, enemy AI, pollution
- `world.ts` / `noise.ts` – chunk-based world generation (Perlin noise), infinite scrolling

### UI (`src/components/`)
- React 18 as an overlay UI (menu, statistics, shop, chat, etc.)
- Full screen routing: Auth → Start → Game
- 23 languages (`i18n.ts`), local save + cloud (Supabase)

### Backend (Supabase)
- **Auth** – registration/login via Supabase Auth
- **Realtime** – co-op (position broadcast, build place/remove)
- **Cloud saves** – backup in `world_snapshots.save_data`
- **Stripe** – `supabase/functions/stripe-checkout` (Deno Edge Function) and `stripe-webhook`

### Stripe / Premium
- Starter/Premium subscriptions via Stripe Checkout
- Webhook updates `profiles.premium_tier` in Supabase
- Frontend refreshes premiumTier after login and after the redirect back

---

## Running

```bash
npm install
npm run dev          # Vite dev server (localhost:5173)
npm run build        # Production build
```

### TypeScript (FAT32 workaround)
```bash
node node_modules/typescript/bin/tsc --noEmit
```

### Edge Functions (requires Stripe keys)
```bash
supabase functions serve stripe-checkout --env-file .env.local
supabase functions serve stripe-webhook --env-file .env.local
```

---

## Highlights (portfolio)

| Feature | Description |
|-------|------|
| **Custom game engine** | ~2500 lines of Canvas 2D renderer, no frameworks |
| **TypeScript strict** | `strict: true` in tsconfig, zero `tsc --noEmit` errors |
| **Factorio-like** | conveyors, inserters, pipe networks, research tree, pollution, enemy evolution |
| **23 languages** | i18n with dynamic switching, Polish and English complete |
| **Supabase** | Auth, Realtime co-op, cloud saves, RLS |
| **Stripe** | Premium subscriptions via Deno Edge Functions |
| **Co-op** | Multiplayer collaboration via Supabase Realtime broadcast |
| **Mobile-ready** | Responsive UI, touch controls |
