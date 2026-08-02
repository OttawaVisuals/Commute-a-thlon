# Commute-a-thlon

A data-driven active-commuting challenge. Log real commuting activities (walk, bike, ski, kayak, stairs…), draw your route on a map, and submit against a triathlon-style target. Rate how fun/original/hard each activity is, climb the leaderboard, and win awards. Metrics come from the 2024 Adult Compendium of Physical Activities; all activity metadata lives in CSV, not code.

Live app: `index.html` served from Cloudflare Pages, with dynamic features backed by Cloudflare Pages Functions + a D1 (SQLite) database.

## Architecture

```
Cloudflare Pages (git-connected, native deploy — no build step)
  ├─ index.html ──fetch()──▶ data/*.csv           (activity metadata, source of truth)
  │
  └─ functions/api/*.js  ──▶  D1 database (binding: DB)
       POST /api/submit        writes submissions + activities, upserts participants
       GET  /api/leaderboard   aggregated standings
       GET  /api/me?email=     one person's profile + stats + history
       POST /api/rate          community rating (1 vote per person per activity)
       GET  /api/ratings       aggregate activity rankings
       GET  /api/awards        current award holders
       POST /api/feedback      free-text feedback
```

No framework, no bundler, no build step. One HTML file, the CSVs, and a handful of Pages Functions. Leaflet and Google Fonts load from CDN. Every dynamic call is same-origin JSON with a real, readable response — there is no `no-cors` workaround.

> **History:** this app previously used Google Apps Script + Google Sheets as its backend (`apps-script/Code.gs`, a `no-cors` optimistic POST). That backend has been fully retired in favour of Cloudflare D1. The Apps Script copy is kept in the repo only as a dormant reference; nothing in the app reads or writes Sheets anymore.

## Deploy

The site is a **git-connected Cloudflare Pages project** (created via *Workers & Pages → Create → Pages → Connect to Git*, **not** the Workers/Import path). Pushing to `main` triggers a native Pages deployment that:

- uploads the repo root as static assets (`pages_build_output_dir = "."` in `wrangler.toml`),
- auto-detects `functions/` and bundles each file as a route under `/api/*`,
- applies the D1 binding declared in `wrangler.toml`.

There is **no build command, no deploy command, and no API token** — the native git integration handles it. (A `wrangler.toml` with a `[[d1_databases]]` binding does *not* require Workers Builds; if the dashboard ever forces a mandatory "Deploy command" field, the project was created via the wrong flow — recreate it through Pages → Connect to Git.)

### D1 setup

`wrangler.toml` binds the database as `DB`:

```toml
name = "commute-a-thlon"
pages_build_output_dir = "."

[[d1_databases]]
binding = "DB"
database_name = "commute-a-thlon-feedback"
database_id = "<your-d1-database-id>"
```

Create the tables once by running `d1/schema.sql` against the database — either with wrangler:

```bash
npx wrangler d1 execute commute-a-thlon-feedback --remote --file=d1/schema.sql
```

or by pasting the statements into the Cloudflare dashboard's **D1 → Console** tab (one statement at a time, without the leading comments — the console rejects comment-only input with "Requests without any query are not supported"). All statements use `IF NOT EXISTS`, so re-running is safe.

### Run it locally

The static UI needs an HTTP server (CSV `fetch()` fails on `file://`), and this renders every panel *except* the D1-backed ones (leaderboard, awards, ratings, my-entries, submit):

```bash
python -m http.server 8000   # then open http://localhost:8000
```

To exercise the Functions + D1 locally, use `npx wrangler pages dev .` instead.

## Layout

Above the tabs, an **announcement banner** always shows a nudge to rate activities (jumps to Standings → *Rate & rank activities*), plus — only when relevant — a water-quality flag if any site's latest reading is Caution/Avoid (jumps to Log a commute → *Water quality*). Both are computed client-side in `renderAnnouncements()`/`wireAnnouncements()` (`index.html`) from the same `wqBySite` index the water-quality map uses; there's no separate backend call.

The UI is organized into three tabs plus an always-available feedback panel:

- **Log a commute** — the core flow: **1 About you** (email, name, team, and *usual commute* as two dropdowns — a primary mode plus an optional second leg, e.g. "transit + walk"), **2 Challenge** (distance + format + target-split bars), **3 Activities** (the legs you actually did), **4 Summary**. Route sketch, activity explorer, and water quality are grouped under *Optional tools*.
- **Standings** — leaderboard, awards grid, and community activity rankings.
- **My entries** — email-as-identity lookup of your own profile, totals, and submission history.

## Identity (email-as-identity)

There is no password. A person's **email is their identity** — `participants` is keyed by email, submissions and ratings carry it, and `GET /api/me?email=` returns that person's data. This is deliberately lightweight for a friendly challenge; anyone who types an email can view that person's entries. A verified magic-link login is a possible future upgrade.

## Data model

### CSV (activity metadata — source of truth)

`data/activities.csv` defines every activity; nothing about an activity is hardcoded. Columns:

`activity_id, category, name, met, speed_kmh, unit, fun_factor, originality_factor, difficulty_factor, is_commute_friendly, source, status`

`unit` drives how a row is entered and scored:

| unit | user enters | how time is found | tracked as |
|---|---|---|---|
| `km` | distance (+ optional time) | time = distance ÷ `speed_kmh` if left blank | distance km |
| `storeys` | storeys + time | time is required | storeys count |
| `minutes` | time only | — | (no distance) |

- **MET·minutes** = effective `met` × active minutes. Primary effort metric.
- **Completion %** = total logged distance ÷ target distance × 100.
- **Fun / Originality scores** on a submission = mean of the activities' `fun_factor` / `originality_factor`.
- Only `status = active` rows are shown. To add or retune an activity, edit the CSV — no code change.

### Pace-adjusted effort

For `km`-unit activities, the "effective" MET used in MET·minutes is **not** always the CSV's flat `met` value — it's adjusted for how the actual pace (distance ÷ time entered) compares to the activity's own `speed_kmh`, so a faster commute over the same distance never scores as *less* total effort than a slower one for the same activity.

- **Categories with a genuine pace continuum** (currently `walking`, `cycling`, `wheels` — i.e. categories whose several activities are really the same movement at different self-selected paces, e.g. "Cycling Leisure" / "to Work" / "Fast") get a speed → MET curve built from that category's own CSV rows. The curve is fit in effort-per-km space (MET ÷ speed) and isotonically smoothed (`pava()` in `index.html`) to be non-decreasing with speed, then interpolated — flat past either end — for the row's actual pace. This is necessary because the Adult Compendium's published MET values are independently-measured per activity, not points on one smooth physical curve, so taken raw they can locally imply a slower pace costs *more* effort than a faster one.
- A category is only trusted as a continuum if its **raw** MET already rises end-to-end with speed. Categories that bundle unrelated activities (`water`: swimming vs. kayaking vs. SUP; `winter`: skiing vs. snowshoeing vs. skating) fail that check and fall back to a simple linear scale off the picked activity's own reference pace, clamped to 0.5×–2× its nominal MET (`MET_PACE_CLAMP`).
- Motor-assisted activities (`ebike_*`) are excluded from all of this — assist decouples speed from physical effort, so they always score at their flat compendium MET regardless of pace.

A row whose effective MET differs from the CSV value shows "pace-adjusted" in its meta line; the adjusted value (not the raw CSV one) is what's submitted as `met`/`metMinutes` in the API payload.

Other CSVs (`categories`, `seasons`, `awards`, `leaderboard_metrics`, `activity_aliases`) are read the same way. `awards.csv` supplies award names/descriptions (the winner is computed in `functions/api/awards.js`). `data/ratings.csv` held the *seed* fun/originality design defaults — it is **not** loaded into D1; live community ratings start fresh from real votes.

### D1 (dynamic state)

Schema in `d1/schema.sql`:

| table | holds |
|---|---|
| `participants` | one row per person, keyed by `email` (+ display name, team, `usual_commute_mode`) |
| `submissions` | one row per logged commute effort (totals, target, drawn distances, notes) |
| `activities` | one row per activity leg, linked by `submission_id` |
| `ratings` | community votes: one row per `(email, activity_id)`, 1–10 on fun/originality/difficulty |
| `feedback` | free-text feedback messages |

## Target

Pick a **format** (Olympic or Ironman) and a **challenge distance**. The format only sets the swim/bike/run *proportions* (Olympic 1.5/40/10, Ironman 3.86/180/42.2); those proportions are applied to your distance to produce the three discipline targets. Choosing a format prefills the distance with the canonical total, which you can override with your real commute distance.

## Submission contract

On submit the client POSTs one JSON body to `/api/submit`. The Function inserts **one `submissions` row + one `activities` row per activity**, and **upserts the `participant`** (keyed by email). The `submissions.id` is auto-generated; the response is `{ success, submissionId }`.

Payload keys are **camelCase**:

```jsonc
{
  "email": "", "displayName": "", "team": "", "usualCommuteMode": "",
  "targetDistanceKm": 0, "targetFormat": "Olympic",
  "targetSwimKm": 0, "targetBikeKm": 0, "targetRunKm": 0,
  "drawnSwimKm": 0, "drawnBikeKm": 0, "drawnRunKm": 0,
  "transitionMinutes": 0,
  "totalDistanceKm": 0, "totalActiveMinutes": 0, "totalElapsedMinutes": 0,
  "totalMETMinutes": 0, "funScore": 0, "originalityScore": 0,
  "completionPercent": 0, "activityCount": 0, "notes": "",
  "activities": [
    { "category": "", "activityId": "", "activityName": "",
      "distance": 0, "distanceUnit": "km", "timeMinutes": 0,
      "met": 0, "metMinutes": 0, "funFactor": 0, "originalityFactor": 0,
      "calculatedSpeed": 0, "season": "all" }
  ]
}
```

`email` is required. `usualCommuteMode` is the combined primary + optional second leg (e.g. `"transit + walk"`). Per-activity `met`/`metMinutes` are the *effective*, pace-adjusted values (see "Pace-adjusted effort" above), not necessarily the CSV's flat `met`. If you rename a field, rename it on both the client (`buildPayload` in `index.html`) and the Function.

## Awards

`data/awards.csv` lists 12 awards. `GET /api/awards` computes the current holder for **10** of them from D1 aggregates (MET Monster, Champion, Fun Machine, Most Original, Daily Grinder, Office Tower Legend, Winter Warrior, Canal Creature, Wheel Wizard, Human Hybrid). Two are intentionally left uncomputed because their rules are ambiguous:

- **Speed Demon** ("fastest total commute time") — undefined at which distance / what counts as "fast".
- **Personal Best** ("largest improvement vs previous average") — needs a defined baseline.

They render as "Not yet awarded" until the rules are pinned down.

## Water quality data

`data/water_quality.csv` holds recreational water quality readings (E. coli, total coliform, water temperature) for swim/paddle spots around Ottawa, for the `water` activity category. It's not hand-maintained — a scheduled workflow (`.github/workflows/update-water-quality.yml`, Thursdays) runs `scripts/fetch_water_quality.py`, which pulls two upstream sources and refetches/replaces the file wholesale each time (both sources already retain their own full history, so there's no local accumulation to drift):

- **[Ottawa Riverkeeper](https://ottawa-riverkeeper-open-data-ork-so.hub.arcgis.com/datasets/afe7fde714bf460e88cf139483bf0d68)** — volunteer/partner sampling at ~28 sites (Mooney's Bay, Petrie Island, Remic Rapids, Constance Bay, Dow's Lake, etc.), 2019–present. `metric_type = single_sample`.
- **[City of Ottawa / Ottawa Public Health](https://open.ottawa.ca/datasets/ottawa::beach-water-sampling)** — official weekly geometric-mean E. coli for the 5 supervised beaches (Britannia, Mooney's Bay, Westboro, Petrie East Bay, Petrie River), 2014–present. `metric_type = weekly_geomean`.

Columns: `date, time, site, latitude, longitude, source, metric_type, parameter, value, unit, flag`. The Ontario recreational water standard is 200 E. coli cfu/100mL (`parameter = ecoli_cfu_100ml`) — that threshold is a display concern, not baked into the data.

Not currently pulled in: Carleton's [Rideau River water quality testing](https://carleton.ca/ormeci/rideau-river-water-quality-testing/) publishes only as page text with no download or API, so it can't be automated the same way — it'd need manual weekly transcription if we want Rideau River coverage.

To run the fetch locally: `pip install -r scripts/requirements.txt && python scripts/fetch_water_quality.py`.

## Repo layout

```
Commute-a-thlon/
├── index.html                 # the app (single file: markup + styles + script)
├── wrangler.toml              # Pages config + D1 binding (DB)
├── functions/
│   └── api/
│       ├── submit.js           # POST /api/submit
│       ├── leaderboard.js      # GET  /api/leaderboard
│       ├── me.js               # GET  /api/me?email=
│       ├── rate.js             # POST /api/rate
│       ├── ratings.js          # GET  /api/ratings
│       ├── awards.js           # GET  /api/awards
│       └── feedback.js         # POST /api/feedback
├── d1/
│   └── schema.sql              # D1 tables (participants, submissions, activities, ratings, feedback)
├── data/
│   ├── activities.csv          # source of truth for activity metadata
│   ├── categories.csv
│   ├── seasons.csv
│   ├── awards.csv              # award names/descriptions (winners computed in awards.js)
│   ├── leaderboard_metrics.csv
│   ├── ratings.csv             # seed rating defaults (not loaded into D1)
│   ├── activity_aliases.csv
│   └── water_quality.csv       # auto-updated, see "Water quality data" above
├── scripts/
│   └── fetch_water_quality.py  # source of data/water_quality.csv
├── .github/workflows/
│   └── update-water-quality.yml
└── apps-script/
    └── Code.gs                 # DORMANT — retired Google Sheets backend, kept for reference only
```
