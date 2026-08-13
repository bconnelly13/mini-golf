I have investigated the codebase and discovered the configuration, database functions, and requirements. 

Here is the plan to achieve all your requirements for the spinner update.

### Overview
We will update the game spinner mechanism to use the database exclusively (no local storage). We will update the database schemas, add a `spinner_default` field to the `games` table, and integrate the `get_option(option_num)` and `get_random(n)` RPC functions in Supabase to fetch spinner options. We will also implement preset/random toggling and the requested details modal/popup for spun results.

### Key Changes
1. **`supabase/schema.sql`**: Update schema documentation for `games`, `spinner_options`, and `spinner_results` to match the exact schemas and include `spinner_default`.
2. **`src/App.tsx`**:
   - Update `GameRecord`, `GameRow`, `SpinnerRow`, and other types to support `spinner_default` on games, and store `{ label: string; description: string | null }` on spinner results so descriptions are persisted in the db and can be displayed on click.
   - On the create game screen, add "Preset" and "Random" selection buttons for `spinner_default` (defaulting to e.g. "preset").
   - When loading games, fetch the `spinner_default` field from the database.
   - When the spinner modal opens, default the selected option ("preset" or "random") to the game's `spinner_default` value.
   - Display "Preset" and "Random" toggle buttons at the top of the spinner modal.
   - Implement real-time database queries to `get_option` or `get_random` depending on which option is selected (and whenever the user toggles between them).
   - Display options fetched dynamically from the database.
   - Update the spin function to select from the fetched options and store both the selected label and description in the database under `spinner_results`.
   - Update the scorecard: show the spun label on the scorecard, and make clicking an already-spun scorecard cell display a description popup of that challenge.

---

### Implementation Steps
1. **Update schema definitions**: Update types and schema script to support the new database tables and columns (`spinner_default` in `games` and `result_description` in `spinner_results`).
2. **Modify Game Creation**:
   - Add state for `spinnerDefault` (preset or random) on the new game page.
   - Add two buttons ("Preset" and "Random") to select the game's spinner default.
   - Save `spinner_default` to the database on game creation.
3. **Update Game Loading**:
   - Update `loadGamesFromSupabase` and `normalizeGames` to retrieve `spinner_default` and `result_description`.
4. **Build dynamic option fetching in Spinner Modal**:
   - Create local state in the spinner modal for `selectedMode` (preset or random), defaulting to the game's `spinner_default`.
   - Fetch options from `get_option` (with `holeNumber % 9` as `option_num`) if "preset" is selected. Note: since the holes are 1-based, we compute `(holeNumber - 1) % 9 + 1` or the specified `holeNumber % 9`. Wait, the prompt says "hole number modulo 9". Let's do `holeNumber % 9` exactly as requested.
   - Fetch options from `get_random` (with `n: 6`) if "random" is selected.
   - Trigger a re-fetch every time `selectedMode` is toggled.
5. **Update Spin Action & DB Persistence**:
   - Spin the wheel among the dynamically fetched database options.
   - Save both the selected `result_label` and `result_description` to `spinner_results` in the database.
6. **Implement Card Click Popup**:
   - If a cell already has a spin result, clicking it will trigger a description popup showing the challenge description instead of opening the spinner modal.

---

### Technical Considerations
- **Modulo 9**: As requested, we will use `holeNumber % 9` as the parameter `option_num` for `get_option`.
- **Database schemas**: The schemas align perfectly with the discovered RPC functions `get_option(option_num)` and `get_random(n)`.
- **Zero local storage**: No localStorage will be used, keeping all states in React or Supabase.

### Success Criteria
- Created game holds a `spinner_default` value.
- Spinner modal dynamically loads options from the database via the proper RPC.
- Toggling between Preset and Random re-fetches options instantly.
- Click on an already-spun scorecard slot shows the challenge's description in a popup/modal.

Please **toggle to Act mode** using the toggle button below to begin implementation!