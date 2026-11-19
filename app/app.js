/* Leonida Cover Studio — GTA-style cover art maker.
   All original code. Runs fully offline: no network, no external fonts,
   no libraries. Photos are processed locally on canvas and never leave
   the machine. */
"use strict";

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const sctx = stage.getContext("2d", { willReadFrequently: true });

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
const state = {
  photos: [], // { img: HTMLImageElement|HTMLCanvasElement, name: string }
  panels: [
    { photo: -1, zoom: 100, panX: 0, panY: 0, flip: false, fit: false },
    { photo: -1, zoom: 100, panX: 0, panY: 0, flip: false, fit: false },
    { photo: -1, zoom: 100, panX: 0, panY: 0, flip: false, fit: false },
    { photo: -1, zoom: 100, panX: 0, panY: 0, flip: false, fit: false },
  ],
  activePanel: 0,
  layout: "collage",
  grade: "sunset",
  posterize: 5,
  printDots: true,
  grain: true,
  panelBorders: true,
  title: "LEONIDA",
  subtitle: "VICE CITY",
  tagline: "EVERY SUNSET HAS A PRICE",
  badge: "VI",
  titleStyle: "sunset",
  size: "1080x1080",
};

/* ------------------------------------------------------------------ */
/* Seeded random (deterministic sample art + grain)                    */
/* ------------------------------------------------------------------ */
function lcg(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Layouts: panel rects as fractions of the canvas                     */
/* ------------------------------------------------------------------ */
function layoutRects(layout) {
  if (layout === "hero") return [[0, 0, 1, 1]];
  if (layout === "duo") return [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]];
  // collage — classic multi-panel cover grid
  return [
    [0, 0, 0.66, 0.7],
    [0.66, 0, 0.34, 0.35],
    [0.66, 0.35, 0.34, 0.35],
    [0, 0.7, 1, 0.3],
  ];
}

/* ------------------------------------------------------------------ */
/* Colour grades                                                       */
/* ------------------------------------------------------------------ */
const GRADES = {
  sunset: {
    stops: [[26, 8, 52], [122, 16, 96], [255, 46, 136], [255, 138, 61], [255, 214, 106]],
    mix: 0.55,
  },
  neon: {
    stops: [[8, 8, 32], [64, 12, 96], [190, 32, 160], [255, 46, 136], [45, 226, 197]],
    mix: 0.6,
  },
  noir: {
    stops: [[10, 10, 12], [70, 70, 76], [150, 150, 158], [215, 215, 220], [250, 248, 240]],
    mix: 0.85,
  },
  vice: {
    stops: [[6, 42, 54], [14, 96, 110], [120, 130, 120], [255, 150, 70], [255, 214, 140]],
    mix: 0.55,
  },
};

function gradeColor(stops, t) {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i], b = stops[i + 1];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

/* Apply posterize + duotone grade to an ImageData in place. */
function applyGrade(imageData, gradeName, levels) {
  const g = GRADES[gradeName] || GRADES.sunset;
  const d = imageData.data;
  const step = 255 / (levels - 1);
  for (let i = 0; i < d.length; i += 4) {
    let r = Math.round(d[i] / step) * step;
    let gg = Math.round(d[i + 1] / step) * step;
    let b = Math.round(d[i + 2] / step) * step;
    // contrast lift
    const lum = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
    const cl = Math.max(0, Math.min(1, (lum - 0.5) * 1.25 + 0.5));
    const gc = gradeColor(g.stops, cl);
    const m = g.mix;
    d[i] = r + (gc[0] - r) * m;
    d[i + 1] = gg + (gc[1] - gg) * m;
    d[i + 2] = b + (gc[2] - b) * m;
  }
}

/* ------------------------------------------------------------------ */
/* Procedural sample photo (deterministic Vice City street scene)      */
/* ------------------------------------------------------------------ */
function makeSamplePhoto(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  const rnd = lcg(20261119);

  // sky
  const sky = x.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, "#2b1055");
  sky.addColorStop(0.45, "#7597de");
  sky.addColorStop(0.62, "#ff7e5f");
  sky.addColorStop(0.78, "#feb47b");
  sky.addColorStop(1, "#ffd76a");
  x.fillStyle = sky;
  x.fillRect(0, 0, w, h * 0.62);

  // retro sun with slats
  const sunX = w * 0.68, sunY = h * 0.42, sunR = h * 0.2;
  x.save();
  x.beginPath(); x.arc(sunX, sunY, sunR, 0, Math.PI * 2); x.clip();
  const sg = x.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
  sg.addColorStop(0, "#ffe259"); sg.addColorStop(1, "#ff7518");
  x.fillStyle = sg; x.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
  x.fillStyle = "#2b1055";
  for (let i = 0; i < 5; i++) {
    const yy = sunY + sunR * (0.05 + i * 0.16);
    x.fillRect(sunX - sunR, yy, sunR * 2, 3 + i * 2.5);
  }
  x.restore();

  // skyline
  x.fillStyle = "#1d0b33";
  let bx = 0;
  while (bx < w) {
    const bw = 40 + rnd() * 90, bh = 40 + rnd() * 130;
    x.fillRect(bx, h * 0.62 - bh, bw, bh);
    // lit windows
    x.fillStyle = "rgba(255,214,106,.85)";
    for (let wy = h * 0.62 - bh + 8; wy < h * 0.62 - 8; wy += 14) {
      for (let wx = bx + 6; wx < bx + bw - 6; wx += 13) {
        if (rnd() > 0.55) x.fillRect(wx, wy, 5, 7);
      }
    }
    x.fillStyle = "#1d0b33";
    bx += bw + 4;
  }

  // sea strip
  const sea = x.createLinearGradient(0, h * 0.62, 0, h * 0.74);
  sea.addColorStop(0, "#ff9a5c"); sea.addColorStop(1, "#c22a6d");
  x.fillStyle = sea; x.fillRect(0, h * 0.62, w, h * 0.12);
  x.strokeStyle = "rgba(255,255,255,.35)"; x.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const yy = h * (0.63 + i * 0.012);
    x.beginPath(); x.moveTo(0, yy); x.lineTo(w, yy); x.stroke();
  }

  // road
  x.fillStyle = "#140a1e";
  x.beginPath();
  x.moveTo(0, h); x.lineTo(w, h); x.lineTo(w * 0.62, h * 0.74); x.lineTo(w * 0.38, h * 0.74);
  x.closePath(); x.fill();
  x.strokeStyle = "#ffd76a"; x.lineWidth = 4; x.setLineDash([26, 22]);
  x.beginPath(); x.moveTo(w * 0.5, h); x.lineTo(w * 0.5, h * 0.74); x.stroke();
  x.setLineDash([]);

  // sports car silhouette (side profile, low + wide)
  x.save();
  x.translate(w * 0.5, h * 0.93); x.scale(w / 1200, h / 900);
  x.fillStyle = "#0b0512";
  x.beginPath();
  x.moveTo(-260, 0);
  x.lineTo(-250, -42); x.lineTo(-190, -52); x.lineTo(-120, -86);
  x.lineTo(30, -92); x.lineTo(140, -58); x.lineTo(250, -46); x.lineTo(262, -8);
  x.lineTo(250, 0); x.closePath(); x.fill();
  // cabin glass
  x.fillStyle = "#2b1055";
  x.beginPath();
  x.moveTo(-110, -80); x.lineTo(20, -86); x.lineTo(120, -56); x.lineTo(-100, -54);
  x.closePath(); x.fill();
  // wheels
  x.fillStyle = "#050308";
  [-168, 168].forEach((wx) => {
    x.beginPath(); x.arc(wx, -6, 34, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#ffd76a"; x.lineWidth = 4;
    x.beginPath(); x.arc(wx, -6, 20, 0, Math.PI * 2); x.stroke();
  });
  // neon underglow
  x.strokeStyle = "rgba(255,46,136,.9)"; x.lineWidth = 5;
  x.beginPath(); x.moveTo(-240, 4); x.lineTo(240, 4); x.stroke();
  x.restore();

  // palm trees (two, framing)
  drawPalm(x, w * 0.08, h * 0.72, h * 0.34, -0.25, rnd);
  drawPalm(x, w * 0.93, h * 0.70, h * 0.30, 0.3, rnd);

  // birds
  x.strokeStyle = "rgba(20,8,30,.8)"; x.lineWidth = 3;
  [[0.2, 0.18], [0.3, 0.13], [0.42, 0.2]].forEach(([fx, fy]) => {
    const px = w * fx, py = h * fy;
    x.beginPath();
    x.moveTo(px - 14, py); x.quadraticCurveTo(px - 5, py - 9, px, py);
    x.quadraticCurveTo(px + 5, py - 9, px + 14, py);
    x.stroke();
  });
  return c;
}

function drawPalm(x, px, py, len, lean, rnd) {
  x.save();
  x.translate(px, py);
  x.rotate(lean);
  x.strokeStyle = "#12081f"; x.lineWidth = len * 0.045; x.lineCap = "round";
  x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(len * 0.06, -len * 0.55, 0, -len); x.stroke();
  const topX = 0, topY = -len;
  x.lineWidth = len * 0.03;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.15 - (i / 6) * Math.PI * 0.7;
    const fl = len * (0.42 + rnd() * 0.1);
    x.beginPath();
    x.moveTo(topX, topY);
    x.quadraticCurveTo(
      topX + Math.cos(a) * fl * 0.55, topY + Math.sin(a) * fl * 0.55 - len * 0.08,
      topX + Math.cos(a) * fl, topY + Math.sin(a) * fl + len * 0.22
    );
    x.stroke();
  }
  x.restore();
}

/* ------------------------------------------------------------------ */
/* Photo drawing                                                       */
/* ------------------------------------------------------------------ */
function drawPhotoInto(ctx, img, rect, panel) {
  const [rx, ry, rw, rh] = rect;
  const iw = img.width, ih = img.height;
  // offscreen at panel pixel size (capped for speed)
  const scale = Math.min(1, 1100 / Math.max(rw, rh));
  const pw = Math.max(2, Math.round(rw * scale));
  const ph = Math.max(2, Math.round(rh * scale));
  const tmp = document.createElement("canvas");
  tmp.width = pw; tmp.height = ph;
  const t = tmp.getContext("2d", { willReadFrequently: true });

  // cover-fit (or contain when fit mode) with zoom + pan
  const base = panel.fit
    ? Math.min(pw / iw, ph / ih)
    : Math.max(pw / iw, ph / ih);
  const z = base * (panel.zoom / 100);
  const dw = iw * z, dh = ih * z;
  const dx = (pw - dw) / 2 + (panel.panX / 100) * pw * 0.4;
  const dy = (ph - dh) / 2 + (panel.panY / 100) * ph * 0.4;
  t.save();
  if (panel.flip) { t.translate(pw, 0); t.scale(-1, 1); }
  if (panel.fit) {
    // dark blurred-ish backdrop: solid deep tone + the photo contained
    t.fillStyle = "#160a20"; t.fillRect(0, 0, pw, ph);
  }
  t.drawImage(img, dx, dy, dw, dh);
  t.restore();

  const data = t.getImageData(0, 0, pw, ph);
  applyGrade(data, state.grade, state.posterize);
  t.putImageData(data, 0, 0);

  ctx.drawImage(tmp, rx, ry, rw, rh);
}

function drawPlaceholder(ctx, rect, label) {
  const [rx, ry, rw, rh] = rect;
  const g = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
  g.addColorStop(0, "#3b1558"); g.addColorStop(0.5, "#7a1e6e"); g.addColorStop(1, "#ff7e5f");
  ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.font = `900 ${Math.max(14, rw * 0.055)}px Impact, "Arial Narrow", sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, rx + rw / 2, ry + rh / 2 - rw * 0.02);
  ctx.font = `700 ${Math.max(11, rw * 0.028)}px "Segoe UI", sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,.75)";
  ctx.fillText("ADD A PHOTO", rx + rw / 2, ry + rh / 2 + rw * 0.05);
}

/* ------------------------------------------------------------------ */
/* Overlays: print dots + grain                                        */
/* ------------------------------------------------------------------ */
let dotPattern = null;
let grainTile = null;

function getDotPattern(ctx) {
  if (dotPattern) return dotPattern;
  const p = document.createElement("canvas");
  p.width = 7; p.height = 7;
  const px = p.getContext("2d");
  px.fillStyle = "rgba(0,0,0,0.9)";
  px.beginPath(); px.arc(3.5, 3.5, 1.1, 0, Math.PI * 2); px.fill();
  dotPattern = ctx.createPattern(p, "repeat");
  return dotPattern;
}

function getGrainTile() {
  if (grainTile) return grainTile;
  const p = document.createElement("canvas");
  p.width = 128; p.height = 128;
  const px = p.getContext("2d");
  const img = px.createImageData(128, 128);
  const rnd = lcg(777);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  px.putImageData(img, 0, 0);
  grainTile = p;
  return grainTile;
}

/* ------------------------------------------------------------------ */
/* Title block                                                         */
/* ------------------------------------------------------------------ */
function fitFont(ctx, text, maxWidth, startPx, family, weight) {
  let px = startPx;
  ctx.font = `${weight} ${px}px ${family}`;
  while (px > 12 && ctx.measureText(text).width > maxWidth) {
    px -= 4;
    ctx.font = `${weight} ${px}px ${family}`;
  }
  return px;
}

function titleGradient(ctx, x0, y0, x1, y1, style) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  if (style === "white") { g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#e8e0f0"); }
  else if (style === "neon") { g.addColorStop(0, "#ff2e88"); g.addColorStop(0.55, "#ff7ad0"); g.addColorStop(1, "#2de2c5"); }
  else if (style === "gold") { g.addColorStop(0, "#fff3b0"); g.addColorStop(0.5, "#ffc93d"); g.addColorStop(1, "#ff8a3d"); }
  else { g.addColorStop(0, "#ffd76a"); g.addColorStop(0.45, "#ff8a3d"); g.addColorStop(1, "#ff2e88"); }
  return g;
}

function drawTitleBlock(ctx, W, H) {
  const bandH = H * 0.24;
  const bandY = H - bandH;
  // scrim
  const scrim = ctx.createLinearGradient(0, bandY - H * 0.1, 0, H);
  scrim.addColorStop(0, "rgba(10,4,18,0)");
  scrim.addColorStop(0.45, "rgba(10,4,18,.72)");
  scrim.addColorStop(1, "rgba(10,4,18,.94)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, bandY - H * 0.1, W, bandH + H * 0.1);

  // badge — sunburst disc as a sticker in the cover's top-right corner,
  // clear of the title so long titles never collide with it
  const badgeR = Math.min(W, H) * 0.052;
  const bx = W - badgeR * 1.7, by = badgeR * 1.7;
  ctx.save();
  ctx.translate(bx, by);
  ctx.fillStyle = "#ff2e88";
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.beginPath();
    ctx.moveTo(0, -badgeR * 1.45);
    ctx.lineTo(badgeR * 0.16, -badgeR * 0.95);
    ctx.lineTo(-badgeR * 0.16, -badgeR * 0.95);
    ctx.closePath(); ctx.fill();
  }
  ctx.rotate(0);
  ctx.beginPath(); ctx.arc(0, 0, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = "#ffc93d"; ctx.fill();
  ctx.lineWidth = Math.max(2, badgeR * 0.08);
  ctx.strokeStyle = "#fff"; ctx.stroke();
  ctx.fillStyle = "#160a20";
  ctx.font = `900 ${badgeR * 0.95}px Impact, "Arial Narrow", sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(state.badge || "VI", 0, badgeR * 0.06);
  ctx.restore();

  // title
  const cx = W / 2;
  const title = (state.title || "LEONIDA").toUpperCase();
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  const maxW = W * 0.86;
  const px = fitFont(ctx, title, maxW, H * 0.115, 'Impact, "Arial Narrow", sans-serif', 900);
  const titleY = bandY + bandH * 0.52;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, px * 0.09);
  ctx.strokeStyle = "rgba(10,4,18,.95)";
  ctx.strokeText(title, cx, titleY);
  ctx.fillStyle = titleGradient(ctx, cx - maxW / 2, titleY - px, cx + maxW / 2, titleY, state.titleStyle);
  ctx.fillText(title, cx, titleY);

  // subtitle — letterspaced caps under the title
  const sub = (state.subtitle || "").toUpperCase();
  if (sub) {
    const subPx = Math.max(12, H * 0.028);
    ctx.font = `700 ${subPx}px "Segoe UI", sans-serif`;
    const spaced = sub.split("").join("  ");
    const sw = ctx.measureText(spaced).width;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(spaced, cx, titleY + subPx * 1.7);
    // rules either side
    const ruleY = titleY + subPx * 1.55;
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    ctx.lineWidth = Math.max(1.5, H * 0.002);
    const gap = sw / 2 + W * 0.03;
    ctx.beginPath(); ctx.moveTo(W * 0.07, ruleY); ctx.lineTo(cx - gap, ruleY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + gap, ruleY); ctx.lineTo(W * 0.93, ruleY); ctx.stroke();
  }

  // tagline at the very bottom
  const tag = (state.tagline || "").toUpperCase();
  if (tag) {
    const tagPx = Math.max(10, H * 0.02);
    ctx.font = `700 ${tagPx}px "Segoe UI", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.fillText(tag, cx, H - H * 0.028);
  }
}

/* ------------------------------------------------------------------ */
/* Main render                                                         */
/* ------------------------------------------------------------------ */
function render(target, W, H) {
  const ctx = target.getContext("2d", { willReadFrequently: true });
  target.width = W; target.height = H;
  ctx.fillStyle = "#0a0412";
  ctx.fillRect(0, 0, W, H);

  const rects = layoutRects(state.layout);
  const gutter = state.panelBorders ? Math.max(3, Math.round(Math.min(W, H) * 0.008)) : 0;

  // white gutters behind panels
  if (state.panelBorders) {
    ctx.fillStyle = "#f5eefb";
    ctx.fillRect(0, 0, W, H);
  }

  rects.forEach((f, i) => {
    const rx = f[0] * W + (i === 0 ? 0 : gutter / 2);
    const ry = f[1] * H + (i === 0 ? 0 : gutter / 2);
    const rw = f[2] * W - gutter;
    const rh = f[3] * H - gutter;
    const panel = state.panels[i];
    const photo = panel.photo >= 0 ? state.photos[panel.photo] : null;
    ctx.save();
    ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
    if (photo) drawPhotoInto(ctx, photo.img, [rx, ry, rw, rh], panel);
    else drawPlaceholder(ctx, [rx, ry, rw, rh], "PANEL " + (i + 1));
    // active panel marker (preview only, not on export)
    ctx.restore();
    if (state.panelBorders) {
      ctx.strokeStyle = "rgba(10,4,18,.9)";
      ctx.lineWidth = Math.max(2, gutter * 0.45);
      ctx.strokeRect(rx, ry, rw, rh);
    }
  });

  if (state.printDots) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = getDotPattern(ctx);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (state.grain) {
    ctx.save();
    ctx.globalAlpha = 0.05;
    const pat = ctx.createPattern(getGrainTile(), "repeat");
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  drawTitleBlock(ctx, W, H);
  return target;
}

function renderPreview() {
  const [w, h] = state.size.split("x").map(Number);
  const q = 0.5; // preview at half res for speed
  render(stage, Math.round(w * q), Math.round(h * q));
  const label = { "1080x1080": "Square post", "1080x1350": "Portrait post", "1920x1080": "Landscape post", "1080x1920": "Story" }[state.size];
  $("size-label").textContent = `${state.size.replace("x", " × ")} · ${label}`;
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */
function exportPNG() {
  const [w, h] = state.size.split("x").map(Number);
  const off = document.createElement("canvas");
  render(off, w, h);
  setStatus(`Rendering ${w}×${h} PNG…`);
  off.toBlob((blob) => {
    if (!blob) { setStatus("Export failed — browser could not encode the PNG."); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leonida-cover-${w}x${h}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus(`Exported leonida-cover-${w}x${h}.png (${(blob.size / 1024).toFixed(0)} KB). Share it anywhere.`);
  }, "image/png");
}

function setStatus(msg) { $("status").textContent = msg; }

/* ------------------------------------------------------------------ */
/* Photos: upload / sample / thumbs                                    */
/* ------------------------------------------------------------------ */
function addPhoto(img, name) {
  state.photos.push({ img, name });
  // auto-assign to the first panel without a photo (hero first)
  for (let i = 0; i < state.panels.length; i++) {
    if (state.panels[i].photo === -1) {
      state.panels[i].photo = state.photos.length - 1;
      break;
    }
  }
  if (state.photos.length === 1) state.activePanel = 0;
  syncPanelControls();
  renderThumbs();
  renderPreview();
}

function loadFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith("image/"));
  if (!list.length) { setStatus("That file is not an image — try a JPG or PNG photo."); return; }
  let loaded = 0;
  list.slice(0, 4 - state.photos.length || 4).forEach((file) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      addPhoto(img, file.name);
      loaded++;
      if (loaded === list.length) setStatus(`${state.photos.length} photo(s) loaded. Pick a layout, grade and caption, then export.`);
    };
    img.onerror = () => setStatus(`Could not read ${file.name}.`);
    img.src = url;
  });
  if (state.photos.length >= 4) setStatus("4 photos max — remove one to add another.");
}

function loadSamplePhoto() {
  const sample = makeSamplePhoto(1200, 900);
  addPhoto(sample, "sample-vice-city.png");
  setStatus("Sample photo loaded — a Vice City street at sunset. Replace it with your own photo any time.");
}

function thumbURL(p) {
  // Cache a small data-URL thumb: uploaded photos use blob: URLs that
  // are revoked after load, so the thumb must not reuse the blob URL.
  if (p.thumb) return p.thumb;
  const c = document.createElement("canvas");
  const s = 128;
  c.width = s; c.height = s;
  const x = c.getContext("2d");
  const iw = p.img.width, ih = p.img.height;
  const sc = Math.max(s / iw, s / ih);
  const dw = iw * sc, dh = ih * sc;
  x.drawImage(p.img, (s - dw) / 2, (s - dh) / 2, dw, dh);
  p.thumb = c.toDataURL("image/png");
  return p.thumb;
}

function renderThumbs() {
  const box = $("thumbs");
  box.innerHTML = "";
  state.photos.forEach((p, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "thumb" + (state.panels[state.activePanel].photo === idx ? " active" : "");
    b.title = p.name + " — click to put in the active panel";
    const im = document.createElement("img");
    im.src = thumbURL(p);
    im.alt = p.name;
    b.appendChild(im);
    const x = document.createElement("span");
    x.className = "x";
    x.textContent = "×";
    x.title = "Remove photo";
    x.addEventListener("click", (ev) => {
      ev.stopPropagation();
      removePhoto(idx);
    });
    b.appendChild(x);
    b.addEventListener("click", () => {
      state.panels[state.activePanel].photo = idx;
      renderThumbs();
      renderPreview();
    });
    box.appendChild(b);
  });
}

function removePhoto(idx) {
  state.photos.splice(idx, 1);
  state.panels.forEach((p) => {
    if (p.photo === idx) p.photo = -1;
    else if (p.photo > idx) p.photo--;
  });
  renderThumbs();
  renderPreview();
}

/* ------------------------------------------------------------------ */
/* Controls wiring                                                     */
/* ------------------------------------------------------------------ */
function syncPanelControls() {
  const p = state.panels[state.activePanel];
  $("active-panel").value = String(state.activePanel);
  $("zoom").value = p.zoom; $("zoom-val").textContent = p.zoom + "%";
  $("panx").value = p.panX; $("panx-val").textContent = p.panX;
  $("pany").value = p.panY; $("pany-val").textContent = p.panY;
}

function bindSeg(id, key) {
  $(id).addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-" + key + "]");
    if (!b) return;
    [...$(id).querySelectorAll("button")].forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    if (key === "layout") state.layout = b.dataset.layout;
    if (key === "grade") state.grade = b.dataset.grade;
    if (key === "size") state.size = b.dataset.size;
    renderPreview();
  });
}

let raf = 0;
function scheduleRender() {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; renderPreview(); });
}

function init() {
  $("file-input").addEventListener("change", (ev) => {
    loadFiles(ev.target.files);
    ev.target.value = "";
  });
  $("btn-sample").addEventListener("click", loadSamplePhoto);
  $("btn-export").addEventListener("click", exportPNG);
  $("btn-export-2").addEventListener("click", exportPNG);
  $("btn-clear-photos").addEventListener("click", () => {
    state.photos = [];
    state.panels.forEach((p) => { p.photo = -1; });
    renderThumbs();
    renderPreview();
    setStatus("Photos cleared.");
  });
  $("btn-flip").addEventListener("click", () => {
    const p = state.panels[state.activePanel];
    p.flip = !p.flip;
    renderPreview();
  });
  $("btn-fit").addEventListener("click", () => {
    const p = state.panels[state.activePanel];
    p.fit = !p.fit;
    if (p.fit) { p.zoom = 100; p.panX = 0; p.panY = 0; syncPanelControls(); }
    renderPreview();
  });

  $("active-panel").addEventListener("change", (ev) => {
    state.activePanel = Number(ev.target.value);
    syncPanelControls();
    renderThumbs();
  });
  $("zoom").addEventListener("input", (ev) => {
    state.panels[state.activePanel].zoom = Number(ev.target.value);
    $("zoom-val").textContent = ev.target.value + "%";
    scheduleRender();
  });
  $("panx").addEventListener("input", (ev) => {
    state.panels[state.activePanel].panX = Number(ev.target.value);
    $("panx-val").textContent = ev.target.value;
    scheduleRender();
  });
  $("pany").addEventListener("input", (ev) => {
    state.panels[state.activePanel].panY = Number(ev.target.value);
    $("pany-val").textContent = ev.target.value;
    scheduleRender();
  });
  $("posterize").addEventListener("input", (ev) => {
    state.posterize = Number(ev.target.value);
    $("posterize-val").textContent = ev.target.value + " levels";
    scheduleRender();
  });
  $("print-dots").addEventListener("change", (ev) => { state.printDots = ev.target.checked; renderPreview(); });
  $("grain").addEventListener("change", (ev) => { state.grain = ev.target.checked; renderPreview(); });
  $("panel-borders").addEventListener("change", (ev) => { state.panelBorders = ev.target.checked; renderPreview(); });

  $("title").addEventListener("input", (ev) => { state.title = ev.target.value; scheduleRender(); });
  $("subtitle").addEventListener("input", (ev) => { state.subtitle = ev.target.value; scheduleRender(); });
  $("tagline").addEventListener("input", (ev) => { state.tagline = ev.target.value; scheduleRender(); });
  $("badge").addEventListener("input", (ev) => { state.badge = ev.target.value; scheduleRender(); });
  $("title-color").addEventListener("change", (ev) => { state.titleStyle = ev.target.value; renderPreview(); });

  bindSeg("layout-seg", "layout");
  bindSeg("grade-seg", "grade");
  bindSeg("size-seg", "size");

  $("preview-zoom").addEventListener("input", (ev) => {
    stage.style.width = ev.target.value + "%";
  });

  // drag & drop anywhere on the page
  let dragDepth = 0;
  window.addEventListener("dragenter", (ev) => { ev.preventDefault(); dragDepth++; document.body.classList.add("dragging"); });
  window.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove("dragging"); });
  window.addEventListener("dragover", (ev) => ev.preventDefault());
  window.addEventListener("drop", (ev) => {
    ev.preventDefault();
    dragDepth = 0;
    document.body.classList.remove("dragging");
    if (ev.dataTransfer.files.length) loadFiles(ev.dataTransfer.files);
  });

  // click a panel in the preview to select it
  stage.addEventListener("click", (ev) => {
    const r = stage.getBoundingClientRect();
    const fx = (ev.clientX - r.left) / r.width;
    const fy = (ev.clientY - r.top) / r.height;
    const rects = layoutRects(state.layout);
    for (let i = 0; i < rects.length; i++) {
      const [x, y, w, h] = rects[i];
      if (fx >= x && fx <= x + w && fy >= y && fy <= y + h) {
        state.activePanel = i;
        syncPanelControls();
        renderThumbs();
        break;
      }
    }
  });

  // arrow keys nudge the active panel
  window.addEventListener("keydown", (ev) => {
    if (ev.target.matches("input, select, textarea")) return;
    const p = state.panels[state.activePanel];
    const step = ev.shiftKey ? 10 : 2;
    if (ev.key === "ArrowLeft") { p.panX = Math.max(-100, p.panX - step); syncPanelControls(); scheduleRender(); ev.preventDefault(); }
    if (ev.key === "ArrowRight") { p.panX = Math.min(100, p.panX + step); syncPanelControls(); scheduleRender(); ev.preventDefault(); }
    if (ev.key === "ArrowUp") { p.panY = Math.max(-100, p.panY - step); syncPanelControls(); scheduleRender(); ev.preventDefault(); }
    if (ev.key === "ArrowDown") { p.panY = Math.min(100, p.panY + step); syncPanelControls(); scheduleRender(); ev.preventDefault(); }
  });

  // automation hook (used by the project's own screenshot script)
  window.__coverStudio = { state, render, renderPreview, exportPNG, loadSamplePhoto, makeSamplePhoto };

  renderPreview();
}

init();
