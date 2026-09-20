# Reference City

`City.json` is exported directly from `src/web/city-geometry.js` by `node scripts/export-unity-city.cjs`. It contains the visible and shadow-casting triangle streams. No downloaded model assets are required.

Use **Tools > Sketchy > Installer > Create Reference City Scene** to generate native Unity meshes, materials, lights and a camera. This also works without importing the sample through Package Manager. Repeated creation uses a new folder and preserves existing scenes and materials.
