#!/usr/bin/env python3
"""Fetch and normalize Ottawa-area recreational water quality data into data/water_quality.csv.

Sources (both are stable direct-download URLs behind ArcGIS Hub item pages, no API key needed):

- Ottawa Riverkeeper "Recreational Water Quality" -- volunteer + partner sampling of E. coli,
  total coliform and water temperature at ~28 sites across the watershed, 2019-present.
  https://ottawa-riverkeeper-open-data-ork-so.hub.arcgis.com/datasets/afe7fde714bf460e88cf139483bf0d68

- City of Ottawa / Ottawa Public Health "Beach Water Sampling" -- official weekly geometric-mean
  E. coli for the 5 supervised beaches, 2014-present.
  https://open.ottawa.ca/datasets/ottawa::beach-water-sampling

Both source files already contain their full history, so this script does a full refetch and
replace rather than an incremental append -- there's no local state to drift from upstream.

Run: python scripts/fetch_water_quality.py
"""
import csv
import datetime as dt
import io
import sys
from pathlib import Path

import openpyxl
import requests

RIVERKEEPER_URL = "https://www.arcgis.com/sharing/rest/content/items/afe7fde714bf460e88cf139483bf0d68/data"
CITY_BEACH_URL = "https://www.arcgis.com/sharing/rest/content/items/e5ae84eb794e4dfe85d755013c136b45/data"
OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "water_quality.csv"

FIELDNAMES = [
    "date", "time", "site", "latitude", "longitude",
    "source", "metric_type", "parameter", "value", "unit", "flag",
]

# The city's beach-sampling file has no coordinates. These are the 5 supervised
# beaches' locations, converted from the city's "Beaches" open-data layer
# (Web Mercator EPSG:3857 -> WGS84). Petrie River has no separate entry in that
# layer -- it's part of the same Petrie Island beach complex as Petrie East Bay,
# so it reuses those coordinates.
CITY_BEACH_COORDS = {
    "Westboro": (45.395397, -75.761271),
    "Britannia": (45.365073, -75.801513),
    "Mooney's Bay": (45.366844, -75.692678),
    "Petrie East Bay": (45.506325, -75.487879),
    "Petrie River": (45.506325, -75.487879),
}

# Riverkeeper's bilingual characteristic names -> our parameter vocabulary.
PARAM_MAP = {
    "E. coli count // Dénombrement d'E. coli": ("ecoli_cfu_100ml", "cfu/100mL"),
    "Total Coliform // Coliformes totaux": ("total_coliform_cfu_100ml", "cfu/100mL"),
    "Water Temperature // Temp. de l'eau": ("water_temp_c", "deg C"),
}


def fetch_riverkeeper(rows):
    resp = requests.get(RIVERKEEPER_URL, timeout=60)
    resp.raise_for_status()
    text = resp.content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    for r in reader:
        mapped = PARAM_MAP.get(r["CharateristicName__Nom caractéristique"])
        if not mapped:
            continue
        parameter, unit = mapped
        date = dt.datetime.strptime(r["Date__Date"], "%d-%b-%y").date().isoformat()
        rows.append({
            "date": date,
            "time": r["Time__Temps"],
            "site": r["BeachName__Nom le la plage"].strip(),
            "latitude": r["Latitude__Latitude"],
            "longitude": r["Longitude__Longitude"],
            "source": "Ottawa Riverkeeper",
            "metric_type": "single_sample",
            "parameter": parameter,
            "value": r["ResultValue__Valeur du résultat"],
            "unit": unit,
            "flag": "",
        })


def fetch_city_beaches(rows):
    resp = requests.get(CITY_BEACH_URL, timeout=60)
    resp.raise_for_status()
    wb = openpyxl.load_workbook(io.BytesIO(resp.content), read_only=True, data_only=True)
    ws = wb["2014-2026"]  # running combined sheet; per-year sheets also exist upstream
    it = ws.iter_rows(values_only=True)
    next(it)  # blank spacer row
    header = next(it)
    assert header == ("Date", "Beach", "GM E. coli", "Status"), f"unexpected header: {header}"
    for date, beach, gm_ecoli, status in it:
        if date is None or beach is None:
            continue
        beach = beach.strip()
        lat, lon = CITY_BEACH_COORDS.get(beach, ("", ""))
        rows.append({
            "date": date.date().isoformat(),
            "time": "",
            "site": beach,
            "latitude": lat,
            "longitude": lon,
            "source": "City of Ottawa / Ottawa Public Health",
            "metric_type": "weekly_geomean",
            "parameter": "ecoli_cfu_100ml",
            "value": round(gm_ecoli, 1) if isinstance(gm_ecoli, (int, float)) else gm_ecoli,
            "unit": "cfu/100mL",
            "flag": status or "",
        })


def main():
    rows = []
    fetch_riverkeeper(rows)
    fetch_city_beaches(rows)
    rows.sort(key=lambda r: (r["date"], r["site"], r["parameter"]))

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDNAMES)
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} rows to {OUT_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
