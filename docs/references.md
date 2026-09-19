# Sources

Sketchy's code was written for this prototype. These sources informed the algorithms and art direction.

## Hatching

[Rune Skovbo Johansen's Surface-Stable Fractal Dithering](https://runevision.com/tech/dither3d/) and [Dither3D implementation](https://github.com/runevision/Dither3D) provide the starting idea: keep marks attached to the surface, adding nested marks as it grows on screen. Sketchy applies this to finite pencil strokes.

The original shader and texture generator were inspected at commit [`34fa85832268dc0649aad24b1b4fe07420782724`](https://github.com/runevision/Dither3D/tree/34fa85832268dc0649aad24b1b4fe07420782724). The volume slices encode density states rather than scene depth. Dither3D uses MPL-2.0; no Dither3D source or assets are bundled here.

[Praun, Hoppe, Webb and Finkelstein's Real-Time Hatching (2001)](https://hhoppe.com/proj/hatching/) establishes stroke coherence across tone and resolution through Tonal Art Maps and lapped surface parameterizations. Sketchy explores a procedural construction without texture assets.

[Webb, Praun, Finkelstein and Hoppe's Fine Tone Control in Hardware Hatching (2002)](https://hhoppe.com/proj/finetone/) separates tone control from crisp stroke appearance. Sketchy's optical deposit curve is an artistic approximation, not a reproduction of that method.

## Outlines

[Brussee, Saraev and Chyr's Manifold Garden rendering retrospective (SIGGRAPH 2020)](https://history.siggraph.org/wp-content/uploads/2022/08/2020-Talks-Brussee_Thats-a-wrap_-Manifold-Garden-rendering-retrospective.pdf), section 3, describes depth/normal metadata, tangent-plane comparisons and subpixel edge distances. Sketchy's local total-least-squares fit is a separate addition. The paper does not establish that Manifold Garden uses this fit or splines.

[William Chyr's edge-detection devlog](https://williamchyr.com/edge-detection-shader-deep-dive-part-1-even-or-thinner-edges/) explains earlier problems with doubled and uneven outlines.

## Shadows and precision

The [GLSL ES 3.00 specification](https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf) defines sampler precision and shadow comparisons. [GPU Gems: Shadow Map Antialiasing](https://developer.nvidia.com/gpugems/gpugems/part-ii-lighting-and-shadows/chapter-11-shadow-map-antialiasing) explains filtering comparison results rather than raw depths.

## Pencil references

[Menzel's Studies of a Young Woman](https://www.metmuseum.org/art/collection/search/460057) and [Sargent's Studies for Fumée d'Ambre Gris](https://www.nga.gov/artworks/184291-studies-fumee-dambre-gris) informed the finite marks, broken contact and pressure variation. Their images are not included as assets. The demo images are captures of Sketchy's shaders.

This project combines nested stroke IDs, overlapping charts, discrete redraws and fitted pencil contours. It has not been peer reviewed, and it does not prove stability at arbitrary scale. The implementation is MIT licensed.
