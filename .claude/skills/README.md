# Vendored Claude Code skills

Project-local [Agent Skills](https://github.com/topics/claude-code-skills) that
Claude Code auto-loads when a task matches their description. They travel with the
repo, so anyone working on 8and0 gets them without extra setup.

This is a **curated** subset chosen for 8and0's actual needs (a web-based
React/TS football-draft game): game **feel/juice**, **difficulty/balance**, and
**mobile/UI UX**. It is deliberately *not* the full upstream packs — the
Unity/Godot/Unreal and 3D/shader/RPG skills those packs also ship were left out
as irrelevant to a browser game. See
[`../../game-design-skills-report.md`](../../game-design-skills-report.md) for the
full review and the reasoning behind these picks.

## What's here

| Skill | Triggers on… | Use it for in 8and0 |
| ----- | ------------ | ------------------- |
| `game-feel-and-juice/` | "game feel", "juice", "screen shake", "feels floaty", "make it feel good" | The spin reel, score pop-ups, win celebrations (`animateSpin`, `LiveMatch`, `ResultPanel`) |
| `ui-ux-and-feedback/` | "UI", "HUD", "information hierarchy", "cluttered", "accessibility" | PitchXI / SquadPanel / ResultPanel layout, feedback vocabulary |
| `difficulty-and-balancing/` | "balance", "difficulty curve", "overpowered", "too hard/easy", "cost curve" | easy/normal/hard tuning, rating curves, rerolls (pairs with `npm run probe`) |
| `mobile-app-ui-design/` | "mobile UI/UX", "screen design", "make this screen look better" | The "See my team" toggle + mobile draft layout (thumb-zone, 8pt grid, hierarchy) |

Each skill's `SKILL.md` is the entry point; gamestack skills also carry a
`GUIDE.md` (deep reference) and `CHECKLIST.md` (review pass). The mobile skill
carries `INDEX.md` and `references/`.

> ⚠️ These are community skills used as **reasoning scaffolding + review
> checklists**, not authoritative doctrine. Keep a human with taste in the loop
> on feel and balance. The mobile skill is written for native (RN/Flutter/SwiftUI)
> framing — apply its *principles* (thumb zone, touch targets, spacing, hierarchy)
> to our responsive **web** UI; ignore the native-specific bits.

## Provenance & licenses

All vendored verbatim from their sources (unmodified). All MIT-licensed.

| Skill(s) | Source | Ref (pinned) | License |
| -------- | ------ | ------------ | ------- |
| `game-feel-and-juice`, `ui-ux-and-feedback`, `difficulty-and-balancing` | [rondorkerin/gamestack](https://github.com/rondorkerin/gamestack) `plugins/gamestack/skills/` | `0419358` | MIT — see [`vendor-licenses/gamestack-LICENSE.txt`](./vendor-licenses/gamestack-LICENSE.txt) |
| `mobile-app-ui-design` | [ceorkm/mobile-app-ui-design](https://github.com/ceorkm/mobile-app-ui-design) | `4c67a0e` | MIT (declared in its README; "feel free to use this skill in your projects") |

To update a skill, re-pull from its source at a newer ref and replace the folder,
keeping this table's ref column current.
