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

## `pixel-icons.mjs`

The reusable generator for the icon set. Icons are authored as ASCII grids with
a shared neon palette and compiled to a crisp SVG `<symbol>` sprite
(`shape-rendering` pixels; use with `image-rendering:pixelated`). Vector, so
they stay sharp at any size and recolour with the theme.

```bash
node docs/retro/pixel-icons.mjs   # writes /tmp/pixel-sprite.html
```

To add or edit an icon, change its grid in the `ICONS` map — one char per pixel,
`.` = transparent, letters map to the `P` palette. Current set: ball, flame,
link, bolt, blind, trophy, target, updown, gear, star.

## Fonts

Press Start 2P and VT323 are both **OFL**-licensed (Google Fonts). In the
mockup they're inlined as woff2 data URIs so there's no web-font flash and the
artifact stays self-contained.
</content>
