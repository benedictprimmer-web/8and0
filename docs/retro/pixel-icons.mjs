import { writeFileSync } from 'fs';

// 80s neon palette used across the icons
const P = {
  '.': null,               // transparent
  o: '#1c0b33',            // deep outline
  A: '#ff9e00', a: '#ffd447', // amber / hi
  M: '#ff2e88', m: '#ff86bd', // magenta / hi
  C: '#00e5ff', c: '#8af6ff', // cyan / hi
  G: '#2bf59b', g: '#9dffcf', // green / hi
  W: '#f4efff', K: '#160a24', // white / black
  P: '#b14dff', p: '#d9a6ff', // purple / hi
};

// Each icon: a string grid. Rows separated by newlines, one char per pixel.
const ICONS = {
  // ⚽ -> football
  ball: `
..oooo..
.oWWWWo.
oWKWKWWo
oWWKWKWo
oKWWWKWo
oWKWKWWo
.oWWWWo.
..oooo..`,
  // 🔥 -> flame
  flame: `
...A....
..AaA...
..AaaA..
.AaMMaA.
.AMMMMA.
AMMmMMMA
AMmmmMMA
.AMMMMA.
..AMMA..`,
  // 🔗 -> chain (two links)
  link: `
.CCC......
C...C.....
C...C.....
C...C.MMM.
.CCC.M...M
.....M...M
.....M...M
......MMM.`,
  // ⚡ -> lightning bolt
  bolt: `
...aaA..
..aaA...
.aaA....
aaaaaA..
..AaaA..
...aaA..
..aaA...
.aA.....`,
  // 🙈 -> blind (eye with slash)
  blind: `
........P
oooooo.P.
oWWWWoP..
oWKKWPo..
oWKKPWo..
oWWPWWo..
oooPoo...
..P.....`,
  // 🏆 -> trophy
  trophy: `
oaaaaaao
oAaaaaAo
MoAaaAoM
MMoAAoMM
MMoAAoMM
...oAAo.
...oAAo.
..oAAAAo
.oAAAAAAo`,
  // 🎯 -> target
  target: `
..MMMM..
.MWWWWM.
MWCCCCWM
MWCMMCWM
MWCMMCWM
MWCCCCWM
.MWWWWM.
..MMMM..`,
  // ↕ -> higher/lower
  updown: `
...CC...
..CCCC..
.CCCCCC.
CCCCCCCC
...CC...
...MM...
MMMMMMMM
.MMMMMM.
..MMMM..
...MM...`,
  // gear -> settings
  gear: `
..P.P.P.
.PpPpPp.
PpPPPPpP
.PPKKPP.
PpPKKPpP
.PPPPPP.
.PpPpPp.
..P.P.P.`,
  // star -> best / score
  star: `
....a....
....a....
.a.aAa.a.
.aaAAAaa.
aaAAAAAaa
..AAAAA..
.AAA.AAA.
.AA...AA.`,
};

function toSymbol(name, grid) {
  const rows = grid.trim().split('\n');
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = P[row[x]];
      if (col) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${col}"/>`;
    }
  });
  return `<symbol id="px-${name}" viewBox="0 0 ${w} ${h}">${rects}</symbol>`;
}

const sprite =
  `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">` +
  Object.entries(ICONS).map(([n, g]) => toSymbol(n, g)).join('') +
  `</svg>`;

writeFileSync('/tmp/pixel-sprite.html', sprite);
console.log('icons:', Object.keys(ICONS).join(', '));
console.log('sprite bytes:', sprite.length);
