using UnityEngine;

namespace Sketchy
{
    [CreateAssetMenu(menuName = "Sketchy/Paper Style", fileName = "PaperStyle")]
    public sealed class SketchyStyle : ScriptableObject
    {
        public Color paper = new Color(0.984f, 0.978f, 0.958f);
        public Color graphite = new Color(0.125f, 0.119f, 0.115f);
        [Range(0, 1)] public float formInk = 0.38f;
        [Range(0, 1)] public float shadowInk = 0.86f;
        [InspectorName("Hatching Starts Below")]
        [Tooltip("Surfaces at or above this brightness have no lighting-driven hatching. 0 is unlit; 1 is fully lit. Material Ink remains independent.")]
        [Range(0, 1)] public float hatchStartBrightness = 1f;
        [InspectorName("Full Hatching Below")]
        [Tooltip("Surfaces at or below this brightness reach Shadow Ink. Between the two thresholds, brightness is remapped through the existing Form Ink curve. Equal thresholds make a hard cutoff.")]
        [Range(0, 1)] public float fullHatchBrightness;
        [Tooltip("Uniform artistic fill added to incoming brightness before the hatching range is applied.")]
        [Range(0, 1)] public float ambientIllumination;
        [Tooltip("Stable variation in point/spot illumination. Zero restores smooth URP falloff; light range and shadow visibility remain intact.")]
        [Range(0, 1)] public float lightFalloffRoughness = 0.35f;
        [Tooltip("Variation frequency per world unit. Higher values give smaller variations. The pattern moves with each light.")]
        [Min(0.01f)] public float lightFalloffScale = 1.5f;
        [Range(0, 1)] public float paperGrain = 0.022f;
        [Range(0, 2)] public float outlineWidth = 0.64f;
        [Range(0, 1)] public float outlineJitter = 0.35f;
        public bool outlines = true;
        [Tooltip("Draw pencil contours along cast-shadow boundaries on Pencil Lit surfaces.")]
        public bool shadowOutlines = true;
        [Range(0, 1)] public float shadowOutlineStrength = 0.75f;
        [Tooltip("Occlusion level to trace through a soft shadow's transition.")]
        [Range(0.05f, 0.95f)] public float shadowOutlineThreshold = 0.5f;
        public int drawingSeed;
        public enum View { Pencil, LightOnly, RawShadows, InkDemand }
        public View view;

        // Validate on upload as well as in the inspector: runtime scripts can edit fields.
        internal Vector4 HatchBrightnessRange
        {
            get
            {
                float start = Mathf.Clamp01(hatchStartBrightness);
                return new Vector4(Mathf.Clamp(fullHatchBrightness, 0, start), start, 0, 0);
            }
        }

        void OnValidate()
        {
            Vector4 range = HatchBrightnessRange;
            fullHatchBrightness = range.x;
            hatchStartBrightness = range.y;
        }

        internal void Apply(UnityEngine.Rendering.RasterCommandBuffer cmd, float seed)
        {
            // Color fields are authored in display space, as in the web reference.
            cmd.SetGlobalColor("_SketchyPaper", paper);
            cmd.SetGlobalColor("_SketchyGraphite", graphite);
            cmd.SetGlobalVector("_SketchyTone", new Vector4(formInk, shadowInk, paperGrain, (float)view));
            cmd.SetGlobalVector("_SketchyHatchBrightness", HatchBrightnessRange);
            cmd.SetGlobalVector("_SketchyDrawing", new Vector4(seed, outlineWidth, outlineJitter, outlines ? 1 : 0));
            cmd.SetGlobalFloat("_SketchyAmbientIllumination", ambientIllumination);
            cmd.SetGlobalVector("_SketchyLightFalloff", new Vector4(lightFalloffRoughness, lightFalloffScale, 0, 0));
            cmd.SetGlobalVector("_SketchyShadowOutlines", new Vector4(shadowOutlines ? 1 : 0, shadowOutlineStrength, shadowOutlineThreshold, 0));
        }
    }
}
