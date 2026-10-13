// Original procedural character animation: no image filter or raster background.
import { createRoom } from "./room-art.js";
// Nothing leaves the browser. All coordinates refer to the 800 × 500 scene.
const W = 800, H = 500;
const canvas = document.querySelector('#room');
const output = canvas.getContext('2d');
const scene = document.createElement('canvas');
scene.width = W; scene.height = H;
const ctx = scene.getContext('2d', { willReadFrequently: true });
const artwork = createRoom();
let ready = true;
let seed = 2931;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function pixel(x, y, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), size, size);
}
const snow = Array.from({ length: 85 }, () => ({
  x: random() * 197, y: random() * 160,
  size: random() > .8 ? 2 : 1, speed: 4 + random() * 10, phase: random() * 6.28,
}));
function glow(x, y, radius, opacity) {
  const light = ctx.createRadialGradient(x, y, 0, x, y, radius);
  light.addColorStop(0, `rgba(255,157,49,${opacity})`);
  light.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = light;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
function render(t) {
  if (!ready) return;
  ctx.globalAlpha = 1;
  ctx.drawImage(artwork, 0, 0, W, H);
  // Four separate panes keep snowfall behind the timber frame and sill objects.
  ctx.save(); ctx.beginPath();
  ctx.rect(306, 48, 92, 72); ctx.rect(408, 48, 92, 72);
  ctx.rect(306, 130, 92, 72); ctx.rect(408, 130, 92, 59);
  ctx.clip();
  for (const s of snow) {
    ctx.globalAlpha = s.size === 2 ? .85 : .5;
    pixel(304 + (s.x + Math.sin(t * .35 + s.phase) * 4 + t * 1.2) % 197,
      46 + (s.y + t * s.speed) % 160, s.size, '#d8e7f1');
  }
  ctx.restore();
  // Short, irregular tongues rise out of the original glowing logs.
  ctx.save();
  ctx.beginPath(); ctx.rect(654, 296, 76, 57); ctx.clip();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 13; i++) {
    const phase = (t * (.45 + (i % 3) * .07) + i * .173) % 1;
    const x = 659 + i * 5 + Math.sin(t * 2 + i) * 2;
    const height = 9 + (i % 4) * 5;
    ctx.globalAlpha = Math.sin(phase * Math.PI) * .7;
    for (let j = 0; j < 6; j++) {
      pixel(x + Math.sin(phase * 7 + j * .5) * 2,
        344 - phase * height - j * 1.5, j < 2 ? 3 : 2,
        j < 2 ? '#ffe7a2' : '#ed9c36');
    }
  }
  for (let i = 0; i < 6; i++) {
    const phase = (t * .22 + i / 6) % 1;
    ctx.globalAlpha = (1 - phase) * .7;
    pixel(670 + i * 9 + Math.sin(phase * 9 + i) * 3, 344 - phase * 46, 1, '#ffd594');
  }
  ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  const flicker = .075 + .025 * Math.sin(t * 3.1) + .015 * Math.sin(t * 6.7);
  glow(692, 335, 65, flicker); glow(660, 394, 100, flicker * .45);
  // Candle locations: tabletop pair, tea light, stove lantern, and sill lantern.
  for (const [x, y] of [[480, 346], [506, 324], [676, 206]]) {
    glow(x, y, 12, .09 + .035 * Math.sin(t * 4 + x));
    ctx.globalAlpha = .45 + .2 * Math.sin(t * 5 + x);
    pixel(x, y - 2 + Math.round(Math.sin(t * 4 + x)), 1, '#fff4c0');
  }
  ctx.restore();
  // Tiny broken steam wisps drift upward from the two cups.
  for (const [x, y] of [[347, 360], [525, 376]]) {
    for (let i = 0; i < 5; i++) {
      const phase = (t * .16 + i / 5) % 1;
      ctx.globalAlpha = Math.sin(phase * Math.PI) * .22;
      for (let j = 0; j < 5; j++) {
        pixel(x + Math.sin(phase * 9 + j * .3) * 3, y - phase * 25 - j, 1, '#f9dfbf');
      }
    }
  }
  ctx.globalAlpha = 1;
  present();
}
let mode = 'ascii';
function present() {
  output.imageSmoothingEnabled = false;
  if (mode === 'pixel') { output.drawImage(scene, 0, 0, canvas.width, canvas.height); return; }
  const pixels = ctx.getImageData(0, 0, W, H).data;
  const cell = canvas.width / (W / 4);
  output.fillStyle = '#151219'; output.fillRect(0, 0, canvas.width, canvas.height);
  output.font = `${cell}px monospace`; output.textBaseline = 'top';
  const chars = ' ··:•+=*#';
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) {
    let r = 0, green = 0, b = 0;
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
      const i = ((y + dy) * W + x + dx) * 4;
      r += pixels[i]; green += pixels[i + 1]; b += pixels[i + 2];
    }
    r /= 16; green /= 16; b /= 16;
    const px = x / 4 * cell, py = y / 4 * cell;
    output.fillStyle = "#151219";
    output.fillRect(px, py, cell, cell);
    output.fillStyle = `rgb(${Math.min(255, r * 1.5 + 12)},${Math.min(255, green * 1.5 + 8)},${Math.min(255, b * 1.5 + 5)})`;
    output.fillText(chars[Math.min(8, Math.floor((r * .3 + green * .59 + b * .11) / 255 * 12))], px, py);
  }
}
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let playing = !reduced.matches, time = 0, last = 0, raf = 0;
const pause = document.querySelector('#pause');
function updatePause() { pause.textContent = playing ? '暂停动画' : '播放动画'; pause.setAttribute('aria-pressed', String(!playing)); }
function frame(now) {
  if (!playing || document.hidden) return;
  if (now - last >= 1000 / 15) { time += Math.min((now - last) / 1000, .1); last = now; render(time); }
  raf = requestAnimationFrame(frame);
}
function resume() { cancelAnimationFrame(raf); last = performance.now(); if (ready && playing && !document.hidden) raf = requestAnimationFrame(frame); }
pause.addEventListener('click', () => { playing = !playing; updatePause(); resume(); });
for (const value of ['ascii', 'pixel']) document.querySelector('#' + value).addEventListener('click', () => {
  mode = value;
  for (const name of ['ascii', 'pixel']) document.querySelector('#' + name).setAttribute('aria-pressed', String(name === value));
  render(time);
});
document.addEventListener('visibilitychange', resume);
reduced.addEventListener('change', event => { playing = !event.matches; updatePause(); resume(); });
updatePause();
try {
  render(0); canvas.dataset.ready = 'true'; resume();
} catch {
  document.querySelector('.caption p').textContent = '场景加载失败，请刷新页面重试。';
  for (const button of document.querySelectorAll('.controls button')) button.disabled = true;
}
