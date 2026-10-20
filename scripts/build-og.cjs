/* eslint-disable @typescript-eslint/no-require-imports -- Node-only renderer uses a CommonJS hook to render the project TSX assets. */
/* Compose the share card from the project's actual icon components, mascot,
 * and brand fonts. Run: node scripts/build-og.cjs */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');

// Render the icons at their initial pose, without starting their animations.
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
const { HeroCatArtwork, EYES } = require('../src/components/hero-cat-artwork.tsx');
const cat = renderToStaticMarkup(React.createElement(HeroCatArtwork)) +
  EYES.paths.map(d => `<path fill="#9fa1ff" d="${d}"/>`).join('');
function icon(name, x, y, size, angle = 0, color = '#171719') {
  const Component = require(`../src/icons/${name}.tsx`)[name];
  const markup = renderToStaticMarkup(React.createElement(Component, { width: size, height: size, color }));
  return `<g transform="translate(${x} ${y}) rotate(${angle} ${size / 2} ${size / 2})">${markup}</g>`;
}
function tile(name, x, y, size, angle, fill = '#fffdf8', color = '#212022') {
  const art = name === 'cat'
    ? `<g transform="translate(${size * .15} ${size * .18}) scale(${size * .7 / 211})">${cat}</g>`
    : icon(name, size * .28, size * .25, size * .44, 0, color);
  return `<g transform="translate(${x} ${y}) rotate(${angle} ${size / 2} ${size / 2})">
    <rect y="9" width="${size}" height="${size}" rx="${size * .2}" fill="#6868ab" opacity=".20"/>
    <rect width="${size}" height="${size}" rx="${size * .2}" fill="${fill}" stroke="#323046" stroke-opacity=".13"/>
    <rect x="3" y="3" width="${size - 6}" height="${size - 6}" rx="${size * .2 - 3}" fill="none" stroke="white" stroke-opacity=".5"/>
    ${art}
    <circle cx="${size * .5}" cy="${size * .86}" r="${size * .032}" fill="${color}" opacity=".12"/>
    <path d="M${size * .491} ${size * .845}l${size * .024} ${size * .015}l-${size * .024} ${size * .015}Z" fill="${color}" opacity=".7"/>
  </g>`;
}
const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="paper" x2="1" y2="1"><stop stop-color="#c4c5ff"/><stop offset="1" stop-color="#a8aafe"/></linearGradient>
    <radialGradient id="light"><stop stop-color="#e1e1ff" stop-opacity=".75"/><stop offset="1" stop-color="#c4c5ff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#paper)"/>
  <ellipse cx="170" cy="80" rx="700" ry="620" fill="url(#light)"/>
  <circle cx="1036" cy="325" r="349" fill="#9698ed" opacity=".23"/>
  <g fill="none" stroke="#f5f4ff" stroke-width="1.25" opacity=".48">
    <ellipse cx="1002" cy="329" rx="349" ry="254" transform="rotate(-38 1002 329)"/>
    <ellipse cx="1002" cy="329" rx="422" ry="324" transform="rotate(-38 1002 329)"/>
  </g>
  <g transform="translate(62 49) scale(.20)">${cat}</g>
  <path d="M64 523H594" stroke="#313052" stroke-opacity=".18"/>
  <circle cx="70" cy="564" r="5" fill="#252339"/>
  ${tile('GemIcon', 778, -65, 145, -17)}
  ${tile('CodeIcon', 1001, -55, 158, 12)}
  ${tile('PaperPlaneIcon', 689, 144, 128, -16)}
  ${tile('HeartIcon', 893, 113, 175, 13, '#252335', '#e4e2ff')}
  ${tile('LightningIcon', 1124, 154, 142, 22)}
  ${tile('cat', 797, 317, 200, -12)}
  ${tile('SparkleIcon', 1064, 357, 165, 13, '#fff1b7')}
  ${tile('GlobeSpinIcon', 706, 550, 144, 11)}
  ${tile('RocketIcon', 979, 568, 160, -12)}
  ${icon('SparkleIcon', 827, 236, 32, -10, '#53508e')}
  <g fill="none" stroke="#53508e" stroke-width="3" stroke-linecap="round">
    <path d="M1075 88l11 -13M1086 105l18 -3"/>
    <path d="M756 469l-13 10M766 485l-5 15"/>
  </g>
</svg>`;
async function textLayer(text, font, size, left, top, color = '#111113') {
  // Outline the bundled WOFF2 font so exports never depend on system fonts.
  const readFont = require('next/dist/compiled/@next/font/dist/fontkit').default;
  const face = readFont(fs.readFileSync(path.join(root, `src/fonts/${font}-Regular.woff2`)));
  const run = face.layout(text);
  const scale = size / face.unitsPerEm;
  let x = 0;
  let maxY = -Infinity;
  let minY = Infinity;
  const paths = run.glyphs.map((glyph, i) => {
    const position = run.positions[i];
    maxY = Math.max(maxY, glyph.bbox.maxY + position.yOffset);
    minY = Math.min(minY, glyph.bbox.minY + position.yOffset);
    const markup = `<path transform="translate(${x + position.xOffset} ${position.yOffset})" d="${glyph.path.toSVG()}"/>`;
    x += position.xAdvance;
    return markup;
  }).join('');
  const width = Math.ceil(x * scale) + 2;
  const height = Math.ceil((maxY - minY) * scale) + 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g fill="${color}" transform="translate(1 ${maxY * scale + 1}) scale(${scale} ${-scale})">${paths}</g></svg>`;
  const input = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
  return { input, left: left * 2, top: top * 2 };
}
async function main() {
  const layers = [
    await textLayer('IconSpace', 'Froundy', 30, 116, 58, '#252335'),
    await textLayer('Small icons.', 'Makenfy', 92, 60, 200, '#252335'),
    await textLayer('Big energy.', 'Makenfy', 100, 60, 301, '#252335'),
    await textLayer('A little motion. A lot of character.', 'Froundy', 22, 65, 439, '#454266'),
    await textLayer('Premium animated icons', 'Froundy', 19, 86, 554, '#252335'),
    await textLayer('iconspace.dev', 'Froundy', 17, 465, 556, '#454266'),
  ];
  const png = await sharp(Buffer.from(artwork), { density: 144 }).composite(layers).png().toBuffer();
  fs.mkdirSync(path.join(root, 'public/og'), { recursive: true });
  await sharp(png).toFile(path.join(root, 'public/og/iconspace-og.png'));
  await sharp(png).resize(1200, 630).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toFile(path.join(root, 'src/app/opengraph-image.jpg'));
  console.log('Created public/og/iconspace-og.png (2400×1260) and src/app/opengraph-image.jpg (1200×630)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
