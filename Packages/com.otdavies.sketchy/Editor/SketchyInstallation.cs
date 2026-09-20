using UnityEngine;
using UnityEngine.Rendering;

namespace Sketchy.Editor
{
    public sealed class SketchyInstallation : ScriptableObject
    {
        public RenderPipelineAsset previousDefault;
        public RenderPipelineAsset[] previousQuality;
        public string[] qualityNames;
        public bool installed;
        public bool defaultMaterialChanged;
        public Material previousDefaultMaterial;
    }
}
