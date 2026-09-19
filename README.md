# Sketchy

Surface-stable pencil hatching and fitted screen-space outlines. A small rendering research project on the way to a Unity **paper drawing pipeline**.

![A city rendered with nested graphite strokes and pencil contours](docs/images/city.png)

## Try it

Download or clone this repository and open **[demos/index.html](demos/index.html)** in a WebGL2 browser. The studio is self-contained and works offline. No installation or build is needed to explore it. GitHub's file viewer shows the HTML source; open the downloaded file in a browser.

| Study | What to look for |
|---|---|
| Pencil city | Bright paper, layered shadow strokes, fitted pencil contours |
| City + traffic | Distant buildings and four cars on a simple road loop |
| Sculpture | Curved surfaces without latitude/longitude hatch poles |
| Flat surface / tone ramp | Stroke ancestry, scale transitions, and ink accumulation |
| Outlines / raw shadows | Isolate contour fitting and direct-light visibility |

Drag to orbit. Zoom from 0.25× to 64×. **Pencil fit** is the default: its subpixel wiggle and pressure variation return the living-sketch character. **Stable fit** provides the clean comparison. **Hold drawings** commits complete drawings at up to 10 Hz, with fresh variations during zoom and no frame blending. Idle drawings stay still.

## The ideas

**Hatching belongs to the surface.** Magnification inserts new strokes between existing ones. A reduced dyadic coordinate gives each parent a persistent identity across scale changes; endpoints, pressure and birth rank derive from that identity. Three overlapping charts support curved surfaces, and darker tones accumulate crossing graphite strokes. Fully lit regions contain no hatch ink.

**Outlines belong to the image.** Depth, normal and material boundaries produce subpixel edge samples. A local total-least-squares fit estimates the contour direction; a pixel-distance field controls coverage. Pencil displacement is applied after fitting, so expressive irregularity cannot contaminate edge detection.

**The drawing has its own clock.** Geometry, camera, lighting, hatching and outlines are sampled together. The completed image is held. A seed change is an artistic redraw, not a replacement for stable coordinates.

| Read | Focus |
|---|---|
| [Hatching](docs/hatching.md) | Dyadic ancestry, finite strokes, chart weights, filtering and limits |
| [Outlines](docs/outlines.md) | Subpixel detection, local fitting, pencil wiggle |
| [Pipeline](docs/pipeline.md) | Pass dependencies, shadows, coordinate and temporal contracts |
| [Unity direction](docs/unity-srp.md) | Proposed package boundaries, SRP integration and acceptance gates |
| [Validation](docs/validation.md) | Reproducible checks and what remains unverified |
| [Sources](docs/references.md) | Original research and the boundary of this experiment's contribution |

## Work on it

Python 3.10+ builds the demos using only its standard library:

```sh
python scripts/build.py
python tests/invariants.py
```

Node 20+ and Playwright are needed only for browser checks:

```sh
npm ci
npx playwright install chromium
npm test
npm run test:shadows
```

`src/shaders/` contains the rendering math; `src/web/` contains the scene and WebGL harness. `reference/hlsl/` holds uncompiled HLSL translations for the future port. Edit source files, then rebuild; `demos/studio.html` is generated. See [validation](docs/validation.md) for browser overrides and screenshot regeneration.

## Status and lineage

This is a working WebGL2 research prototype, **not yet an installable Unity render pipeline**. The city uses an orthographic camera and planar faces. Perspective integration, object/rest-space anchoring for moving geometry, robust contour junctions and physical mobile-GPU validation remain open.

The starting point is [Rune Skovbo Johansen's Surface-Stable Fractal Dithering](https://runevision.com/tech/dither3d/) and its [original implementation](https://github.com/runevision/Dither3D). Scale-coherent hatching also has established roots in [Real-Time Hatching](https://hhoppe.com/proj/hatching/). The screen-space contour direction is informed by [Manifold Garden's rendering retrospective](https://history.siggraph.org/wp-content/uploads/2022/08/2020-Talks-Brussee_Thats-a-wrap_-Manifold-Garden-rendering-retrospective.pdf). Sketchy's kernels are independently written; no upstream code, paper PDFs or artwork are bundled. See [attribution](docs/references.md).

MIT licensed. The approved hatching kernels are fingerprinted in `tests/hatching-lock.json` so integration cleanup cannot silently redesign the pencil.
