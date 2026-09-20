// Independent ray/box truth for perspective shadows, plus flat-face outline and
// outline checks. No screenshot goldens or graphics-driver assumptions.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(pathToFileURL(path.join(__dirname, '../demos/index.html')).href);
    const report = await page.evaluate(() => {
      const root = document.getElementById('fractal-hatching'), d = root.fractalDemo, g = d.gl;
      const w = g.canvas.width, h = g.canvas.height;
      const source = ['[data-pencil-core]', '[data-edge-fragment]', '[data-composite-fragment]']
        .map(s => root.querySelector(s).textContent.trim());
      const fixture = eval('(' + buildPencilCityGeometry.toString().replace('  return vertices;',
        'vertices.length=42;box(0,.5,0,.5,.5,.5);return vertices;') + ')')();
      const renderer = createPencilCity(g, ...source, false, fixture);
      const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
      const add = (a, b, scale = 1) => a.map((x, i) => x + scale * b[i]);
      function boxHit(o, ray) {
        let lo = 0, hi = Infinity, normal = null;
        for (let i = 0; i < 3; i++) {
          const a = i === 1 ? 0 : -.5, b = i === 1 ? 1 : .5;
          if (Math.abs(ray[i]) < 1e-8) { if (o[i] < a || o[i] > b) return null; continue; }
          const ta = (a - o[i]) / ray[i], tb = (b - o[i]) / ray[i];
          if (Math.min(ta, tb) > lo) {
            lo = Math.min(ta, tb); normal = [0, 0, 0]; normal[i] = ta < tb ? -1 : 1;
          }
          hi = Math.min(hi, Math.max(ta, tb));
        }
        return hi > lo && lo > .00001 && normal ? { t: lo, n: normal } : null;
      }
      function hit(o, ray) {
        const box = boxHit(o, ray), ground = (-.01 - o[1]) / ray[1];
        if (box && (ground <= 0 || box.t < ground)) return { p: add(o, ray, box.t), n: box.n };
        if (ground > 0) return { p: add(o, ray, ground), n: [0, 1, 0] };
        return null;
      }
      const read = () => {
        const pixels = new Uint8Array(w * h * 4);
        g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, pixels);
        return pixels;
      };
      const result = { views: 0, visibilitySamples: 0, flatOutlineSamples: 0, falseEdges: 0, shadowFailures: [] };
      for (let view = 0; view < 12; view++) {
        const angle = view * Math.PI / 6, distance = view % 2 ? 1.1 : 3;
        const eye = [Math.sin(angle) * distance, .52, Math.cos(angle) * distance];
        const yaw = -angle, pitch = view % 3 === 0 ? -.32 : .10;
        const forward = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
        const right = [Math.cos(yaw), 0, Math.sin(yaw)];
        const up = [-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)];
        const pixelScale = 2 * Math.tan(Math.PI / 6) / h;
        const ray = (x, y) => add(add(forward, right, (x - w / 2) * pixelScale), up, (y - h / 2) * pixelScale);
        const state = { ...d.getState(), walkPose: { eye, yaw, pitch }, light: (view % 4) / 4, view: 1, outline: 1, quality: view % 2 };
        renderer.draw(state, w, h, 1);
        const raw = read(), samples = [];
        const a = state.light * Math.PI * 2, light = [.8 * Math.cos(a), .95, .8 * Math.sin(a)];
        for (let y = 5; y < h - 5; y += 9) for (let x = 5; x < w - 5; x += 9) {
          const hits = [[.5, .5], [-3, -3], [4, -3], [-3, 4], [4, 4]].map(([dx, dy]) => hit(eye, ray(x + dx, y + dy)));
          if (hits.some(p => !p || Math.hypot(p.p[0], p.p[2]) > 15)) continue;
          if (hits.some(p => dot(p.n, hits[0].n) < .999)) continue;
          samples.push([x, y]);
          const visibility = hits.map(p => dot(p.n, light) > 0 && !boxHit(add(p.p, p.n, .001), light));
          if (visibility.some(v => v !== visibility[0])) continue;
          const expected = visibility[0] ? 255 : 0, actual = raw[(y * w + x) * 4];
          result.visibilitySamples++;
          if (Math.abs(actual - expected) > 3 && result.shadowFailures.length < 10)
            result.shadowFailures.push({ view, x, y, expected, actual });
        }
        state.view = 0;
        renderer.draw(state, w, h, 1);
        g.bindFramebuffer(g.FRAMEBUFFER, renderer.getBuffers().edge);
        const seeds = read();
        for (const [x, y] of samples) {
          result.flatOutlineSamples++;
          if (seeds[(y * w + x) * 4 + 3]) result.falseEdges++;
        }
        result.views++;
      }
      result.glError = g.getError();
      return result;
    });
    console.log(JSON.stringify(report));
    assert(report.visibilitySamples > 1000);
    assert(report.flatOutlineSamples > 1000);
    assert.deepEqual(report.shadowFailures, []);
    assert.equal(report.falseEdges, 0);
    assert.equal(report.glError, 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
