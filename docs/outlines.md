# Screen-space outlines

[View the outlines on their own.](https://otdavies.github.io/sketchy/?study=outlines)

The outline pass reads depth, normals and material categories from the rendered image. It finds subpixel edge samples, fits a local straight line and shades that line by pixel distance. Pencil wiggle is added at the end.

[Manifold Garden's SIGGRAPH retrospective](references.md) describes the depth/normal and edge-distance approach that informed this work. Sketchy's total-least-squares fit is a separate experiment. It fits local lines, not splines or connected curves.

## Finding edges

[`outline-edge.frag`](../src/shaders/outline-edge.frag) reads buffers at twice the output width and height. It detects silhouettes, normal changes, material boundaries and breaks in the local surface plane.

For a displacement $\Delta P$ between neighboring samples, the plane test is

$$e=\max(|n_a\cdot\Delta P|,|n_b\cdot\Delta P|).$$

This lets a sloping flat face remain clear; a raw depth-difference test would mark it as an edge. The threshold accounts for normal and depth quantization. Depth samplers use high precision.

Crossings produce a seed position, an unoriented normal angle and a confidence value, packed into RGBA8. Orbit views reconstruct linear orthographic depth. Walking first linearizes perspective depth, then reconstructs each sample along its own view ray. The quantization allowance grows with distance, keeping sloping flat surfaces clear.

## Fitting a line

[`PencilOutline.glsl`](../src/shaders/PencilOutline.glsl) first estimates a direction from the positions in a 5×5 neighborhood. A coherent group supplies a guide before direction rejection. This corrects isolated staircase crossings whose grid direction is perpendicular to the real contour. The second fit uses a 7×7 neighborhood, giving less weight to distant samples, conflicting directions and samples on another nearby contour.

For positions $x_i$ and weights $w_i$,

$$\mu=\frac{\sum_i w_ix_i}{\sum_i w_i},\qquad C=\frac{\sum_i w_i(x_i-\mu)(x_i-\mu)^T}{\sum_i w_i}.$$

The major covariance eigenvector gives the tangent. Eigenvalue separation measures how well the samples fit one line. At corners or sparse endpoints, the result falls back toward the original seed. The fitted anchor can move only a short distance, limiting accidental bridges across gaps.

The compositor searches a 5×5 neighborhood and takes the minimum distance to finite fitted boundary segments. Each segment extends 0.75 pixels along its tangent. It does not select an anchor and extrapolate an infinite line: that earlier approach turned misoriented staircase samples into perpendicular spikes. Web rendering uses an occupancy mip to skip empty areas; descriptor positions always come from mip level zero. This is a local boundary-distance approximation, not Manifold Garden's exact per-MSAA-sample implementation.

## Adding wiggle

Pencil fit shifts the fitted line with smooth noise, varies its pressure and adds paper contact grain. The default jitter is 0.65 px. These changes happen after fitting, so they cannot create false edge detections.

Camera motion and zoom keep the noise seed fixed. Repeated unchanged frames stay identical. Stable fit and Lines only ignore the seed, and relighting doesn't refit a static web contour. Pencil fit is the default.

## Remaining problems

The fit has no correspondence between frames. Switching the nearest descriptor can cause a small jump during camera motion. Thin geometry, junctions and nearby silhouettes still need work. The wiggle is anchored in screen space, while the hatching is anchored to the surface.

Useful next tests are object-aware neighborhoods, better handling of junctions and quadratic fits where enough samples support curvature. Keep geometric work separate from pencil displacement and avoid temporal blending.

`npm run test:outlines` renders twelve analytic staircase edges in WebGL. Before the correction, 180 visibly inked pixels protruded beyond 1.6 pixels from the true edge (maximum 2.13). The corrected kernel produced zero such pixels (maximum 1.20). The HLSL kernel is generated from the same GLSL source with `python scripts/sync-outline-hlsl.py`; `--check` detects drift.
