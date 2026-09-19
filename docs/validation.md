# Tests and builds

The demo runs in WebGL2. Tests use Chromium with SwiftShader. They do not establish performance or correctness on a physical phone, and the HLSL translations have not been tested in Unity.

## Build and test locally

Python 3.10+ builds the self-contained demo without extra packages. Node 20+ and Playwright run the browser tests.

```sh
python scripts/build.py
python scripts/build.py --check
python tests/invariants.py
npm ci
npx playwright install chromium
npm test
npm run test:shadows
```

On Linux, use `npx playwright install --with-deps chromium` if browser system dependencies are missing. To use an existing browser, set `BROWSER_EXECUTABLE_PATH`. In PowerShell:

```powershell
$env:BROWSER_EXECUTABLE_PATH = 'C:\path\to\chrome.exe'
```

| Test | Checks |
|---|---|
| `scripts/build.py --check` | Generated demo matches its sources |
| `tests/invariants.py` | Stroke IDs, nested centers, engraving continuity and approved shader hashes |
| `tests/browser.cjs` | Scene rendering, outline wiggle, held frames, seed stability, diagnostic views and mobile layout |
| `tests/walking.cjs` | Movement, wall collisions, input release, mode switching, mobile controls and held stroke identity |
| `tests/perspective.cjs` | Perspective visibility against CPU rays, false outlines on flat faces and ground clipping against an unclipped reference |
| `tests/shadows.cjs` | Rendered visibility against a CPU ray/box test across light, camera and zoom changes |

The shadow test runs 384 views with float32 depth storage, then repeats with actual depth16 storage. Each run checks 5,616 lit-face samples, 2,160 reverse-face samples, 39,636 clear-ground samples, 2,232 shadowed-ground samples and 30,288 distant-ground samples at the original fixture viewport. Counts vary with the viewport layout. Pixels that cross silhouettes are excluded. Both original runs passed without failures. Set `SHADOW_REPORT` to retain the JSON output.

The hash checks protect the approved hatching kernels. A deliberate shader change still needs visual review; updating the hash alone is not validation.

## GitHub Pages

The [Pages workflow](../.github/workflows/pages.yml) builds the site on each push to `main`. Repository Settings → Pages must use **GitHub Actions** as the source. The published entry point opens the interactive demo directly.

To inspect the same files locally:

```sh
python scripts/build.py --site _site
python -m http.server 8000 --directory _site
```

Open `http://localhost:8000`. `demos/index.html` also works as a local file.

## Visual review

Check lit faces, deep shadows, flat-surface zoom transitions, curved chart blends and contour corners. Rotate the camera and light in both cities. Walk between buildings, look toward the horizon, and compare Raw shadows with pencil shading. Stable fit removes intentional outline wiggle; Raw shadows helps distinguish a lighting error from a pencil mark.

`npm run capture` recreates the four example PNGs at fixed camera, light and traffic states. They are actual shader captures, not cross-GPU reference images.

Known limits include finite precision and octave range, approximate tone/filtering, contour jumps at descriptor changes, and fixed-height walking with static collision. Cars still move through a world-space hatch field. See [rendering](pipeline.md) and the [Unity plan](unity-srp.md) for the work these imply.
