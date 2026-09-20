using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;
using UnityEngine.Rendering.RenderGraphModule;
using UnityEngine.Rendering.RenderGraphModule.Util;
using UnityEngine.Rendering.Universal;

namespace Sketchy
{
    public sealed class SketchyRendererFeature : ScriptableRendererFeature
    {
        public SketchyStyle style;
        [SerializeField, HideInInspector] Shader screenShader;
        Material material;
        SetupPass setup;
        DrawingPass drawing;

        public void SetShader(Shader shader) { screenShader = shader; }

        public override void Create()
        {
            CoreUtils.Destroy(material);
            if (screenShader == null) screenShader = Shader.Find("Hidden/Sketchy/Pencil Screen");
            if (screenShader != null) material = CoreUtils.CreateEngineMaterial(screenShader);
            setup = new SetupPass { renderPassEvent = RenderPassEvent.BeforeRenderingOpaques };
            drawing = new DrawingPass { renderPassEvent = RenderPassEvent.BeforeRenderingPostProcessing };
        }

        public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
        {
            var camera = renderingData.cameraData;
            // v0.1 supports independent mono base cameras, including Scene view.
            if (style == null || material == null || camera.isPreviewCamera || camera.xrRendering
                || camera.renderType != CameraRenderType.Base || camera.cameraType == CameraType.Reflection) return;
            setup.style = style;
            drawing.material = material;
            drawing.style = style;
            drawing.ConfigureInput(ScriptableRenderPassInput.Depth | ScriptableRenderPassInput.Normal);
            renderer.EnqueuePass(setup);
            renderer.EnqueuePass(drawing);
        }

        protected override void Dispose(bool disposing)
        {
            CoreUtils.Destroy(material);
        }

        sealed class SetupPass : ScriptableRenderPass
        {
            public SketchyStyle style;
            sealed class Data { public SketchyStyle style; }
            public override void RecordRenderGraph(RenderGraph graph, ContextContainer frame)
            {
                using var builder = graph.AddRasterRenderPass<Data>("Sketchy Style", out var data);
                data.style = style;
                builder.AllowGlobalStateModification(true);
                builder.AllowPassCulling(false);
                builder.SetRenderFunc((Data d, RasterGraphContext ctx) => d.style.Apply(ctx.cmd, d.style.drawingSeed));
            }
        }

        sealed class DrawingPass : ScriptableRenderPass
        {
            public Material material;
            public SketchyStyle style;
            sealed class Data
            {
                public TextureHandle source, edges;
                public Material material;
                public int pass;
                public bool shadowCompose;
            }
            sealed class MaskData { public RendererListHandle renderers; }

            void DrawShadowMask(RenderGraph graph, ContextContainer frame, TextureHandle target, UniversalResourceData resources)
            {
                var rendering=frame.Get<UniversalRenderingData>();
                var camera=frame.Get<UniversalCameraData>();
                var lights=frame.Get<UniversalLightData>();
                var settings=RenderingUtils.CreateDrawingSettings(new ShaderTagId("SketchyShadowBoundary"),
                    rendering,camera,lights,camera.defaultOpaqueSortFlags);
                var filtering=new FilteringSettings(RenderQueueRange.opaque,camera.camera.cullingMask);
                var renderers=graph.CreateRendererList(new RendererListParams(rendering.cullResults,settings,filtering));
                using var builder=graph.AddRasterRenderPass<MaskData>("Sketchy Shadow Visibility",out var data);
                data.renderers=renderers;
                builder.UseRendererList(renderers);
                builder.SetRenderAttachment(target,0,AccessFlags.Write);
                builder.SetRenderAttachmentDepth(resources.activeDepthTexture,AccessFlags.Read);
                if(resources.mainShadowsTexture.IsValid()) builder.UseTexture(resources.mainShadowsTexture);
                if(resources.additionalShadowsTexture.IsValid()) builder.UseTexture(resources.additionalShadowsTexture);
                builder.SetRenderFunc((MaskData d,RasterGraphContext ctx)=>ctx.cmd.DrawRendererList(d.renderers));
            }

            void Draw(RenderGraph graph, string name, TextureHandle source, TextureHandle target,
                int pass, UniversalResourceData resources, TextureHandle edges = default, bool shadowCompose = false)
            {
                using var builder = graph.AddRasterRenderPass<Data>(name, out var data);
                data.source = source; data.edges = edges; data.material = material; data.pass = pass;
                data.shadowCompose = shadowCompose;
                builder.UseTexture(source);
                if (pass == 0 || pass == 3)
                {
                    builder.UseTexture(resources.cameraDepthTexture);
                    builder.UseTexture(resources.cameraNormalsTexture);
                }
                if (edges.IsValid()) builder.UseTexture(edges);
                builder.SetRenderAttachment(target, 0, AccessFlags.Write);
                builder.SetRenderFunc((Data d, RasterGraphContext ctx) =>
                {
                    var properties = new MaterialPropertyBlock();
                    properties.SetTexture("_BlitTexture", d.source);
                    properties.SetVector("_BlitScaleBias", new Vector4(1,1,0,0));
                    properties.SetInteger("_SketchyComposeShadow", d.shadowCompose ? 1 : 0);
                    if (d.edges.IsValid()) properties.SetTexture("_SketchyEdges", d.edges);
                    ctx.cmd.DrawProcedural(Matrix4x4.identity, d.material, d.pass, MeshTopology.Triangles, 3, 1, properties);
                });
            }

            public override void RecordRenderGraph(RenderGraph graph, ContextContainer frame)
            {
                var resources = frame.Get<UniversalResourceData>();
                var cameraData = frame.Get<UniversalCameraData>();
                if (resources.isActiveTargetBackBuffer) return;
                var descriptor = cameraData.cameraTargetDescriptor;
                descriptor.depthBufferBits = 0;
                descriptor.msaaSamples = 1;
                descriptor.useMipMap = false;
                descriptor.autoGenerateMips = false;
                var edgeDescriptor = descriptor;
                edgeDescriptor.graphicsFormat = GraphicsFormat.R16G16B16A16_SFloat;
                var edges = UniversalRenderer.CreateRenderGraphTexture(graph, edgeDescriptor, "Sketchy Edge Seeds", false);
                var fitted = UniversalRenderer.CreateRenderGraphTexture(graph, edgeDescriptor, "Sketchy Fitted Contours", false);
                Draw(graph,"Sketchy Edge Seeds",resources.activeColorTexture,edges,0,resources);
                graph.AddBlitPass(new RenderGraphUtils.BlitMaterialParameters(edges,fitted,material,1),"Sketchy Fit Contours");
                var output = UniversalRenderer.CreateRenderGraphTexture(graph,descriptor,"Sketchy Output",false);
                Draw(graph,"Sketchy Compose Drawing",resources.activeColorTexture,output,2,resources,fitted);
                if (style.shadowOutlines && style.shadowOutlineStrength>0 && style.view==SketchyStyle.View.Pencil)
                {
                    var mask=UniversalRenderer.CreateRenderGraphTexture(graph,edgeDescriptor,"Sketchy Shadow Visibility",true);
                    DrawShadowMask(graph,frame,mask,resources);
                    var shadowEdges=UniversalRenderer.CreateRenderGraphTexture(graph,edgeDescriptor,"Sketchy Shadow Seeds",false);
                    var shadowFit=UniversalRenderer.CreateRenderGraphTexture(graph,edgeDescriptor,"Sketchy Fitted Shadows",false);
                    Draw(graph,"Sketchy Shadow Seeds",mask,shadowEdges,3,resources);
                    graph.AddBlitPass(new RenderGraphUtils.BlitMaterialParameters(shadowEdges,shadowFit,material,1),"Sketchy Fit Shadows");
                    var outlined=UniversalRenderer.CreateRenderGraphTexture(graph,descriptor,"Sketchy Shadow Outlines",false);
                    Draw(graph,"Sketchy Compose Shadows",output,outlined,2,resources,shadowFit,true);
                    output=outlined;
                }
                resources.cameraColor = output;
            }
        }
    }
}
