# Reading the shaders

Start with [city-fill.frag](city-fill.frag). It follows one surface sample from position and lighting to hatch coverage and paper color. The other city passes use the same position and lighting helpers.

## Pencil hatching

[PencilHatching.glsl](PencilHatching.glsl) contains the pencil algorithm. Read its functions in this order:

| Function | What it does |
|---|---|
| `pnPencil` | Blends three planar charts, then converts graphite deposit to ink coverage |
| `pnChart` | Warps one chart and layers crossing stroke families |
| `pnFamily` | Chooses a scale; keeps parent lines and introduces children between them |
| `pnStroke` | Gives a line finite segments, taper, pressure and drawing variation |
| `pnLineKey` | Keeps a line's identity when its octave label changes |

Surface positions and their derivatives must use the same coordinate space. `positionDx` and `positionDy` are changes per **output pixel**, even when shading is supersampled. `tone` is requested darkness: zero leaves bare paper. `frameSeed` selects a drawing; it does not replace the persistent line key.

[FractalHatching.glsl](FractalHatching.glsl) is the simpler engraving comparison. Its `fhFamilyState` inserts stripes between parents and integrates their coverage over a pixel footprint. The `pn`, `fh` and `po` prefixes mean pencil, fractal hatching and pencil outline.

## Screen-space outlines

The outline pipeline has three stages:

1. [outline-edge.frag](outline-edge.frag) compares depth, normals and material IDs on a 2× sample grid. It records subpixel edge crossings.
2. [PencilOutline.glsl](PencilOutline.glsl), compiled with `OUTLINE_FIT_PASS`, fits a local line to compatible crossings. The covariance stores `(xx, xy, yy)`.
3. [outline-composite.frag](outline-composite.frag) uses the nearest fitted line to shade the contour. Pencil fit adds displacement and pressure; Stable fit uses the same fit without that variation.

An edge descriptor packs a local pixel offset into RG, an unoriented normal angle into B, and confidence into A. Zero alpha means no edge. Distances and wiggle use output pixels. The encoding equations are next to the functions that read and write them.

## City passes and shared code

| File | Responsibility |
|---|---|
| [CitySurface.glsl](CitySurface.glsl) | Reconstructs world position and matching pixel derivatives from a ray/plane intersection |
| [CityLighting.glsl](CityLighting.glsl) | Filters shadow visibility on the receiver plane; converts lighting to requested pencil tone |
| [CityTraffic.glsl](CityTraffic.glsl) | Places each vehicle along its route |
| [city.vert](city.vert), [city-shadow.vert](city-shadow.vert) | Transform scene geometry for the camera or shadow map |
| [city-fill.frag](city-fill.frag) | Combines lighting, hatching and paper |
| [city-raw.frag](city-raw.frag) | Renders light and shadow diagnostic views |
| [SurfaceLighting.glsl](SurfaceLighting.glsl) | Shared city/sculpture illumination-to-ink mapping |
| [city-metadata.frag](city-metadata.frag) | Writes normals and material IDs for edge detection |
| [fullscreen.vert](fullscreen.vert), [depth-only.frag](depth-only.frag) | Small shared entry points for screen and depth passes |
| [scene.frag](scene.frag) | Runs the flat-chart and ray-marched sculpture studies |

`lightDirection` points from the surface **toward the sun**. Incoming light is the clamped normal/light dot product multiplied by visibility. Reverse faces and cast shadows both reach the unlit ink level, including ground. `SurfaceLighting.glsl` remaps the selected brightness range before applying the tone curve. `hatchBrightnessRange` packs (full-hatching brightness, clear-paper brightness); its default is `(0, 1)`. This changes ink demand without changing stroke coordinates or shadow visibility.

## Editing and assembly

Edit these source files, then run `python scripts/build.py`. The build resolves quoted `#include` lines and embeds the results in the self-contained demo. The renderer inserts the pencil core at `PENCIL_CORE_INSERT` and selects chart and outline variants with compile-time defines. Shader source no longer lives inside JavaScript templates.

The matching [HLSL references](../../reference/hlsl/) use the same descriptive names. The [Unity package](../../Packages/com.otdavies.sketchy/README.md) compiles the pencil kernel and a synchronized outline adapter. [Formatting rules](../../.clang-format) keep one statement per line and expand control flow. See [validation](../../docs/validation.md) for the before/after render comparison and regression tests.
