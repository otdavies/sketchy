// Independent geometric truth for a closed box and receiving ground. Exercises
// real shadow storage, hardware comparisons, camera motion, and wide views.
const { chromium } = require("playwright"),
  fs = require("fs"),
  path = require("path"),
  assert = require("assert"),
  { pathToFileURL } = require("url");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const reports = [];
  for (const depthBits of [32, 16]) {
    const page = await browser.newPage({
        viewport: { width: 568, height: 900 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (depthBits === 16)
      await page.addInitScript(() => {
        const original = WebGL2RenderingContext.prototype.texImage2D;
        WebGL2RenderingContext.prototype.texImage2D = function (...a) {
          if (a[2] === this.DEPTH_COMPONENT32F) {
            a[2] = this.DEPTH_COMPONENT16;
            a[7] = this.UNSIGNED_SHORT;
          }
          return original.apply(this, a);
        };
      });
    await page.goto(
      pathToFileURL(path.join(__dirname, "../demos/index.html")).href,
    );
    const report = await page.evaluate(() => {
      const root = document.getElementById("fractal-hatching"),
        d = root.fractalDemo,
        g = d.gl,
        w = g.drawingBufferWidth,
        h = g.drawingBufferHeight;
      const fixture = eval(
        "(" +
          buildPencilCityGeometry
            .toString()
            .replace(
              "  return vertices;",
              "vertices.length=42;box(0,.5,0,.5,.5,.5);return vertices;",
            ) +
          ")",
      )();
      const c = createPencilCity(
        g,
        ...[
          "[data-pencil-core]",
          "[data-edge-fragment]",
          "[data-composite-fragment]",
        ].map((s) => root.querySelector(s).textContent.trim()),
        false,
        fixture,
      );
      const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0),
        plus = (a, b, s = 1) => a.map((v, i) => v + s * b[i]);
      const hit = (o, v) => {
        let lo = 0,
          hi = 1e6;
        for (let i = 0; i < 3; i++) {
          const mn = i === 1 ? 0 : -0.5,
            mx = i === 1 ? 1 : 0.5;
          if (Math.abs(v[i]) < 1e-8) {
            if (o[i] < mn || o[i] > mx) return false;
          } else {
            const a = (mn - o[i]) / v[i],
              b = (mx - o[i]) / v[i];
            lo = Math.max(lo, Math.min(a, b));
            hi = Math.min(hi, Math.max(a, b));
          }
        }
        return hi > lo && hi > 1e-4;
      };
      const pixel = new Uint8Array(4),
        result = {
          views: 0,
          litFaces: 0,
          reverseFaces: 0,
          clearGround: 0,
          shadowGround: 0,
          farGround: 0,
          failures: [],
        };
      const faces = [];
      for (const side of [-1, 1])
        for (const v of [-0.2, 0, 0.2])
          for (const y of [0.3, 0.5, 0.7]) {
            faces.push(
              { p: [0.5 * side, y, v], n: [side, 0, 0] },
              { p: [v, y, 0.5 * side], n: [0, 0, side] },
            );
          }
      for (const x of [-0.2, 0, 0.2])
        for (const z of [-0.2, 0, 0.2])
          faces.push({ p: [x, 1, z], n: [0, 1, 0] });
      for (const zoom of [0, -2])
        for (const pitch of [0.3, 0.7])
          for (let j = 0; j < 8; j++)
            for (let k = 0; k < 12; k++) {
              const yaw = (j * Math.PI) / 4,
                angle = (k * Math.PI) / 6,
                L = [0.8 * Math.cos(angle), 0.95, 0.8 * Math.sin(angle)],
                camera = [
                  Math.sin(yaw) * Math.cos(pitch),
                  Math.sin(pitch),
                  Math.cos(yaw) * Math.cos(pitch),
                ];
              c.draw(
                {
                  ...d.getHeld(),
                  view: 1,
                  zoom,
                  yaw,
                  pitch,
                  light: k / 12,
                  outline: 0,
                },
                w,
                h,
                1,
              );
              result.views++;
              const vp = c.getBuffers().viewProjection,
                rate = 8.3 / Math.pow(2, zoom) / h,
                right = [Math.cos(yaw), 0, -Math.sin(yaw)],
                up = [
                  -Math.sin(yaw) * Math.sin(pitch),
                  Math.cos(pitch),
                  -Math.cos(yaw) * Math.sin(pitch),
                ];
              const locate = (o) => {
                const ndc = [0, 1].map(
                  (i) =>
                    vp[i] * o[0] +
                    vp[4 + i] * o[1] +
                    vp[8 + i] * o[2] +
                    vp[12 + i],
                );
                const sx = (ndc[0] * 0.5 + 0.5) * w,
                  sy = (ndc[1] * 0.5 + 0.5) * h;
                return { sx, sy, x: Math.floor(sx), y: Math.floor(sy) };
              };
              const inspect = (q, expected, kind) => {
                if (q.x < 1 || q.x >= w - 1 || q.y < 1 || q.y >= h - 1) return;
                g.readPixels(q.x, q.y, 1, 1, g.RGBA, g.UNSIGNED_BYTE, pixel);
                result[kind]++;
                if (
                  Math.abs(pixel[0] - expected) > 3 &&
                  result.failures.length < 40
                )
                  result.failures.push({
                    zoom,
                    pitch,
                    yaw,
                    light: k / 12,
                    kind,
                    expected,
                    actual: pixel[0],
                    x: q.x,
                    y: q.y,
                  });
              };
              for (const f of faces) {
                if (dot(f.n, camera) < 0.2 || Math.abs(dot(f.n, L)) < 0.08)
                  continue;
                inspect(
                  locate(f.p),
                  dot(f.n, L) > 0 ? 255 : 0,
                  dot(f.n, L) > 0 ? "litFaces" : "reverseFaces",
                );
              }
              // Clear and shadowed ground near the box; plus a wide grid far outside its
              // shadow and across the projected shadow-map boundaries.
              const ground = [];
              for (let x = -1.5; x <= 1.5; x += 0.25)
                for (let z = -1.5; z <= 1.5; z += 0.25)
                  if (Math.abs(x) > 0.6 || Math.abs(z) > 0.6)
                    ground.push([x, -0.01, z]);
              if (zoom === -2)
                for (let x = -18; x <= 18; x += 3)
                  for (let z = -18; z <= 18; z += 3)
                    if (Math.hypot(x, z) > 4) ground.push([x, -0.01, z]);
              const groundUp = plus(up, camera, -up[1] / camera[1]);
              for (const o of ground) {
                const q = locate(o);
                if (q.x < 1 || q.x >= w - 1 || q.y < 1 || q.y >= h - 1)
                  continue;
                const samples = [
                  [-0.5, -0.5],
                  [1.5, -0.5],
                  [-0.5, 1.5],
                  [1.5, 1.5],
                  [0.5, 0.5],
                ].map(([a, b]) =>
                  plus(
                    plus(o, right, (q.x + a - q.sx) * rate),
                    groundUp,
                    (q.y + b - q.sy) * rate,
                  ),
                );
                if (samples.some((p) => hit(p, camera))) continue;
                const blocked = samples.map((p) =>
                  hit(plus(p, [0, 1, 0], 0.001), L),
                );
                if (blocked.some((v) => v !== blocked[0])) continue;
                inspect(
                  q,
                  blocked[0] ? 0 : 255,
                  Math.hypot(o[0], o[2]) > 4
                    ? "farGround"
                    : blocked[0]
                      ? "shadowGround"
                      : "clearGround",
                );
              }
            }
      result.error = g.getError();
      return result;
    });
    reports.push({ depthBits, ...report, errors });
    await page.close();
  }
  if (process.env.SHADOW_REPORT)
    fs.writeFileSync(
      process.env.SHADOW_REPORT,
      JSON.stringify(reports, null, 2),
    );
  for (const r of reports) {
    assert.equal(r.failures.length, 0, JSON.stringify(r.failures.slice(0, 3)));
    assert.equal(r.error, 0);
    assert.deepEqual(r.errors, []);
    for (const k of ["litFaces", "reverseFaces", "shadowGround", "farGround"])
      assert(r[k] > 100);
  }
  console.log(JSON.stringify(reports));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
