# HLSL kernels

These files translate the shader functions for a future Unity port. They have not been compiled in Unity. The tested demo uses GLSL/WebGL2.

| File | Use |
|---|---|
| `PencilHatching.hlsl` | Finite nested pencil strokes. Takes position, normal, pixel derivatives, ink demand and drawing seed. |
| `FractalHatching.hlsl` | Analytic nested-stripe comparison. |
| `PencilOutline.hlsl` | Line fitting with `OUTLINE_FIT_PASS`; composition without it. Requires `edgeSeeds`, `edgeLinearSampler`, output `resolution` and the pencil hash/noise helpers. |

The port still needs edge detection, engine lighting, materials, buffer management and a held output texture. See the [Unity plan](../../docs/unity-srp.md).
