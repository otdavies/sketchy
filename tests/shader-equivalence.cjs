// Compare two self-contained demo builds on the same browser/GPU. Pass the old
// HTML as argv[2]; argv[3] defaults to the current demos/index.html.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
(async () => {
  assert(process.argv[2], 'Usage: node tests/shader-equivalence.cjs BEFORE.html [AFTER.html]');
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const captures = [];
  try {
    for (const file of [process.argv[2], process.argv[3] || path.join(__dirname, '../demos/index.html')]) {
      const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(pathToFileURL(path.resolve(file)).href);
      const images = await page.evaluate(() => {
        const root = document.getElementById('fractal-hatching'), demo = root.fractalDemo;
        const control = name => root.querySelector(`[data-control=${name}]`);
        control('hold').checked = false;
        control('traffic').checked = false;
        const images = [];
        function capture(name) { images.push([name, demo.gl.canvas.toDataURL()]); }
        for (const scene of [0, 1, 2, 3, 4]) for (const method of [0, 1, 2]) {
          control('scene').value = scene;
          control('method').value = method;
          control('zoom').value = scene === 0 ? -.45 : .35;
          demo.draw();
          capture(`scene-${scene}-method-${method}`);
        }
        const renderer = demo.cityRenderer;
        const base = { ...demo.getHeld(), scene: 4, method: 0, trafficTime: 1.7 };
        for (const quality of [0, 1]) for (const outline of [0, 1, 2, 3]) {
          renderer.draw({ ...base, quality, outline }, demo.gl.canvas.width, demo.gl.canvas.height, 7);
          capture(`orbit-quality-${quality}-outline-${outline}`);
        }
        for (const view of [0, 1, 2]) for (const light of [.03, .38, .72]) {
          renderer.draw({ ...base, view, light, walkPose: { eye: [.26, .52, 3.05], yaw: .22, pitch: .1 } },
            demo.gl.canvas.width, demo.gl.canvas.height, 11);
          capture(`walk-view-${view}-light-${light}`);
        }
        if (demo.gl.getError()) throw Error('WebGL error during comparison');
        return images;
      });
      assert.deepEqual(errors, []);
      captures.push(images.map(([name, png]) => [name, createHash('sha256').update(png).digest('hex')]));
      await page.close();
    }
    assert.deepEqual(captures[1], captures[0], 'Shader output changed');
    console.log(`All ${captures[0].length} renders are byte-identical to the baseline.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
