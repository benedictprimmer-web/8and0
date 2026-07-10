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

### Step 1 — Pixel-art still (`generate_image`)

- **Model:** `nano_banana_pro` (strong prompt adherence) — or `z_image` for a fast/cheap draft.
- **Aspect:** `3:4` (portrait card).
- **Prompt:**

  > 16-bit pixel-art sprite of a football (soccer) player mid-celebration, arms
  > crossed confidently across the chest, calm proud expression. Royal-blue home
  > kit with a white number 10 and red/white trim, white shorts. Full body,
  > front-facing, centred. Chunky retro game pixels, limited palette, crisp hard
  > edges, no anti-aliasing, plain dark background. Arcade sports-game hero pose.

- Iterate until the sprite reads clean at small size. Keep the **job_id** for step 2.

### Step 2 — Animate (`generate_video`, image→video)

- **Model:** `kling3_0_turbo` (fast single-start-frame animation) — or `seedance_2_0` when identity consistency matters.
- **Input:** `medias: [{ role: "start_image", value: "<image job_id>" }]`, `duration: 5`.
- **Prompt:**

  > The player holds the arms-crossed pose, then a subtle proud celebration — a
  > small confident nod and slight bounce — and re-crosses the arms. Camera
  > locked, minimal background motion, retro game feel, seamless loop.

- **Consistency across legends:** train a **Soul** character (`show_characters action='train'`, 5–20 refs) so the same stylised player recurs on-model. Optional for the spike.

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
connected. Point it at this file and run the Phase-0 spike.

- **Mbappé** = `player_id: 121` (FRA, FW, shirt #10) in `public/data/players.json`.
  Key the manifest and the `LiveMatch` goal-scorer check off the **id**, never the
  hard-coded name (house rule).
- The spike clip lands at `public/celebrations/121.webm` + `121.png`.
</content>
