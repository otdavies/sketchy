# Unity port

The goal is a drop-in paper drawing pipeline. The browser demo supplies a visual reference; the [`HLSL kernels`](../reference/hlsl/) are uncompiled translations. A Unity package still needs material integration, render passes and resource management.

## Start with URP

Use URP's culling and shadows for the first port. This lets us test the drawing without also writing a lighting engine. Unity's [Render Graph documentation](https://docs.unity3d.com/6000.0/Documentation/Manual/urp/render-graph.html) covers custom passes. Pin a Unity/URP version before choosing the APIs and pass injection points.

The same drawing passes could later run in a custom SRP. Keep their math separate from the engine adapter.

| Component | Responsibility |
|---|---|
| Paper style asset | Colors, density, pressure, outline width, jitter and drawing rate |
| Material adapter | Ink demand, object/rest coordinates, normals, outline category and shadow flags |
| Hatching | Stroke IDs, families, charts, birth rules and filtering |
| Outlines | Edge samples, line fitting and pencil composition |
| Drawing scheduler | Captured scene state, stroke seed and persistent output texture per camera |
| Pipeline adapter | Culling, lighting, depth conventions and resource lifetime |

## First working version

1. Render opaque geometry with one directional light. Keep Light only and Raw shadows available.
2. Supply stable rest coordinates and material IDs through a material or metadata pass. Depth and normals alone cannot recover an object's intended hatch coordinates.
3. Run hatching with derivatives of those same coordinates. Compare the flat ramp and sculpture against the browser before adding complex materials.
4. Render subpixel edge data, fit the lines and composite their pencil appearance after hatching.
5. Capture camera, lights and object state together at each drawing tick. Retain the completed texture between ticks.

## Coordinates and materials

| Input | Required meaning |
|---|---|
| Rest position and derivatives | A stable surface map, all in the same coordinate frame |
| Object ID | Identifies an object's strokes independently of camera motion |
| Geometric normal | Used for visibility and plane tests |
| Appearance normal | May affect artistic shading; must not replace the geometric normal in plane tests |
| Ink demand | A 0–1 tone value; zero means no hatch ink |
| Drawing seed | Fixed for the drawing, separate from time and shadow sampling |
| Pixel footprint | Measured in output pixels, including render scale and supersampling |

Rigid objects should carry strokes with them. Nonuniform scaling needs matching normal and derivative transforms. Skinned meshes need a persistent rest domain with deformed derivatives; world-space sampling would swim. Large worlds need stable local origins or integer addressing that preserves stroke IDs.

## Camera and frame handling

Replace the demo's orthographic depth equation with reconstruction for the engine's projection and depth convention. Test perspective, reversed Z, dynamic resolution, multiple cameras and XR eyes separately.

Quantizing a shader time value is insufficient if the camera and scene buffers keep updating underneath it. The drawing scheduler must capture a complete state. Keep the output in persistent resources; transient Render Graph textures are not frame history. Responsive UI can be drawn afterward.

Choose where post-processing belongs. By default, TAA and motion blur should not blend the held drawing. Spatial antialiasing is still needed. Continuous mode with a fixed seed remains useful for finding coordinate errors.

## Checks before calling it a drop-in

| Stage | Required check |
|---|---|
| Shader port | Flat ramp and stroke-ID tests agree within a recorded GPU tolerance |
| Surface attachment | Static, moving and scaled objects retain their markings during camera and light motion |
| Outlines | Flat interiors stay clear; widths, corners and creases have reviewed captures |
| Drawing clock | Frames remain identical between ticks; zoom redraws are discrete; orbit and light preserve seeds |
| Package | Sample scene, style asset, editor setup and multi-camera cleanup work in the pinned Unity version |
| Hardware | Full-frame timings and light/orbit/zoom captures pass on desktop and representative phones |

Curved contour fitting, directional surface atlases and better tone calibration remain separate research tasks. They should not silently change the established pencil style during the port.
