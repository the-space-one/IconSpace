/* eslint-disable @typescript-eslint/no-require-imports -- Node-only artwork renderer. */
// Compose the original Figma exports without redrawing or recoloring the cats.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');
const { asset, centeredText } = require('./build-og.cjs');
const output = path.resolve(__dirname, '../public/og/variations');
const PURPLE = '#655cf6';
const cat = (file, x, y, width, height) => asset(file, file, x, y, width, height);
const brand = (x, y, width) => asset('wordmark', 'Brand', x, y, width);

function icon(name, x, y, size, angle = 0) {
  const Component = require(`../src/icons/${name}.tsx`)[name];
  const svg = renderToStaticMarkup(React.createElement(Component, {
    width: size, height: size, color: PURPLE,
  })).replaceAll('currentColor', PURPLE);
  return `<g id="${name}" transform="translate(${x} ${y}) rotate(${angle} ${size / 2} ${size / 2})">${svg}</g>`;
}

const variations = [
  {
    name: 'cozy-packing',
    title: 'Cozy packing',
    brand: brand(275, 65, 650),
    subtitleTop: 218,
    art: [
      '<path id="Baseline" d="M180 553H1015" stroke="#e9e8ff" stroke-width="2" stroke-linecap="round"/>',
      cat('laptop-shopping', 200, 335, 235, 218),
      cat('open-box', 478, 319, 250, 234),
      cat('stacked-boxes', 782, 353, 225, 200),
      icon('HeartIcon', 432, 314, 35, -12),
      icon('SparkleIcon', 748, 305, 38, 9),
      icon('CodeIcon', 746, 402, 30),
    ].join('\n'),
  },
  {
    name: 'little-icon-club',
    title: 'Little icon club',
    brand: brand(295, 235, 610),
    subtitleTop: 374,
    art: [
      cat('open-box', 535, 56, 130, 122),
      cat('shopping-cart', 960, 168, 160, 147),
      cat('stacked-boxes', 70, 166, 160, 142),
      cat('laptop-shopping', 312, 453, 160, 149),
      cat('shopping-bag', 764, 458, 128, 141),
      icon('HeartIcon', 469, 107, 31, -15),
      icon('SparkleIcon', 696, 101, 33, 12),
      icon('CodeIcon', 584, 436, 32),
    ].join('\n'),
  },
];

async function main() {
  fs.mkdirSync(output, { recursive: true });
  for (const v of variations) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<title>Icon Space / ${v.title}</title>
<rect width="1200" height="630" fill="#ffffff"/>
${v.brand}
${centeredText('Premium animated icons', 32, v.subtitleTop, '#171719', 'Description')}
<g id="Original Figma cats and product icons">${v.art}</g>
${centeredText('iconspace.dev', 18, 582, '#666674', 'URL')}
</svg>`;
    const png = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
    const jpeg = await sharp(png).resize(1200, 630)
      .jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
    if (jpeg.length >= 1000000) throw new Error(`${v.name} exceeds 1 MB`);
    fs.writeFileSync(path.join(output, `${v.name}.svg`), svg);
    fs.writeFileSync(path.join(output, `${v.name}.png`), png);
    fs.writeFileSync(path.join(output, `${v.name}.jpg`), jpeg);
    console.log(`${v.name}: 2400×1260 PNG, 1200×630 JPEG (${jpeg.length} bytes), editable SVG`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
