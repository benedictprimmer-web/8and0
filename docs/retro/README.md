# 8-0 // ARCADE EDITION — retro concept

An 80s synthwave / arcade-cabinet skin for **page 1** (the `SetupScreen`).
Same screen, same flow — re-dressed as a 1986 arcade cabinet: outrun sunset,
neon grid horizon, hand-drawn pixel-art icons in place of the emoji, an 8-bit
type system (Press Start 2P + VT323), and a CRT over the glass.

This is a **concept exploration**, not shipped code — no product code was
changed. The full interactive mockup (before/after phone frames, palette, icon
gallery, type specimens, FX ideas, and how the earlier UX findings still hold)
lives in the published artifact.

## The direction at a glance

| Layer | Now | Arcade |
| ----- | --- | ------ |
| Palette | Trophy gold on navy/white | Outrun **sunset** (amber→magenta) on deep grape, cyber-cyan + laser-green highlights |
| Accent discipline | Gold does 3 jobs | Sunset fill + glow reserved for **START** only; selection = neon outline-glow |
| Icons | OS emoji (🔥🔗⚡…) | One consistent **pixel-art** set at 16×16 |
| Type | Inter + serif | **Press Start 2P** (display/labels) + **VT323** (body/data) |
| State | Grey "ON/OFF" text | **Laser-green** ON pill + the icon; dim outline OFF |
| Feel | Flat | CRT scanlines, neon pulse on the CTA, arcade "slot snap", attract mode — all gated on `prefers-reduced-motion` |

It is intentionally **single-theme** (a neon arcade cabinet is one committed
visual world). Accessibility watch-items: neon-on-grape must clear 4.5:1 for
body text, the magenta/green pairing needs the shape backup the pixel icons
already provide, and every CRT/pulse effect must die under reduced-motion.

## Scope options

1. **Full re-skin** — the whole cabinet treatment shown in the mockup.
2. **Retro accent** — keep the current layout, adopt just the pixel icons +
   the sunset CTA. Much smaller change; most of the personality, little risk.

## Boutique cut (sleeker follow-up)

A refined, less-neon take on the same idea: **brass + teal** instead of the
arcade sunset (pink retired), a **redrawn monochrome icon set**, and
**Silkscreen + Sora** instead of Press Start 2P — presented as two grounds,
**Midnight Brass** (dark) and **Cream Console** (warm light). Also a concept
artifact; no product code changed.

## Icon generators

Two reusable generators. Both author icons as ASCII grids and compile them to a
crisp SVG `<symbol>` sprite (use with `image-rendering:pixelated`); vector, so
they stay sharp at any size and recolour with the theme.

- **`pixel-icons.mjs`** — the original **neon/duotone** set (per-icon colours).
  Writes `/tmp/pixel-sprite.html`. Set: ball, flame, link, bolt, blind, trophy,
  target, updown, gear, star.
- **`pixel-icons-mono.mjs`** — the **monochrome** set used in the boutique cut:
  one weight, `fill="currentColor"`, recolourable (brass at rest, teal when
  live). Writes `/tmp/sprite2.html`. Set: flame, link, bolt, eyeoff, trophy,
  target, swap, ball, gear, star. **Prefer this one** — it's the higher-fidelity,
  cohesive set.

```bash
node docs/retro/pixel-icons-mono.mjs   # writes /tmp/sprite2.html
```

To add or edit an icon, change its grid in the `ICONS` map — one char per pixel,
`.` = transparent, `#` = filled (mono) or a palette letter (neon set).

## Fonts

Press Start 2P and VT323 are both **OFL**-licensed (Google Fonts). In the
mockup they're inlined as woff2 data URIs so there's no web-font flash and the
artifact stays self-contained.
</content>
