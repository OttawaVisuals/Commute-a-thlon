# Commute-a-thlon

A data-driven active-commuting challenge. Log real commuting activities (walk, bike, ski, kayak, stairs…), draw your route on a map, and submit against a triathlon-style target. Metrics come from the 2024 Adult Compendium of Physical Activities; all activity data lives in CSV, not code.

Live app: served from `index.html` via GitHub Pages.

## Architecture

```
GitHub Pages (static)
  └─ index.html  ──fetch()──▶  data/*.csv        (activity metadata, source of truth)
        │
        └──POST (no-cors)────▶  Google Apps Script  ──▶  Google Sheets
                                 doPost(e)               Submissions + Activities (+ Participants)
```

No build step, no framework, no bundler. One HTML file plus the CSVs. Leaflet and Google Fonts load from CDN.

## Run it

**GitHub Pages:** push to `main`, enable Pages (Settings → Pages → deploy from `main`, root). The app fetches `./data/*.csv` relatively, so `index.html` and `data/` must stay side by side.

**Locally:** you need an HTTP server — `fetch()` of the CSVs fails on `file://`.
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Data model

`data/activities.csv` is the source of truth. Nothing about an activity is hardcoded. Columns:

`activity_id, category, name, met, speed_kmh, unit, fun_factor, originality_factor, difficulty_factor, is_commute_friendly, source, status`

`unit` drives how a row is entered and scored:

| unit | user enters | how time is found | tracked as |
|---|---|---|---|
| `km` | distance (+ optional time) | time = distance ÷ `speed_kmh` if left blank | distance km |
| `storeys` | storeys + time | time is required | storeys count |
| `minutes` | time only | — | (no distance) |

- **MET·minutes** = `met` × active minutes. Primary effort metric.
- **Completion %** = total logged distance ÷ target distance × 100.
- **Fun / Originality scores** = mean of `fun_factor` / `originality_factor` across logged activities.
- Only `status = active` rows are shown. To add or retune an activity, edit the CSV — no code change.

Other CSVs (`categories`, `seasons`, `awards`, `leaderboard_metrics`, `ratings`, `activity_aliases`) are read the same way. `awards.csv` and `leaderboard_metrics.csv` are consumed by the read-back features listed under *Not yet wired*.

## Target

Pick a **format** (Olympic or Ironman) and a **challenge distance**. The format only sets the swim/bike/run *proportions* (Olympic 1.5/40/10, Ironman 3.86/180/42.2); those proportions are applied to your distance to produce the three discipline targets. Choosing a format prefills the distance with the canonical total, which you can override with your real commute distance.

## Submission contract

On submit, the client POSTs one JSON body. The Apps Script (`doPost`) writes **one row to `Submissions`** and **one row per activity to `Activities`**, and generates `SubmissionID`, `Timestamp`, `Year`, `Month`, `Week` server-side (don't send them).

Payload keys are **camelCase** and must match `doPost` exactly:

```jsonc
{
  "displayName": "", "team": "", "usualCommuteMode": "",
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

If you rename a field on either side, rename it on both. The endpoint is set in one place near the top of the script block in `index.html`:

```js
const API_URL = "https://script.google.com/macros/s/.../exec";
```

### The no-cors caveat (important)

Apps Script web apps don't return CORS headers, so the browser can't read the response of a cross-origin POST. The client therefore sends a *simple* request (`Content-Type: text/plain`, `mode: "no-cors"`) and treats submission as **optimistic** — the write succeeds but the client can't see success/failure or the returned `SubmissionID`. The UI says as much and asks you to confirm the row in the sheet. On a network-level failure the full payload is logged to the console so nothing is lost.

If you want true confirmation in the browser, the realistic options are a proxy that adds CORS headers, or accepting the opaque response as-is (current behaviour).

## Not yet wired

Leaderboards, awards, personal records, trends, and community ratings all need to **read data back** from the sheet. That requires a `doGet` on the Apps Script that returns rows as JSON (e.g. `?sheet=Participants`); the current `doGet` only returns a health-check. Once that exists, the client can render:

- **Leaderboards** — driven by `leaderboard_metrics.csv` + `awards.csv` against sheet rows.
- **Personal records** — from the `Participants` sheet (already maintained by the script).
- **Trends** — grouped by the `Year` / `Month` / `Week` columns.
- **Community ratings** — vote UI writing to `ActivityRatings`; optional export back into `ratings.csv`.

The client and CSVs are structured for these; they're intentionally left as a TODO rather than stubbed with fake data.

## Water quality data

`data/water_quality.csv` holds recreational water quality readings (E. coli, total coliform, water temperature) for swim/paddle spots around Ottawa, for the `water` activity category. It's not hand-maintained — a scheduled workflow (`.github/workflows/update-water-quality.yml`, Thursdays) runs `scripts/fetch_water_quality.py`, which pulls two upstream sources and refetches/replaces the file wholesale each time (both sources already retain their own full history, so there's no local accumulation to drift):

- **[Ottawa Riverkeeper](https://ottawa-riverkeeper-open-data-ork-so.hub.arcgis.com/datasets/afe7fde714bf460e88cf139483bf0d68)** — volunteer/partner sampling at ~28 sites (Mooney's Bay, Petrie Island, Remic Rapids, Constance Bay, Dow's Lake, etc.), 2019–present. `metric_type = single_sample`.
- **[City of Ottawa / Ottawa Public Health](https://open.ottawa.ca/datasets/ottawa::beach-water-sampling)** — official weekly geometric-mean E. coli for the 5 supervised beaches (Britannia, Mooney's Bay, Westboro, Petrie East Bay, Petrie River), 2014–present. `metric_type = weekly_geomean`.

Columns: `date, time, site, latitude, longitude, source, metric_type, parameter, value, unit, flag`. The Ontario recreational water standard is 200 E. coli cfu/100mL (`parameter = ecoli_cfu_100ml`) — that threshold is a display concern, not baked into the data.

Not currently pulled in: Carleton's [Rideau River water quality testing](https://carleton.ca/ormeci/rideau-river-water-quality-testing/) publishes only as page text with no download or API, so it can't be automated the same way — it'd need manual weekly transcription if we want Rideau River coverage.

To run the fetch locally: `pip install -r scripts/requirements.txt && python scripts/fetch_water_quality.py`.

This data isn't wired into the UI yet — see the Not yet wired section above; water quality display is next.

## Repo layout

```
Commute-a-thlon/
├── index.html                 # the app
├── data/
│   ├── activities.csv          # source of truth for activity metadata
│   ├── categories.csv
│   ├── seasons.csv
│   ├── awards.csv
│   ├── leaderboard_metrics.csv
│   ├── ratings.csv
│   ├── activity_aliases.csv
│   └── water_quality.csv       # auto-updated, see "Water quality data" above
├── scripts/
│   └── fetch_water_quality.py  # source of data/water_quality.csv
├── .github/workflows/
│   └── update-water-quality.yml
└── apps-script/
    └── Code.gs                 # doPost/doGet (deployed as a Web App)
```

The Apps Script lives in the Google project; keep a copy under `apps-script/Code.gs` so the payload contract and the sheet columns stay reviewable alongside the client.
