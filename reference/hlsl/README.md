# HLSL reference kernels

These translations preserve the algorithm interfaces for a future Unity port. They are **not a Unity package** and have not been compiled in Unity. The tested runtime is GLSL/WebGL2.

- `PencilHatching.hlsl`: finite nested pencil strokes; caller provides a consistent position, normal, pixel derivatives, ink demand and drawing seed.
- `FractalHatching.hlsl`: analytic nested-stripe comparison.
- `PencilOutline.hlsl`: compile with `OUTLINE_FIT_PASS` for fitting, without it for composition. Requires `edgeSeeds`, `edgeLinearSampler`, native `resolution`, and hash/noise helpers from `PencilHatching.hlsl`.

Depth/normal seed detection, engine lighting, material setup, resource management and the held output texture still need integration. Start with [the Unity design](../../docs/unity-srp.md). The old built-in-pipeline demonstration components are deliberately excluded so they cannot be mistaken for an SRP drop-in.
