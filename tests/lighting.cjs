// GPU checks for the shared surface tone and the real city ground rendering path.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname, '../demos/index.html')).href);
    const report = await page.evaluate(() => {
      const root = document.getElementById('fractal-hatching'), demo = root.fractalDemo, gl = demo.gl;
      const source = ['[data-pencil-core]', '[data-edge-fragment]', '[data-composite-fragment]']
        .map(s => root.querySelector(s).textContent.trim());
      // Keep all geometry, batching and tone evaluation; display tone instead of ink.
      // A ground-only fixture has no cast-shadow bounds to hide missed shading.
      const original = CITY_SHADERS.fill;
      const insertion = 'float tone = cityPencilTone(worldNormal, sunVisibility, materialId);';
      if (!original.includes(insertion)) throw Error('Missing diagnostic insertion point');
      CITY_SHADERS.fill = original.replace(insertion, insertion +
        '\ncolor=vec4(vec3(tone),1);meta=vec4(worldNormal*.5+.5,materialId*.25);return;');
      const ground = buildPencilCityGeometry(false).slice(0, 42);
      const state = { ...demo.getState(), view: 0, outline: 0, trafficTime: 0, zoom: -.3 };
      const samples = [];
      try {
        for (const light of [[.8,.95,.1], [.8,.5,.1], [.8,0,.1], [.8,-.95,.1], [.2,1,0]]) {
          const factory = createPencilCity.toString();
          const expression = 'light = norm([Math.cos(angle) * 0.8, 0.95, Math.sin(angle) * 0.8]);';
          if (!factory.includes(expression)) throw Error('Missing fixture light override');
          const renderer = eval('(' + factory.replace(expression, `light = norm(${JSON.stringify(light)});`) + ')')
            (gl, ...source, false, ground);
          for (const [full, start] of [[0,1], [.2,.8], [0,.6], [.8,.9], [.5,.5], [0,0], [1,1]])
          for (const quality of [0,1]) {
            renderer.draw({ ...state, quality, fullHatchBrightness: full, hatchStartBrightness: start },
              gl.canvas.width, gl.canvas.height, 0);
            const width=gl.canvas.width, height=gl.canvas.height;
            const pixels=new Uint8Array(width*height*4);
            gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
            const illumination=Math.max(0,light[1]/Math.hypot(...light));
            // Independent brightness-domain reference, including exact endpoints.
            const dark=start===full ? Number(illumination<start)
              : Math.max(0,Math.min(1,(start-illumination)/(start-full)));
            const expected=255*dark*(.38+.48*dark);
            // Samples span the clear ground, away from the city footprint.
            for (const fx of [.15,.35,.5,.65,.85]) {
              const actual=pixels[(Math.floor(height*.4)*width+Math.floor(width*fx))*4];
              samples.push({ light, quality, full, start, expected, actual });
            }
          }
        }
      } finally { CITY_SHADERS.fill=original; }
      return { samples, glError: gl.getError() };
    });
    assert.deepEqual(errors, []);
    assert.equal(report.glError, 0);
    for (const sample of report.samples)
      assert(Math.abs(sample.actual-sample.expected)<=2, JSON.stringify(sample));
    console.log(JSON.stringify({ surfaceIlluminationSamples: report.samples.length, failures: 0 }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
