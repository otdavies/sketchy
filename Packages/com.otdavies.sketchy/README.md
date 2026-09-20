# Sketchy for Unity

Pencil hatching and fitted screen-space contours for **Unity 6.3 (6000.3.12f1), URP 17.3.0**. This is the first Unity testbed release; the WebGL demo remains the visual reference.

## Install from Git

In **Window > Package Management > Package Manager**, choose **Install package from git URL**:

```text
https://github.com/otdavies/sketchy.git?path=/Packages/com.otdavies.sketchy
```

Append `#<commit-or-tag>` to pin a revision. The repository root remains the web project's npm package; the `?path=` suffix is required.

1. Open **Tools > Sketchy > Installer**.
2. Click **Install / Repair Sketchy Pipeline**. This creates assets under `Assets/Sketchy` and assigns the preset to Graphics and all Quality levels. Enable **Use Sketchy as the default mesh material** to apply pencil materials to newly created primitives, or use **Set Sketchy as Default Material Now** later. Existing materials are not converted.
3. Click **Create Reference City Scene** for the original web geometry, or **Create Lighting / Instancing Test Scene** for shared-material primitives and a point light.
4. For your own scene, assign materials using **Sketchy/Pencil Lit**, then click **Configure Cameras in Open Scenes**.
5. Edit `Assets/Sketchy/PaperStyle.asset` to adjust ink, paper and outlines.

Installation is repeatable. **Restore Previous Pipeline Assignments** restores saved Graphics/Quality references and the previous default material, matching quality levels by name. It leaves generated assets available for reuse and preserves assignments subsequently changed to another pipeline. Camera configuration is a separate, undoable action. Scene creation asks to save unsaved scenes. **Repair Existing Reference City Meshes** corrects triangle winding in earlier generated city samples; installation also runs this repair.

## Preset

The preset uses Forward rendering, SRP Batcher, main and additional per-pixel lights, directional cascades, point/spot shadow maps, and soft shadows. It disables HDR, MSAA, opaque texture copies and dynamic batching. Its dedicated renderer has no SSAO, bloom, temporal AA or motion blur. Camera setup disables camera post-processing and antialiasing and uses a paper clear color. Existing URP assets and material assignments are preserved.

Use ordinary Unity MeshRenderers and lights. Pencil Lit has forward, depth, depth-normal and shadow-caster passes, with GPU instancing variants. Enable instancing on materials when appropriate; Unity may prefer SRP batching. Do not statically batch pencil meshes: their object-space coordinates are the stroke domain. Rigid movement and nonuniform scale preserve this domain. Skinned meshes need an explicit undeformed coordinate stream before they can retain strokes through deformation.

The style uses **Surface Illumination**: light reaching the surface removes ink. Back-facing, occluded and out-of-range surfaces receive **Shadow Ink**, including ground. **Form Ink** shapes midtones, and **Ambient Illumination** adds an optional uniform artistic fill (zero by default). Light color tints the paper surface, fading toward its original tint as incoming light weakens. Graphite keeps the selected stroke color. Light luminance also controls ink demand. Main and additional lights use the clamped normal/light dot product, URP's inverse-square attenuation, smooth range cutoff, spot cone, cookies and shadow visibility before mapping total illumination to ink. Other lights can fill a shadow.

`Material Ink` adds a dark base deposit, `Surface Scale` sets the coordinate scale, and `Stroke Identity` allows material-specific variation. **Object-local Triplanar** is enabled by default: strokes follow an object's local coordinates through rigid movement and require no UVs. Disable it for world-space triplanar projection across objects. Both coordinate choices use matching normals and derivatives.

**Light Falloff Roughness** adds smooth, stable spatial variation to point/spot illumination; set it to zero for ordinary URP attenuation. **Light Falloff Scale** controls spatial frequency. The pattern follows each light, is shared across surfaces and affects both paper tint and ink demand. It does not animate or extend the light's range, and shadow visibility still gates the light contribution. Directional lights retain their surface-normal falloff.

Light Only displays unshadowed diffuse lighting, Raw Shadows displays diffuse-weighted shadow visibility, and Ink Demand displays tone before hatching (white means maximum ink).

Realtime directional, point and spot lighting/shadows are supported. URP supplies shadows for one main directional light; additional directional lights illuminate but do not cast shadows. Area lights are baked-only in URP, and baked lightmaps/ambient probes are not implemented by this first pencil material. PBR reflections are also outside this style. These limits are distinct from realtime point/spot support; see [Unity's pipeline comparison](https://docs.unity.com/en-us/engine/6000.0/manual/render-pipelines/choose-a-render-pipeline/feature-comparison).

## Rendering and UI

The Render Graph feature detects depth/normal edges, fits local boundary segments and composites graphite every camera frame. **Shadow Outlines** additionally traces cast-shadow visibility on Pencil Lit receivers, using the same outline width, jitter and graphite color. **Shadow Outline Strength** controls opacity; **Shadow Outline Threshold** places a single contour within soft transitions (0.5 by default). Geometry outlines and shadow outlines have independent toggles. Unshadowed lighting gradients, paper tint, hatching and rough falloff do not create shadow contours. Weak lights fade the contours, and other lights or ambient fill can suppress them. Turning the option off or setting strength to zero skips its visibility, seed, fit and composition passes. All textures are transient graph resources. There is no frame history, drawing-rate control or temporal blending. Stroke seeds remain fixed until explicitly edited.

Use **Screen Space Overlay** canvases for UI drawn after the scene. **Sketchy/UI Paper** supports sprite textures, tint/alpha, paper grain, stencil Mask, RectMask2D and soft rectangle clipping. UI uses material-local colors, independent of which scene camera rendered last.

## Current support boundary

- Unity 6.3, URP 17.3, Render Graph enabled, Forward renderer, independent mono base cameras, opaque rigid meshes.
- Native-resolution contours use the browser's local line fitting. The browser uses a separate 2x metadata buffer; subpixel contours and Unity shadow filtering therefore differ. Exact pixel parity is not claimed.
- The stroke kernel is copied unchanged from `reference/hlsl/PencilHatching.hlsl`; the synchronized outline kernel exposes width and can omit the mip occupancy shortcut for native textures.
- XR, camera stacks, reflection cameras, dynamic resolution, skinned rest coordinates, baked GI, transparent pencil surfaces and mobile GPU performance are outside the validated first-release scope. XR/overlay/reflection cameras skip the feature.
- Render Graph compatibility mode is unsupported. Use the supplied preset; custom renderers must supply depth/normals and an intermediate color texture.

See [the repository Unity guide](https://github.com/otdavies/sketchy/blob/main/docs/unity-srp.md) for test commands and architecture.
