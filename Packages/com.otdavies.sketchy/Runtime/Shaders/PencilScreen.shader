Shader "Hidden/Sketchy/Pencil Screen"
{
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" }
        ZWrite Off ZTest Always Cull Off
        HLSLINCLUDE
        #pragma target 3.5
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"
        #include "PencilHatching.hlsl"
        float4 _SketchyPaper, _SketchyGraphite, _SketchyTone, _SketchyDrawing, _SketchyShadowOutlines;
        int _SketchyComposeShadow;
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareNormalsTexture.hlsl"
        float3 World(float2 uv, float depth)
        {
            #if !UNITY_REVERSED_Z
            depth = lerp(UNITY_NEAR_CLIP_VALUE,1,depth);
            #endif
            return ComputeWorldSpacePosition(uv,depth,UNITY_MATRIX_I_VP);
        }
        bool Background(float d)
        {
            #if UNITY_REVERSED_Z
            return d < 0.000001;
            #else
            return d > 0.999999;
            #endif
        }
        float Crossing(float2 a, float2 b)
        {
            a = clamp(a, 0.5/_ScaledScreenParams.xy, 1-0.5/_ScaledScreenParams.xy);
            b = clamp(b, 0.5/_ScaledScreenParams.xy, 1-0.5/_ScaledScreenParams.xy);
            float da=SampleSceneDepth(a), db=SampleSceneDepth(b);
            bool ba=Background(da), bb=Background(db);
            if (ba && bb) return 0;
            if (ba != bb) return 1;
            float3 na=SampleSceneNormals(a), nb=SampleSceneNormals(b);
            float3 delta=World(b,db)-World(a,da);
            float residual=max(abs(dot(na,delta)),abs(dot(nb,delta)));
            float allowance=0.008 + length(delta)*0.09;
            return max(step(0.18,length(na-nb)),step(allowance,residual));
        }
        ENDHLSL
        Pass
        {
            Name "Edge Seeds"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Edge
            float4 Edge(Varyings i) : SV_Target
            {
                float2 uv=i.texcoord, px=1/_ScaledScreenParams.xy;
                float ex=Crossing(uv,uv+float2(px.x,0));
                float ey=Crossing(uv,uv+float2(0,px.y));
                if (ex+ey < 0.5) return 0;
                float2 offset=float2(ex,ey)*0.5/(ex+ey);
                float angle=atan2(ey,ex);
                angle=angle-3.141592654*floor((angle+1.570796327)/3.141592654);
                return float4(0.5+offset*0.5,angle/3.141592654+0.5,1);
            }
            ENDHLSL
        }
        Pass
        {
            Name "Fit Contours"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Fit
            #define edgeSeeds _BlitTexture
            #define OUTLINE_FIT_PASS
            #include "PencilOutline.hlsl"
            float4 Fit(Varyings i) : SV_Target { return poFitAtSeed(int2(i.positionCS.xy)); }
            ENDHLSL
        }
        Pass
        {
            Name "Compose Pencil"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Compose
            Texture2D<float4> _SketchyEdges;
            #define edgeSeeds _SketchyEdges
            #define edgeLinearSampler sampler_LinearClamp
            #define resolution _ScaledScreenParams.xy
            #define PO_NO_OCCUPANCY_MIPS
            #define PO_OUTLINE_WIDTH _SketchyDrawing.y
            #include "PencilOutline.hlsl"
            float4 Compose(Varyings i) : SV_Target
            {
                float3 scene=SAMPLE_TEXTURE2D_X(_BlitTexture,sampler_LinearClamp,i.texcoord).rgb;
                #ifndef UNITY_COLORSPACE_GAMMA
                scene=LinearToSRGB(scene);
                #endif
                // Apply paper tooth to the image without replacing pixels that lack
                // opaque depth: those pixels can contain transparent objects or UI.
                if (_SketchyTone.w==0 && _SketchyComposeShadow==0)
                    scene*=1-_SketchyTone.z+_SketchyTone.z*pnHash(floor(i.positionCS.xy));
                float enabled=_SketchyComposeShadow!=0 ? _SketchyShadowOutlines.x : _SketchyDrawing.w;
                float ink=(enabled>0 && _SketchyTone.w==0)
                    ? poFittedInk(i.positionCS.xy,_SketchyDrawing.x,_SketchyDrawing.z,2) : 0;
                if (_SketchyComposeShadow!=0) ink*=_SketchyShadowOutlines.y;
                float3 color=lerp(scene,_SketchyGraphite.rgb,ink);
                #ifndef UNITY_COLORSPACE_GAMMA
                color=SRGBToLinear(color);
                #endif
                return float4(color,1);
            }
            ENDHLSL
        }
        Pass
        {
            Name "Shadow Edge Seeds"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment ShadowEdge
            float4 ShadowEdge(Varyings i) : SV_Target
            {
                float2 uv=i.texcoord, px=1/_ScaledScreenParams.xy;
                float4 center=SAMPLE_TEXTURE2D_X(_BlitTexture,sampler_PointClamp,uv);
                float4 right=SAMPLE_TEXTURE2D_X(_BlitTexture,sampler_PointClamp,uv+float2(px.x,0));
                float4 up=SAMPLE_TEXTURE2D_X(_BlitTexture,sampler_PointClamp,uv+float2(0,px.y));
                float level=_SketchyShadowOutlines.z;
                bool cx=(center.r<level)!=(right.r<level);
                bool cy=(center.r<level)!=(up.r<level);
                // Require two valid receivers on one continuous surface. Geometry
                // silhouettes and creases have their own independently fitted lines.
                cx=cx && center.a>0.5 && right.a>0.5 && Crossing(uv,uv+float2(px.x,0))<0.5;
                cy=cy && center.a>0.5 && up.a>0.5 && Crossing(uv,uv+float2(0,px.y))<0.5;
                if (!cx && !cy) return 0;
                float2 gradient=float2(right.r-center.r,up.r-center.r);
                float2 offset=0;
                if (cx) offset.x=saturate((level-center.r)/gradient.x);
                if (cy) offset.y=saturate((level-center.r)/gradient.y);
                offset/=float(cx)+float(cy);
                float angle=atan2(gradient.y,gradient.x);
                angle-=3.141592654*floor((angle+1.570796327)/3.141592654);
                float energy=max(center.g,max(cx ? right.g : 0,cy ? up.g : 0));
                float confidence=smoothstep(0.02,0.3,energy);
                return float4(0.5+offset*0.5,angle/3.141592654+0.5,confidence);
            }
            ENDHLSL
        }
    }
}
