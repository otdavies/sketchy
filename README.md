# Sketchy

Pencil shading for 3D scenes. Zooming adds new hatch strokes between existing ones; screen-space outlines give the edges a slight pencil wobble.

## [Try the demo](https://otdavies.github.io/sketchy/)

[![Pencil shading and outlines on a small city](docs/images/city.png)](https://otdavies.github.io/sketchy/)

## How it works

The hatching builds on [Rune Skovbo Johansen's fractal dithering](https://runevision.com/tech/dither3d/). Each stroke keeps the same identity as the pattern subdivides, so its length and pressure don't reset at every scale change. Darker areas build up overlapping strokes; fully lit areas stay clear.

The outlines use depth and normal samples to find edges, then fit a short line through nearby samples. Width and wiggle are measured in pixels. This follows the screen-space approach described in [Manifold Garden's rendering retrospective](https://history.siggraph.org/wp-content/uploads/2022/08/2020-Talks-Brussee_Thats-a-wrap_-Manifold-Garden-rendering-retrospective.pdf), with a local line fit and pencil shading added here.

Camera, light and scene changes render continuously. Stroke seeds stay fixed during motion and zoom; there is no temporal blending.

## Controls

- Drag to orbit; scroll or use **Zoom** to move closer.
- **Scene** switches between the city, traffic, sculpture and flat tests.
- [**Walk through town**](https://otdavies.github.io/sketchy/?study=walk) offers WASD movement and drag-to-look. **Capture mouse** enables mouse-look; Esc releases it. Touch screens have movement buttons.
- **Pencil fit** adds outline wiggle. **Stable fit** removes it.
- **Hatching starts below** and **Full hatching below**, in More controls, set the surface-brightness range that produces hatch ink.
- **More controls** contains the shading comparisons, shadow views and quality settings.

## Research and source

[Hatching](docs/hatching.md) · [Outlines](docs/outlines.md) · [Rendering](docs/pipeline.md) · [Sources](docs/references.md)

Start with the [shader reading guide](src/shaders/README.md) for the call order, coordinate spaces and render passes. Shaders are in `src/shaders/`; the scene and WebGL code are in `src/web/`. Run `python scripts/build.py` after editing them. The generated demo also works offline. See [tests and build instructions](docs/validation.md).

## Unity 6.3 / URP

The [Unity package](Packages/com.otdavies.sketchy/README.md) includes pencil materials, fitted contours, a paper UI shader and a reversible setup window. Install it into a **Unity 6000.3.12f1 / URP 17.3** project, then use **Tools > Sketchy > Installer**. Local testbeds under `Unity/` are excluded from Git; only the UPM package is shared. The reference scene uses the same city geometry as the browser.

To install from this repository, use Package Manager's **Install package from git URL**:

```text
https://github.com/otdavies/sketchy.git?path=/Packages/com.otdavies.sketchy
```

This first Unity release targets URP 17.3, opaque rigid meshes and independent mono cameras. [Setup, architecture and validation](docs/unity-srp.md) describe the current scope and remaining parity work.

MIT license. The [tests](https://github.com/otdavies/sketchy/actions/workflows/checks.yml) check stroke identity, immediate updates, contour spikes and shadow visibility.
