# Fractal hatching

Zoom into the [flat-surface demo](https://otdavies.github.io/sketchy/?study=flat). New strokes appear between existing ones. The old strokes keep their endpoints and pressure pattern as the grid subdivides.

That nested structure comes from [Johansen's fractal dithering](references.md). Sketchy extends it to finite pencil strokes in [`PencilHatching.glsl`](../src/shaders/PencilHatching.glsl). The earlier [`FractalHatching.glsl`](../src/shaders/FractalHatching.glsl) remains available as the engraving comparison.

## Choosing a scale

A surface chart is a two-dimensional coordinate map laid over the object. For chart coordinate $u$ and direction $a$, the across-stroke coordinate is $q=u\cdot a$. Its perpendicular gives the along-stroke coordinate.

Let $g=\|\nabla_{pixel}q\|$ measure how much that coordinate changes across a pixel, and let $s$ be the desired spacing in pixels. Then

$$\ell=-\log_2(sg),\qquad k=\lfloor\ell\rfloor,\qquad b=2^{\operatorname{fract}(\ell)}-1.$$

The existing lines have centers $q=j/2^k$. New lines occupy the odd sites of the next finer grid. At an octave boundary, $(j,k)$ becomes $(2j,k+1)$, which describes the same position.

Camera distance changes the pixel footprint used here. Lighting changes how much ink to draw. Neither rotates the chart axes. Position and derivatives must come from the same coordinate map.

## Keeping a stroke's identity

For a nonzero index, write $j=o2^v$ with odd $o$. Use the key

$$K(j,k)=(o,k-v).$$

This gives `pnLineKey(j, k) == pnLineKey(2*j, k+1)`. Zero has a reserved key, and negative indices keep their sign.

The key seeds segment length, gaps and pressure. Segments use the line's birth scale, so relabeling a line at the next octave doesn't move its ends.

Each new segment also has a fixed birth rank $r\in(0,1)$. It appears when $b\ge r$, at its intended width. This is a discrete birth with antialiased pixel coverage. Parent segments stay eligible across the octave boundary.

## Making pencil marks

Strokes have tapered tips, varying pressure, a small wave and a redraw-dependent offset measured in pixels. Keeping the original segment length means some parent strokes become long at extreme zoom.

Three crossing families use different angles and spacing. The second contributes more as tone increases. The combined deposit $D$ becomes visible ink through

$$\tau=-\log(\max(1-t,0.01)),\qquad I=1-\exp(-1.12\tau D),$$

where $t$ is the requested tone. Overlaps darken, and $t=0$ produces no hatch ink. This is an artistic tone curve. Paper grain is added separately.

## Covering curved surfaces

Three charts use `p.yz`, `p.zx` and `p.xy`. Their weights are

$$w_i=\frac{\max(|n_i|-0.22,0)^4}{\sum_j\max(|n_j|-0.22,0)^4}.$$

A chart loses weight as its projection flattens. This avoids the bullseyes produced by spherical coordinates. Each chart has a small, fixed warp; its Jacobian also transforms the pixel derivatives.

Chart blending can change local tone, and it doesn't produce one continuous curvature-following field. An authored surface atlas is a possible extension, but it must preserve the stroke IDs.

## Filtering and limits

The shader estimates stroke coverage from the pixel footprint. Gaps smaller than a pixel approach their average coverage to reduce flicker. The city offers two shading samples per pixel, or four through 2× supersampling.

The engraving comparison uses an analytic stripe integral over a one-dimensional box footprint. Its children grow in width continuously. The pencil version uses finite segments and discrete births.

The nesting guarantee applies to a fixed chart and drawing seed during increasing local magnification. It does not promise identical pixels through lighting changes, occlusion or intentional redraws. Pixel-sized wiggle perturbs the ideal centerline; zoom redraw changes small pressure and placement variations.

Float precision, integer range and octave limits are finite. Anisotropic filtering is approximate. The city currently uses world-space coordinates, so cars move through the hatch field. Object motion and deformation need stable object/rest coordinates with matching derivatives; see the [Unity plan](unity-srp.md).
