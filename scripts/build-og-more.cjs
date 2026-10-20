/* eslint-disable @typescript-eslint/no-require-imports -- Node-only artwork renderer. */
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');
const { asset, centeredText } = require('./build-og.cjs');
const output = path.resolve(__dirname, '../public/og/variations');
const cat = (name, x, y, w, h) => asset(name, name, x, y, w, h);
const brand = (x, y, w) => asset('wordmark', 'Brand', x, y, w);
const text = (s, size, y, center = 600, color = '#292733') =>
  `<g transform="translate(${center - 600} 0)">${centeredText(s, size, y, color, s)}</g>`;
function icon(name, x, y, size, angle = 0) {
  const Component = require(`../src/icons/${name}.tsx`)[name];
  const svg = renderToStaticMarkup(React.createElement(Component, {
    width: size, height: size, color: '#655cf6',
  })).replaceAll('currentColor', '#655cf6');
  return `<g transform="translate(${x} ${y}) rotate(${angle} ${size / 2} ${size / 2})">${svg}</g>`;
}
const designs = [
  {
    name: 'lavender-club',
    background: '#8e94fd',
    content: [
      brand(270, 58, 660).replaceAll('#8E94FD', '#FFFFFF').replaceAll('#8e94fd', '#ffffff'),
      text('Premium animated icons', 32, 218, 600, '#ffffff'),
      '<ellipse cx="600" cy="609" rx="515" ry="290" fill="#f8f7ff"/>',
      cat('shopping-bag', 205, 344, 180, 198),
      cat('open-box', 435, 292, 308, 288),
      cat('shopping-cart', 790, 353, 198, 182),
      icon('HeartIcon', 373, 337, 38, -15),
      icon('SparkleIcon', 761, 302, 42, 12),
      text('iconspace.dev', 18, 592),
    ].join('\n'),
  },
  {
    name: 'unboxed',
    background: '#ffffff',
    content: [
      '<path d="M690 630C651 478 709 180 935 150C1089 129 1195 228 1200 260V630Z" fill="#f1f0ff"/>',
      brand(64, 129, 550),
      text('Premium animated icons', 32, 276, 338),
      cat('open-box', 685, 279, 360, 337),
      cat('laptop-shopping', 92, 394, 179, 166),
      icon('HeartIcon', 729, 147, 67, -17),
      icon('SparkleIcon', 892, 93, 65, 9),
      icon('CodeIcon', 1040, 211, 62, 15),
      text('iconspace.dev', 18, 544, 442),
    ].join('\n'),
  },
  {
    name: 'collectors-edition',
    background: '#faf9ff',
    content: [
      '<rect x="28" y="28" width="1144" height="574" rx="24" fill="white" stroke="#dddaf7" stroke-width="2"/>',
      brand(76, 79, 470),
      text('Premium animated icons', 30, 111, 884),
      '<path d="M76 211H1124" stroke="#e5e2f5" stroke-width="2"/>',
      ...['shopping-bag', 'open-box', 'shopping-cart', 'stacked-boxes'].map((name, i) => {
        const x = 76 + i * 268;
        return `<rect x="${x}" y="248" width="244" height="242" rx="18" fill="${i % 2 ? '#f8f7ff' : '#f0efff'}"/>
        ${cat(name, x + 32, 280, 180, 177)}`;
      }),
      icon('HeartIcon', 76, 532, 30),
      icon('SparkleIcon', 130, 532, 30),
      icon('CodeIcon', 184, 532, 30),
      text('iconspace.dev', 18, 538, 1058),
    ].join('\n'),
  },
];
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const thumbnails = [];
  for (const design of designs) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <title>Icon Space / ${design.name}</title>
    <rect width="1200" height="630" fill="${design.background}"/>
    ${design.content}</svg>`;
    const base = path.join(output, design.name);
    const png = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
    const jpg = await sharp(png).resize(1200, 630).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
    if (jpg.length >= 1000000) throw new Error('JPEG exceeds 1 MB');
    fs.writeFileSync(`${base}.svg`, svg);
    fs.writeFileSync(`${base}.png`, png);
    fs.writeFileSync(`${base}.jpg`, jpg);
    thumbnails.push(await sharp(png).resize(600, 315).png().toBuffer());
    console.log(`${design.name}: ${jpg.length} bytes; 1200×630 JPEG and 2400×1260 PNG`);
  }
  await sharp({ create: { width: 600, height: 969, channels: 3, background: '#dedde8' } })
    .composite(thumbnails.map((input, i) => ({ input, left: 0, top: i * 327 })))
    .png().toFile(path.join(output, 'more-variations-preview.png'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
