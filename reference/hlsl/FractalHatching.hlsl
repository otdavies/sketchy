// Analytic nested hatching research prototype, 2026. SPDX-License-Identifier: MIT
// Conceptual lineage: Rune Skovbo Johansen's Surface-Stable Fractal Dithering
// and Praun et al., Real-Time Hatching (2001). Independently written code.
#ifndef FRACTAL_HATCHING_INCLUDED
#define FRACTAL_HATCHING_INCLUDED

float FHIntegral(float x, float w)
{
    float q = x + 0.5 * w;
    return floor(q) * w + min(frac(q), w);
}

float FHStripe(float phase, float width, float footprint)
{
    float x = frac(phase);
    float w = saturate(width);
    float p = max(footprint, 1e-6);
    return saturate((FHIntegral(x + p * 0.5, w)
                  - FHIntegral(x - p * 0.5, w)) / p);
}

// Pixel shader only. gradient = float2(ddx(phase), ddy(phase)), computed
// before discontinuous operations or divergent branches. Use float precision.
float FHFamilyState(float phase, float2 gradient, float2 stateGradient, float ink, float gapPx)
{
    float g = max(length(stateGradient), 1e-10);
    float lod = clamp(-log2(max(gapPx, 2.0) * g), -20.0, 20.0);
    float level = floor(lod);
    float subdivision = exp2(frac(lod));
    float birth = subdivision - 1.0;
    float frequency = exp2(level);
    float u = phase * frequency;
    float footprint = max((abs(gradient.x) + abs(gradient.y)) * frequency, 1e-6);
    float parentWidth = saturate(ink) / subdivision;
    float childWidth = parentWidth * birth;
    return saturate(FHStripe(u, parentWidth, footprint)
                 + FHStripe(u - 0.5, childWidth, footprint));
}

// Separate held drawing-state metric from the live anti-aliasing footprint.
float FHFamilyGrad(float phase, float2 gradient, float ink, float gapPx)
{
    return FHFamilyState(phase, gradient, gradient, ink, gapPx);
}

float FHFamily(float phase, float ink, float gapPx)
{
    return FHFamilyGrad(phase, float2(ddx(phase), ddy(phase)), ink, gapPx);
}

float FHCross(float2 phase, float ink, float gapPx)
{
    float a = min(saturate(ink), 0.46);
    float b = (saturate(ink) - a) / (1.0 - a);
    float first = FHFamily(phase.x, a, gapPx);
    float second = FHFamily(phase.y, b, gapPx);
    return first + second - first * second;
}

// Analytic phase gradient in a sampled camera, independent of the live camera.
// Supply a 10 Hz snapshot of objectToClip and viewport size. n and phaseGrad
// are in object coordinates; n need not be normalized for this ratio.
float2 FHReferenceGradient(float3 p, float3 n, float3 phaseGrad,
                          float4x4 objectToClip, float2 viewport)
{
    float4 c = mul(objectToClip, float4(p, 1.0));
    float w2 = max(c.w * c.w, 1e-10);
    float3 a = 0.5 * viewport.x *
        (objectToClip[0].xyz * c.w - objectToClip[3].xyz * c.x) / w2;
    float3 b = 0.5 * viewport.y *
        (objectToClip[1].xyz * c.w - objectToClip[3].xyz * c.y) / w2;
    float determinant = dot(a, cross(b, n));
    determinant = (determinant < 0.0 ? -1.0 : 1.0) * max(abs(determinant), 1e-5);
    return float2(dot(phaseGrad, cross(b, n)), dot(phaseGrad, cross(n, a))) / determinant;
}

float FHCrossState(float2 phase, float2 stateGradient1, float2 stateGradient2,
                   float ink, float gapPx)
{
    float2 dx = ddx(phase), dy = ddy(phase);
    float a = min(saturate(ink), 0.46);
    float b = (saturate(ink) - a) / (1.0 - a);
    float first = FHFamilyState(phase.x, float2(dx.x,dy.x), stateGradient1, a, gapPx);
    float second = FHFamilyState(phase.y, float2(dx.y,dy.y), stateGradient2, b, gapPx);
    return first + second - first * second;
}

// Unity Shader Graph file-mode Custom Function: name FractalHatch,
// precision Float; inputs Phase(Vector2), Ink(Float), Spacing(Float),
// output Coverage(Float). Connect to the fragment stage only.
void FractalHatch_float(float2 Phase, float Ink, float Spacing, out float Coverage)
{
    Coverage = FHCross(Phase, Ink, Spacing);
}
#endif
