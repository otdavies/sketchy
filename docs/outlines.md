# Screen-space outlines

[View the outlines on their own.](https://otdavies.github.io/sketchy/?study=outlines)

The outline pass reads depth, normals and material categories from the rendered image. It finds subpixel edge samples, fits a local straight line and shades that line by pixel distance. Pencil wiggle is added at the end.

[Manifold Garden's SIGGRAPH retrospective](references.md) describes the depth/normal and edge-distance approach that informed this work. Sketchy's total-least-squares fit is a separate experiment. It fits local lines, not splines or connected curves.

## Finding edges

[`outline-edge.frag`](../src/shaders/outline-edge.frag) reads buffers at twice the output width and height. It detects silhouettes, normal changes, material boundaries and breaks in the local surface plane.

For a displacement $\Delta P$ between neighboring samples, the plane test is

$$e=\max(|n_a\cdot\Delta P|,|n_b\cdot\Delta P|).$$

This lets a sloping flat face remain clear; a raw depth-difference test would mark it as an edge. The threshold accounts for normal and depth quantization. Depth samplers use high precision.

Crossings produce a seed position, an unoriented normal angle and a confidence value, packed into RGBA8. The depth reconstruction assumes the city's orthographic camera. Perspective cameras need their own position reconstruction.

## Fitting a line

[`PencilOutline.glsl`](../src/shaders/PencilOutline.glsl) fits a 7×7 neighborhood around each occupied seed. It gives less weight to distant samples, conflicting directions and samples on another nearby contour.

For positions $x_i$ and weights $w_i$,

$$\mu=\frac{\sum_i w_ix_i}{\sum_i w_i},\qquad C=\frac{\sum_i w_i(x_i-\mu)(x_i-\mu)^T}{\sum_i w_i}.$$

The major covariance eigenvector gives the tangent. Eigenvalue separation measures how well the samples fit one line. At corners or sparse endpoints, the result falls back toward the original seed. The fitted anchor can move only a short distance, limiting accidental bridges across gaps.

The compositor searches a 5×5 neighborhood for the nearest fitted descriptor and evaluates its signed distance in output pixels. It reuses stored fits and uses an occupancy mip to skip empty areas. Descriptor positions always come from mip level zero. The search is local, so this is only an approximate distance field.

## Adding wiggle

Pencil fit shifts the fitted line with smooth noise, varies its pressure and adds paper contact grain. The default jitter is 0.65 px. These changes happen after fitting, so they cannot create false edge detections.

Zoom redraws change the noise seed at the next drawing tick. Repeated frames stay identical. Stable fit and Lines only ignore the seed, and relighting doesn't refit a static contour. Pencil fit is the default.

## Remaining problems

The fit has no correspondence between frames. Switching the nearest descriptor can cause a small jump during camera motion. Thin geometry, junctions and nearby silhouettes still need work. The wiggle is anchored in screen space, while the hatching is anchored to the surface.

Useful next tests are object-aware neighborhoods, better handling of junctions and quadratic fits where enough samples support curvature. Keep any such geometric work separate from the pencil displacement, and avoid temporal blending of held drawings.
