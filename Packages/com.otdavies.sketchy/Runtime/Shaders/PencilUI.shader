Shader "Sketchy/UI Paper"
{
    Properties
    {
        [PerRendererData] _MainTex("Sprite Texture",2D)="white" {}
        _Color("Tint",Color)=(0.984,0.978,0.958,1)
        _Grain("Paper Grain",Range(0,0.2))=0.022
        _StencilComp("Stencil Comparison",Float)=8
        _Stencil("Stencil ID",Float)=0
        _StencilOp("Stencil Operation",Float)=0
        _StencilWriteMask("Stencil Write Mask",Float)=255
        _StencilReadMask("Stencil Read Mask",Float)=255
        _ColorMask("Color Mask",Float)=15
        [Toggle(UNITY_UI_ALPHACLIP)] _UseUIAlphaClip("Use Alpha Clip",Float)=0
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "IgnoreProjector"="True" "RenderType"="Transparent" "CanUseSpriteAtlas"="True" }
        Stencil { Ref [_Stencil] Comp [_StencilComp] Pass [_StencilOp] ReadMask [_StencilReadMask] WriteMask [_StencilWriteMask] }
        Cull Off Lighting Off ZWrite Off ZTest [unity_GUIZTestMode]
        Blend SrcAlpha OneMinusSrcAlpha
        ColorMask [_ColorMask]
        Pass
        {
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_local _ UNITY_UI_CLIP_RECT
            #pragma multi_compile_local _ UNITY_UI_ALPHACLIP
            #include "UnityCG.cginc"
            #include "UnityUI.cginc"
            sampler2D _MainTex;
            float4 _MainTex_ST, _Color, _TextureSampleAdd, _ClipRect;
            float _Grain, _UIMaskSoftnessX, _UIMaskSoftnessY;
            struct A { float4 vertex:POSITION; float4 color:COLOR; float2 uv:TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct V { float4 vertex:SV_POSITION; float4 color:COLOR; float2 uv:TEXCOORD0; float4 mask:TEXCOORD1; UNITY_VERTEX_OUTPUT_STEREO };
            V Vert(A v)
            {
                V o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.vertex=UnityObjectToClipPos(v.vertex);
                o.color=v.color*_Color; o.uv=TRANSFORM_TEX(v.uv,_MainTex);
                float2 pixelSize=o.vertex.w/abs(mul((float2x2)UNITY_MATRIX_P,_ScreenParams.xy));
                float4 rect=clamp(_ClipRect,-2e10,2e10);
                o.mask=float4(v.vertex.xy*2-rect.xy-rect.zw,0.25/(0.25*float2(_UIMaskSoftnessX,_UIMaskSoftnessY)+abs(pixelSize)));
                return o;
            }
            float4 Frag(V i):SV_Target
            {
                float4 color=(tex2D(_MainTex,i.uv)+_TextureSampleAdd)*i.color;
                float3 h=frac(float3(floor(i.vertex.xy).xyx)*float3(0.1031,0.1030,0.0973));
                h+=dot(h,h.yzx+33.33);
                color.rgb*=1-_Grain+_Grain*frac((h.x+h.y)*h.z);
                #ifdef UNITY_UI_CLIP_RECT
                float2 mask=saturate((_ClipRect.zw-_ClipRect.xy-abs(i.mask.xy))*i.mask.zw);
                color.a*=mask.x*mask.y;
                #endif
                #ifdef UNITY_UI_ALPHACLIP
                clip(color.a-0.001);
                #endif
                return color;
            }
            ENDHLSL
        }
    }
}
