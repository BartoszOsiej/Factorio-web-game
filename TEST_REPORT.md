# Novactorio (Factorio Web Game) — Test Report & QA

> Generated: 2026-08-13 · Node 22 · Linux
> Re-run: `npm ci && npm run typecheck && npm run build && npm run lint`

## Whole project

**✅ Typecheck: 0 errors** · **✅ production build OK** (244 kB main bundle,
gzip 67 kB) · lint: 0 unused-vars errors.

## Per-module / category status

| Area | Check | Result |
|---|---|---|
| TypeScript (whole app) | `tsc --noEmit -p tsconfig.app.json` | ✅ 0 errors |
| Production bundle | `vite build` | ✅ built in ~3 s |
| Lint | `eslint .` | ⚠️ 28 style-only `no-explicit-any` + 7 react-hooks warnings remain |

## Bugs found & fixed during the sweep

1. **Weather transitions crashed** — `lerpConfig()` returned no `color`, so
   `ctx.strokeStyle = config.color` read `undefined` during rain/snow
   transitions.
2. **Light alpha out of bounds** — `LIGHT_CFG` is a 5-tuple
   `[radius, r, g, b, alpha]` but the renderer read `cfg[5]` → now `cfg[4]`.
3. **Player walk animation frozen** — code referenced `PlayerState.isMoving`
   and `prevX/prevY`, which never existed; the renderer now tracks the last
   position itself.
4. **Missing import** — `production.ts` called `removeBuilding()` without
   importing it from `economy.ts`.
5. Dead code removed: legacy `renderWeather` (superseded by `WeatherSystem`),
   `_glowCache`, `_prevEnemyHealthIds`, `windOffset`, unused supabase consts.
6. ESLint config now honours the codebase's `_`-prefix convention for
   intentionally-unused parameters.

## Security notes

- Supabase edge functions (Stripe checkout/webhook) compile clean; secrets
  accessed via `Deno.env`, never hard-coded (price IDs are public values).
