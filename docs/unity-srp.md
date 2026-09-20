# Unity pencil pipeline

The Unity implementation lives in [`Packages/com.otdavies.sketchy`](../Packages/com.otdavies.sketchy/README.md). Only the package is versioned; `Unity/SketchyTestbed` is an optional local workspace, excluded from Git. Use **6000.3.12f1 / URP 17.3.0**. The WebGL demo remains the visual reference; both versions render continuously with fixed stroke seeds.

Use **Tools > Sketchy > Installer** to install the Forward renderer, configure cameras and generate the original web city as native meshes. The installer saves Graphics/Quality assignments for restoration. The package includes Pencil Lit materials, Render Graph contours, continuous rendering and a uGUI paper shader. See the package guide for Git installation and controls.

## CLI and validation

To create a local testbed with the Unity CLI:

```powershell
unity projects create SketchyTestbed --path Unity --editor-version 6000.3.12f1 --template com.unity.template.urp-blank
```

Add `"com.otdavies.sketchy": "file:../../../Packages/com.otdavies.sketchy"` to its `Packages/manifest.json` dependencies, using UTF-8 without a BOM. To run package tests, also add `"testables": ["com.otdavies.sketchy"]` at the manifest root. A cloned repository does not need a testbed for its package integrity checks.

For an existing checkout, with the testbed closed:

```powershell
node scripts/export-unity-city.cjs
unity run Unity/SketchyTestbed -- -executeMethod Sketchy.Editor.SketchySample.Bootstrap
unity test Unity/SketchyTestbed --mode EditMode --filter Sketchy.Tests --output artifacts/unity-tests.xml
```

`unity run` manages `-batchmode` and `-quit`; do not forward them. GPU tests require a graphics device, so do not use `-nographics`. Tests use a temporary asset folder, restore pipeline assignments and restore saved scene setup. Run with saved scenes or in a disposable project. The testbed's CLI Pipeline package is a development tool, not a Sketchy package dependency.

An ignored `artifacts/ValidationProject` was used for batch GPU verification while the main testbed was open. Both local-source and packed UPM imports were tested. Tests save captures inside their project under `TestResults/Sketchy`; review copies are in `artifacts/unity-city.png`, `artifacts/unity-perspective.png` and `artifacts/unity-occluded-sphere.png`.

Editor tests exercise repeat installation, restoring the default material and pipeline assignments, city face winding, shader compilation on rendered variants, contours, directional/point/spot shadows, point/spot range cutoff, spot direction, unlit ground, fitted shadow-boundary localization and gradient rejection, back-facing surfaces, directional sphere transitions, fully occluded spheres, colored-light attenuation, stable rough falloff, UV-free triplanar attachment, UI clipping, instancing on/off appearance, immediate redraw, stable stroke identity, perspective, independent cameras and resizing. Captures are visual inspection artifacts, not golden-image parity assertions. `Sketchy.Editor.SketchyBuild.BuildValidationPlayer` also builds a Windows player from a generated city in a disposable project.

## Current support boundary

The first release targets Render Graph, Forward rendering, independent mono base cameras and opaque rigid meshes. Reflection/overlay/XR cameras skip the drawing feature. Camera stacks, dynamic resolution, XR, mobile hardware, skinned rest-space attachment, baked GI, transparent pencil materials and UI Toolkit are outside the validated scope. Realtime directional, point and spot lights use URP attenuation and shadow maps. URP limits directional shadows to the main light and area lights to baking. Cookie variants are included; cookie authoring is not covered by the regression tests.

The pencil kernel is copied unchanged from the reference. The Surface Illumination model maps shadowed Lambertian lighting to ink, so unlit faces and ground remain dark. Optional ambient fill is explicit. The web city and sculpture use the same tone mapping with the default ink values and zero ambient fill. Colored lights tint paper with attenuation while graphite remains unchanged. Point/spot falloff has adjustable, stable spatial variation. Unity's shadow filter and native-resolution contour seeds differ from the browser's receiver-plane shadows and independent 2x metadata buffer. Color composition follows the web reference in display space and converts to linear output as required. Exact image parity and hardware performance baselines still need work.

The material's Object-local Triplanar switch defaults on and uses object-space positions, normals and matching derivatives to retain markings under rigid motion and nonuniform scaling. Turning it off selects world-space triplanar coordinates; neither mode needs UVs. Do not statically batch pencil objects, which rewrites that coordinate domain. Drawing seeds are explicit style/material controls and remain fixed during motion and zoom. Every frame uses current scene state and transient graph textures. Optional shadow outlines render a visibility-loss mask using the Pencil Lit material's shared lighting evaluation. Contour seeds trace a chosen occlusion level, reject geometry discontinuities and fade with incident light strength; fitting and composition reuse the geometry-outline kernel. Normal, range and color gradients alone cannot produce these contours. The extra passes are skipped when disabled. Overlay UI renders afterward.

The original research checklist below records the broader goals, including work beyond this first package release.

## Start with URP

Use URP's culling and shadows for the first port. This lets us test the drawing without also writing a lighting engine. Unity's [Render Graph documentation](https://docs.unity3d.com/6000.0/Documentation/Manual/urp/render-graph.html) covers custom passes. Pin a Unity/URP version before choosing the APIs and pass injection points.

The same drawing passes could later run in a custom SRP. Keep their math separate from the engine adapter.

| Component | Responsibility |
|---|---|
| Paper style asset | Colors, density, pressure, outline width, jitter and stroke seed |
| Material adapter | Ink demand, object/rest coordinates, normals, outline category and shadow flags |
| Hatching | Stroke IDs, families, charts, birth rules and filtering |
| Outlines | Edge samples, line fitting and pencil composition |
| Pipeline adapter | Culling, lighting, depth conventions and resource lifetime |

## First working version

1. Render opaque geometry with one directional light. Keep Light only and Raw shadows available.
2. Supply stable rest coordinates and material IDs through a material or metadata pass. Depth and normals alone cannot recover an object's intended hatch coordinates.
3. Run hatching with derivatives of those same coordinates. Compare the flat ramp and sculpture against the browser before adding complex materials.
4. Render subpixel edge data, fit the lines and composite their pencil appearance after hatching.
5. Render current camera, lights and objects every frame, with fixed stroke seeds.

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

Adapt the demo's orthographic and perspective reconstruction to the engine's projection and depth convention. Test perspective, reversed Z, dynamic resolution, multiple cameras and XR eyes separately.

All scene passes use the current frame state. Render Graph owns the intermediate textures; no cross-frame output cache or drawing scheduler is needed.

Choose where post-processing belongs. The preset disables TAA and motion blur to preserve crisp strokes. Spatial antialiasing and contour quality still need separate evaluation.

## Checks before calling it a drop-in

| Stage | Required check |
|---|---|
| Shader port | Flat ramp and stroke-ID tests agree within a recorded GPU tolerance |
| Surface attachment | Static, moving and scaled objects retain their markings during camera and light motion |
| Outlines | Flat interiors stay clear; widths, corners and creases have reviewed captures |
| Frame updates | Motion renders immediately; unchanged views and stroke seeds remain stable |
| Package | Sample scene, style asset, editor setup and multi-camera cleanup work in the pinned Unity version |
| Hardware | Full-frame timings and light/orbit/zoom captures pass on desktop and representative phones |

Curved contour fitting, directional surface atlases and better tone calibration remain separate research tasks. They should not silently change the established pencil style during the port.
