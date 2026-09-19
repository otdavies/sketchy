// Reproducible, real shader images for the gallery and README.
const { chromium } = require("playwright");
const fs = require("node:fs");
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
    viewport: { width: 1020, height: 1250 },
  });
  try {
    for (const name of ["city", "sculpture", "outlines", "traffic"]) {
      await page.goto(
        pathToFileURL(path.join(__dirname, "../demos/studio.html")).href +
          "?study=" +
          name,
      );
      const png = await page.evaluate((name) => {
        const root = document.getElementById("fractal-hatching"),
          demo = root.fractalDemo;
        const c = (key) => root.querySelector("[data-control=" + key + "]");
        c("hold").checked = false;
        c("traffic").checked = false;
        c("quality").value = 0;
        c("zoom").value =
          name === "sculpture" ? -0.45 : 0.1;
        demo.setCamera(
          name === "sculpture" ? 0.34 : 0.68,
          name === "sculpture" ? 0.25 : 0.52,
        );
        if (demo.getHeld().scene >= 3)
          demo.cityRenderer.draw(
            { ...demo.getHeld(), trafficTime: 0 },
            demo.gl.canvas.width,
            demo.gl.canvas.height,
            1,
          );
        if (demo.gl.getError()) throw Error("WebGL capture failed");
        return demo.gl.canvas.toDataURL();
      }, name);
      fs.writeFileSync(
        path.join(__dirname, "../docs/images/" + name + ".png"),
        Buffer.from(png.split(",")[1], "base64"),
      );
    }
  } finally {
    await browser.close();
  }
  console.log("Captured four shader studies.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
