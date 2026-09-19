# Toward a Unity paper drawing pipeline

This is a proposed architecture and acceptance plan. There is no installable Unity package in this repository yet. The HLSL files in [`reference/hlsl/`](../reference/hlsl/) translate the kernels; they have not been compiled or validated in Unity.

The intended experience is a scene rendered as a coherent drawing: empty lit paper, surface-attached graphite, controlled architectural contours, and optional held animation. A full-screen color filter alone cannot provide stable surface coordinates or object attachment.

## Package boundaries

| Proposed component | Owns |
|---|---|
| Paper style asset | Paper/graphite colors, density, pressure, outline width/jitter, tone response and drawing cadence |
| Material adapter | Ink demand, stable object/rest coordinates, geometric and shading normals, outline category, cast/receive flags |
| Hatching core | Canonical stroke identity, families, charts, birth rules and filtering |
| Contour passes | Metadata, edge seeds, local fit, occupancy and line composition |
| Drawing scheduler | Captured scene state, separate stroke seed, persistent output texture, per-camera lifetime |
| Render-pipeline adapter | Culling, lights/shadows, projection/depth conventions, resource lifetime and engine integration |

Keep the math independent of pipeline plumbing. The browser should remain a compact visual reference while Unity becomes the production renderer. Select and pin a Unity/URP version at the start of implementation rather than promise broad version support from untested sketches.

## First integration: URP as the host

An initial URP adapter can prove the rendering contracts using Unity's existing culling and shadow infrastructure. Unity documents the [Render Graph system](https://docs.unity3d.com/6000.0/Documentation/Manual/urp/render-graph.html) as the API for authoring render passes. The concrete APIs and injection points must be chosen for the pinned package version.

1. Add an explicit paper-material pass, or a metadata pass that supplies stable rest coordinates and material IDs. Normal/depth alone cannot recover every object's intended hatch frame.
2. Feed unshadowed illumination and shadow visibility through a separate artistic ink-demand function. Begin with one directional light and opaque geometry; preserve raw inspection views.
3. Run the HLSL hatching core using derivatives of the same rest-coordinate mapping being shaded. Confirm appearance against the WebGL flat and sculpture studies before adding complex materials.
4. Produce subpixel edge metadata, seed and fit passes, then composite the outlines after hatching. Keep geometrical estimation free of artistic noise.
5. Retain the finished drawing in a persistent texture. Capture the camera, lights and visible object state together on a drawing tick; present that texture between ticks.

This is a route to the broader paper pipeline, not a decision to abandon a custom SRP. A dedicated SRP can later own the same material, lighting and drawing contracts when full control is useful. Avoid implementing a second shadow system before the drawing stages are validated against the engine's lighting.

## Inputs that must be explicit

| Input | Required meaning |
|---|---|
| Rest position and derivatives | A stable chart domain; both expressed in the same coordinate frame |
| Object identity | Separates overlapping object charts without changing on camera movement |
| Geometric normal | Visibility, plane tests and receiver-plane calculations |
| Appearance normal | Optional artistic chart or lighting input; not a substitute for geometric normals |
| Ink demand | A defined 0–1 material/tone signal; zero means no hatch ink |
| Drawing seed | Stable for a held drawing; independent of wall-clock time and shadow sampling |
| Pixel footprint | Measured in final output pixels, accounting for dynamic resolution and supersampling |

Rigid objects should carry rest/object-space strokes through motion. Nonuniform scale needs consistent derivative and normal transforms. Skinned meshes need a persistent rest domain plus deformed derivatives; sampling world position will swim. Large scenes need stable local origins or integer cell addressing that does not silently re-key parent strokes.

## Projection and resource rules

Do not copy the city's fixed orthographic depth equation into a perspective camera. Reconstruct positions using the actual projection, render-target orientation and engine depth convention. Test orthographic, perspective, reversed Z and dynamic resolution explicitly. Treat XR eyes and multiple cameras as separate state owners.

The drawing clock must control when scene buffers are consumed, not merely quantize one shader uniform while transforms continue changing beneath it. Retain output across frames with persistent resources; transient render-graph textures cannot serve as implicit history. Keep UI outside the held image if it should remain responsive.

Decide whether post-processing happens before the held image or after presentation. Temporal antialiasing and motion blur must not interpolate the drawing layer by default. Spatial antialiasing remains necessary. A fixed seed in Continuous mode is a useful coordinate diagnostic, separate from artistic redraw.

## Milestones and evidence

| Milestone | Done when |
|---|---|
| Kernel parity | Flat ramp and canonical stroke tests agree within a documented GPU tolerance; no line re-keying at an octave boundary |
| Surface integration | Static, rigid-moving and scaled objects keep their markings through camera/light motion |
| Contours | Isolated planes have no false edges; silhouettes and creases maintain a measured pixel width; corners have reviewed captures |
| Drawing clock | Entire output is unchanged between ticks; zoom redraws are discrete; light/orbit do not reroll strokes |
| Pipeline package | Sample scene, style asset, editor setup, multiple-camera lifecycle and clean install/uninstall work in the pinned Unity version |
| Hardware qualification | Measured full-frame cost and captured light/orbit/zoom sweeps on desktop and representative mobile GPUs |

Open research priorities: confidence-aware curved contours, a better directional surface atlas, tone calibration that preserves overlapping graphite, and adaptive sampling without changing mark identity. Keep those as separable experiments so performance work cannot quietly replace the established pencil style.
