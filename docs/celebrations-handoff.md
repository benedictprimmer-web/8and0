# Pixel Celebrations — Handoff & Runbook

Full-screen pixel-art celebration clips that play when a legend is **drafted**
or **scores** in a live match. Shipped to `main` in PR #66 (commit `2c4d45d`).
Currently one player: **Kylian Mbappé (`player_id 121`)**.

---

## TL;DR for adding more players

**Adding a player is data-only — NO code changes.** The system is manifest-driven
and keyed by `player_id`. To add player `<ID>` you produce two files and one JSON line:

- `public/celebrations/<ID>.webm`   (looping clip, vp9, < 300 KB)
- `public/celebrations/<ID>.png`    (poster / reduced-motion still)
- an entry in `public/celebrations/celebrations.json`

The draft-pick handler and the goal handler already look up **any** `player_id`
against the manifest and no-op if there's no entry. Drop the files in and it works.

---

## How it works (architecture)

| Piece | File | Role |
|-------|------|------|
| Overlay | `src/components/CelebrationClip.tsx` | Full-screen dark scrim + looping `<video>` + caption. Loads the manifest, renders nothing if the `playerId` has no entry. `prefers-reduced-motion` → static poster. `pointer-events-none` (never blocks the game). |
| Manifest | `public/celebrations/celebrations.json` | `{ "<player_id>": { name, webm, poster } }`. |
| Assets | `public/celebrations/<id>.webm` + `.png` | The clip and its poster. |
| Draft trigger | `src/pages/EightZeroGame.tsx` → `commitPick()` | On every pick, `setClipCeleb({ playerId, label: "STAR PLAYER", key })`. Only shows if the id has a clip. |
| Goal trigger | `src/components/LiveMatch.tsx` → `onCelebrate` prop | On a user goal, resolves the scorer's `player_id` via the `scorerIds` prop (name→id from `run.picks`) and calls `onCelebrate(playerId, scorerName)`. `EightZeroGame` sets the same `clipCeleb` state. |
| Single overlay | `EightZeroGame` root, next to the confetti `<Celebration>` | `{clipCeleb && <CelebrationClip .../>}`, auto-dismiss after 2.8 s. |

Captions: **"STAR PLAYER"** on draft, the **scorer's name** on a goal.

The sprite art sits on an opaque light background, so it's framed as a rounded
card over the dark scrim — the scrim is identical in light and dark mode, so
theming can't break it.

---

## Runbook — produce a clip for a new player

Needs the **Higgsfield MCP** (image/video gen) and **ffmpeg** (`brew install ffmpeg`).
Cost ≈ **7 credits/player** (2 keyframes + 5 video). Work in a **git worktree**, not
the shared checkout (see Gotchas).

### 1. Two keyframes — `generate_image`, model `nano_banana_pro`, `aspect_ratio: "3:4"`, `resolution: "1k"`
Make the **same** pixel player in two poses so a video can tween between them.
Generate pose A, then generate pose B passing A as a reference (`medias: [{ value: <jobId>, role: "image" }]`) so the character stays consistent.
- Pose A `run`: "16-bit pixel-art sprite of a football player sprinting joyfully away from a goal, dynamic mid-stride, arm pumping, elated open-mouth. Full body, side-on, centred. Chunky retro pixels, hard edges, no anti-aliasing, plain white background."
- Pose B `cross` (or the player's signature pose): "…the SAME player… arms crossed confidently, calm proud expression. Full body, front-facing, centred. …plain white background."
- **Review the stills before spending on video.** `job_display <jobId>` renders them.

### 2. Video — `generate_video`, model `seedance_2_0_mini`
**Preflight cost first** with `get_cost: true`. Use these params (480p = 5 cr; 720p = 12.5 — always set 480p):
```
{ model: "seedance_2_0_mini", duration: 5, resolution: "480p", aspect_ratio: "3:4",
  generate_audio: false,
  medias: [ { value: "<runJobId>",  role: "start_image" },
            { value: "<crossJobId>", role: "end_image" } ],
  prompt: "Pixel-art footballer runs in from a goal, leaps and lands into a proud arms-crossed pose, slight bounce, camera locked, minimal background, seamless loop." }
```
Poll `job_display <id>` until `status: "completed"`; download `results.rawUrl` (mp4).

### 3. Re-pixelate + loop with ffmpeg
The AI video is smooth and pans the subject in/out of frame. Two goals: make it
**chunky pixel** and keep the subject **always in-frame** so the card is never empty.
```bash
# a) sample frames to find the always-in-frame window [T0..T1]
#    (the "landed hero pose" segment — subject fills the frame)
for t in 2.0 2.5 3.0 3.5 4.0 4.5 5.0; do
  ffmpeg -y -ss $t -i raw.mp4 -vframes 1 -vf "scale=140:-1:flags=neighbor" f_$t.png
done   # eyeball f_*.png; pick T0/T1 where the subject is centred & whole

# b) boomerang loop, nearest-neighbour re-pixelate (120px grid → 300px), 12 fps, vp9
ffmpeg -y -ss <T0> -to <T1> -i raw.mp4 -filter_complex \
 "[0:v]fps=12,scale=120:-1:flags=neighbor,scale=300:-1:flags=neighbor,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[out]" \
 -map "[out]" -c:v libvpx-vp9 -crf 46 -b:v 0 -pix_fmt yuv420p -an <ID>.webm
#    check size < 300 KB:  stat -f%z <ID>.webm   (raise -crf to shrink)

# c) poster (a strong in-frame hero frame, same pixelation)
ffmpeg -y -ss <TPOSTER> -i raw.mp4 -vframes 1 \
 -vf "scale=120:-1:flags=neighbor,scale=300:-1:flags=neighbor" <ID>.png
```
Reference numbers from Mbappé (121): window `2.2–4.5s`, poster at `4.0s`, result **67 KB**.

### 4. Install into the repo
```bash
cp <ID>.webm <ID>.png <repo>/public/celebrations/
```
Add to `public/celebrations/celebrations.json`:
```json
"<ID>": { "name": "<Player Name>", "webm": "/celebrations/<ID>.webm", "poster": "/celebrations/<ID>.png" }
```
`<ID>` and `<Player Name>` must match the player's `player_id` and `name` in
`public/data/players.json` (the goal trigger matches on `player.name`).

### 5. Verify
```bash
npm run lint && npm test && npm run build      # all green
npm run dev                                     # then DRAFT the player → "STAR PLAYER" fires instantly
```

---

## Gotchas / lessons

- **Work in a git worktree**, never edit the shared `~/8and0` checkout while another
  session might be on it. This work collided once: a concurrent session ran `git commit -a`
  on a different branch and swept up uncommitted celebration files. Fix:
  `git worktree add ~/8and0-<feature> <branch>` gives an isolated checkout that can't collide.
- **480p, not 720p** on `seedance_2_0_mini` (5 vs 12.5 credits). Always `get_cost: true` first.
- The **in-frame trim window is per-clip** — always sample frames; don't reuse Mbappé's `2.2–4.5s`.
- Keep the webm **< 300 KB** (raise `-crf`); it ships in the app bundle's public dir.
- Reuse a prior keyframe as an `image` reference to keep the art style consistent across players.

---

## Open decisions (not yet done)

- Which players get clips next.
- Sound (currently silent — `generate_audio: false`).
- Goal caption wording (currently the scorer's name; could be "GOAL!").
- Transparent sprites (would need regenerating keyframes on a green screen to chroma-key;
  skipped to save credits — the framed-card-on-scrim look was accepted instead).

---

## Full self-contained prompt (paste into a fresh session)

Fill in the two bracketed values and paste. It assumes the Higgsfield MCP is connected.

> Add a pixel goal/draft celebration for **[PLAYER NAME]** (`player_id [ID]`) to the 8and0
> game at `~/8and0`. The system already exists on `main` and is **data-only** — read
> `docs/celebrations-handoff.md` first, then follow its runbook. Do NOT touch `game8/` sim,
> the seed, `PenaltyShootout.tsx`, or any component logic — this is purely adding assets +
> one manifest line.
>
> 1. Work in an **isolated git worktree**, not the shared checkout:
>    `git worktree add ~/8and0-celeb-[ID] -b feat/celebration-[ID] main`. Do everything there.
> 2. **Keyframes** (`generate_image`, `nano_banana_pro`, `3:4`, `1k`, ~2 cr): a `run` pose and
>    the player's signature celebration pose, SAME pixel character (pass one as an `image`
>    reference on the other). Match the existing style — chunky 16-bit pixels, hard edges,
>    plain white background, full body. **Show me the stills before generating video.**
> 3. **Video** (`generate_video`, `seedance_2_0_mini`): preflight `get_cost: true` first, then
>    `start_image`=run, `end_image`=signature, `duration: 5`, `resolution: "480p"`,
>    `generate_audio: false`. Prompt describes running in from a goal and landing into the
>    signature pose, camera locked, seamless loop. **Show me before spending more.**
> 4. **ffmpeg** (see the runbook): sample frames to find the always-in-frame window, boomerang
>    that segment, nearest-neighbour re-pixelate (120→300px), 12 fps, vp9 webm **< 300 KB**,
>    plus a poster PNG. Save as `public/celebrations/[ID].webm` and `[ID].png`.
> 5. Add the manifest line to `public/celebrations/celebrations.json` keyed by `[ID]`, with the
>    player's exact `name` from `public/data/players.json`.
> 6. Verify: `npm run lint && npm test && npm run build` all green, then `npm run dev` and DRAFT
>    the player to see the full-screen "STAR PLAYER" takeover fire. Check light + dark + reduced
>    motion. Open a PR against `main`; **don't merge — show me first.**
>
> Budget ~7 credits. If unsure which model params to use, they're all in the handoff runbook.
