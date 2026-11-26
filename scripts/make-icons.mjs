// Draws the Peakcast icon once (SVG) and renders every size the apps need:
// web/PWA, iOS home screen, Android launcher (legacy + adaptive) and Windows.
// Run: node scripts/make-icons.mjs   (uses Playwright's Chromium to rasterize)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "@playwright/test";

const SIZE = 1024;

/** Apple-style continuous-corner squircle (superellipse, n = 5). */
function squircle(size, inset = 0) {
  const r = size / 2 - inset;
  const c = size / 2;
  const points = [];
  for (let i = 0; i < 360; i++) {
    const t = (i / 360) * Math.PI * 2;
    const x = Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** (2 / 5);
    const y = Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** (2 / 5);
    points.push(`${(c + r * x).toFixed(1)},${(c + r * y).toFixed(1)}`);
  }
  return `M${points.join("L")}Z`;
}

const defs = `
  <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="#6A8DFF"/>
    <stop offset="0.55" stop-color="#4B4BE8"/>
    <stop offset="1" stop-color="#2E1FAE"/>
  </linearGradient>
  <radialGradient id="sheen" cx="0.28" cy="0.08" r="0.8">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.38"/>
    <stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="sun" cx="0.38" cy="0.32" r="0.75">
    <stop offset="0" stop-color="#FFF1C2"/>
    <stop offset="0.5" stop-color="#FFC94D"/>
    <stop offset="1" stop-color="#FF8A3D"/>
  </radialGradient>
  <linearGradient id="snow" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFFFFF"/>
    <stop offset="1" stop-color="#E4E9FF"/>
  </linearGradient>
  <linearGradient id="mass" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.42"/>
    <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.08"/>
  </linearGradient>
  <filter id="lift" x="-20%" y="-20%" width="140%" height="150%">
    <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#160C6B" flood-opacity="0.38"/>
  </filter>`;

/**
 * The mark: a mountain whose ridge is a rising price line. Past the summit the
 * line turns into dots, the forecast, ending at a rising sun.
 * `scale` shrinks it around the centre; `mono` is the single-colour version.
 */
function glyph(scale = 1, mono = false) {
  const paint = (colour) => (mono ? "#FFFFFF" : colour);
  const ridge = "M200 712 L372 522 L462 600 L640 376";
  return `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
    <path d="${ridge} L838 760 L200 760 Z" fill="${paint("url(#mass)")}" ${mono ? 'fill-opacity="0.35"' : ""}
      stroke="${paint("url(#mass)")}" ${mono ? 'stroke-opacity="0.35"' : ""} stroke-width="28" stroke-linejoin="round"/>
    <g ${mono ? "" : 'filter="url(#lift)"'}>
      <path d="${ridge}" fill="none" stroke="${paint("url(#snow)")}" stroke-width="64"
        stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="704" cy="332" r="22" fill="${paint("#FFFFFF")}" ${mono ? "" : 'fill-opacity="0.9"'}/>
      <circle cx="756" cy="296" r="22" fill="${paint("#FFFFFF")}" ${mono ? "" : 'fill-opacity="0.75"'}/>
      <circle cx="830" cy="244" r="66" fill="${paint("url(#sun)")}"/>
    </g>
  </g>`;
}

const svg = (body, size = SIZE) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${SIZE} ${SIZE}"><defs>${defs}</defs>${body}</svg>`;
const background = `<rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/><rect width="${SIZE}" height="${SIZE}" fill="url(#sheen)"/>`;

const art = {
  // Rounded for places that show the icon as-is (favicon, PWA, Windows, legacy Android).
  rounded: svg(
    `<clipPath id="shape"><path d="${squircle(SIZE, 8)}"/></clipPath><g clip-path="url(#shape)">${background}${glyph()}</g>`,
  ),
  // Full bleed for platforms that cut their own shape (iOS, maskable PWA).
  square: svg(`${background}${glyph()}`),
  maskable: svg(`${background}${glyph(0.8)}`),
  // Android adaptive icon layers: 108dp canvas, the mark inside the 66dp safe zone.
  adaptiveBackground: svg(background),
  adaptiveForeground: svg(glyph(0.62)),
  adaptiveMonochrome: svg(glyph(0.62, true)),
};

const outputs = [
  ["public/icon.svg", "rounded"],
  ["public/icon-192.png", "rounded", 192],
  ["public/icon-512.png", "rounded", 512],
  ["public/icon-maskable.png", "maskable", 512],
  ["public/apple-touch-icon.png", "square", 180],
  ["android/res/mipmap-mdpi/ic_launcher.png", "rounded", 48],
  ["android/res/mipmap-hdpi/ic_launcher.png", "rounded", 72],
  ["android/res/mipmap-xhdpi/ic_launcher.png", "rounded", 96],
  ["android/res/mipmap-xxhdpi/ic_launcher.png", "rounded", 144],
  ["android/res/mipmap-xxxhdpi/ic_launcher.png", "rounded", 192],
  [
    "android/res/drawable-nodpi/ic_launcher_background.png",
    "adaptiveBackground",
    432,
  ],
  [
    "android/res/drawable-nodpi/ic_launcher_foreground.png",
    "adaptiveForeground",
    432,
  ],
  [
    "android/res/drawable-nodpi/ic_launcher_monochrome.png",
    "adaptiveMonochrome",
    432,
  ],
  ["docs/brand/peakcast-icon-1024.png", "rounded", 1024],
  ["docs/brand/peakcast-icon-appstore-1024.png", "square", 1024],
];
const icoSizes = [256, 64, 48, 32, 16];

const write = (path, data) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
};

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(name, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${art[name]}`,
  );
  return page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
}
for (const [path, name, size] of outputs)
  write(path, size ? await render(name, size) : art[name]);

// Google Play store listing: 512×512 icon (full bleed, Play rounds it) and the
// 1024×500 feature graphic. Neither may have transparency.
write("docs/brand/play-store-icon-512.png", await render("square", 512));
await page.setViewportSize({ width: 1024, height: 500 });
await page.setContent(`<style>
  html,body{margin:0}
  .card{width:1024px;height:500px;position:relative;overflow:hidden;
    background:linear-gradient(160deg,#6A8DFF 0%,#4B4BE8 55%,#2E1FAE 100%);
    font-family:"Segoe UI",system-ui,sans-serif;color:#fff}
  .sheen{position:absolute;inset:0;background:radial-gradient(circle at 18% 8%,rgba(255,255,255,.35),transparent 55%)}
  .icon{position:absolute;left:96px;top:110px;width:280px;height:280px;
    filter:drop-shadow(0 24px 40px rgba(22,12,107,.45))}
  .text{position:absolute;left:432px;top:150px}
  h1{margin:0;font-size:92px;font-weight:800;letter-spacing:-3px}
  h1 span{color:#FFC94D}
  p{margin:14px 0 0;font-size:32px;font-weight:500;opacity:.92;max-width:520px;line-height:1.25}
</style><div class="card"><div class="sheen"></div>
  <div class="icon">${art.rounded.replace(/width="1024" height="1024"/, 'width="280" height="280"')}</div>
  <div class="text"><h1>peakcast<span>.</span></h1>
  <p>Practice forecasting with demo credits. Everything stays on your phone.</p></div></div>`);
write(
  "docs/brand/play-feature-graphic-1024x500.png",
  await page.screenshot({ clip: { x: 0, y: 0, width: 1024, height: 500 } }),
);

// Windows .ico with PNG-compressed entries (supported since Windows Vista).
const images = [];
for (const size of icoSizes)
  images.push({ size, png: await render("rounded", size) });
await browser.close();
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach(({ size, png }, i) => {
  const entry = 6 + 16 * i;
  header.writeUInt8(size >= 256 ? 0 : size, entry);
  header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
write(
  "public/icon.ico",
  Buffer.concat([header, ...images.map((image) => image.png)]),
);

write(
  "android/res/mipmap-anydpi-v26/ic_launcher.xml",
  `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
 <background android:drawable="@drawable/ic_launcher_background"/>
 <foreground android:drawable="@drawable/ic_launcher_foreground"/>
 <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
`,
);
console.log(`Wrote ${outputs.length + 2} icon files.`);
