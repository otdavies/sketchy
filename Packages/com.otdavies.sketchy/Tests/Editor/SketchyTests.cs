using System.Collections;
using System.IO;
using System.Linq;
using NUnit.Framework;
using Sketchy.Editor;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.TestTools;

namespace Sketchy.Tests
{
    public sealed class SketchyTests
    {
        RenderPipelineAsset previousDefault;
        RenderPipelineAsset[] previousQuality;
        SceneSetup[] previousScenes;

        [OneTimeSetUp]
        public void IsolateTestAssets()
        {
            previousDefault=GraphicsSettings.defaultRenderPipeline;
            previousQuality=Enumerable.Range(0,QualitySettings.names.Length).Select(QualitySettings.GetRenderPipelineAssetAt).ToArray();
            previousScenes=EditorSceneManager.GetSceneManagerSetup();
            SketchyInstaller.AssetRoot=AssetDatabase.GenerateUniqueAssetPath("Assets/__SketchyTests");
        }

        [OneTimeTearDown]
        public void RestoreProject()
        {
            SketchyInstaller.Restore();
            GraphicsSettings.defaultRenderPipeline=previousDefault;
            for(int i=0;i<previousQuality.Length;i++) SketchyInstaller.SetQualityPipeline(i,previousQuality[i]);
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            AssetDatabase.DeleteAsset(SketchyInstaller.Root);
            SketchyInstaller.AssetRoot="Assets/Sketchy";
            if(previousScenes.Length>0) EditorSceneManager.RestoreSceneManagerSetup(previousScenes);
        }

        [Test]
        public void InstallerIsIdempotentAndRestoresAssignments()
        {
            SketchyInstaller.Restore();
            var previous=GraphicsSettings.defaultRenderPipeline;
            var qualities=Enumerable.Range(0,QualitySettings.names.Length).Select(QualitySettings.GetRenderPipelineAssetAt).ToArray();
            var first=SketchyInstaller.Install();
            var previousMaterial=first.defaultMaterial;
            string previousMaterialPath=AssetDatabase.GetAssetPath(previousMaterial);
            SketchyInstaller.SetDefaultMaterial();
            Assert.AreEqual("Sketchy/Pencil Lit",first.defaultMaterial.shader.name);
            var primitive=GameObject.CreatePrimitive(PrimitiveType.Cube);
            Assert.AreEqual("Sketchy/Pencil Lit",primitive.GetComponent<Renderer>().sharedMaterial.shader.name);
            Object.DestroyImmediate(primitive);
            Assert.AreSame(first,SketchyInstaller.Install());
            Assert.IsFalse(first.supportsHDR);
            Assert.IsFalse(first.supportsCameraOpaqueTexture);
            Assert.IsTrue(first.supportsMainLightShadows);
            Assert.IsTrue(first.supportsAdditionalLightShadows);
            var renderer=AssetDatabase.LoadAssetAtPath<UniversalRendererData>(SketchyInstaller.Root+"/SketchyRenderer.asset");
            Assert.AreEqual(1,renderer.rendererFeatures.OfType<SketchyRendererFeature>().Count());
            SketchyInstaller.Restore();
            Assert.AreEqual(previousMaterialPath,AssetDatabase.GetAssetPath(first.defaultMaterial));
            Assert.AreSame(previous,GraphicsSettings.defaultRenderPipeline);
            for(int i=0;i<qualities.Length;i++) Assert.AreSame(qualities[i],QualitySettings.GetRenderPipelineAssetAt(i));
            SketchyInstaller.Install();
        }

        [UnityTest]
        public IEnumerator RenderCityAndValidateLightingAndImmediateCameraUpdates()
        {
            SketchySample.Create();
            foreach(var mesh in Object.FindObjectsByType<MeshFilter>(FindObjectsSortMode.None).Select(f=>f.sharedMesh))
            {
                var v=mesh.vertices; var n=mesh.normals; var triangles=mesh.triangles;
                for(int i=0;i<triangles.Length;i+=3)
                {
                    int a=triangles[i],b=triangles[i+1],c=triangles[i+2];
                    Assert.GreaterOrEqual(Vector3.Dot(Vector3.Cross(v[b]-v[a],v[c]-v[a]),n[a]),0,"City mesh front faces must agree with normals.");
                }
            }
            yield return null;
            yield return null;
            var style=AssetDatabase.LoadAssetAtPath<SketchyStyle>(SketchyInstaller.StylePath);
            var camera=Camera.main;
            var target=new RenderTexture(960,400,24,RenderTextureFormat.ARGB32);
            target.Create();
            var before=Capture(camera,target);
            SaveCapture("unity-city.png",before);
            var pixels=before.GetPixels32();
            Assert.Greater(pixels.Count(p=>p.r<150 && p.g<150 && p.b<150),300,"Expected graphite strokes and shadows.");
            Assert.Less(pixels.Count(p=>p.r>220 && p.b>220 && p.g<40),10,"Unexpected shader error magenta.");
            style.outlines=false;
            var noOutlines=Capture(camera,target);
            Assert.Greater(Difference(before,noOutlines),0.0001,"Contour pass must affect the image.");
            style.outlines=true;
            style.view=SketchyStyle.View.RawShadows;
            var shadowed=Capture(camera,target);
            RenderSettings.sun.shadows=LightShadows.None;
            var unshadowed=Capture(camera,target);
            Assert.Greater(Difference(shadowed,unshadowed),0.001,"Main light shadows must reach the pencil shader.");
            RenderSettings.sun.shadows=LightShadows.Soft;
            style.view=SketchyStyle.View.Pencil;
            var current=Capture(camera,target);
            camera.transform.position+=Vector3.right;
            var moved=Capture(camera,target);
            Assert.Greater(Difference(current,moved),0.001,"Camera changes must render immediately, without a frame-rate gate.");
            var redrawn=Capture(camera,target);
            Assert.AreEqual(0,Difference(moved,redrawn),"An unchanged view must keep stable stroke identity.");
            camera.orthographic=false;
            var perspective=Capture(camera,target);
            Assert.Greater(Difference(redrawn,perspective),0.001);
            SaveCapture("unity-perspective.png",perspective);
            var second=new GameObject("Second camera").AddComponent<Camera>();
            second.CopyFrom(camera); second.transform.SetPositionAndRotation(camera.transform.position+Vector3.right*3,camera.transform.rotation);
            SketchyInstaller.ConfigureCamera(second);
            var other=Capture(second,target);
            Assert.Greater(Difference(perspective,other),0.001,"Independent cameras must render their own view.");
            var resized=new RenderTexture(480,200,24,RenderTextureFormat.ARGB32); resized.Create();
            var small=Capture(camera,resized);
            Assert.AreEqual(480,small.width);
            foreach(var name in new[]{"Sketchy/Pencil Lit","Hidden/Sketchy/Pencil Screen","Sketchy/UI Paper"})
            {
                var shader=Shader.Find(name);
                Assert.IsNotNull(shader);
                Assert.IsFalse(ShaderUtil.ShaderHasError(shader),name);
            }
            foreach(var tex in new[]{before,noOutlines,shadowed,unshadowed,current,moved,redrawn,perspective,other,small}) Object.DestroyImmediate(tex);
            Object.DestroyImmediate(second.gameObject);
            target.Release(); Object.DestroyImmediate(target);
            resized.Release(); Object.DestroyImmediate(resized);
            style.view=SketchyStyle.View.Pencil;
        }

        static Texture2D Capture(Camera camera,RenderTexture target)
        {
            var request=new UniversalRenderPipeline.SingleCameraRequest {destination=target};
            RenderPipeline.SubmitRenderRequest(camera,request);
            var previous=RenderTexture.active;
            RenderTexture.active=target;
            var image=new Texture2D(target.width,target.height,TextureFormat.RGBA32,false);
            image.ReadPixels(new Rect(0,0,target.width,target.height),0,0); image.Apply();
            RenderTexture.active=previous;
            return image;
        }

        [UnityTest]
        public IEnumerator AdditionalLightsAndInstancedMaterialsRender()
        {
            SketchySample.Create(false);
            yield return null;
            var style=AssetDatabase.LoadAssetAtPath<SketchyStyle>(SketchyInstaller.StylePath);
            var target=new RenderTexture(480,320,24,RenderTextureFormat.ARGB32); target.Create();
            var camera=Camera.main;
            var pipeline=(UniversalRenderPipelineAsset)GraphicsSettings.defaultRenderPipeline;
            pipeline.useSRPBatcher=false;
            var point=Object.FindObjectsByType<Light>(FindObjectsSortMode.None).First(l=>l.type==LightType.Point);
            var lit=Capture(camera,target);
            point.enabled=false;
            var unlit=Capture(camera,target);
            Assert.Greater(Difference(lit,unlit),0.001,"Additional point lights must affect ink demand.");
            var materials=Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None).Select(r=>r.sharedMaterial).Distinct().ToArray();
            foreach(var m in materials) m.enableInstancing=false;
            var nonInstanced=Capture(camera,target);
            Assert.Less(Difference(unlit,nonInstanced),0.001,"Instancing must preserve appearance.");
            RenderSettings.sun.enabled=false;
            point.enabled=false;
            var noLights=Capture(camera,target);
            point.enabled=true;
            foreach(var type in new[]{LightType.Point,LightType.Spot})
            {
                point.type=type;
                point.transform.position=new Vector3(0,3,-2);
                point.transform.LookAt(Vector3.zero);
                point.spotAngle=100; point.innerSpotAngle=60;
                point.range=0.1f;
                var outOfRange=Capture(camera,target);
                Assert.Less(Difference(noLights,outOfRange),0.0001,type+" must contribute nothing outside its range.");
                point.range=10;
                point.shadows=LightShadows.Soft;
                var withShadows=Capture(camera,target);
                SaveCapture("unity-"+type.ToString().ToLowerInvariant()+".png",withShadows);
                point.shadows=LightShadows.None;
                var withoutShadows=Capture(camera,target);
                Assert.Greater(Difference(withShadows,withoutShadows),0.0001,type+" must cast visible pencil shadows.");
                Assert.Greater(Difference(outOfRange,withoutShadows),0.001,type+" must respect range attenuation.");
                if(type==LightType.Spot)
                {
                    point.transform.rotation=Quaternion.LookRotation(Vector3.up);
                    var away=Capture(camera,target);
                    Assert.Greater(Difference(withoutShadows,away),0.001,"Spot light cone must follow its direction.");
                    Object.DestroyImmediate(away);
                }
                foreach(var tex in new[]{outOfRange,withShadows,withoutShadows}) Object.DestroyImmediate(tex);
            }
            Object.DestroyImmediate(noLights);
            pipeline.useSRPBatcher=true;
            foreach(var m in materials) m.enableInstancing=true;
            foreach(var tex in new[]{lit,unlit,nonInstanced}) Object.DestroyImmediate(tex);
            target.Release(); Object.DestroyImmediate(target);
        }

        static double Difference(Texture2D a,Texture2D b)
        {
            var x=a.GetPixels32(); var y=b.GetPixels32();
            long total=0;
            for(int i=0;i<x.Length;i++) total+=System.Math.Abs(x[i].r-y[i].r)+System.Math.Abs(x[i].g-y[i].g)+System.Math.Abs(x[i].b-y[i].b);
            return total/(x.Length*3.0*255);
        }

        static void SaveCapture(string name,Texture2D image)
        {
            string directory=Path.GetFullPath(Path.Combine(Application.dataPath,"../TestResults/Sketchy"));
            Directory.CreateDirectory(directory);
            File.WriteAllBytes(Path.Combine(directory,name),image.EncodeToPNG());
        }

        [UnityTest]
        public IEnumerator PaperUIRendersAndClips()
        {
            SketchySample.Create(false);
            yield return null;
            var style=AssetDatabase.LoadAssetAtPath<SketchyStyle>(SketchyInstaller.StylePath);
            var camera=Camera.main;
            var target=new RenderTexture(480,320,24,RenderTextureFormat.ARGB32); target.Create();
            var canvas=new GameObject("UI test",typeof(Canvas)).GetComponent<Canvas>();
            canvas.renderMode=RenderMode.ScreenSpaceCamera; canvas.worldCamera=camera; canvas.planeDistance=1;
            var clip=new GameObject("Clip",typeof(RectTransform),typeof(UnityEngine.UI.RectMask2D));
            clip.transform.SetParent(canvas.transform,false);
            ((RectTransform)clip.transform).sizeDelta=new Vector2(100,100);
            var image=new GameObject("Paper",typeof(RectTransform),typeof(UnityEngine.UI.Image)).GetComponent<UnityEngine.UI.Image>();
            image.transform.SetParent(clip.transform,false);
            image.rectTransform.sizeDelta=new Vector2(220,220);
            var material=new Material(Shader.Find("Sketchy/UI Paper"));
            material.SetColor("_Color",Color.red);
            image.material=material;
            Canvas.ForceUpdateCanvases();
            var masked=Capture(camera,target);
            int maskedRed=masked.GetPixels32().Count(p=>p.r>150 && p.g<60 && p.b<60);
            Assert.Greater(maskedRed,500,"Paper UI must remain visible through scene composition.");
            clip.GetComponent<UnityEngine.UI.RectMask2D>().enabled=false;
            Canvas.ForceUpdateCanvases();
            var unmasked=Capture(camera,target);
            int unmaskedRed=unmasked.GetPixels32().Count(p=>p.r>150 && p.g<60 && p.b<60);
            Assert.Greater(unmaskedRed,maskedRed*2,"RectMask2D must clip paper UI.");
            Assert.IsFalse(ShaderUtil.ShaderHasError(material.shader));
            Object.DestroyImmediate(canvas.gameObject); Object.DestroyImmediate(material);
            Object.DestroyImmediate(masked); Object.DestroyImmediate(unmasked);
            target.Release(); Object.DestroyImmediate(target);
        }

        [UnityTest]
        public IEnumerator UnlitGroundAndBackFacesStayDark()
        {
            SketchySample.Create(false);
            yield return null;
            foreach(var renderer in Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None)) renderer.enabled=false;
            foreach(var light in Object.FindObjectsByType<Light>(FindObjectsSortMode.None)) light.enabled=false;
            var style=AssetDatabase.LoadAssetAtPath<SketchyStyle>(SketchyInstaller.StylePath);
            style.ambientIllumination=0;
            style.view=SketchyStyle.View.InkDemand;
            var cube=GameObject.CreatePrimitive(PrimitiveType.Cube);
            var material=new Material(Shader.Find("Sketchy/Pencil Lit"));
            cube.GetComponent<Renderer>().sharedMaterial=material;
            var camera=Camera.main;
            camera.orthographicSize=1;
            camera.transform.SetPositionAndRotation(new Vector3(0,0,-5),Quaternion.identity);
            var target=new RenderTexture(128,128,24,RenderTextureFormat.ARGB32); target.Create();
            var source=new GameObject("Surface illumination test").AddComponent<Light>();
            source.range=10; source.shadows=LightShadows.None;
            source.spotAngle=90; source.innerSpotAngle=80;
            var ground=GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.transform.rotation=Quaternion.Euler(-90,0,0);
            ground.GetComponent<Renderer>().sharedMaterial=material;
            ground.SetActive(false);
            foreach(var surface in new[]{cube,ground})
            {
                cube.SetActive(surface==cube); ground.SetActive(surface==ground);
                source.enabled=false;
                Assert.Greater(CenterInk(camera,target),0.83f,"No light must produce shadow ink, including on ground.");
                source.enabled=true;
                foreach(var type in new[]{LightType.Directional,LightType.Point,LightType.Spot})
                {
                    source.type=type; source.intensity=type==LightType.Directional ? 1 : 20;
                    source.transform.position=new Vector3(0,0,-3);
                    source.transform.LookAt(Vector3.zero);
                    Assert.Less(CenterInk(camera,target),0.05f,type+" must illuminate the facing surface.");
                    source.transform.position=new Vector3(0,0,3);
                    source.transform.LookAt(Vector3.zero);
                    Assert.Greater(CenterInk(camera,target),0.83f,type+" must not illuminate the reverse face, even with shadows disabled.");
                }
            }
            source.enabled=false;
            style.ambientIllumination=0.25f;
            float filled=CenterInk(camera,target);
            Assert.That(filled,Is.InRange(0.50f,0.65f),"Explicit ambient fill must reduce ink without returning to white.");
            style.ambientIllumination=0;
            style.view=SketchyStyle.View.Pencil;
            Object.DestroyImmediate(source.gameObject); Object.DestroyImmediate(cube); Object.DestroyImmediate(ground); Object.DestroyImmediate(material);
            target.Release(); Object.DestroyImmediate(target);
        }

        static float CenterInk(Camera camera,RenderTexture target)
        {
            var image=Capture(camera,target);
            float ink=image.GetPixel(target.width/2,target.height/2).r;
            Object.DestroyImmediate(image);
            // Diagnostic output is linear ink demand, encoded by the sRGB render target.
            return QualitySettings.activeColorSpace==ColorSpace.Linear ? Mathf.GammaToLinearSpace(ink) : ink;
        }

        [UnityTest]
        public IEnumerator TriplanarMappingNeedsNoUVsAndCanFollowTheObject()
        {
            SketchySample.Create(false);
            yield return null;
            foreach(var renderer in Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None)) renderer.enabled=false;
            foreach(var light in Object.FindObjectsByType<Light>(FindObjectsSortMode.None)) light.enabled=false;
            var style=AssetDatabase.LoadAssetAtPath<SketchyStyle>(SketchyInstaller.StylePath);
            style.view=SketchyStyle.View.Pencil; style.ambientIllumination=0;
            var cube=GameObject.CreatePrimitive(PrimitiveType.Cube);
            var mesh=Object.Instantiate(cube.GetComponent<MeshFilter>().sharedMesh);
            mesh.uv=new Vector2[0]; cube.GetComponent<MeshFilter>().sharedMesh=mesh;
            var material=new Material(Shader.Find("Sketchy/Pencil Lit"));
            cube.GetComponent<Renderer>().sharedMaterial=material;
            Assert.AreEqual(1,material.GetFloat("_ObjectSpaceHatching"),"Object-local mapping is the default.");
            var camera=Camera.main; camera.orthographicSize=0.7f;
            var originalCamera=new Vector3(0,0,-5);
            camera.transform.SetPositionAndRotation(originalCamera,Quaternion.identity);
            var target=new RenderTexture(256,256,24,RenderTextureFormat.ARGB32); target.Create();
            var original=Capture(camera,target);
            var translation=new Vector3(.37f,.23f,.19f);
            var rotation=Quaternion.Euler(13,27,8);
            cube.transform.SetPositionAndRotation(translation,rotation);
            camera.transform.SetPositionAndRotation(translation+rotation*originalCamera,rotation);
            var attached=Capture(camera,target);
            Assert.Less(Difference(original,attached),0.003,"Object-local strokes must follow rigid translation and rotation without UVs.");
            material.SetFloat("_ObjectSpaceHatching",0);
            var world=Capture(camera,target);
            Assert.Greater(Difference(attached,world),0.015,"World mapping must change the projected stroke coordinates.");
            SaveCapture("unity-triplanar-local.png",attached); SaveCapture("unity-triplanar-world.png",world);
            foreach(var tex in new[]{original,attached,world}) Object.DestroyImmediate(tex);
            Object.DestroyImmediate(cube); Object.DestroyImmediate(material); Object.DestroyImmediate(mesh);
            target.Release(); Object.DestroyImmediate(target);
        }

        [UnityTest]
        public IEnumerator ColoredLightsTintPaperAndPreserveGraphite()
        {
            SketchySample.Create(false);
            yield return null;
            foreach(var renderer in Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None)) renderer.enabled=false;
            foreach(var light in Object.FindObjectsByType<Light>(FindObjectsSortMode.None)) light.enabled=false;
            var style=AssetDatabase.LoadAssetAtPath<SketchyStyle>(SketchyInstaller.StylePath);
            style.view=SketchyStyle.View.Pencil; style.ambientIllumination=0;
            var cube=GameObject.CreatePrimitive(PrimitiveType.Cube);
            var material=new Material(Shader.Find("Sketchy/Pencil Lit"));
            cube.GetComponent<Renderer>().sharedMaterial=material;
            var camera=Camera.main; camera.orthographicSize=.7f;
            camera.transform.SetPositionAndRotation(new Vector3(0,0,-5),Quaternion.identity);
            var source=new GameObject("Colored illumination").AddComponent<Light>();
            source.transform.position=new Vector3(0,0,-3); source.transform.LookAt(Vector3.zero);
            source.range=10; source.spotAngle=90; source.innerSpotAngle=80; source.shadows=LightShadows.None;
            var target=new RenderTexture(256,256,24,RenderTextureFormat.ARGB32); target.Create();
            foreach(var type in new[]{LightType.Directional,LightType.Point,LightType.Spot})
            {
                source.type=type; source.intensity=200;
                material.SetFloat("_InkBias",0);
                foreach(var color in new[]{Color.red,Color.green,Color.blue})
                {
                    source.color=color;
                    var image=Capture(camera,target);
                    var pixel=image.GetPixel(128,128);
                    Assert.Greater(pixel.r*color.r+pixel.g*color.g+pixel.b*color.b,.9f,type+" must tint bare paper with its color.");
                    Assert.Less(pixel.r*(1-color.r)+pixel.g*(1-color.g)+pixel.b*(1-color.b),.03f);
                    Object.DestroyImmediate(image);
                }
                // Identical maximum ink demand isolates graphite from illumination hue.
                material.SetFloat("_InkBias",1); source.color=Color.white;
                var white=Capture(camera,target); source.color=Color.red;
                var red=Capture(camera,target);
                int graphitePixels=0;
                for(int y=50;y<206;y++) for(int x=50;x<206;x++)
                {
                    var a=white.GetPixel(x,y); var b=red.GetPixel(x,y);
                    if(Mathf.Abs(a.r-style.graphite.r)>.008f || Mathf.Abs(a.g-style.graphite.g)>.008f
                        || Mathf.Abs(a.b-style.graphite.b)>.008f) continue;
                    graphitePixels++;
                    Assert.Less(Mathf.Abs(a.r-b.r)+Mathf.Abs(a.g-b.g)+Mathf.Abs(a.b-b.b),.025f,
                        type+" must preserve the graphite color in dense strokes.");
                }
                Assert.Greater(graphitePixels,500,"The fixture must contain enough dense graphite to test.");
                SaveCapture("unity-colored-"+type.ToString().ToLowerInvariant()+".png",red);
                Object.DestroyImmediate(white); Object.DestroyImmediate(red);
            }
            Object.DestroyImmediate(source.gameObject); Object.DestroyImmediate(cube); Object.DestroyImmediate(material);
            target.Release(); Object.DestroyImmediate(target);
        }

        [UnityTest]
        public IEnumerator LightTintFadesWithEnergyAndRoughFalloffStaysStable()
        {
            SketchySample.Create(false);
            yield return null;
            foreach(var renderer in Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None)) renderer.enabled=false;
            foreach(var light in Object.FindObjectsByType<Light>(FindObjectsSortMode.None)) light.enabled=false;
            var style=AssetDatabase.LoadAssetAtPath<SketchyStyle>(SketchyInstaller.StylePath);
            style.view=SketchyStyle.View.Pencil; style.ambientIllumination=0;
            float formInk=style.formInk, shadowInk=style.shadowInk, roughness=style.lightFalloffRoughness;
            // Bare paper isolates color falloff from changes in hatch coverage.
            style.formInk=0; style.shadowInk=0; style.lightFalloffRoughness=0;
            var cube=GameObject.CreatePrimitive(PrimitiveType.Cube);
            var material=new Material(Shader.Find("Sketchy/Pencil Lit"));
            cube.GetComponent<Renderer>().sharedMaterial=material;
            var camera=Camera.main; camera.orthographicSize=.7f;
            camera.transform.SetPositionAndRotation(new Vector3(0,0,-5),Quaternion.identity);
            var source=new GameObject("Falloff test").AddComponent<Light>();
            source.color=Color.red; source.range=10; source.spotAngle=90; source.innerSpotAngle=80;
            source.transform.position=new Vector3(0,0,-3); source.transform.LookAt(Vector3.zero);
            var target=new RenderTexture(256,256,24,RenderTextureFormat.ARGB32); target.Create();
            foreach(var type in new[]{LightType.Directional,LightType.Point,LightType.Spot})
            {
                source.type=type;
                float previous=2;
                foreach(float intensity in new[]{0f,.1f,1f,20f,200f})
                {
                    source.intensity=intensity;
                    var image=Capture(camera,target); var center=image.GetPixel(128,128);
                    float neutralFraction=center.g/Mathf.Max(center.r,.001f);
                    Assert.LessOrEqual(neutralFraction,previous+.01f,type+" tint must strengthen with incoming energy.");
                    if(intensity==0) Assert.Greater(neutralFraction,.95f,"No light must leave neutral paper.");
                    if(intensity==200) Assert.Less(neutralFraction,.02f,"Bright red light must reach full tint.");
                    previous=neutralFraction; Object.DestroyImmediate(image);
                }
                if(type==LightType.Directional) continue;
                source.intensity=2;
                source.transform.position=new Vector3(0,0,-1);
                var nearImage=Capture(camera,target); var nearColor=nearImage.GetPixel(128,128);
                source.transform.position=new Vector3(0,0,-8);
                var farImage=Capture(camera,target); var farColor=farImage.GetPixel(128,128);
                Assert.Greater(farColor.g/farColor.r,nearColor.g/nearColor.r+.15f,
                    type+" color must fade with distance while the surface is still inside its range.");
                Object.DestroyImmediate(nearImage); Object.DestroyImmediate(farImage);
                source.transform.position=new Vector3(0,0,-3);
                source.intensity=2; source.color=Color.white;
                style.view=SketchyStyle.View.LightOnly;
                style.lightFalloffRoughness=0;
                var smooth=Capture(camera,target);
                style.lightFalloffRoughness=1;
                var rough=Capture(camera,target); var repeated=Capture(camera,target);
                Assert.Greater(Difference(smooth,rough),.001,"Falloff roughness must vary incoming energy.");
                Assert.AreEqual(0,Difference(rough,repeated),"Falloff variation must stay fixed between frames.");
                source.range=.1f;
                var outside=Capture(camera,target); source.enabled=false;
                var absent=Capture(camera,target);
                Assert.Less(Difference(outside,absent),.0001,"Roughness must preserve the light's range cutoff.");
                foreach(var image in new[]{smooth,rough,repeated,outside,absent}) Object.DestroyImmediate(image);
                source.enabled=true; source.range=10; source.color=Color.red;
                style.view=SketchyStyle.View.Pencil; style.lightFalloffRoughness=0;
            }
            style.formInk=formInk; style.shadowInk=shadowInk; style.lightFalloffRoughness=roughness;
            Object.DestroyImmediate(source.gameObject); Object.DestroyImmediate(cube); Object.DestroyImmediate(material);
            target.Release(); Object.DestroyImmediate(target);
        }

        [UnityTest]
        public IEnumerator ShadowContoursFollowVisibilityInsteadOfLightingGradients()
        {
            SketchySample.Create(false);
            yield return null;
            foreach(var renderer in Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None)) renderer.enabled=false;
            foreach(var light in Object.FindObjectsByType<Light>(FindObjectsSortMode.None)) light.enabled=false;
            var style=AssetDatabase.LoadAssetAtPath<SketchyStyle>(SketchyInstaller.StylePath);
            float formInk=style.formInk,shadowInk=style.shadowInk,roughness=style.lightFalloffRoughness;
            bool outlines=style.outlines;
            style.formInk=0; style.shadowInk=0; style.outlines=false;
            style.ambientIllumination=0; style.shadowOutlineStrength=.75f;
            style.shadowOutlineThreshold=.5f; style.lightFalloffRoughness=1;
            style.view=SketchyStyle.View.Pencil;
            var material=new Material(Shader.Find("Sketchy/Pencil Lit"));
            var ground=GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.transform.rotation=Quaternion.Euler(-90,0,0);
            ground.GetComponent<Renderer>().sharedMaterial=material;
            var blocker=GameObject.CreatePrimitive(PrimitiveType.Cube);
            blocker.transform.position=new Vector3(-.65f,.65f,-1);
            blocker.transform.localScale=Vector3.one*.6f;
            blocker.GetComponent<Renderer>().sharedMaterial=material;
            blocker.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.ShadowsOnly;
            var source=new GameObject("Shadow contour test").AddComponent<Light>();
            source.transform.position=new Vector3(-2,2,-3); source.transform.LookAt(Vector3.zero);
            source.range=12; source.spotAngle=90; source.innerSpotAngle=60;
            var camera=Camera.main; camera.orthographicSize=2.5f;
            camera.transform.SetPositionAndRotation(new Vector3(0,0,-6),Quaternion.identity);
            var target=new RenderTexture(256,256,24,RenderTextureFormat.ARGB32); target.Create();
            foreach(var type in new[]{LightType.Directional,LightType.Point,LightType.Spot})
            {
                source.type=type; source.intensity=type==LightType.Directional ? 1 : 20;
                source.color=Color.white;
                if(type==LightType.Directional) RenderSettings.sun=source;
                foreach(var shadows in new[]{LightShadows.Hard,LightShadows.Soft})
                {
                    source.shadows=shadows; style.shadowOutlines=false;
                    var plain=Capture(camera,target); style.shadowOutlines=true;
                    var outlined=Capture(camera,target);
                    Assert.Greater(Difference(plain,outlined),.0003,type+" must draw cast-shadow contours with "+shadows+" shadows.");
                    var repeated=Capture(camera,target);
                    Assert.AreEqual(0,Difference(outlined,repeated),"An unchanged shadow must keep stable pencil contours.");
                    style.view=SketchyStyle.View.RawShadows;
                    var visibility=Capture(camera,target); style.view=SketchyStyle.View.Pencil;
                    int changed=0,nearBoundary=0;
                    for(int y=8;y<248;y++) for(int x=8;x<248;x++)
                    {
                        if(plain.GetPixel(x,y).r-outlined.GetPixel(x,y).r<.08f) continue;
                        changed++; float lo=1,hi=0;
                        for(int dy=-5;dy<=5;dy++) for(int dx=-5;dx<=5;dx++)
                        {
                            float value=visibility.GetPixel(x+dx,y+dy).r;
                            if(QualitySettings.activeColorSpace==ColorSpace.Linear) value=Mathf.GammaToLinearSpace(value);
                            lo=Mathf.Min(lo,value); hi=Mathf.Max(hi,value);
                        }
                        if(lo<.4f && hi>.6f) nearBoundary++;
                    }
                    Assert.Greater(changed,40,"The fixture must expose a meaningful shadow boundary.");
                    Assert.Greater((float)nearBoundary/changed,.95f,"Shadow ink must stay close to actual visibility boundaries.");
                    SaveCapture("unity-shadow-contour-"+type.ToString().ToLowerInvariant()+"-"+shadows.ToString().ToLowerInvariant()+".png",outlined);
                    foreach(var image in new[]{plain,outlined,repeated,visibility}) Object.DestroyImmediate(image);
                }
                source.shadows=LightShadows.None; source.color=Color.red;
                style.shadowOutlines=false; var unshadowed=Capture(camera,target);
                style.shadowOutlines=true; var enabled=Capture(camera,target);
                Assert.AreEqual(0,Difference(unshadowed,enabled),"Normal, spot-cone, color and rough falloff gradients must not become shadow contours.");
                Object.DestroyImmediate(unshadowed); Object.DestroyImmediate(enabled);
            }
            style.formInk=formInk; style.shadowInk=shadowInk; style.outlines=outlines;
            style.lightFalloffRoughness=roughness; style.shadowOutlines=true;
            Object.DestroyImmediate(source.gameObject); Object.DestroyImmediate(ground); Object.DestroyImmediate(blocker);
            Object.DestroyImmediate(material); target.Release(); Object.DestroyImmediate(target);
        }

        [UnityTest]
        public IEnumerator DirectionalSphereHasMonotonicTerminator()
        {
            SketchySample.Create(false);
            yield return null;
            foreach(var renderer in Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None)) renderer.enabled=false;
            foreach(var light in Object.FindObjectsByType<Light>(FindObjectsSortMode.None)) light.enabled=false;
            var style=AssetDatabase.LoadAssetAtPath<SketchyStyle>(SketchyInstaller.StylePath);
            style.ambientIllumination=0;
            style.view=SketchyStyle.View.InkDemand;
            var sphere=GameObject.CreatePrimitive(PrimitiveType.Sphere);
            sphere.transform.localScale=Vector3.one*1.8f;
            var material=new Material(Shader.Find("Sketchy/Pencil Lit"));
            sphere.GetComponent<Renderer>().sharedMaterial=material;
            var sun=new GameObject("Terminator test").AddComponent<Light>();
            sun.type=LightType.Directional; sun.intensity=1;
            sun.transform.rotation=Quaternion.LookRotation(Vector3.right);
            RenderSettings.sun=sun;
            var camera=Camera.main; camera.orthographicSize=1.2f;
            camera.transform.SetPositionAndRotation(new Vector3(0,0,-5),Quaternion.identity);
            var target=new RenderTexture(256,256,24,RenderTextureFormat.ARGB32); target.Create();
            foreach(var shadows in new[]{LightShadows.None,LightShadows.Hard,LightShadows.Soft})
            {
                sun.shadows=shadows;
                var image=Capture(camera,target);
                var pixels=image.GetPixels32();
                for(int x=60;x<195;x++)
                {
                    Assert.GreaterOrEqual((int)pixels[128*256+x+1].r,(int)pixels[128*256+x].r-3,
                        shadows+" must not introduce a bright band approaching or crossing the terminator.");
                    if(x>140) Assert.Greater(pixels[128*256+x].r,230,"The unlit hemisphere must stay dark (high ink demand).");
                }
                Assert.Greater((int)pixels[128*256+185].r-(int)pixels[128*256+65].r,50,"The lit hemisphere must have a visible tone gradient.");
                Object.DestroyImmediate(image);
            }
            style.view=SketchyStyle.View.Pencil;
            var capture=Capture(camera,target);
            SaveCapture("unity-directional-sphere.png",capture);
            Object.DestroyImmediate(capture); Object.DestroyImmediate(sun.gameObject);
            Object.DestroyImmediate(sphere); Object.DestroyImmediate(material);
            target.Release(); Object.DestroyImmediate(target);
        }

        [UnityTest]
        public IEnumerator OccludedSphereHasNoBrightBackFacingCrescent()
        {
            SketchySample.Create(false);
            yield return null;
            foreach(var renderer in Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None)) renderer.enabled=false;
            foreach(var light in Object.FindObjectsByType<Light>(FindObjectsSortMode.None)) light.enabled=false;
            var style=AssetDatabase.LoadAssetAtPath<SketchyStyle>(SketchyInstaller.StylePath);
            style.view=SketchyStyle.View.InkDemand;
            var sphere=GameObject.CreatePrimitive(PrimitiveType.Sphere);
            sphere.transform.position=new Vector3(0,1,0); sphere.transform.localScale=Vector3.one*1.8f;
            var material=new Material(Shader.Find("Sketchy/Pencil Lit"));
            sphere.GetComponent<Renderer>().sharedMaterial=material;
            var blocker=GameObject.CreatePrimitive(PrimitiveType.Cube);
            blocker.transform.position=new Vector3(2,1,0); blocker.transform.localScale=new Vector3(.5f,4,4);
            blocker.GetComponent<Renderer>().sharedMaterial=material;
            blocker.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.ShadowsOnly;
            var point=new GameObject("Occluded sphere light").AddComponent<Light>();
            point.type=LightType.Point; point.range=10; point.intensity=100; point.shadows=LightShadows.Hard;
            point.transform.position=new Vector3(4,1,0);
            var camera=Camera.main; camera.orthographicSize=1.2f;
            camera.transform.position=new Vector3(0,1,-5); camera.transform.LookAt(sphere.transform.position);
            var target=new RenderTexture(256,256,24,RenderTextureFormat.ARGB32); target.Create();
            foreach(var type in new[]{LightType.Point,LightType.Spot})
            {
                point.type=type; point.spotAngle=90; point.innerSpotAngle=80;
                point.transform.LookAt(sphere.transform.position);
                var image=Capture(camera,target);
                var pixels=image.GetPixels32();
                // Every sampled point is safely inside the sphere silhouette, on both
                // the light-facing and reverse-facing halves. White means high ink.
                for(int y=110;y<146;y++) for(int x=65;x<191;x++)
                    Assert.Greater(pixels[y*256+x].r,210,type+" cast shadow must cover both normal orientations.");
                Object.DestroyImmediate(image);
            }
            style.view=SketchyStyle.View.Pencil;
            var capture=Capture(camera,target);
            SaveCapture("unity-occluded-sphere.png",capture);
            Object.DestroyImmediate(capture);
            Object.DestroyImmediate(sphere); Object.DestroyImmediate(blocker); Object.DestroyImmediate(point.gameObject);
            Object.DestroyImmediate(material); target.Release(); Object.DestroyImmediate(target);
        }
    }
}
