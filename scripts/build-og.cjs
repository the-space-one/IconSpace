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
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8').replace(
      'import { Hedges } from "@/components/hedges";',
      // The static OG needs the original SVG fallback, not the Rive runtime.
      'const Hedges = ({ children }: { children: ReactNode }) => <>{children}</>;'
    ), {
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
// Use the website's complete shop illustration in its original resting pose.
const { ShopBack, ShopFront } = require('../src/components/shop-scene.tsx');
const shop = [ShopBack, ShopFront]
  .flatMap(Component => [...renderToStaticMarkup(React.createElement(Component)).matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/g)].map(match => match[0]))
  .join('')
  .replaceAll(/<svg[^>]*>/g, '<g fill="none">')
  .replaceAll('</svg>', '</g>');
const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ededff"/>
  <rect x="16" y="16" width="1168" height="598" rx="22" fill="#ffffff"/>
  <g transform="translate(65 58) scale(.19)">${cat}</g>
  <svg x="626" y="151" width="548" height="438" viewBox="-10 45 470 375">${shop}</svg>
  ${icon('HeartIcon', 70, 475, 34)}
  ${icon('SparkleIcon', 145, 475, 34)}
  ${icon('GlobeSpinIcon', 220, 475, 34)}
  ${icon('RocketIcon', 295, 475, 34)}
  ${icon('CodeIcon', 370, 475, 34)}
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
    // The display face has a very narrow space. Keep whole words distinct
    // at thumbnail size without loosening the character shapes themselves.
    x += glyph.codePoints.includes(32) && font === 'Makenfy'
      ? Math.max(position.xAdvance, face.unitsPerEm * .27)
      : position.xAdvance;
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
    await textLayer('IconSpace', 'Froundy', 27, 118, 66),
    await textLayer('iconspace.dev', 'Froundy', 17, 1010, 72, '#737373'),
    await textLayer('Beautifully', 'Makenfy', 84, 66, 202),
    await textLayer('crafted icons.', 'Makenfy', 84, 66, 292, '#7779d9'),
    await textLayer('Animated with character.', 'Froundy', 23, 69, 402, '#616161'),
  ];
  const png = await sharp(Buffer.from(artwork), { density: 144 }).composite(layers).png().toBuffer();
  fs.mkdirSync(path.join(root, 'public/og'), { recursive: true });
  await sharp(png).toFile(path.join(root, 'public/og/iconspace-og.png'));
  await sharp(png).resize(1200, 630).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toFile(path.join(root, 'src/app/opengraph-image.jpg'));
  console.log('Created public/og/iconspace-og.png (2400×1260) and src/app/opengraph-image.jpg (1200×630)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
