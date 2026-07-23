# Commute-a-thlon UX Review & Roadmap

## Overall Assessment

Current state is strong for an internal office challenge tool.

Scores:
- Visual Design: 8.5/10
- Information Architecture: 8/10
- Usability: 7/10
- Leaderboard Readiness: 9/10

The site feels like a real product rather than a spreadsheet front-end. The visual identity is consistent, engaging, and memorable.

---

## Strengths

### 1. Strong Visual Identity

The triathlon theme is executed well:
- Consistent swim / bike / run color system
- Good typography (Space Grotesk + Inter)
- Attractive progress bars
- Instrument-panel style metrics
- Professional but playful feel

### 2. Clear User Flow

The numbered sections work well:
1. Set target
2. Log activities
3. Route (optional)
4. Metrics
5. Explorer
6. Water quality

Users can understand the workflow quickly.

### 3. Immediate Feedback

The live metrics section is a major strength.

Users instantly see:
- Distance
- MET minutes
- Completion percentage
- Activity count

This creates motivation without being overly game-like.

### 4. Responsive Layout

The desktop-first approach is appropriate.

Expected usage:
- ~80% desktop/laptop
- ~20% mobile

Current responsive behavior is sufficient for the target audience.

---

## Biggest UX Opportunities

### 1. Reduce Main Page Complexity (Highest Priority)

The page currently contains:
- Target setup
- Activity logging
- Route map
- Metrics
- Activity explorer
- Water quality explorer

For most users, the goal is simply:

> Log a commute quickly.

#### Recommendation

Move advanced tools out of the primary workflow.

Option A:
- Keep Explorer and Water Quality under a collapsed "Extras" section.

Option B (preferred):
- Home / Submit
- Leaderboard
- Activity Explorer
- Water Quality

This will scale better as the user base grows.

---

### 2. Simplify Activity Entry

Activity rows are powerful but visually dense.

Current fields:
- Category
- Activity
- Distance
- Time
- Delete
- Optional water quality controls
- Metadata summary

#### Goal

Optimize for:

> Select activity → enter distance → submit.

#### Recommendation

Make metadata visually lighter and reduce perceived complexity where possible.

---

### 3. Replace Technical MET Language

Most office users do not know what MET means.

#### Suggested Renames

Current:
- MET minutes

Proposed:
- Effort Score

Current:
- MET Explorer

Proposed:
- Activity Explorer

Continue calculating MET internally but avoid exposing the technical term everywhere.

---

### 4. Keep Route Sketch Secondary

The route sketch feature is nice but likely used by a small minority of users.

Recommendation:
- Keep collapsed by default
- Potentially move below metrics
- Continue treating as optional

---

## Leaderboard Design

Do NOT create only a distance leaderboard.

Use multiple ranking systems.

### Tab 1: Distance

Rank by total distance.

Example:
- #1 Simon – 245 km
- #2 Alex – 221 km

### Tab 2: Completion

Rank by:

Completion = Distance / Target Distance

Benefits:
- Makes short commutes competitive
- Rewards consistency
- More inclusive

Example:
- #1 Alex – 180%
- #2 Sam – 145%

### Tab 3: Effort

Rank by:

Effort = MET Minutes

Benefits:
- Rewards harder activities
- Prevents long low-effort activities from dominating

### Tab 4: Fun & Originality

Use existing data.

Examples:
- Most Original Commuter
- Most Fun Commute
- Weirdest Commute

These create conversation and engagement.

---

## High-Impact Feature: Personal Rank Card

After submission, show:

✅ Submitted

Distance Rank: #12
Completion Rank: #4
Effort Rank: #8

You moved up 3 places today.

### Why This Matters

Users care more about:

> "I'm now #7"

than:

> "I have 123 MET minutes"

This is likely the single most motivating leaderboard feature.

---

## Priority Roadmap

### Phase 1 (Immediate)

1. Build leaderboard page
2. Add completion ranking
3. Add effort ranking
4. Add personal rank card

### Phase 2

1. Hall of Fame page
2. Awards and badges
3. Fun/Originality leaderboards
4. Personal history page

### Phase 3

1. Move advanced tools to separate pages
2. Reduce complexity on submission page
3. Further streamline activity logging

---

## Final Recommendation

The design is already above average for an internal challenge application.

The biggest risk is not visual design.

The biggest risk is feature density on the main page.

Focus next development effort on:

1. Leaderboards
2. Personal rankings
3. Recognition and awards
4. Simplifying the primary submission experience

Overall positioning:

> Strava + office challenge + data-nerd project

That is likely exactly the right fit for the intended audience of ~100 users.
