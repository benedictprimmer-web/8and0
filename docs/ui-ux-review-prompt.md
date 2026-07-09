# Prompt — Full UI/UX Review of a Screen

A reusable prompt for running a grounded UI/UX review of any screen in **8and0**,
bringing in the vendored design skills. Copy the block below, fill in the
`{TARGET}`, and paste it into a new session (or run `/design-review {TARGET}`,
which automates most of this).

> This is scaffolding, not doctrine — a human keeps taste authority on feel and
> colour. Prefer several small, individually-acceptable suggestions over one big
> rewrite. House rules in `README.md` and `.claude/skills/design-review/SKILL.md`
> still apply.

---

## The prompt

```
Do a full UI and UX review of {TARGET} in 8and0, then deliver phone mockups.

GROUND IT IN REALITY FIRST — do not review from memory:
1. Read the actual component in src/pages/EightZeroGame.tsx (and any children),
   plus the colour/type system in src/index.css + tailwind.config.js.
2. Run the app (npm install && npm run dev) and screenshot {TARGET} on a real
   phone viewport (390×844, deviceScaleFactor 3) with playwright-core driving
   the pre-installed chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome.
   Capture BOTH themes (colorScheme: 'light' AND 'dark') — the app follows
   prefers-color-scheme, so most users won't see the dark theme it was designed for.

BRING IN THE RELEVANT SKILLS as review lenses (cite the specific principle +
file:line for every finding):
- ui-ux-and-feedback  → information hierarchy, feedback vocabulary, state-by-colour,
  contrast/accessibility, menu flow, touch targets (CHECKLIST.md sections B–E).
- mobile-app-ui-design → 60/30/10 colour rule, "hierarchy with size/weight/opacity
  not just bold", one accent used sparingly, thumb-zone CTA, 8-pt spacing, Peak-End.
- game-feel-and-juice  → responsiveness, selection/press feedback, reduced-motion.
- difficulty-and-balancing → only if the screen exposes difficulty/rating choices.

ORGANISE the findings under three headings the reviewer asked for:
- COLOURS   (accent overuse, theme, contrast, semantic colour, brand)
- TEXT      (typographic hierarchy, weight, copy, truncation, all-caps)
- PHONE     (scroll length, information architecture, touch, thumb reach)
Each finding: severity (High/Med/Low) · what · why (skill principle) · where (file:line).

DELIVER, in this order:
1. A ranked findings table, flagged `safe` (apply now) vs `ask` (needs a call).
2. A visual phone mockup as an HTML Artifact: the current screen (embed the real
   screenshot) beside a redesigned "proposed" screen built in real CSS, plus a
   proposed colour palette (swatches + roles + hex) and a type scale. Theme-aware.
3. A short written summary: top 3 changes, what you'd apply vs defer.

Do NOT edit product code in this pass unless I say so — this is review + mockup.
Keep the sim path deterministic and PenaltyShootout.tsx off-limits (see README).
```

---

## Why these skills

The four lenses live in `.claude/skills/` (provenance in
`.claude/skills/README.md`). They are engine-agnostic *design craft*, which maps
cleanly onto a web game — see `game-design-skills-report.md` for the full survey
of why this set was chosen over the heavier Unity/Godot packs.

## Notes for the reviewer

- **Screenshot harness** is throwaway — put it in the scratchpad dir, drive
  chromium with `playwright-core` (not a project dep). Binary path:
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, launch with `--no-sandbox`.
- **"Page 1"** = the `SetupScreen` component (`src/pages/EightZeroGame.tsx`), the
  first screen a player sees: title, Formation, Difficulty, Game modes, leaderboard
  peek, stat row, and the fixed "Start draft" CTA.
- The `/design-review` skill already runs the panel → apply → sub-agent-verify
  loop; this prompt is the "just review + mock it up, don't touch code yet" variant.
</content>
</invoke>
