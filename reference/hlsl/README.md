# HLSL kernels

These files preserve the engine-independent shader translations. The [Unity package](../../Packages/com.otdavies.sketchy/) compiles an unchanged copy of the pencil kernel and an adapted outline kernel in Unity 6.3. The browser continues to use GLSL/WebGL2.

| File | Use |
|---|---|
| `PencilHatching.hlsl` | Finite nested pencil strokes. Takes position, normal, pixel derivatives, ink demand and drawing seed. |
| `FractalHatching.hlsl` | Analytic nested-stripe comparison. |
| `PencilOutline.hlsl` | Line fitting with `OUTLINE_FIT_PASS`; composition without it. Requires `edgeSeeds`, `edgeLinearSampler`, output `resolution` and the pencil hash/noise helpers. |

The package supplies lighting, material passes, edge detection, buffer management and continuous rendering. See the [Unity guide](../../docs/unity-srp.md) for validation and support limits. The fractal comparison kernel remains a reference, outside the Unity material.
