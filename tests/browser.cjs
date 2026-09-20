// Integration evidence: immediate updates, stable strokes, pencil wiggle and diagnostics.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 700, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(
      pathToFileURL(path.join(__dirname, "../demos/index.html")).href,
    );
    const report = await page.evaluate(() => {
      const root = document.getElementById("fractal-hatching");
      const demo = root.fractalDemo,
        gl = demo.gl;
      const c = (name) => root.querySelector("[data-control=" + name + "]");
      const read = () => gl.canvas.toDataURL();
      let now = performance.now() + 200;
      Object.defineProperty(performance, "now", {
        configurable: true,
        value: () => now,
      });
      const commit = (values) => {
        for (const [name, value] of Object.entries(values))
          c(name).value = String(value);
        now += 110;
        demo.draw();
      };
      try {
        c("traffic").checked = false;
        const defaultPencilFit =
          +c("outline").value === 2 && !c("jitter").disabled;
        const initial = read(),
          seed = demo.getFrameSeed();
        c("zoom").value = ".4";
        demo.draw();
        const settled = read(),
          settledSeed = demo.getFrameSeed();
        c("zoom").value = ".6";
        now += 1;
        demo.draw();
        const immediateZoomRedraw =
          read() !== settled && demo.getFrameSeed() === settledSeed;
        const zoomSeed = demo.getFrameSeed();
        commit({ light: 0.7 });
        now += 110;
        demo.setCamera(0.8, 0.55);
        const motionPreservesSeed = demo.getFrameSeed() === zoomSeed;
        // A fixed texture comparison has no drawing-seed input: only outlines vary.
        const renderer = demo.cityRenderer;
        const state = { ...demo.getState(), method: 2, outline: 2 };
        renderer.draw(state, gl.canvas.width, gl.canvas.height, 4);
        const pencilA = read();
        renderer.draw(state, gl.canvas.width, gl.canvas.height, 5);
        const pencilB = read();
        renderer.draw(state, gl.canvas.width, gl.canvas.height, 5);
        const pencilRepeat = read();
        state.outline = 1;
        renderer.draw(state, gl.canvas.width, gl.canvas.height, 4);
        const stableA = read();
        renderer.draw(state, gl.canvas.width, gl.canvas.height, 5);
        const stableB = read();
        const fitCount = renderer.stats.fitUpdates;
        commit({ view: 2, light: 0.2 });
        const lightA = read(),
          shadowCount = renderer.stats.shadowUpdates;
        commit({ light: 0.8 });
        const lightB = read();
        const lightOnlySkipsShadows =
          renderer.stats.shadowUpdates === shadowCount;
        commit({ view: 1 });
        const raw = read();
        const rawUpdatesShadows =
          renderer.stats.shadowUpdates === shadowCount + 1;
        commit({ method: 1, outline: 2, jitter: 1.2, hatchStartBrightness: .6, fullHatchBrightness: .2 });
        const rawIgnoresStyle =
          raw === read() && renderer.stats.fitUpdates === fitCount;
        const rangeDisabledInRaw = c("hatchStartBrightness").disabled && c("fullHatchBrightness").disabled;
        commit({ hatchStartBrightness: 1, fullHatchBrightness: 0 });

        // Exercise real input events: changing either endpoint keeps the range ordered.
        c("hatchStartBrightness").value = ".4";
        c("hatchStartBrightness").dispatchEvent(new Event("input", { bubbles: true }));
        c("fullHatchBrightness").value = ".6";
        c("fullHatchBrightness").dispatchEvent(new Event("input", { bubbles: true }));
        const startFollowsFull = +c("hatchStartBrightness").value === .6;
        c("hatchStartBrightness").value = ".3";
        c("hatchStartBrightness").dispatchEvent(new Event("input", { bubbles: true }));
        const fullFollowsStart = +c("fullHatchBrightness").value === .3;
        commit({ scene: 1, view: 0, method: 0, light: .3, hatchStartBrightness: 1, fullHatchBrightness: 0 });
        const hatchedFlat = read(), thresholdSeed = demo.getFrameSeed();
        commit({ hatchStartBrightness: .6 }); // The flat input is 70% bright.
        const clearFlat = read();
        commit({ light: 0 });
        const thresholdClearsFlat = clearFlat === read() && clearFlat !== hatchedFlat;
        const thresholdPreservesSeed = demo.getFrameSeed() === thresholdSeed;
        commit({ hatchStartBrightness: 1, fullHatchBrightness: 0, light: .8 });
        const studies = [];
        for (const scene of [0, 1, 2, 3, 4]) {
          commit({
            scene,
            method: 0,
            view: 0,
            zoom: 0,
            outline: 2,
            quality: 1,
          });
          const pixels = new Uint8Array(gl.canvas.width * gl.canvas.height * 4);
          gl.readPixels(
            0,
            0,
            gl.canvas.width,
            gl.canvas.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels,
          );
          let min = 255,
            max = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            min = Math.min(min, pixels[i]);
            max = Math.max(max, pixels[i]);
          }
          studies.push({ scene, contrast: max - min, error: gl.getError() });
        }
        commit({ scene: 3, quality: 0 });
        return {
          defaultPencilFit,
          immediateZoomRedraw,
          motionPreservesSeed,
          pencilWiggles: pencilA !== pencilB,
          pencilRepeats: pencilB === pencilRepeat,
          stableIgnoresSeed: stableA === stableB,
          lightChangesImage: lightA !== lightB,
          lightOnlySkipsShadows,
          rawUpdatesShadows,
          rawIgnoresStyle,
          rangeDisabledInRaw,
          startFollowsFull,
          fullFollowsStart,
          thresholdClearsFlat,
          thresholdPreservesSeed,
          studies,
          referenceError: gl.getError(),
          initialRendered: initial !== settled && settledSeed === seed,
        };
      } finally {
        delete performance.now;
      }
    });
    for (const [key, value] of Object.entries(report))
      if (typeof value === "boolean") assert(value, key);
    assert.equal(report.referenceError, 0);
    for (const study of report.studies) {
      assert(study.contrast > 50);
      assert.equal(study.error, 0);
    }
    await page.setViewportSize({ width: 360, height: 1100 });
    await page.locator("details.advanced").evaluate(e => e.open = true);
    await page.waitForTimeout(250);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    // Named entries resolve to the intended study, including the seed-free outline view.
    for (const [name, scene, outline] of [
      ["outlines", 3, 3],
      ["traffic", 4, 2],
      ["sculpture", 0, 2],
    ]) {
      await page.goto(
        pathToFileURL(path.join(__dirname, "../demos/index.html")).href +
          "?study=" +
          name,
      );
      const state = await page.evaluate(() =>
        document.getElementById("fractal-hatching").fractalDemo.getState(),
      );
      assert.equal(state.scene, scene);
      assert.equal(state.outline, outline);
    }
    await page.goto(
      pathToFileURL(path.join(__dirname, "../demos/gallery.html")).href,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.equal(await page.locator("article").count(), 4);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
