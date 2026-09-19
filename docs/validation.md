# Validation

The browser demo is the executable reference. HLSL translations and Unity integration are not validated here. Tests use Chromium with SwiftShader; a passing software-renderer check does not establish correctness or performance on a physical phone.

## Run the focused checks

From the repository root:

```sh
python scripts/build.py --check
python tests/invariants.py
npm ci
npx playwright install chromium
npm test
npm run test:shadows
```

On Linux, Playwright may also need its documented system dependencies (`npx playwright install --with-deps chromium`). To use an existing Chromium, set `BROWSER_EXECUTABLE_PATH`; in PowerShell use `$env:BROWSER_EXECUTABLE_PATH = 'C:\path\to\chrome.exe'`. No environment variable is needed when using Playwright's installed browser.

| Check | What it establishes |
|---|---|
| `scripts/build.py --check` | The committed offline demo matches the editable sources |
| `tests/invariants.py` | Parent identity and lattice nesting across levels, analytic engraving continuity, approved core hashes |
| `tests/browser.cjs` | All five studies render; pencil wiggle changes with seed; held images repeat; light/orbit preserve seed; raw diagnostics bypass style; both sampling paths compile; named demo entries and mobile layout work |
| `tests/shadows.cjs` | Known lit/reverse faces and clear/shadowed/distant ground agree with an independent CPU ray/box oracle across light/camera/zoom changes |

The shadow oracle runs 384 views with float32 shadow storage and repeats them with **actual depth16 storage**. Each storage run checks 5,616 lit-face samples, 2,160 reverse-face samples, 39,636 clear-ground samples, 2,232 receiving-shadow samples and 30,288 distant-ground samples. Silhouette-crossing pixel footprints are excluded. Both runs in the reorganized repository passed with zero failures. Set `SHADOW_REPORT` to a local output path to retain its JSON report.

The dependency-free tests are mathematical checks plus an appearance guard, not a second implementation of the complete pencil shader. GPU parity and image behavior are separate evidence. Do not replace visual review with a hash update when deliberately changing a locked kernel.

## Review the drawings

Open `demos/index.html`. Check empty lit faces, layered deep shadows, scale transitions on the flat surface, chart blending on the sculpture, contour corners, and a full orbit/light rotation in both cities. Use **Stable fit** to isolate the intentional pencil deviation. Use **Raw shadows** before attributing an unexpected dark mark to hatching.

`npm run capture` regenerates the four committed gallery PNGs from the actual shader at fixed camera/light/traffic states. These are demonstration captures, not cross-GPU golden images. The gallery has no generated illustration or borrowed art asset.

## Remaining limits

- The city uses orthographic planar reconstruction and a fixed directional shadow volume.
- Extreme scale, near-tangent geometry, thin contours and contour junctions remain research cases.
- The paper tone response and anisotropic filtering are approximate.
- Camera motion can change nearest contour descriptors; there is no temporal contour correspondence.
- Cars demonstrate held scene motion, not solved rest-space hatch attachment.
- No current hardware speedup or mobile frame-rate claim is made. Measure the whole frame on the target device.

Historical captures, failed experiments and successive fix logs are not included in this small repository. The current contracts are consolidated in [pipeline](pipeline.md), with original research attribution in [references](references.md).
