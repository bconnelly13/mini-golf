# Mini Golf Spinner & Scorecard App — Development Plan

## 1. Goal
A mobile web app, used solo from Safari on your phone, for tracking mini golf scores across a group and adding a "spin the wheel" challenge per hole. Free hosting on Vercel + Supabase.

## 2. Recommended Stack
Matches what you already know from the ice cream blog project:

- **Frontend:** Vite + React + TypeScript
- **Styling:** Tailwind CSS (fast to build mobile-first layouts, easy horizontal-scroll utilities)
- **Backend/DB:** Supabase (Postgres) — free tier
- **Hosting:** Vercel — free tier, auto-deploys from GitHub
- **Routing:** No router needed. This app has 4 linear screens; a single top-level `screen` state (`'home' | 'newGame' | 'existingGames' | 'game'`) plus a `currentGameId` is simpler than React Router for something this size.
- **PWA basics:** A `manifest.json` + Apple touch icon + `apple-mobile-web-app-capable` meta tag so you can "Add to Home Screen" from Safari and it opens full-screen like a native app. No service worker / offline support needed for v1 (you'll have signal at the course, and it adds complexity).

## 3. Data Model (Supabase / Postgres)

```sql
-- games
create table games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  played_at timestamptz not null default now(),
  num_holes int not null check (num_holes in (9, 18)),
  location text,
  ball_color text,
  created_at timestamptz not null default now()
);

-- players (belong to one game)
create table players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  name text not null,
  sort_order int not null
);

-- scores (one row per player per hole)
create table scores (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  hole_number int not null,
  strokes int not null,
  unique (player_id, hole_number)
);

-- spinner results (one row per player per hole, since each player spins individually)
create table spinner_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  hole_number int not null,
  result_label text not null,
  unique (player_id, hole_number)
);

-- spinner option pool (placeholder data now, editable/expandable later)
create table spinner_options (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  weight int not null default 1,
  active boolean not null default true
);
```

**Auth:** None. No login screen — the Supabase anon key is baked into the client env vars, with open (or minimally restricted) RLS policies. Anyone with your deployed URL could technically read/write, but that's an acceptable tradeoff for zero login friction on a personal scorecard app.

**Sync:** Since it's always one phone (never handed off mid-round across multiple devices simultaneously), no realtime subscriptions are needed — a plain read on screen load plus writes on each interaction is sufficient. This also simplifies conflict handling, since there's never more than one writer at a time.

## 4. Screens & Components

### Home Screen
- Two big tap-friendly buttons: "New Game" / "Existing Game"

### Existing Games Screen
- Query `games` ordered by `played_at desc`
- List item: game name + formatted date, tap to open, trailing delete icon (with a confirm step — easy to fat-finger on mobile)
- Delete cascades to players/scores/spinner_results automatically via FK `on delete cascade`

### New Game Screen
- Form: game name, number of players (stepper, dynamically render that many name inputs), num holes (9/18 toggle), ball color (optional text or a small color picker), location (optional text)
- "Continue" creates the `games` row + `players` rows in one batch insert, then navigates to Main Game screen with the new `game_id`

### Main Game Screen — the core UI
Since each player spins individually (not one shared spin per hole), there's no single "Spinner row" that works across all players — each player needs their own spin result *and* their own score on every hole. The cleanest layout for that:

- Sticky/frozen left columns: **Player Name** | **Total** (computed as `sum(scores.strokes)` per player, live-updating)
- Horizontally scrollable region for hole columns, ~2 holes visible at a time (CSS: `overflow-x: auto; scroll-snap-type: x mandatory;` on the container, each hole column `scroll-snap-align: start` and roughly `width: 50%` of the scrollable area minus the frozen columns)
- **Rows: one per player** — no separate Spinner row. Each player×hole cell is split into two stacked, independently-tappable halves:
  - **Top half — spin result:** shows a 🎰/dice icon until spun, then shows the landed challenge text (small, may need truncation/tooltip on long labels). Tapping it (if not yet spun) opens the spinner modal for that player+hole.
  - **Bottom half — score:** shows the stroke count once entered, blank/dash before that. Tapping it opens the 1–6 / Other score modal.
- Every write (score entry, spinner result) is an immediate Supabase `upsert` on that cell — no separate "save" step, no local-only state that could get lost

### Spinner Component
- Modal opens scoped to one player + one hole (e.g. "Ben — Hole 4"), shows the wheel with the (currently placeholder) 6 options
- Tap wheel → CSS transform rotation animation: pick a random target angle (`baseRotations * 360 + offsetForWinningSegment`), animate with a decelerating easing curve (`cubic-bezier(0.15, 0.85, 0.35, 1)` or similar, ~3–4s duration) so it starts fast and eases out
- On animation end, write the landed result to `spinner_results` (keyed by that player + hole) and show it in that player's cell
- The actual selection *logic* (weighting, categories, avoiding repeats) is a placeholder for now — pull uniformly from `spinner_options` — and can get more elaborate later without changing the UI

## 5. Build Phases

1. **Scaffold:** Vite + React + TS + Tailwind, Vercel project connected to GitHub repo, Supabase project created, run the schema above, env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) set in both `.env.local` and Vercel dashboard
2. **Static screens:** Build all 4 screens with mock/hard-coded data first, no Supabase yet — get the navigation and layout (especially the frozen-columns + horizontal-scroll table) right on an actual iPhone in Safari before wiring up data
3. **Supabase CRUD:** New game creation, existing games list + delete, score read/write
4. **Spinner:** Build the wheel animation with placeholder options, wire up result persistence
5. **Mobile polish:** Add to Home Screen manifest/icons, test tap targets, safe-area insets (`env(safe-area-inset-*)` for iPhone notch/home bar), confirm autosave feels instant with no loading spinners blocking taps

## 6. iOS Safari Gotchas to Watch For
- `100vh` includes the address bar and will cause layout jumps — use `100dvh` instead
- Double-tap-to-zoom on buttons — add `touch-action: manipulation`
- Momentum scroll on the horizontal hole list can feel janky without `-webkit-overflow-scrolling: touch` (mostly handled automatically in modern Safari, but worth checking on-device)
- "Add to Home Screen" ignores your `<title>` for the label — needs `apple-mobile-web-app-title` meta tag