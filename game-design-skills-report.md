# Claude Game-Design Skills — Deep Review

_A survey of the best open-source Claude Code "skills" for game design on
GitHub, evaluated for usefulness on **8and0** (a browser-based React + TypeScript
World Cup draft game)._

**Compiled:** 2026-07-06 · **Scope:** public GitHub repos, sorted and
cross-checked for relevance to a small, web-first, single-developer game.

---

## TL;DR — what to actually install

8and0 is a **web (React/TS/Canvas-free) game made by a small team**, not a
Unity/Godot/Unreal title. That single fact reorders the whole field: the giant
"studio-in-a-box" packs are impressive but mostly wasted on us, while the
**engine-agnostic design-craft** skills map almost one-to-one onto our stated
focus areas (spin *feel* / "juice", difficulty tuning, mobile UX, onboarding).

| Rank | Skill pack | Why it fits 8and0 | Fit |
| ---- | ---------- | ----------------- | --- |
| 🥇 1 | **rondorkerin/gamestack** | Pure engine-agnostic design *knowledge*: `game-feel-and-juice`, `difficulty-and-balancing`, `ui-ux-and-feedback`, `onboarding-and-teaching`, `pacing-and-the-player-journey`. Exactly our current focus areas. | **High** |
| 🥈 2 | **fagemx/gstack-game** | 27-skill production *workflow* with review gates: `/feel-pass`, `/balance-review`, `/player-experience`, `/game-ux-review`, `/game-qa`, `/playtest`. Tuned for indie + mobile/casual. | **High** |
| 🥉 3 | **baxatron-git/claude-game-design-suite** | 22 medium-agnostic skills for vision → GDD → economy/progression → balance. Good for *documenting* and structuring 8and0's design intent. | **Med-High** |
| 4 | **HermeticOrmus/claude-code-game-development** | The only web/JS-native option (Canvas/WebGL/Phaser/Three). Patterns & prompts, not SKILL.md skills — best as an *implementation* reference. | **Medium** |
| 5 | **Donchitos/Claude-Code-Game-Studios** | Massive (49 agents / 72 skills, 22.7k★) but Godot/Unity/Unreal-first. Overkill for a solo web game; harvest only the design/QA subset. | **Low-Med** |
| — | Glade-tool/glade-mcp, fenixnix/Godot-Skills, IdoCohen560/claude-unity-game-studio | Engine-bound (Unity/Godot MCP + GDScript). Not applicable to a browser game. | **N/A** |

**Recommendation:** start with **gamestack** (design craft) + a handful of
**gstack-game** review commands (`/feel-pass`, `/balance-review`, `/playtest`),
and for the **mobile** work add **ceorkm/mobile-app-ui-design** — it targets our
exact React + Tailwind + Lucide stack (see the [Mobile experience](#mobile-experience)
section). That covers 8and0's real needs without importing a 70-skill studio hierarchy.

---

## How to read "skills" here

A Claude Code **Skill** is a `SKILL.md` file (plus optional reference docs and
scripts) that Claude auto-loads when a task matches its description — the open
"[Agent Skills / SKILL.md](https://github.com/topics/claude-code-skills)"
standard now shared by Claude Code, Cursor, Codex, Gemini CLI, and others.
Install is almost always one of:

- **Global:** copy the skill folder into `~/.claude/skills/`
- **Project:** copy into `.claude/skills/` in the repo (travels with the code)
- **Plugin/marketplace:** `/plugin install <name>` where the pack ships one

All packs below are **MIT-licensed** unless noted, so vendoring individual
`SKILL.md` files into 8and0's own `.claude/skills/` is allowed.

---

## The field (verified GitHub data)

Star counts and dates verified via the GitHub API on 2026-07-06.

### Discovery aggregators (where these skills are catalogued)

| Repo | Stars | Note |
| ---- | ----: | ---- |
| [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | ~67k | Broadest curated skill index |
| [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | ~49k | Hand-picked CC resources incl. skills |
| [sickn33/antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills) | ~42k | 1,800+ installable skills w/ CLI |
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | ~27k | 1,000+ skills, multi-agent |
| [bergside/awesome-design-skills](https://github.com/bergside/awesome-design-skills) | ~1.6k | 67 DESIGN.md/SKILL.md **design** files |

Use these to find *new* skills over time, but they're broad — the game-design
signal is thin. The packs below are the targeted picks.

---

## Deep dives

### 🥇 1. rondorkerin/gamestack — _design knowledge, engine-agnostic_

> "The game-design process for Claude — knowledge + workflow skills … tuned for
> headless, procedural, AI-authored development." · ~19★ · MIT · created Jun 2026

**Shape.** ~24 engine-agnostic skills split into *process* (orchestration),
*universal craft*, *technical craft*, *genre lenses*, and *technique modules*,
plus separate engine "packs" (Godot/Unreal/Unity) you can ignore.

**Why it's #1 for 8and0.** Its "universal craft" skills are a direct hit on our
[README's stated focus](./README.md#active-work--boundaries) (spin feel, "juice",
score pop-ups, mobile "see my team"):

- `game-feel-and-juice` — moment-to-moment feel, input latency, animation
  principles → the **spin reel, score pops, win celebrations**.
- `difficulty-and-balancing` — dominance checks, cost curves, dynamic difficulty,
  accessibility assists → our **easy/normal/hard** + blind-ratings tuning.
- `ui-ux-and-feedback` — diegetic vs non-diegetic, info hierarchy, HUD specs →
  the **PitchXI / SquadPanel / ResultPanel** layouts and mobile toggle.
- `onboarding-and-teaching` — progressive disclosure, teaching order → the
  first-run **draft tutorial**.
- `pacing-and-the-player-journey` — interest curves, engagement loops → the
  **spin → pick → simulate** core loop and end-of-run payoff.

Also relevant: `procgen-review` / `procedural-generation` (self-review of
generated content) — indirectly useful because 8and0's simulation is
*seed-driven procedural output* we want to feel fair and varied.

**Watch-outs.** Early-stage (mostly v0.1); two skills (`narrative-and-quest-design`,
`ai-authored-content-coherence`) are flagged for re-verification; low star count =
less battle-testing. Treat as strong *scaffolding for Claude's reasoning*, not
authoritative dogma.

---

### 🥈 2. fagemx/gstack-game — _production workflow with review gates_

> "Complete game production workflow for Claude Code — 27 skills from concept to
> shipped build." · ~48★ · MIT · v0.5.0 · updated Jul 2026

**Shape.** ~27–29 slash-command skills following
Spark → Think → Plan → Review → Slice → Build → Feel → Test → Ship. Explicitly
**platform-agnostic** and **indie/small-team (1–5 people)**, with mobile/casual
economy + player-psychology support. Installed by pasting a bootstrap command
that clones + builds skill docs into `~/.claude/skills/`; needs Bun.

**Why it fits 8and0.** Where gamestack gives *knowledge*, gstack-game gives
*process discipline* — review passes we can run against a diff or a feature:

- `/feel-pass` — polish/juice review → run it on the spin animation & score pops.
- `/balance-review` — dominant-strategy / economy check → run against
  `src/game8/ratings.ts` + `simulate.ts`.
- `/player-experience` + `/game-ux-review` — emotional arc + interaction review →
  the mobile "see my team" work.
- `/game-qa` + `/build-playability-review` + `/playtest` — structured QA/fix loop.
- `/prototype-slice-plan` + `/implementation-handoff` — scope a vertical slice
  before building.

**Watch-outs.** Self-reported "domain judgment completeness" of **35–80%** across
skills; author explicitly says the *engineering backbone* is solid but *game-
industry judgment* needs a human with taste. Requires Bun + a clone step (heavier
setup than copying a folder). Best used as **on-demand review commands**, not an
always-on framework.

---

### 🥉 3. baxatron-git/claude-game-design-suite — _vision → GDD → systems_

> "22-skill game design framework … Full lifecycle coverage — vision to delivery.
> Medium-agnostic." · ~9★ · MIT · v1.0.0 (Feb 2026)

**Shape.** 22 tiered skills: Vision Architect, Design Pillars, Player Experience
Modeler, Core Loop Designer, **Economy & Progression Designer**, **Game Balance
Analyst**, UI/UX Systems Designer, **GDD Author**, Scope & Feature Prioritizer,
Technical Design Bridge, etc. Explicitly works for digital **and** tabletop/hybrid.
Ships recommended starter sets (4 skills for a game jam → all 22 for big teams).

**Why it fits 8and0.** 8and0 has rich design intent scattered across `README.md`,
`HANDOFF.md`, and `ideas.md` but **no formal GDD**. This suite is the best tool
for *capturing and pressure-testing* that intent:

- `Core Loop Designer` + `Systems Interaction Mapper` → formalize spin→pick→sim.
- `Economy & Progression Designer` + `Game Balance Analyst` → reason about
  rerolls, difficulty, rating curves (pairs with our `npm run probe` harness).
- `GDD Author` + `Scope & Feature Prioritizer` (MoSCoW) → turn `ideas.md` into a
  prioritized backlog.

**Watch-outs.** Documentation-heavy — it produces *designs and docs*, not code or
runtime checks. Low stars; single v1.0.0 release. Best used **once** to establish
structure, then kept as a reference rather than run continuously.

---

### 4. HermeticOrmus/claude-code-game-development — _the web/JS-native one_

> "Game development patterns and workflows for Claude Code." · ~43★ · MIT · active

**Shape.** Not a SKILL.md pack — it's **50k+ words of docs, 10+ working example
games, and 100+ tested prompts**, all in **JavaScript/TypeScript** targeting
HTML5 Canvas, WebGL, Three.js, PixiJS, Phaser 3, WebSockets, Matter.js.

**Why it matters for 8and0.** It's the **only** resource here that speaks our
actual runtime. Its patterns — game loop, state machines, event-driven design,
WebSocket multiplayer, mobile optimization, deployment (GitHub Pages/Netlify/PWA)
— map cleanly onto a React/Vite/Vercel game. Use it as an **implementation
reference** and mine its prompts, or wrap the parts we like into our own
`.claude/skills/` entries.

**Watch-outs.** It's a knowledge base, not drop-in skills — you convert it into
skills yourself. Coverage is generic web-game (Pong→multiplayer shooter), so
there's nothing football/draft-specific.

---

### 5. Donchitos/Claude-Code-Game-Studios — _the 800-lb studio_

> "Turn Claude Code into a full game dev studio — 49 AI agents, 72 workflow
> skills." · **22,668★** (verified) · MIT · v1.0.0 (May 2026)

**Shape.** A full studio hierarchy — directors → department leads → specialists —
with 41 doc templates and 12 validation hooks. Design-relevant skills include
`/brainstorm`, `/map-systems`, `/design-system`, `/create-epics`,
`/create-stories`, `/design-review`.

**Verdict for 8and0.** By far the most popular, but built around **Godot 4 / Unity
/ Unreal 5** engine specialists and a multi-department team fiction that a
**single-developer web game does not need**. Importing all 72 skills would add
noise and pull Claude toward engine assumptions that don't apply. **Harvest, don't
adopt:** the engine-neutral `/design-review`, `/brainstorm`, and `/map-systems`
skills are worth reading, the rest isn't.

_(Note: there are several low-star forks/clones of this repo — the Donchitos
original is the canonical, actively maintained one.)_

---

## Notable also-rans

| Repo | Stars | One-liner | Verdict for 8and0 |
| ---- | ----: | --------- | ----------------- |
| [Glade-tool/glade-mcp](https://github.com/Glade-tool/glade-mcp) | ~175 | MCP bridge → Unity/Godot, 235+ tools | Engine-bound; N/A for web |
| [SkyrimTB/Aurigida](https://github.com/SkyrimTB/Aurigida) | ~9 | AAA narrative-director skill | 8and0 has ~no narrative |
| [jasonxu610/game-design-skills](https://github.com/jasonxu610/game-design-skills) | ~6 | Design knowledge extracted from books | Useful raw theory; sparse |
| [fenixnix/Godot-Skills](https://github.com/fenixnix/Godot-Skills) | ~5 | GDScript/Godot codegen skills | Engine-bound; N/A |
| [Elkhiffa/skill-ux-advisor](https://github.com/Elkhiffa/skill-ux-advisor) | ~2 | Game-interaction UX sparring partner | Small but on-theme for our UX work |
| [DesignPlayLabs/game-design](https://github.com/DesignPlayLabs/game-design) | ~1 | Tabletop game simulator builder | Tangential |

---

## Mobile experience

Mobile is a first-class concern for 8and0 — the README's active work calls out a
**"See my team" toggle so the drafted XI is reachable on mobile without
scrolling**, and the whole spin/pick loop needs to feel good under a thumb. One
distinction reorders the mobile field the same way "web vs engine" reordered the
main list:

> **8and0 is mobile _web_, not a native app.** It's React + Tailwind + Vite served
> as a responsive site (with PWA potential), *not* iOS/Android/React Native. So
> **thumb-zone, touch-target, and responsive-breakpoint** guidance is gold, while
> iOS Human Interface Guidelines / React Native / native-navigation skills are
> largely wasted.

### 🥇 The mobile pick: ceorkm/mobile-app-ui-design

> "Professional mobile app UI/UX design skill for Claude Code." · **130★** · MIT ·
> updated Jul 2026

This is the standout because it **targets 8and0's exact stack** — its
implementation guidance is written for **React, Tailwind CSS, Lucide React icons,
and CSS transitions** (compare our [tech stack](./README.md#tech-stack)). The
principles land directly on our open mobile work:

- **Thumb zone** — primary actions in the bottom third → where the **spin button,
  pick confirmation, and "See my team" toggle** should live for one-handed play.
- **8-point grid** — consistent spacing → tightens the **PitchXI / SquadPanel**
  layout on small screens.
- **60/30/10 colour rule** + **typography hierarchy (≤4 sizes / 2 weights)** →
  keeps the draft UI legible on a phone without fighting our `gold-*`/`surface-*`
  Tailwind tokens.
- **Peak-end rule** — memorable finish → reinforces the **win celebration /
  ResultPanel** payoff.

Install: `npx skills add ceorkm/mobile-app-ui-design`, or copy into
`~/.claude/skills/mobile-app-ui-design/`. MIT, so we can vendor it into the repo's
`.claude/skills/` too.

### Supporting mobile skills

| Repo | Stars | What it adds | Fit for 8and0 |
| ---- | ----: | ------------ | ------------- |
| [wonjyou/design-audit](https://github.com/wonjyou/design-audit) | ~4 | Context-aware UI/UX **audit** — adapts criteria to *mobile app / web app / marketing site*, cites standards, severity-scores findings | **High** as a review pass — point it at the mobile draft screen |
| [awesome-skills/mobile-app-design](https://github.com/awesome-skills/mobile-app-design) | ~48 | iOS/Android + **WCAG 2.1 AA accessibility** + React Native conventions | **Partial** — mine the accessibility + touch-target parts, skip native/RN |
| gamestack `ui-ux-and-feedback` *(from #1 above)* | — | Info hierarchy, HUD specs, diegetic vs non-diegetic feedback | **High** — game-aware, engine-agnostic; pairs with thumb-zone rules |
| gstack-game `/game-ux-review` *(from #2 above)* | — | On-demand UX review command | **High** — run it against the "See my team" change |
| [anthropics/claude-code · frontend-design](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md) | official | Baseline quality floor: "responsive down to mobile, visible keyboard focus, reduced motion respected" | **Low-Med** — good hygiene defaults, but marketing-site oriented, not game UX |

### Also noted (skip for 8and0)

`ChrisPiz/apple-app-ui-design` (iOS HIG), `almazjanat/native-mobile-ui`,
`draftbit/mobile-taste-skill` (React Native/Expo), `NguyenKhacPhuc/mobile-app-design-pro`
— all **native-app** oriented. Wrong runtime for a responsive web game.

### Mobile-specific caveat

None of these skills *test* mobile — they reason about it from a checklist. Real
device testing still matters: 8and0's simulation and animation (`animateSpin`,
`LiveMatch`) should be profiled on a mid-range phone, and touch targets verified
at real DPI. Treat the skills as **review scaffolding + a design vocabulary**, then
confirm on hardware.

---

## Recommended setup for 8and0

A minimal, web-appropriate loadout — no 70-skill studio required:

1. **Vendor into `.claude/skills/` (project-local, travels with the repo):**
   - From **gamestack**: `game-feel-and-juice`, `difficulty-and-balancing`,
     `ui-ux-and-feedback`, `onboarding-and-teaching`, `pacing-and-the-player-journey`.
   - From **gstack-game**: `/feel-pass`, `/balance-review`, `/playtest` as
     on-demand review commands.
   - For **mobile**: **ceorkm/mobile-app-ui-design** (stack-matched thumb-zone /
     grid / hierarchy rules) + **wonjyou/design-audit** as a mobile-web review pass.
2. **Keep as references (don't install):**
   - **claude-game-design-suite** → run its `GDD Author` + `Core Loop Designer`
     **once** to turn `ideas.md`/`README.md` into a proper GDD, then archive.
   - **HermeticOrmus** → web/JS implementation patterns when we touch the engine.
3. **Skip:** the Unity/Godot/Unreal packs (Studios, glade-mcp, Godot-Skills) —
   wrong runtime for a React/Vite/Vercel game.

**Why this shape:** 8and0's near-term work is *feel, difficulty, and mobile UX*
polish on an existing, shipped web game — exactly the surface the engine-agnostic
**design-craft** skills cover, and exactly the surface the big engine-oriented
studio packs *don't*.

> ⚠️ **A caveat worth stating plainly.** Every pack here is community-made, mostly
> low-star, and several openly flag that their "game-industry domain judgment"
> is only partially complete. They're valuable as **structured scaffolding for
> Claude's reasoning** and as review checklists — not as authoritative game-design
> doctrine. Keep a human with taste in the loop, especially on balance and feel.

---

## Sources

- [firecrawl.dev — Best Claude Code Skills to Try in 2026](https://www.firecrawl.dev/blog/best-claude-code-skills)
- [rondorkerin/gamestack](https://github.com/rondorkerin/gamestack)
- [fagemx/gstack-game](https://github.com/fagemx/gstack-game)
- [baxatron-git/claude-game-design-suite](https://github.com/baxatron-git/claude-game-design-suite)
- [HermeticOrmus/claude-code-game-development](https://github.com/HermeticOrmus/claude-code-game-development)
- [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios)
- [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) ·
  [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) ·
  [bergside/awesome-design-skills](https://github.com/bergside/awesome-design-skills)
- [Claude Code `claude-code-skills` topic](https://github.com/topics/claude-code-skills)
- **Mobile:** [ceorkm/mobile-app-ui-design](https://github.com/ceorkm/mobile-app-ui-design) ·
  [awesome-skills/mobile-app-design](https://github.com/awesome-skills/mobile-app-design) ·
  [wonjyou/design-audit](https://github.com/wonjyou/design-audit) ·
  [anthropics/claude-code frontend-design skill](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md)
