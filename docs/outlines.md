# Fitted screen-space pencil outlines

The goal is an architectural contour with a consistent pixel width and a controlled hand-drawn deviation. The inputs are rendered depth, normals and material categories. There is no mesh-edge list, barycentric wireframe or geometry extrusion.

The reference is [Manifold Garden's SIGGRAPH 2020 retrospective](references.md): use geometric metadata and a subpixel edge-distance interpretation rather than a binary pixel outline. Sketchy's local total-least-squares fit and pencil displacement are its own experimental stages. This implementation fits **local straight lines**, not splines or globally connected curves; it does not claim to reproduce Manifold Garden's proprietary implementation.

## Detection

[`outline-edge.frag`](../src/shaders/outline-edge.frag) reads metadata rendered at twice the output width and height. Neighboring samples differ when there is a silhouette, normal discontinuity, material boundary, or separation from the local tangent plane.

For a reconstructed sample displacement $\Delta P$, the plane test uses

$$e=\max(|n_a\cdot\Delta P|,|n_b\cdot\Delta P|).$$

Comparing raw depth alone would mark a sloping flat surface as an edge. The threshold includes a bound for quantized normals/depth; samplers explicitly use high precision. Subpixel boundary crossings are accumulated into a seed position, an unoriented normal angle and a confidence value, packed in RGBA8.

The current detector assumes the city camera's orthographic depth mapping. A perspective engine port must reconstruct actual positions with that camera's projection and depth conventions.

## Fit once per seed

[`PencilOutline.glsl`](../src/shaders/PencilOutline.glsl), compiled with `OUTLINE_FIT_PASS`, examines a 7×7 neighborhood at occupied seeds. Weights depend on confidence, distance, angle agreement, and proximity to the same local contour. Those gates reduce accidental merging of nearby parallel lines and branches.

For positions $x_i$ and weights $w_i$,

$$\mu=\frac{\sum_i w_ix_i}{\sum_i w_i},\qquad C=\frac{\sum_i w_i(x_i-\mu)(x_i-\mu)^T}{\sum_i w_i}.$$

The major covariance eigenvector is the tangent, and its perpendicular is the fitted normal. Eigenvalue separation measures whether the samples resemble one line. At corners or sparse endpoints, the fit falls back toward the originating seed. Anchor movement is bounded so the descriptor cannot arbitrarily bridge gaps.

The fit is stored and reused. A mipmapped occupancy channel rejects empty output regions; descriptor geometry is always fetched from level zero. Composition searches a 5×5 neighborhood for the nearest valid descriptor and evaluates its signed distance in native output pixels. This is a short-range approximation, not a complete Euclidean distance transform.

## Put the pencil after the geometry

In **Pencil fit**, a smooth noise field displaces the fitted distance by up to the selected jitter scale, another field varies pressure, and a grain term modulates contact. The default jitter is 0.65 px. All of this happens in composition; noisy positions never feed back into detection or fitting.

The drawing seed is held. It changes during zoom redraws, giving a fresh line on each committed drawing, without interpolation. **Stable fit** and **Lines only** ignore the drawing seed. Idle drawings do not boil. Relighting does not reroll the pencil or refit a static contour.

An earlier demo revision selected Stable fit by default, hiding this expressive stage. The research demo restores Pencil fit as the default without changing its shader formula.

## Boundaries to improve

The current fit is deterministic per image, but has no temporal contour correspondence. A nearest-descriptor switch can still cause a local jump during camera motion. Thin geometry, intersections and nearly coincident silhouettes remain difficult. Screen-space wiggle moves with the image field, unlike the surface-attached hatching.

Possible next experiments are confidence-aware junction handling, object-aware contour neighborhoods, and piecewise quadratic fits where curvature is well supported. Each should preserve the separation between geometric estimation and artistic displacement. Any temporal stabilization must preserve held frames rather than smear them with a history blend.
