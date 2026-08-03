// Cloudflare Pages Function — GET /api/awards
// Computes the current holder of each award from D1. Award names/descriptions
// live in data/awards.csv (loaded client-side); this endpoint returns the
// winner keyed by award_id.
//
// All 12 awards are now computed:
//   • Speed Demon  — highest average commute pace (total distance ÷ total active
//     time), gated to ≥5 km logged so a single short sprint can't win. ("Fastest
//     commute time" taken as fastest *pace*, since lowest raw time would just
//     reward the shortest commute.)
//   • Personal Best — largest improvement of a participant's most recent
//     submission's MET-minutes over the average of their earlier submissions
//     (needs ≥2 submissions).
// Requires a D1 database bound as DB (configured in wrangler.toml).

export async function onRequestGet({ env }) {
  try {
    // Per-participant submission aggregates (best-of / sums / counts).
    const { results: subs } = await env.DB.prepare(
      `SELECT
         p.email,
         p.display_name,
         p.team,
         COUNT(s.id)                              AS submissions,
         COALESCE(SUM(s.total_met_minutes), 0)    AS met,
         COALESCE(SUM(s.total_distance_km), 0)    AS distance,
         COALESCE(SUM(s.total_active_minutes), 0) AS active_min,
         COALESCE(MAX(s.completion_percent), 0)   AS best_completion,
         COALESCE(MAX(s.fun_score), 0)            AS best_fun,
         COALESCE(MAX(s.originality_score), 0)    AS best_orig
       FROM participants p
       LEFT JOIN submissions s ON s.email = p.email
       GROUP BY p.email`
    ).all();

    // Per-participant category/unit distances + distinct activity types.
    const { results: acts } = await env.DB.prepare(
      `SELECT
         s.email,
         COALESCE(SUM(CASE WHEN a.category = 'winter'   THEN a.distance ELSE 0 END), 0) AS winter_km,
         COALESCE(SUM(CASE WHEN a.category = 'water'    THEN a.distance ELSE 0 END), 0) AS water_km,
         COALESCE(SUM(CASE WHEN a.category = 'wheels'   THEN a.distance ELSE 0 END), 0) AS wheels_km,
         COALESCE(SUM(CASE WHEN a.distance_unit = 'storeys' THEN a.distance ELSE 0 END), 0) AS storeys,
         COUNT(DISTINCT a.activity_id)            AS activity_types
       FROM submissions s
       JOIN activities a ON a.submission_id = s.id
       GROUP BY s.email`
    ).all();

    // Merge the two aggregate sets by email into one per-participant record.
    const byEmail = new Map();
    for (const r of subs || []) {
      byEmail.set(r.email, {
        name: r.display_name || r.email,
        team: r.team || "",
        submissions: r.submissions,
        met: r.met,
        pace: Number(r.distance) >= 5 && Number(r.active_min) > 0
          ? (Number(r.distance) / Number(r.active_min)) * 60
          : 0,
        best_completion: r.best_completion,
        best_fun: r.best_fun,
        best_orig: r.best_orig,
        winter_km: 0, water_km: 0, wheels_km: 0, storeys: 0, activity_types: 0,
      });
    }
    for (const r of acts || []) {
      const p = byEmail.get(r.email);
      if (!p) continue;
      p.winter_km = r.winter_km;
      p.water_km = r.water_km;
      p.wheels_km = r.wheels_km;
      p.storeys = r.storeys;
      p.activity_types = r.activity_types;
    }
    const people = [...byEmail.values()];

    // Personal Best: per participant, compare their latest submission's
    // MET-minutes to the average of all earlier ones. Needs ≥2 submissions.
    const { results: perSub } = await env.DB.prepare(
      `SELECT email, id, COALESCE(total_met_minutes, 0) AS met
       FROM submissions ORDER BY email, id`
    ).all();
    const subsByEmail = new Map();
    for (const r of perSub || []) {
      if (!subsByEmail.has(r.email)) subsByEmail.set(r.email, []);
      subsByEmail.get(r.email).push(Number(r.met) || 0);
    }
    let personalBest = null;
    for (const [email, mets] of subsByEmail) {
      if (mets.length < 2) continue;
      const latest = mets[mets.length - 1];
      const prior = mets.slice(0, -1);
      const priorAvg = prior.reduce((s, v) => s + v, 0) / prior.length;
      const improvement = latest - priorAvg;
      const p = byEmail.get(email);
      if (improvement > 0 && (!personalBest || improvement > personalBest.value)) {
        personalBest = { name: p ? p.name : email, team: p ? p.team : "", value: improvement };
      }
    }

    // For an award, the winner is the person with the highest value (> 0).
    const top = (key) => {
      let best = null;
      for (const p of people) {
        const v = Number(p[key]) || 0;
        if (v > 0 && (!best || v > best.value)) best = { name: p.name, team: p.team, value: v };
      }
      return best;
    };

    const winners = {
      met_monster: top("met"),
      commute_athlon_champion: top("best_completion"),
      fun_machine: top("best_fun"),
      most_original: top("best_orig"),
      daily_grinder: top("submissions"),
      office_tower_legend: top("storeys"),
      winter_warrior: top("winter_km"),
      water_creature: top("water_km"),
      wheel_wizard: top("wheels_km"),
      human_hybrid: top("activity_types"),
      speed_demon: top("pace"),
      personal_best: personalBest,
    };

    return json({ success: true, winners });
  } catch (err) {
    return json({ success: false, error: "Database error: " + err.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
