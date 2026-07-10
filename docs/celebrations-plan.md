# Pixel Celebrations — game plan + implementation handoff

Pixel-art legends that **come alive when they score**. A drafted star nets a goal
and their pixel goal-card bursts into a short looping celebration (Mbappé arms
crossed, Ronaldo _siuuu_, etc.), generated with **Higgsfield** and re-pixelated
to match the retro skin.

> **Status:** plan + Phase-0 spike. No gameplay/sim code changed. Celebrations are
> **purely presentational** — never touch the seeded simulation.

Full visual plan artifact: _Pixel Celebrations plan_ (published separately).

---

## Locked decisions

| Question | Decision |
| --- | --- |
| Likeness / IP | **Real named legends** — accept the likeness/ToS risk (hobby project). Pixel-art abstraction softens it; if a prompt is refused, fall back to an "inspired-by / #10 in France blue" stylisation. |
| First build | **Phase-0 spike** — one player (Mbappé), end-to-end, before any batch. |
| Trigger | **A drafted legend scores a goal** → clip plays during match playback (`LiveMatch`). (Win/trophy screen is a later add.) |
| Generation | **Higgsfield MCP** (`mcp.higgsfield.ai`), connected. Uses account credits. |

---

## The architecture rule (why this is even possible)

AI video takes seconds–minutes and costs credits per clip, so it **cannot run at
match time**. Higgsfield is a **build-time content tool**, not a runtime
dependency:

```
portrait ─► pixel-art still ─► Higgsfield image→video ─► re-pixelate + loop ─► ship as <video> ─► plays instantly in-game
     (offline asset pipeline, done once)                                        (runtime = just a static asset)
```

The app ships small looping `.webm` files and plays them like images. No API at
runtime, no keys in the browser, sim untouched, deterministic.

---

## The Higgsfield pipeline (per celebration, offline)

### Step 1 — Pixel-art pose stills (`generate_image`)

Generate the **celebration as keyframes** — the same character in 2–3 poses — so
the video has a start and an end to interpolate between (much cleaner motion,
guaranteed signature pose).

- **Model:** `nano_banana_pro` (~2 credits each). **Aspect:** `3:4`.
- **Poses (one still each):**
  - **`run`** — sprinting away after scoring, arms back, head up (goal → run-off).
  - **`jump`** _(optional)_ — mid-leap, about to set the pose.
  - **`cross`** — landed, **arms crossed**, proud/calm (Mbappé signature).
- **Consistency:** pass the first still as `medias: [{ role: "image_references", value: "<job_id>" }]` on the others so it stays the same player (or train a **Soul** character later for the hero set).
- **Shared prompt base:**

  > 16-bit pixel-art sprite of a football (soccer) player, royal-blue #10 home kit,
  > white shorts, dark boots. Chunky retro game pixels, limited palette, crisp hard
  > edges, no anti-aliasing, plain dark background, full body, centred.
  > &nbsp;&nbsp;• run → "…sprinting to the right, arms swept back, celebrating a goal."
  > &nbsp;&nbsp;• jump → "…mid-air leap, fists clenched."
  > &nbsp;&nbsp;• cross → "…standing, arms crossed over the chest, proud and calm."

- Keep each **job_id**. The current spike's `cross` still already exists:
  `3ad71956-09e3-4f56-a4f6-d4d65f0ad75e` (2 credits, done).

### Step 2 — Animate between keyframes (`generate_video`)

- **Model:** **`seedance_2_0_mini`** — budget variant, supports **`start_image` + `end_image`** keyframes. `480p`, `generate_audio:false` → **~5 credits / 5s**. (Cheap. `kling3_0` also does start+end but costs more.)
- **Input:** `medias: [{ role:"start_image", value:"<run job_id>" }, { role:"end_image", value:"<cross job_id>" }]`, `duration:5`, `resolution:"480p"`, `generate_audio:false`.
- **Prompt:**

  > Pixel-art footballer runs in from a goal, leaps and lands into a proud
  > arms-crossed pose with a slight bounce. Camera locked, minimal background
  > motion, retro game feel, seamless loop.

- Optional 3-keyframe version: two clips (`run→jump`, `jump→cross`) concatenated. Start with the simple 2-keyframe clip first.

### Step 3 — Re-pixelate + loop (local, `ffmpeg`)

Downscale-nearest → upscale-nearest (blocky), drop fps, quantise palette, export
webm; boomerang for a clean loop.

```bash
# 1) pixelate + low fps
ffmpeg -i raw.mp4 -vf "fps=12,scale=192:-1:flags=neighbor,scale=576:-1:flags=neighbor" pix.mp4
# 2) boomerang loop (forward + reverse)
ffmpeg -i pix.mp4 -filter_complex "[0]reverse[r];[0][r]concat=n=2:v=1" loop.mp4
# 3) compact webm (target <300KB)
ffmpeg -i loop.mp4 -c:v libvpx-vp9 -b:v 0 -crf 40 -an mbappe.webm
# poster frame for reduced-motion fallback
ffmpeg -i pix.mp4 -vframes 1 mbappe.png
```

Tune `crf`/scale to hit the size budget. Store both `.webm` and `.png`.

---

## App implementation spec

### Files

- `public/celebrations/<playerId>.webm` + `<playerId>.png` (poster).
- `public/celebrations/celebrations.json` — manifest:

  ```json
  {
    "version": 1,
    "clips": {
      "<playerId>": { "webm": "mbappe.webm", "poster": "mbappe.png", "celebration": "arms-crossed", "credit": "Higgsfield" }
    },
    "archetypes": { "striker": "generic-kneeslide.webm" }
  }
  ```

- `src/components/CelebrationClip.tsx` — new component.

### `<CelebrationClip>`

- Props: `playerId`, `size`, `onEnd?`.
- Resolves manifest: exact `playerId` clip → position/archetype clip → `null`.
- Renders `<video autoplay muted playsInline loop poster=…>`; on `prefers-reduced-motion` render the **static poster** (pixel card) only.
- Lazy: only fetch the manifest once; only mount `<video>` when actually celebrating; preload posters for the drafted XI, defer webm.

### Where it hooks in (Phase 0 = goal moment only)

- `src/components/LiveMatch.tsx` — on a goal event whose scorer is a drafted
  player **with a manifest clip**, overlay `<CelebrationClip playerId=…>` for
  ~2–3s (a corner card or a brief centre flourish). Guard: only for players that
  have a clip; everyone else keeps today's behaviour.
- Later: `ResultPanel` / `Celebration.tsx` for the win/trophy hero moment.

### Guardrails

- Presentational only — **do not** touch `game8/` sim or the seed.
- Everything behind a manifest lookup → **graceful fallback** to current confetti.
- `prefers-reduced-motion` → poster, no video.
- Payload budget: <300–500 KB/clip; lazy-load; cap total shipped clips.
- Keep `PenaltyShootout.tsx` off-limits.

---

## Phase checklist

- [ ] **Phase 0 — Spike (Mbappé, goal moment).** Image → video → re-pixelate →
      `<CelebrationClip>` + manifest → plays when Mbappé scores in `LiveMatch`.
      Verify both themes, reduced-motion fallback. **Don't merge — review first.**
- [ ] **Phase 1 — Hero set.** ~8–12 legends; wire goal + win moments; Soul for
      on-model consistency.
- [ ] **Phase 2 — Archetypes.** Generic celebrations by position for the long tail.
- [ ] **Phase 3 — Juice.** Sound, timing, "share your celebration" export.

---

## Risks

- **Likeness/ToS** ⚠️ — real footballers on a public app is a real name/image-rights
  + platform-ToS question; some models refuse real public figures. Mitigations:
  heavy pixel stylisation, "inspired-by / #10" fallback, or original mascots.
- **Warping** — AI video of pixel art can melt; the re-pixelate pass hides most of it.
- **Cost/time** — credits + curation per clip; batch small, not every player earns one.
- **Payload** — video bloats the bundle; compress hard, lazy-load.

---

## Continuing in a fresh session

Recommended: a new session on branch `feat/pixel-celebrations`, Higgsfield MCP
connected. Key facts:

- **Mbappé** = `player_id: 121` (FRA, FW, shirt #10) in `public/data/players.json`.
  Key the manifest and the `LiveMatch` goal-scorer check off the **id**, never the
  hard-coded name (house rule).
- The spike clip lands at `public/celebrations/121.webm` + `121.png`.
- Existing `cross` still (arms crossed): job `3ad71956-09e3-4f56-a4f6-d4d65f0ad75e`.

### Copy-paste starter prompt

```
Read docs/celebrations-plan.md end to end — that's the game plan. Do the
Phase-0 "Pixel Celebrations" spike for 8and0 on a new branch
feat/pixel-celebrations. The Higgsfield MCP is connected. Decisions are locked:
real named legend (Mbappé, player_id 121), trigger = a drafted legend scores a
goal → clip plays in LiveMatch, cheap models only, don't merge.

1. KEYFRAMES (generate_image, nano_banana_pro, 3:4, ~2 credits each): make the
   celebration as poses of the SAME pixel player — `run` (sprinting off after a
   goal) and `cross` (arms crossed, Mbappé signature). Reuse the existing cross
   still 3ad71956-09e3-4f56-a4f6-d4d65f0ad75e if it still looks good; otherwise
   regenerate. Keep them consistent (pass one as image_references on the other).
   Show me the stills before the video.

2. VIDEO (generate_video, seedance_2_0_mini, ~5 credits): preflight cost first
   (get_cost:true). Then start_image = run, end_image = cross, duration 5,
   resolution 480p, generate_audio false. Prompt: "Pixel-art footballer runs in
   from a goal, leaps and lands into a proud arms-crossed pose, slight bounce,
   camera locked, minimal background, seamless loop." Show me before spending
   more.

3. RE-PIXELATE + LOOP (ffmpeg, see this doc): nearest-neighbour down/up, ~12fps,
   boomerang loop, vp9 webm < 300KB, plus a poster PNG. Save as
   public/celebrations/121.webm and 121.png.

4. WIRE THE SPIKE: add src/components/CelebrationClip.tsx (autoplay/muted/loop,
   poster; prefers-reduced-motion → poster only) + public/celebrations/
   celebrations.json manifest keyed by player_id. In LiveMatch, when the goal
   scorer's player_id has a clip, overlay <CelebrationClip> for ~2-3s. Purely
   presentational — do NOT touch game8/ sim or the seed. PenaltyShootout.tsx is
   off-limits.

5. VERIFY in the real app (npm run dev + a phone-viewport screenshot), both
   themes, and the reduced-motion fallback. Run npm test + npm run lint +
   npm run build. DON'T merge — show me the result first.

Note: the sandbox proxy blocks the Higgsfield CDN + the live domain, so use the
job_display widget to show me generated media, and drive the app locally for
screenshots.
```
</content>
