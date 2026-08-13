# Novactorio

Gra przeglądarkowa w stylu factory automation (inspirowana Factorio) – napisana od zera w TypeScript, z własnym silnikiem Canvas 2D.

**Stack:** TypeScript 5.5 (strict), React 18, Vite 6, Supabase, Stripe, Deno Edge Functions.

---

## Architektura

### Silnik gry (`src/game/`)
- **Własny silnik 2D** na Canvas API – brak bibliotek zewnętrznych (Phaser, Pixi itp.)
- `engine.ts` – pętla gry (update/render), logika budynków, inventory, combat, particles
- `renderer.ts` – 10 wyodrębnionych metod renderowania (sky, ground, entities, damage numbers itd.)
- `systems.ts` – supply chains, conveyor belts, pipe networks, enemy AI, pollution
- `world.ts` / `noise.ts` – chunk-based world generation (Perlin noise), infinite scrolling

### UI (`src/components/`)
- React 18 jako overlay UI (menu, statystyki, sklep, czat itp.)
- Pełny routing ekranów: Auth → Start → Gra
- 23 języki (`i18n.ts`), zapis lokalny + chmura (Supabase)

### Backend (Supabase)
- **Auth** – rejestracja/logowanie przez Supabase Auth
- **Realtime** – co-op (broadcast pozycji, build place/remove)
- **Cloud saves** – backup w `world_snapshots.save_data`
- **Stripe** – `supabase/functions/stripe-checkout` (Deno Edge Function) i `stripe-webhook`

### Stripe / Premium
- Subskrypcje Starter/Premium przez Stripe Checkout
- Webhook aktualizuje `profiles.premium_tier` w Supabase
- Frontend odświeża premiumTier po logowaniu i po przekierowaniu zwrotnym

---

## Uruchomienie

```bash
npm install
npm run dev          # Vite dev server (localhost:5173)
npm run build        # Produkcyjny build
```

### TypeScript (FAT32 workaround)
```bash
node node_modules/typescript/bin/tsc --noEmit
```

### Edge Functions (wymaga kluczy Stripe)
```bash
supabase functions serve stripe-checkout --env-file .env.local
supabase functions serve stripe-webhook --env-file .env.local
```

---

## Wyróżniki (portfolio)

| Cecha | Opis |
|-------|------|
| **Własny silnik gierki** | ~2500 linii renderera Canvas 2D, bez frameworków |
| **TypeScript strict** | `strict: true` w tsconfig, bez błędów `tsc --noEmit` |
| **Factorio-like** | conveyory, inserters, pipe networks, research tree, pollution, enemy evolution |
| **23 języki** | i18n z dynamicznym przełączaniem, polski i angielski pełne |
| **Supabase** | Auth, Realtime co-op, cloud saves, RLS |
| **Stripe** | Subskrypcje Premium przez Deno Edge Functions |
| **Co-op** | Współpraca wielu graczy przez Supabase Realtime broadcast |
| **Mobile-ready** | Responsywne UI, dotykowe sterowanie |
