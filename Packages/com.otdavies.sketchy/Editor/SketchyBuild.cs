using System;
using UnityEditor;
using UnityEditor.Build.Reporting;

namespace Sketchy.Editor
{
    public static class SketchyBuild
    {
        // Intended for a disposable validation project; creates a sample and builds it.
        public static void BuildValidationPlayer()
        {
            var scene=SketchySample.Create();
            var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes=new[] {scene},
                locationPathName="Builds/Sketchy/Sketchy.exe",
                target=BuildTarget.StandaloneWindows64,
                options=BuildOptions.Development
            });
            if(report.summary.result!=BuildResult.Succeeded)
                throw new Exception("Sketchy player build failed: "+report.summary.result);
            UnityEngine.Debug.Log("SKETCHY_BUILD_OK "+report.summary.totalSize+" bytes");
        }
    }
}
