# Surface-stable fractal hatching

The useful principle from [Johansen's fractal dithering](references.md) is **nested membership**: magnifying a pattern reveals additional marks while retaining the old ones. Sketchy applies that principle to procedural finite pencil strokes. It does not stretch a fixed screen texture or crossfade unrelated noise octaves.

The active implementation is [`PencilHatching.glsl`](../src/shaders/PencilHatching.glsl). [`FractalHatching.glsl`](../src/shaders/FractalHatching.glsl) is the earlier analytic engraving comparison. Their scale transitions differ deliberately.

## 1. A continuous surface phase

For a chart coordinate $u$ and family direction $a$, define an across-stroke phase $q=u\cdot a$ and an along-stroke phase using its perpendicular. Project the derivatives of the **same** coordinate map onto those directions.

Let $g=\|\nabla_{pixel}q\|$ and let $s$ be the desired screen spacing. The scale choice is

$$\ell=-\log_2(sg),\qquad k=\lfloor\ell\rfloor,\qquad b=2^{\operatorname{fract}(\ell)}-1.$$

The mature lattice has centers $q=j/2^k$. Candidate children occupy the odd sites of the finer lattice. At the next octave, an old center is relabeled $(j,k)\rightarrow(2j,k+1)$ and remains at exactly the same chart coordinate. The implementation clamps levels to a finite range; this is scale-adaptive rendering, not infinite numerical precision.

The camera footprint controls density and filtering. Light direction controls ink demand. Neither rotates the chart axes.

## 2. Identity survives relabeling

Write a nonzero integer index as $j=o2^v$ with odd $o$. Its canonical key is

$$K(j,k)=(o,k-v).$$

`pnLineKey(j, k) == pnLineKey(2*j, k+1)`. Zero has a reserved key. Negative indices retain their sign. Family/chart seeds separate independent stroke populations.

The key determines segment length, gaps and pressure parameters. Along-stroke segment cells are measured using the line's **birth scale**, never its current octave label. Otherwise a line's ends would jump every time its lattice representation changes.

Each candidate segment has a persistent birth rank $r\in(0,1)$. A child becomes present when $b\ge r$, at its intended width. There is no fade between different drawings. The decision is discrete, but spatial pixel coverage is still antialiased. Mature parent segments remain eligible through the octave boundary.

## 3. Graphite instead of a perfect grid

A finite stroke combines tapered tips, a varying pressure profile, coherent waviness and a small redraw-dependent displacement measured in pixels. Segment endpoints remain attached to their persistent identity. Under extreme magnification, surviving parent segments can consequently become long; this is a known tradeoff.

Three crossing families use different angles, spacing and strength. The second family's contribution increases with tone; all deposit is multiplied through an optical ink response:

$$\tau=-\log(\max(1-t,0.01)),\qquad I=1-\exp(-1.12\tau D).$$

Here $t$ is artistic ink demand and $D$ is combined graphite deposit. This gives overlapping lines darker contact while $t=0$ returns exactly zero hatch ink. It is an artistic response, not an exact coverage or physical graphite model. The renderer adds paper tooth separately, so empty paper can still carry subtle paper grain.

## 4. Curved surfaces without scalar-field poles

Three planar charts use `p.yz`, `p.zx` and `p.xy`, with weights

$$w_i=\frac{\max(|n_i|-0.22,0)^4}{\sum_j\max(|n_j|-0.22,0)^4}.$$

Each chart has a smooth, view-independent warp; the warp Jacobian transforms its derivatives. A chart loses influence as its projection becomes poorly conditioned. The result avoids the visible bullseyes of spherical coordinates or a single projected direction field.

This is a blended atlas, not a globally integrated curvature field. Chart overlap can alter local tone. An authored lapped parameterization or directional atlas is a meaningful future research branch, provided it retains stable stroke identities.

## 5. Filtering and the exact scope of stability

Across-stroke coverage is approximated using the local pixel footprint. Subpixel segment gaps approach an approximate mean instead of flashing. The city offers two shading samples at native resolution or four through 2× supersampling; geometry coverage uses a separate antialiasing path.

The engraving comparison integrates a periodic stripe analytically over a 1D box footprint and grows child width continuously. It is useful for mathematical coverage tests; it is **not** the finite pencil's discrete birth algorithm.

The strongest invariant is parent identity and center-lattice nesting for a fixed chart and fixed drawing seed under monotone local magnification. It does not imply identical images during a lighting change, changing surface normal, minification, occlusion, or an intentional redraw. Pixel-sized wiggle deliberately perturbs the ideal centerline. Zoom redraw changes small pressure/placement variations; it preserves ancestry rather than exact pixels.

Current limits include finite float/integer range, finite octave bounds, approximate anisotropic filtering, and world-space anchoring in the city. Moving cars pass through that world field; they are not evidence of solved object-space or deforming-surface attachment. A port must choose stable object/rest coordinates and transform their derivatives consistently. See [Unity direction](unity-srp.md).
