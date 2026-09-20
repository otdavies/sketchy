using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Sketchy.Editor
{
    public sealed class SketchyInstaller : EditorWindow
    {
        internal static string AssetRoot = "Assets/Sketchy";
        public static string Root => AssetRoot;
        public const string PackageRoot = "Packages/com.otdavies.sketchy";
        static string PipelinePath => Root + "/SketchyURP.asset";
        static string RendererPath => Root + "/SketchyRenderer.asset";
        static string StatePath => Root + "/Installation.asset";
        public static string StylePath => Root + "/PaperStyle.asset";
        string status;
        bool useSketchyAsDefault = true;

        [MenuItem("Tools/Sketchy/Installer")]
        public static void Open() => GetWindow<SketchyInstaller>("Sketchy Setup");

        void OnGUI()
        {
            GUILayout.Label("Pencil on paper", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox("Unity 6.3 / URP 17.3. Installs a dedicated Forward renderer with pencil contours and continuous rendering. Keeps main/additional lights, shadows and GPU instancing. Disables HDR, MSAA, opaque copies and extra renderer effects in this preset.", MessageType.Info);
            EditorGUILayout.HelpBox("Assigns Sketchy to Graphics and every Quality level. Previous assignments are saved once and can be restored. Existing materials keep their shaders; use Sketchy/Pencil Lit for surface hatching.", MessageType.None);
            useSketchyAsDefault=EditorGUILayout.ToggleLeft("Use Sketchy as the default mesh material",useSketchyAsDefault);
            if (GUILayout.Button("Install / Repair Sketchy Pipeline")) Run(() => Install(useSketchyAsDefault));
            if (GUILayout.Button("Set Sketchy as Default Material Now")) Run(SetDefaultMaterial);
            if (GUILayout.Button("Repair Existing Reference City Meshes")) Run(() => SketchySample.RepairCityMeshes());
            if (GUILayout.Button("Select Paper Style")) Selection.activeObject = AssetDatabase.LoadAssetAtPath<SketchyStyle>(StylePath);
            if (GUILayout.Button("Configure Cameras in Open Scenes")) Run(ConfigureCameras);
            if (GUILayout.Button("Create Reference City Scene")) Run(() => SketchySample.Create());
            if (GUILayout.Button("Create Lighting / Instancing Test Scene")) Run(() => SketchySample.Create(false));
            if (GUILayout.Button("Restore Previous Pipeline Assignments")) Run(Restore);
            if (!string.IsNullOrEmpty(status)) EditorGUILayout.HelpBox(status, MessageType.Info);
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Camera setup uses a paper clear color, disables post effects, HDR, MSAA and camera antialiasing. It supports Undo. Use Screen Space Overlay for responsive UI.", EditorStyles.wordWrappedLabel);
            EditorGUILayout.LabelField("v0.1: mono base cameras and rigid opaque meshes. XR, camera stacks, skinned rest coordinates and baked lightmaps are not validated.", EditorStyles.wordWrappedLabel);
        }

        void Run(Action action)
        {
            try { action(); status = "Done. Assets are in " + Root + "."; }
            catch (Exception e) { status = e.Message; Debug.LogException(e); }
        }

        public static UniversalRenderPipelineAsset Install(bool useSketchyDefault = false)
        {
            Directory.CreateDirectory(Root);
            AssetDatabase.Refresh();
            var state = AssetDatabase.LoadAssetAtPath<SketchyInstallation>(StatePath);
            if (state == null)
            {
                state = CreateInstance<SketchyInstallation>();
                AssetDatabase.CreateAsset(state,StatePath);
            }
            if (!state.installed)
            {
                state.previousDefault = GraphicsSettings.defaultRenderPipeline;
                state.qualityNames = QualitySettings.names;
                state.previousQuality = new RenderPipelineAsset[state.qualityNames.Length];
                for (int i=0;i<state.previousQuality.Length;i++) state.previousQuality[i]=QualitySettings.GetRenderPipelineAssetAt(i);
                EditorUtility.SetDirty(state);
            }
            var style = AssetDatabase.LoadAssetAtPath<SketchyStyle>(StylePath);
            if (style == null) { style=CreateInstance<SketchyStyle>(); AssetDatabase.CreateAsset(style,StylePath); }
            var renderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
            if (renderer == null) { renderer=CreateInstance<UniversalRendererData>(); AssetDatabase.CreateAsset(renderer,RendererPath); }
            var serialized = new SerializedObject(renderer);
            serialized.FindProperty("m_RenderingMode").intValue = 0; // Forward, per-pixel additional lights.
            serialized.FindProperty("m_IntermediateTextureMode").intValue = 1; // Always, supports screen composition.
            serialized.ApplyModifiedPropertiesWithoutUndo();
            SketchyRendererFeature feature=null;
            foreach (var item in renderer.rendererFeatures) if (item is SketchyRendererFeature f) feature=f;
            if (feature == null)
            {
                feature=CreateInstance<SketchyRendererFeature>(); feature.name="Sketchy Pencil Pipeline";
                AssetDatabase.AddObjectToAsset(feature,renderer); renderer.rendererFeatures.Add(feature);
            }
            feature.style=style;
            feature.SetShader(AssetDatabase.LoadAssetAtPath<Shader>(PackageRoot+"/Runtime/Shaders/PencilScreen.shader"));
            feature.SetActive(true);
            feature.Create();
            renderer.SetDirty();
            EditorUtility.SetDirty(feature);
            EditorUtility.SetDirty(renderer);
            var pipeline=AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
            if (pipeline == null) { pipeline=UniversalRenderPipelineAsset.Create(renderer); AssetDatabase.CreateAsset(pipeline,PipelinePath); }
            pipeline.supportsHDR=false;
            pipeline.msaaSampleCount=1;
            pipeline.renderScale=1;
            pipeline.supportsCameraDepthTexture=true;
            pipeline.supportsCameraOpaqueTexture=false;
            var pipelineSettings=new SerializedObject(pipeline);
            pipelineSettings.FindProperty("m_MainLightRenderingMode").intValue=(int)LightRenderingMode.PerPixel;
            pipelineSettings.FindProperty("m_MainLightShadowsSupported").boolValue=true;
            pipelineSettings.FindProperty("m_AdditionalLightsRenderingMode").intValue=(int)LightRenderingMode.PerPixel;
            pipelineSettings.FindProperty("m_AdditionalLightShadowsSupported").boolValue=true;
            pipelineSettings.FindProperty("m_SoftShadowsSupported").boolValue=true;
            pipelineSettings.ApplyModifiedPropertiesWithoutUndo();
            pipeline.mainLightShadowmapResolution=2048;
            pipeline.maxAdditionalLightsCount=8;
            pipeline.additionalLightsShadowmapResolution=2048;
            pipeline.shadowDistance=50;
            pipeline.shadowCascadeCount=2;
            pipeline.shadowDepthBias=0.15f;
            pipeline.shadowNormalBias=0.2f;
            pipeline.useSRPBatcher=true;
            pipeline.supportsDynamicBatching=false; // Preserve per-object hatch coordinates.
            EditorUtility.SetDirty(pipeline);
            GraphicsSettings.defaultRenderPipeline=pipeline;
            for (int i=0;i<QualitySettings.names.Length;i++) SetQualityPipeline(i,pipeline);
            state.installed=true; EditorUtility.SetDirty(state);
            if(useSketchyDefault) SetDefaultMaterial();
            SketchySample.RepairCityMeshes();
            AssetDatabase.SaveAssets();
            return pipeline;
        }

        public static void Restore()
        {
            var state=AssetDatabase.LoadAssetAtPath<SketchyInstallation>(StatePath);
            if (state == null || !state.installed) return;
            if(state.defaultMaterialChanged)
            {
                var defaults=DefaultMaterialSettings(out var property);
                var ours=AssetDatabase.LoadAssetAtPath<Material>(Root+"/DefaultPencil.mat");
                if(property.objectReferenceValue==ours)
                {
                    property.objectReferenceValue=state.previousDefaultMaterial;
                    defaults.ApplyModifiedPropertiesWithoutUndo();
                }
                state.defaultMaterialChanged=false;
            }
            var installed=AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
            if (GraphicsSettings.defaultRenderPipeline == installed) GraphicsSettings.defaultRenderPipeline=state.previousDefault;
            for (int i=0;i<QualitySettings.names.Length;i++)
            {
                int old=Array.IndexOf(state.qualityNames,QualitySettings.names[i]);
                if (old>=0 && QualitySettings.GetRenderPipelineAssetAt(i)==installed)
                    SetQualityPipeline(i,state.previousQuality[old]);
            }
            state.installed=false; EditorUtility.SetDirty(state); AssetDatabase.SaveAssets();
        }

        static SerializedObject DefaultMaterialSettings(out SerializedProperty material)
        {
            var global=GraphicsSettings.GetSettingsForRenderPipeline<UniversalRenderPipeline>();
            if(global==null) throw new InvalidOperationException("Install the Sketchy pipeline first so URP global settings exist.");
            var serialized=new SerializedObject(global);
            var property=serialized.GetIterator();
            while(property.Next(true))
            {
                if(property.propertyType==SerializedPropertyType.ManagedReference &&
                    property.managedReferenceFullTypename.EndsWith("UniversalRenderPipelineEditorMaterials",StringComparison.Ordinal))
                {
                    material=property.FindPropertyRelative("m_DefaultMaterial");
                    return serialized;
                }
            }
            throw new InvalidOperationException("URP 17.3 default material settings were not found.");
        }

        public static void SetDefaultMaterial()
        {
            var state=AssetDatabase.LoadAssetAtPath<SketchyInstallation>(StatePath);
            if(state==null || !state.installed) { Install(); state=AssetDatabase.LoadAssetAtPath<SketchyInstallation>(StatePath); }
            var settings=DefaultMaterialSettings(out var property);
            var material=AssetDatabase.LoadAssetAtPath<Material>(Root+"/DefaultPencil.mat");
            if(material==null)
            {
                material=new Material(Shader.Find("Sketchy/Pencil Lit")) { name="Default Pencil",enableInstancing=true };
                AssetDatabase.CreateAsset(material,Root+"/DefaultPencil.mat");
            }
            if(!state.defaultMaterialChanged)
            {
                state.previousDefaultMaterial=property.objectReferenceValue as Material;
                state.defaultMaterialChanged=true;
            }
            property.objectReferenceValue=material;
            settings.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(state); AssetDatabase.SaveAssets();
        }

        public static void ConfigureCamera(Camera camera)
        {
            Undo.RecordObject(camera,"Configure Sketchy Camera");
            camera.clearFlags=CameraClearFlags.SolidColor;
            var style=AssetDatabase.LoadAssetAtPath<SketchyStyle>(StylePath);
            camera.backgroundColor=style != null ? style.paper : Color.white;
            camera.allowHDR=false; camera.allowMSAA=false;
            var data=camera.GetComponent<UniversalAdditionalCameraData>();
            if (data==null) data=Undo.AddComponent<UniversalAdditionalCameraData>(camera.gameObject);
            Undo.RecordObject(data,"Configure Sketchy Camera");
            data.renderPostProcessing=false;
            data.antialiasing=AntialiasingMode.None;
            data.SetRenderer(-1);
            EditorSceneManager.MarkSceneDirty(camera.gameObject.scene);
        }

        internal static void SetQualityPipeline(int index, RenderPipelineAsset pipeline)
        {
            // Edit the assignment without switching the user's active quality level.
            var settings=new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/QualitySettings.asset")[0]);
            settings.FindProperty("m_QualitySettings").GetArrayElementAtIndex(index)
                .FindPropertyRelative("customRenderPipeline").objectReferenceValue=pipeline;
            settings.ApplyModifiedPropertiesWithoutUndo();
        }

        public static void ConfigureCameras()
        {
            foreach (var camera in FindObjectsByType<Camera>(FindObjectsInactive.Include,FindObjectsSortMode.None))
                if (camera.gameObject.scene.IsValid()) ConfigureCamera(camera);
        }
    }
}
