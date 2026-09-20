Shader "Sketchy/Pencil Lit"
{
    Properties
    {
        [MainColor] _BaseColor("Paper Tint", Color) = (1,1,1,1)
        _InkBias("Material Ink", Range(0,1)) = 0
        _HatchScale("Surface Scale", Float) = 1
        [Toggle] _ObjectSpaceHatching("Object-local Triplanar", Float) = 1
        _ObjectSeed("Stroke Identity", Float) = 0
    }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" "Queue"="Geometry" }
        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        CBUFFER_START(UnityPerMaterial)
            float4 _BaseColor;
            float _InkBias, _HatchScale, _ObjectSeed, _ObjectSpaceHatching;
        CBUFFER_END
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
        #include "PencilHatching.hlsl"
        float4 _SketchyPaper, _SketchyGraphite, _SketchyTone, _SketchyDrawing;
        float _SketchyAmbientIllumination;
        float4 _SketchyLightFalloff;
        float PunctualFalloffVariation(float3 lightOffset)
        {
            if (_SketchyLightFalloff.x <= 0) return 1;
            float3 p=lightOffset*max(_SketchyLightFalloff.y,0.01);
            // Smooth spatial noise anchored to the light, shared across objects.
            // Multiplication keeps zero attenuation exactly zero outside range.
            float noise=(pnNoise(p.xy+float2(13.1,7.7))
                +pnNoise(p.yz+float2(23.4,17.3))+pnNoise(p.zx+float2(5.9,31.1)))/3;
            return lerp(1,0.25+1.5*noise,saturate(_SketchyLightFalloff.x));
        }
        void AccumulateLight(Light light, float3 normal, inout float diffuse, inout float3 illuminationColor)
        {
            // URP supplies inverse-square distance, smooth range cutoff and spot-cone
            // attenuation together. Only visible incoming light removes ink.
            float3 incoming=max(light.color,0)*light.distanceAttenuation*saturate(dot(normal,light.direction));
            diffuse += dot(incoming,float3(0.2126,0.7152,0.0722));
            illuminationColor += incoming*light.shadowAttenuation;
        }
        struct SketchyAttributes
        {
            float4 positionOS : POSITION;
            float3 normalOS : NORMAL;
            UNITY_VERTEX_INPUT_INSTANCE_ID
        };
        struct SketchyVaryings
        {
            float4 positionCS : SV_POSITION;
            float3 positionWS : TEXCOORD0;
            float3 normalWS : TEXCOORD1;
            float3 rest : TEXCOORD2;
            float3 restNormal : TEXCOORD3;
            UNITY_VERTEX_INPUT_INSTANCE_ID
            UNITY_VERTEX_OUTPUT_STEREO
        };
        SketchyVaryings SketchyVert(SketchyAttributes v)
        {
            SketchyVaryings o = (SketchyVaryings)0;
            UNITY_SETUP_INSTANCE_ID(v);
            UNITY_TRANSFER_INSTANCE_ID(v,o);
            UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
            o.positionWS = TransformObjectToWorld(v.positionOS.xyz);
            o.positionCS = TransformWorldToHClip(o.positionWS);
            o.normalWS = TransformObjectToWorldNormal(v.normalOS);
            // Coordinates, normal weights and derivatives must share a frame.
            // Both choices are triplanar and need no mesh UVs.
            o.rest = (_ObjectSpaceHatching > 0.5 ? v.positionOS.xyz : o.positionWS) * _HatchScale;
            o.restNormal = _ObjectSpaceHatching > 0.5 ? v.normalOS : o.normalWS;
            return o;
        }
        void EvaluateLighting(SketchyVaryings i, out float diffuse, out float3 illuminationColor)
        {
            float3 n=normalize(i.normalWS);
            Light sun = GetMainLight(TransformWorldToShadowCoord(i.positionWS),i.positionWS,half4(1,1,1,1));
            diffuse=0;
            illuminationColor=0;
            AccumulateLight(sun,n,diffuse,illuminationColor);
            #if defined(_ADDITIONAL_LIGHTS)
            uint count = GetAdditionalLightsCount();
            LIGHT_LOOP_BEGIN(count)
                Light light = GetAdditionalLight(lightIndex, i.positionWS, half4(1,1,1,1));
                int dataIndex=GetPerObjectLightIndex(lightIndex);
                #if USE_STRUCTURED_BUFFER_FOR_LIGHT_DATA
                float4 lightPosition=_AdditionalLightsBuffer[dataIndex].position;
                #else
                float4 lightPosition=_AdditionalLightsPosition[dataIndex];
                #endif
                if (lightPosition.w > 0)
                    light.distanceAttenuation *= PunctualFalloffVariation(i.positionWS-lightPosition.xyz);
                AccumulateLight(light,n,diffuse,illuminationColor);
            LIGHT_LOOP_END
            #endif
        }
        ENDHLSL
        Pass
        {
            Name "PencilForward"
            Tags { "LightMode"="UniversalForwardOnly" }
            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex SketchyVert
            #pragma fragment Frag
            #pragma multi_compile_instancing
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _ADDITIONAL_LIGHT_SHADOWS
            #pragma multi_compile_fragment _ _LIGHT_COOKIES
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            half4 Frag(SketchyVaryings i) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(i);
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(i);
                float3 dx = ddx(i.rest), dy = ddy(i.rest);
                float diffuse; float3 illuminationColor;
                EvaluateLighting(i,diffuse,illuminationColor);
                // Form Ink shapes midtones; Shadow Ink is the unlit endpoint.
                // Ground uses the same illumination and tone mapping as every surface.
                float illumination=dot(illuminationColor,float3(0.2126,0.7152,0.0722));
                float darkness=1-saturate(illumination+_SketchyAmbientIllumination);
                float tone=darkness*lerp(_SketchyTone.x,_SketchyTone.y,darkness);
                tone = _InkBias + (1-_InkBias)*tone;
                if (_SketchyTone.w == 1) return half4(diffuse.xxx,1);
                if (_SketchyTone.w == 2) return half4((diffuse>1e-5 ? saturate(illumination/diffuse) : 0).xxx,1);
                if (_SketchyTone.w == 3) return half4(tone.xxx,1);
                float seed = _SketchyDrawing.x + _ObjectSeed;
                float3 offset = 0.25*(dx+dy);
                float ink = 0.5*(pnPencil(i.rest-offset,normalize(i.restNormal),dx,dy,tone,seed)
                    + pnPencil(i.rest+offset,normalize(i.restNormal),dx,dy,tone,seed));
                float tooth = pnHash(floor(i.positionCS.xy));
                float fibre = pnNoise(i.positionCS.xy*float2(0.13,0.87));
                ink *= lerp(saturate(0.80+0.27*tooth+0.13*fibre),1,pow(ink,3));
                float3 tint = _BaseColor.rgb;
                #ifndef UNITY_COLORSPACE_GAMMA
                tint = LinearToSRGB(tint);
                #endif
                // Hue affects the paper only, fading back to neutral as the incoming
                // illumination weakens. Ink density also follows that same energy.
                float3 surfaceLight=illuminationColor+_SketchyAmbientIllumination;
                float peak=max(surfaceLight.r,max(surfaceLight.g,surfaceLight.b));
                float3 lightTint=peak>1e-5 ? lerp(float3(1,1,1),surfaceLight/peak,saturate(peak)) : float3(1,1,1);
                #ifndef UNITY_COLORSPACE_GAMMA
                lightTint=LinearToSRGB(lightTint);
                #endif
                float3 paper = _SketchyPaper.rgb * tint * lightTint;
                float3 color = lerp(paper,_SketchyGraphite.rgb,ink);
                #ifndef UNITY_COLORSPACE_GAMMA
                color = SRGBToLinear(color);
                #endif
                return half4(color,1);
            }
            ENDHLSL
        }
        Pass
        {
            Name "Shadow Boundary Mask"
            Tags { "LightMode"="SketchyShadowBoundary" }
            ZWrite Off ZTest Equal
            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex SketchyVert
            #pragma fragment ShadowBoundaryMask
            #pragma multi_compile_instancing
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _ADDITIONAL_LIGHT_SHADOWS
            #pragma multi_compile_fragment _ _LIGHT_COOKIES
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            half4 ShadowBoundaryMask(SketchyVaryings i) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(i);
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(i);
                float diffuse; float3 illuminationColor;
                EvaluateLighting(i,diffuse,illuminationColor);
                float visible=dot(illuminationColor,float3(0.2126,0.7152,0.0722));
                // Pure visibility loss: normal/range/noise gradients alone cannot
                // create contours. Other lights and ambient fill weaken occlusion.
                float occlusion=saturate((diffuse-visible)/max(diffuse+_SketchyAmbientIllumination,1e-5));
                return half4(occlusion,saturate(diffuse),0,1);
            }
            ENDHLSL
        }
        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode"="ShadowCaster" }
            ZWrite On ZTest LEqual ColorMask 0
            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex ShadowPassVertex
            #pragma fragment ShadowPassFragment
            #pragma multi_compile_instancing
            #pragma multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW
            #include "Packages/com.unity.render-pipelines.universal/Shaders/ShadowCasterPass.hlsl"
            ENDHLSL
        }
        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode"="DepthOnly" }
            ZWrite On ColorMask R
            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex DepthOnlyVertex
            #pragma fragment DepthOnlyFragment
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/Shaders/DepthOnlyPass.hlsl"
            ENDHLSL
        }
        Pass
        {
            Name "DepthNormals"
            Tags { "LightMode"="DepthNormalsOnly" }
            ZWrite On
            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex DepthNormalsVertex
            #pragma fragment DepthNormalsFragment
            #pragma multi_compile_instancing
            #pragma multi_compile_fragment _ _GBUFFER_NORMALS_OCT
            #include "Packages/com.unity.render-pipelines.universal/Shaders/DepthNormalsPass.hlsl"
            ENDHLSL
        }
    }
    FallBack Off
}
