/* eslint-disable @typescript-eslint/no-require-imports -- Node-only artwork renderer. */
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');
const { asset, centeredText } = require('./build-og.cjs');

const output = path.resolve(__dirname, '../public/og/variations');
const tiles = [
  { x: 690, y: -8, cat: 'shopping-bag' },
  { x: 906, y: -8, icon: 'HeartIcon' },
  { x: 690, y: 208, icon: 'SparkleIcon' },
  { x: 906, y: 208, cat: 'open-box' },
  { x: 690, y: 424, cat: 'laptop-shopping' },
  { x: 906, y: 424, cat: 'stacked-boxes' },
];

function tile({ x, y, cat, icon }) {
  const artwork = cat
    ? asset(cat, cat, x + 27, y + 27, 146, 146)
    : (() => {
      const Component = require(`../src/icons/${icon}.tsx`)[icon];
      const svg = renderToStaticMarkup(React.createElement(Component, {
        width: 88, height: 88, color: '#655cf6', strokeWidth: 1.5,
      })).replaceAll('currentColor', '#655cf6');
      return `<g id="${icon}" transform="translate(${x + 56} ${y + 56})">${svg}</g>`;
    })();
  return `<g>
    <rect x="${x}" y="${y}" width="200" height="200" rx="26" fill="white" stroke="#e5e3f7" stroke-width="1.5"/>
    ${artwork}
  </g>`;
}

async function main() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <title>Icon Space — the little icon collection</title>
  <desc>Premium animated icons, with original purple cat illustrations and heart and sparkle icons on a tilted white specimen sheet.</desc>
  <rect width="1200" height="630" fill="#ffffff"/>
  <path d="M690 0H1200V630H579Z" fill="#f1f0ff"/>
  <g id="Icon sheet" transform="rotate(-10 900 308)">
    ${tiles.map(tile).join('\n')}
  </g>
  ${asset('wordmark', 'Brand', 64, 222, 500)}
  <g transform="translate(-286 0)">
    ${centeredText('Premium animated icons', 32, 351, '#292733', 'Description')}
    ${centeredText('iconspace.dev', 18, 555, '#777383', 'URL')}
  </g>
  </svg>`;
  fs.mkdirSync(output, { recursive: true });
  const base = path.join(output, 'icon-sheet');
  const png = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
  const jpeg = await sharp(png).resize(1200, 630)
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
  if (jpeg.length >= 1000000) throw new Error('JPEG exceeds 1 MB');
  fs.writeFileSync(`${base}.svg`, svg);
  fs.writeFileSync(`${base}.png`, png);
  fs.writeFileSync(`${base}.jpg`, jpeg);
  await sharp(png).resize(600, 315).png().toFile(`${base}-600.png`);
  await sharp(png).resize(300, 158).png().toFile(`${base}-300.png`);
  console.log(`Icon sheet: 2400×1260 PNG, 1200×630 JPEG (${jpeg.length} bytes), editable SVG.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
