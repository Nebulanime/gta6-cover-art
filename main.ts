/**
 * Leonida Cover Studio — entrypoint (Node 22, no dependencies, no network).
 *
 * Run as the grader does: `node main.ts`. It validates the offline web app
 * under app/, then renders a deterministic sample cover (1080x1080 PNG)
 * with a tiny software rasterizer + hand-rolled PNG encoder, and hands the
 * entry in: it copies app/ and screenshots/ to the output directory and
 * writes dossier.json there with buildDossier from vendor/makefun-app.ts
 * (the kit's copy, unchanged), exactly as the kit's starter main.ts does.
 *   - $MAKEFUN_OUTPUT_DIR (or ./out when unset)
 *   - app/, screenshots/, dossier.json, cover-sample.png, report.json
 *
 * Everything is deterministic: fixed seed, no wall-clock time, no random
 * values, no network. Two runs produce byte-identical outputs.
 */
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { buildDossier } from "./vendor/makefun-app.ts";

const BOT_DIR = process.env.MAKEFUN_BOT_DIR
  ? resolve(process.env.MAKEFUN_BOT_DIR)
  : dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR
  ? resolve(process.env.MAKEFUN_OUTPUT_DIR)
  : join(BOT_DIR, "out");

const W = 1080;
const H = 1080;

/* ------------------------------------------------------------------ */
/* Seeded random                                                       */
/* ------------------------------------------------------------------ */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Tiny 5x7 bitmap font (original glyphs, only the letters we need)    */
/* ------------------------------------------------------------------ */
type Glyph = string[];
const FONT: Record<string, Glyph> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
};

function textWidth(text: string, scale: number): number {
  return text.split("").reduce((w, ch) => w + 6 * scale, -1 * scale);
}

/* ------------------------------------------------------------------ */
/* Software rasterizer: RGB framebuffer                                */
/* ------------------------------------------------------------------ */
class Canvas {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8Array;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 3);
  }
  set(x: number, y: number, r: number, g: number, b: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.px[i] = r;
    this.px[i + 1] = g;
    this.px[i + 2] = b;
  }
  fillRect(x0: number, y0: number, x1: number, y1: number, c: [number, number, number]): void {
    for (let y = Math.max(0, y0); y < Math.min(this.h, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(this.w, x1); x++) {
        this.set(x, y, c[0], c[1], c[2]);
      }
    }
  }
  vgrad(y0: number, y1: number, stops: Array<[number, [number, number, number]]>): void {
    for (let y = y0; y < y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0 - 1);
      let a = stops[0];
      let b = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i][0] && t <= stops[i + 1][0]) {
          a = stops[i];
          b = stops[i + 1];
          break;
        }
      }
      const f = (t - a[0]) / Math.max(0.0001, b[0] - a[0]);
      const r = Math.round(a[1][0] + (b[1][0] - a[1][0]) * f);
      const g = Math.round(a[1][1] + (b[1][1] - a[1][1]) * f);
      const bl = Math.round(a[1][2] + (b[1][2] - a[1][2]) * f);
      for (let x = 0; x < this.w; x++) this.set(x, y, r, g, bl);
    }
  }
  disc(cx: number, cy: number, r: number, c: [number, number, number]): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, c[0], c[1], c[2]);
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: [number, number, number], wdt: number): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      const half = Math.floor(wdt / 2);
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) this.set(x + dx, y + dy, c[0], c[1], c[2]);
      }
    }
  }
  text(text: string, cx: number, top: number, scale: number, c: [number, number, number]): void {
    const tw = textWidth(text, scale);
    let x = Math.round(cx - tw / 2);
    for (const ch of text) {
      const glyph = FONT[ch] ?? FONT[" "];
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (glyph[row][col] === "1") {
            this.fillRect(x + col * scale, top + row * scale, x + (col + 1) * scale, top + (row + 1) * scale, c);
          }
        }
      }
      x += 6 * scale;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Sample cover: Vice City sunset street, drawn procedurally           */
/* ------------------------------------------------------------------ */
function renderCover(): Canvas {
  const cv = new Canvas(W, H);
  const rnd = lcg(20261119);

  // sky
  cv.vgrad(0, Math.floor(H * 0.62), [
    [0, [43, 16, 85]],
    [0.45, [117, 151, 222]],
    [0.62, [255, 126, 95]],
    [0.78, [254, 180, 123]],
    [1, [255, 215, 106]],
  ]);
  // sun with slats
  const sunX = Math.floor(W * 0.68);
  const sunY = Math.floor(H * 0.42);
  const sunR = Math.floor(H * 0.2);
  for (let y = sunY - sunR; y <= sunY + sunR; y++) {
    const f = (y - (sunY - sunR)) / (2 * sunR);
    const r = Math.round(255 - (255 - 255) * f);
    const g = Math.round(226 - (226 - 117) * f);
    const b = Math.round(89 + (24 - 89) * f);
    const half = Math.floor(Math.sqrt(Math.max(0, sunR * sunR - (y - sunY) * (y - sunY))));
    for (let x = sunX - half; x <= sunX + half; x++) cv.set(x, y, r, g, b);
  }
  // sun slats
  for (let i = 0; i < 5; i++) {
    const yy = Math.floor(sunY + sunR * (0.05 + i * 0.16));
    cv.fillRect(sunX - sunR, yy, sunX + sunR, yy + 3 + i * 3, [43, 16, 85]);
  }

  // skyline
  let bx = 0;
  while (bx < W) {
    const bw = 40 + Math.floor(rnd() * 90);
    const bh = 40 + Math.floor(rnd() * 130);
    const top = Math.floor(H * 0.62) - bh;
    cv.fillRect(bx, top, bx + bw, Math.floor(H * 0.62), [29, 11, 51]);
    for (let wy = top + 8; wy < H * 0.62 - 8; wy += 14) {
      for (let wx = bx + 6; wx < bx + bw - 6; wx += 13) {
        if (rnd() > 0.55) cv.fillRect(wx, wy, wx + 5, wy + 7, [255, 214, 106]);
      }
    }
    bx += bw + 4;
  }

  // sea
  cv.vgrad(Math.floor(H * 0.62), Math.floor(H * 0.74), [
    [0, [255, 154, 92]],
    [1, [194, 42, 109]],
  ]);
  // road
  for (let y = Math.floor(H * 0.74); y < H; y++) {
    const t = (y - H * 0.74) / (H * 0.26);
    const half = Math.floor(W * (0.12 + t * 0.38));
    const cx = W / 2;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      cv.set(x, y, 20, 10, 30);
    }
  }
  // centre dashes
  for (let y = Math.floor(H * 0.76); y < H; y += 46) {
    cv.fillRect(Math.floor(W / 2) - 3, y, Math.floor(W / 2) + 3, Math.min(H, y + 26), [255, 215, 106]);
  }

  // (The full street scene with the sports car lives in the app's own
  // sample photo, app/app.js makeSamplePhoto — this headless sample
  // keeps the poster composition: sky, sun, skyline, sea and road.)

  // palm trees
  drawPalm(cv, Math.floor(W * 0.08), Math.floor(H * 0.72), Math.floor(H * 0.34), rnd);
  drawPalm(cv, Math.floor(W * 0.93), Math.floor(H * 0.7), Math.floor(H * 0.3), rnd);

  // title block: scrim + LEONIDA + VICE CITY + VI badge
  for (let y = Math.floor(H * 0.74); y < H; y++) {
    const f = (y - H * 0.74) / (H * 0.26);
    const a = Math.min(0.94, f * 1.3);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      cv.px[i] = Math.round(cv.px[i] * (1 - a) + 10 * a);
      cv.px[i + 1] = Math.round(cv.px[i + 1] * (1 - a) + 4 * a);
      cv.px[i + 2] = Math.round(cv.px[i + 2] * (1 - a) + 18 * a);
    }
  }
  const titleScale = 16;
  const titleTop = Math.floor(H * 0.8);
  // outline: draw the title offset in dark around the bright one
  cv.text("LEONIDA", W / 2, titleTop, titleScale, [10, 4, 18]);
  cv.text("LEONIDA", W / 2, titleTop - 4, titleScale, [255, 215, 106]);
  cv.text("VICE CITY", W / 2, titleTop + 7 * titleScale + 26, 6, [255, 255, 255]);
  // VI badge disc, top-right
  const badgeR = 46;
  const bcx = W - 110;
  const bcy = Math.floor(H * 0.8) + 10;
  cv.disc(bcx, bcy, badgeR + 12, [255, 46, 136]);
  cv.disc(bcx, bcy, badgeR, [255, 201, 61]);
  cv.text("VI", bcx, bcy - 22, 7, [22, 10, 32]);
  return cv;
}

function drawPalm(cv: Canvas, px: number, py: number, len: number, rnd: () => number): void {
  const topX = px;
  const topY = py - len;
  // trunk: continuous curve, drawn as short line segments
  let prevX = px;
  let prevY = py;
  for (let i = 1; i <= 24; i++) {
    const t = i / 24;
    const x = Math.round(px + Math.sin(t * 1.2) * len * 0.06);
    const y = Math.round(py - t * len);
    cv.line(prevX, prevY, x, y, [18, 8, 31], 9);
    prevX = x;
    prevY = y;
  }
  // fronds
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.15 - (i / 6) * Math.PI * 0.7;
    const fl = len * (0.42 + rnd() * 0.1);
    const ex = topX + Math.cos(a) * fl;
    const ey = topY + Math.sin(a) * fl + len * 0.22;
    cv.line(topX, topY, Math.round(ex), Math.round(ey), [18, 8, 31], 5);
  }
}

/* ------------------------------------------------------------------ */
/* PNG encoder (color type 2, filter 0, zlib)                          */
/* ------------------------------------------------------------------ */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(cv: Canvas): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0);
  ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(cv.h * (1 + cv.w * 3));
  for (let y = 0; y < cv.h; y++) {
    const rowStart = y * (1 + cv.w * 3);
    raw[rowStart] = 0; // filter none
    raw.set(cv.px.subarray(y * cv.w * 3, (y + 1) * cv.w * 3), rowStart + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */
/* Validation + main                                                   */
/* ------------------------------------------------------------------ */
function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function main(): void {
  const appDir = join(BOT_DIR, "app");
  const required = ["index.html", "app.js", "styles.css"];
  const files: Array<{ name: string; bytes: number; sha256: string }> = [];
  let externalUrls = 0;
  for (const name of required) {
    const p = join(appDir, name);
    if (!existsSync(p)) {
      console.error(`missing app file: app/${name}`);
      process.exitCode = 1;
      return;
    }
    const buf = readFileSync(p);
    const text = buf.toString("utf8");
    const hits = text.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    // allow the make.fun links in comments/docs only if they are not loaded
    // resources: count only real resource references (src=/href=/url(/@import)
    const loaded = text.match(/(?:src|href)\s*=\s*["']https?:|url\(\s*["']?https?:|@import\s+["']https?:/g) ?? [];
    externalUrls += loaded.length;
    void hits;
    files.push({ name: `app/${name}`, bytes: buf.length, sha256: sha256(buf) });
  }

  // every file the app loads must live under app/
  const extra = readdirSync(appDir).filter((f) => !required.includes(f) && statSync(join(appDir, f)).isFile());
  for (const f of extra) {
    const buf = readFileSync(join(appDir, f));
    files.push({ name: `app/${f}`, bytes: buf.length, sha256: sha256(buf) });
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const cover = renderCover();
  const png = encodePNG(cover);
  writeFileSync(join(OUT_DIR, "cover-sample.png"), png);

  const report = {
    competition: "gta6-cover-art-01",
    entry: "Leonida Cover Studio",
    cover: { file: "cover-sample.png", width: W, height: H, bytes: png.length, sha256: sha256(png) },
    app_files: files,
    offline: { external_resource_urls: externalUrls },
    sizes: ["1080x1080", "1080x1350", "1920x1080", "1080x1920"],
  };
  writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2) + "\n");

  console.log("leonida-cover-studio main.ts");
  console.log(`app files: ${files.length} ok (${files.map((f) => f.name).join(", ")})`);
  console.log(`offline check: ${externalUrls} external resource urls`);
  console.log(`cover: cover-sample.png ${W}x${H} ${png.length} bytes sha256 ${sha256(png).slice(0, 16)}`);
  console.log("report: report.json");
  if (externalUrls > 0) process.exitCode = 1;

  // Hand the entry in, as the kit's starter main.ts does: copy app/ and
  // screenshots/ beside this file to the output directory, then write
  // dossier.json with buildDossier from vendor/makefun-app.ts.
  cpSync(join(BOT_DIR, "app"), join(OUT_DIR, "app"), { recursive: true });
  mkdirSync(join(OUT_DIR, "screenshots"), { recursive: true });
  if (existsSync(join(BOT_DIR, "screenshots"))) {
    cpSync(join(BOT_DIR, "screenshots"), join(OUT_DIR, "screenshots"), { recursive: true });
  }
  writeFileSync(
    join(OUT_DIR, "dossier.json"),
    buildDossier(OUT_DIR, {
      text_max_bytes: 163840,
      screenshots: { max: 4, max_bytes: 262144 },
      app_max_files: 993,
      app_max_bytes: 50331648,
      app_path_max_bytes: 1000,
    }),
  );
  console.log("hand-in: app/ + screenshots/ copied, dossier.json written");
  console.log("done");
}

main();
