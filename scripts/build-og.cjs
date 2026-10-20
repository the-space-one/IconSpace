/* eslint-disable @typescript-eslint/no-require-imports -- Node-only static artwork renderer. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');
const readFont = require('next/dist/compiled/@next/font/dist/fontkit').default;
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public/og');
const WIDTH = 1200;
const HEIGHT = 630;
const INK = '#171719';
const PURPLE = '#655cf6';
const CATS = [
  { name: 'Shopping bag', file: 'shopping-bag', x: 65, y: 55, width: 150, height: 165 },
  { name: 'Shopping cart', file: 'shopping-cart', x: 975, y: 65, width: 170, height: 156 },
  { name: 'Laptop shopping', file: 'laptop-shopping', x: 60, y: 385, width: 190, height: 176 },
  { name: 'Open box', file: 'open-box', x: 760, y: 465, width: 135, height: 126 },
  { name: 'Stacked boxes', file: 'stacked-boxes', x: 970, y: 350, width: 180, height: 160 },
];
const WORDMARK = { x: 320, y: 233, width: 560 };
const ICONS = ['HeartIcon', 'SparkleIcon', 'CodeIcon'];
const ICON_SIZE = 36;
const ICON_GAP = 28;
const ICON_TOP = 405;
const DESCRIPTION_TOP = 357;
const URL_TOP = 574;
const ALT = 'Icon Space. Premium animated icons. Five original purple cat illustrations surround the lavender wordmark, with heart, sparkle, and code icons on a white background.';

// Render the real product components in their resting pose.
for (const extension of ['.tsx', '.ts']) {
  require.extensions[extension] = (module, filename) => {
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020, esModuleInterop: true,
      },
    }).outputText, filename);
  };
}

function asset(file, name, x, y, width, height) {
  const svg = fs.readFileSync(path.join(output, 'assets', `${file}.svg`), 'utf8');
  const viewBox = svg.match(/viewBox="([^"]+)"/);
  if (!viewBox || !svg.includes('<path')) throw new Error(`Invalid original SVG: ${file}`);
  const [left, top, sourceWidth, sourceHeight] = viewBox[1].split(/\s+/).map(Number);
  const scale = Math.min(width / sourceWidth, (height ?? Infinity) / sourceHeight);
  const dx = x + (width - sourceWidth * scale) / 2;
  const dy = y + (height === undefined ? 0 : (height - sourceHeight * scale) / 2);
  // Preserve the exported vectors and paints; namespace IDs when combining assets.
  const body = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'))
    .replace(/id="([^"]+)"/g, `id="${file}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${file}-$1)`);
  return `<g id="${name}" transform="translate(${dx} ${dy}) scale(${scale}) translate(${-left} ${-top})">${body}</g>`;
}

function centeredText(label, size, top, color, name) {
  const face = readFont(fs.readFileSync(path.join(root, 'src/fonts/Froundy-Regular.woff2')));
  const run = face.layout(label);
  const scale = size / face.unitsPerEm;
  let pen = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const paths = run.glyphs.map((glyph, i) => {
    const position = run.positions[i];
    const x = pen + position.xOffset;
    const y = position.yOffset;
    if (glyph.path.commands.length) {
      minX = Math.min(minX, x + glyph.bbox.minX);
      maxX = Math.max(maxX, x + glyph.bbox.maxX);
      maxY = Math.max(maxY, y + glyph.bbox.maxY);
    }
    pen += position.xAdvance;
    return `<path transform="translate(${x} ${y})" d="${glyph.path.toSVG()}"/>`;
  }).join('');
  const left = (WIDTH - (maxX - minX) * scale) / 2 - minX * scale;
  return `<g id="${name}" aria-label="${label}" fill="${color}" transform="translate(${left} ${top + maxY * scale}) scale(${scale} ${-scale})">${paths}</g>`;
}

async function main() {
  // Build everything before replacing production exports: missing assets fail safely.
  const cats = CATS.map(c => asset(c.file, c.name, c.x, c.y, c.width, c.height)).join('\n');
  const brand = asset('wordmark', 'Brand', WORDMARK.x, WORDMARK.y, WORDMARK.width);
  const rowWidth = ICONS.length * ICON_SIZE + (ICONS.length - 1) * ICON_GAP;
  const icons = ICONS.map((name, i) => {
    const Component = require(`../src/icons/${name}.tsx`)[name];
    const svg = renderToStaticMarkup(React.createElement(Component, { width: ICON_SIZE, height: ICON_SIZE, color: PURPLE })).replaceAll('currentColor', PURPLE);
    return `<g id="${name}" transform="translate(${(WIDTH - rowWidth) / 2 + i * (ICON_SIZE + ICON_GAP)} ${ICON_TOP})">${svg}</g>`;
  }).join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<title>OG / Cat ensemble / 1200×630</title>
<rect id="Background" width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>
${brand}
${centeredText('Premium animated icons', 32, DESCRIPTION_TOP, INK, 'Description')}
<g id="Product icons">${icons}</g>
<g id="Cats">${cats}</g>
${centeredText('iconspace.dev', 18, URL_TOP, '#666674', 'URL')}
</svg>`;
  const png = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
  const jpeg = await sharp(png).resize(WIDTH, HEIGHT).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
  if (jpeg.length >= 1000000) throw new Error('OG JPEG exceeds the 1 MB budget');
  fs.writeFileSync(path.join(output, 'iconspace-og.svg'), svg);
  fs.writeFileSync(path.join(output, 'iconspace-og.png'), png);
  fs.writeFileSync(path.join(root, 'src/app/opengraph-image.jpg'), jpeg);
  fs.writeFileSync(path.join(root, 'src/app/opengraph-image.alt.txt'), `${ALT}\n`);
  console.log(`Created editable SVG, 2400×1260 PNG, and 1200×630 JPEG (${jpeg.length} bytes).`);
}
module.exports = { asset, centeredText };
if (require.main === module) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
