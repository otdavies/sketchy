using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace Sketchy.Editor
{
    public static class SketchySample
    {
        [Serializable] sealed class CityData { public float[] vertices; public float[] casters; }

        public static string Create(bool city = true)
        {
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return null;
            SketchyInstaller.Install();
            string folder = AssetDatabase.GenerateUniqueAssetPath(SketchyInstaller.Root + (city ? "/ReferenceCity" : "/LightingStudy"));
            Directory.CreateDirectory(folder); AssetDatabase.Refresh();
            var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var paper=Material(folder,"Paper",0);
            var dark=Material(folder,"Graphite",0.70f);
            var ground=Material(folder,"Ground",0);
            var road=Material(folder,"Road",0);
            road.color=new Color(0.96f,0.96f,0.96f);
            if (city)
            {
                string packagePath=UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(SketchySample).Assembly).resolvedPath;
                var data=JsonUtility.FromJson<CityData>(File.ReadAllText(Path.Combine(packagePath,"Samples~/ReferenceCity/City.json")));
                var materials=new[] {paper,paper,dark,ground,road};
                for (int category=0;category<5;category++)
                    MakeMesh(data.vertices,category,"City "+category,materials[category],folder,ShadowCastingMode.Off);
                for (int category=0;category<5;category++)
                    MakeMesh(data.casters,category,"Casters "+category,materials[category],folder,ShadowCastingMode.ShadowsOnly);
            }
            else
            {
                var floor=GameObject.CreatePrimitive(PrimitiveType.Plane);
                floor.name="Shadow receiver"; floor.GetComponent<Renderer>().sharedMaterial=ground;
                for (int i=0;i<16;i++)
                {
                    var item=GameObject.CreatePrimitive(i%2==0 ? PrimitiveType.Cube : PrimitiveType.Sphere);
                    item.name="Shared instanced material "+i;
                    item.transform.position=new Vector3((i%4-1.5f)*1.4f,0.6f,(i/4-1.5f)*1.4f);
                    item.transform.localScale=new Vector3(0.75f,1.2f,0.75f);
                    item.GetComponent<Renderer>().sharedMaterial=paper;
                }
                var point=new GameObject("Additional point light").AddComponent<Light>();
                point.type=LightType.Point; point.intensity=4; point.range=8; point.shadows=LightShadows.Soft;
                point.transform.position=new Vector3(1,2,-1);
            }
            var sun=new GameObject("Sun").AddComponent<Light>();
            sun.type=LightType.Directional; sun.intensity=1; sun.shadows=LightShadows.Soft;
            var lightDirection=new Vector3(Mathf.Cos(0.35f*Mathf.PI*2)*0.8f,0.95f,-Mathf.Sin(0.35f*Mathf.PI*2)*0.8f).normalized;
            sun.transform.rotation=Quaternion.LookRotation(-lightDirection);
            RenderSettings.sun=sun;
            RenderSettings.ambientMode=AmbientMode.Flat;
            RenderSettings.ambientLight=Color.white*0.2f;
            RenderSettings.skybox=null;
            var camera=new GameObject("Main Camera",typeof(Camera),typeof(AudioListener)).GetComponent<Camera>();
            camera.tag="MainCamera";
            camera.orthographic=true; camera.orthographicSize=4.15f; camera.nearClipPlane=0.1f; camera.farClipPlane=50;
            camera.transform.position=new Vector3(8,6.8f,-10);
            camera.transform.LookAt(new Vector3(0,0.85f,0));
            SketchyInstaller.ConfigureCamera(camera);
            string scenePath=folder+"/"+(city ? "ReferenceCity" : "LightingStudy")+".unity";
            EditorSceneManager.SaveScene(scene,scenePath);
            AssetDatabase.SaveAssets();
            Selection.activeObject=camera.gameObject;
            return scenePath;
        }

        static Material Material(string folder,string name,float ink)
        {
            var material=new Material(Shader.Find("Sketchy/Pencil Lit")) { name=name, enableInstancing=true };
            material.SetFloat("_InkBias",ink);
            AssetDatabase.CreateAsset(material,folder+"/"+name+".mat");
            return material;
        }

        static void MakeMesh(float[] data,int category,string name,Material material,string folder,ShadowCastingMode casting)
        {
            var vertices=new List<Vector3>(); var normals=new List<Vector3>(); var indices=new List<int>();
            for (int i=0;i<data.Length;i+=7)
            {
                if ((int)data[i+6]!=category) continue;
                // Reflect WebGL's Z axis; reverse each triangle for Unity's front faces.
                vertices.Add(new Vector3(data[i],data[i+1],-data[i+2]));
                normals.Add(new Vector3(data[i+3],data[i+4],-data[i+5]));
                indices.Add(indices.Count);
            }
            if (vertices.Count==0) return;
            for (int i=0;i<indices.Count;i+=3) (indices[i+1],indices[i+2])=(indices[i+2],indices[i+1]);
            var mesh=new Mesh {name=name,indexFormat=IndexFormat.UInt32};
            mesh.SetVertices(vertices); mesh.SetNormals(normals); mesh.SetTriangles(indices,0); mesh.RecalculateBounds();
            AssetDatabase.CreateAsset(mesh,folder+"/"+name+".asset");
            var obj=new GameObject(name,typeof(MeshFilter),typeof(MeshRenderer));
            obj.GetComponent<MeshFilter>().sharedMesh=mesh;
            var renderer=obj.GetComponent<MeshRenderer>(); renderer.sharedMaterial=material; renderer.shadowCastingMode=casting;
        }

        public static int RepairCityMeshes()
        {
            int repaired=0;
            foreach(string guid in AssetDatabase.FindAssets("t:Mesh",new[]{SketchyInstaller.Root}))
            {
                string path=AssetDatabase.GUIDToAssetPath(guid);
                if(!Path.GetFileName(Path.GetDirectoryName(path)).StartsWith("ReferenceCity",StringComparison.Ordinal)) continue;
                var mesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);
                if(!mesh.name.StartsWith("City ",StringComparison.Ordinal) && !mesh.name.StartsWith("Casters ",StringComparison.Ordinal)) continue;
                var vertices=mesh.vertices; var normals=mesh.normals; var indices=mesh.triangles;
                bool changed=false;
                for(int i=0;i<indices.Length;i+=3)
                {
                    int a=indices[i],b=indices[i+1],c=indices[i+2];
                    if(Vector3.Dot(Vector3.Cross(vertices[b]-vertices[a],vertices[c]-vertices[a]),normals[a])>=0) continue;
                    (indices[i+1],indices[i+2])=(indices[i+2],indices[i+1]); changed=true;
                }
                if(!changed) continue;
                mesh.triangles=indices; EditorUtility.SetDirty(mesh); repaired++;
            }
            if(repaired>0) AssetDatabase.SaveAssets();
            return repaired;
        }

        // CLI: unity run Unity/SketchyTestbed -- -executeMethod Sketchy.Editor.SketchySample.Bootstrap
        public static void Bootstrap()
        {
            var city=Create();
            EditorBuildSettings.scenes=new[] {new EditorBuildSettingsScene(city,true)};
            Debug.Log("SKETCHY_BOOTSTRAP_OK " + city);
        }
    }
}
