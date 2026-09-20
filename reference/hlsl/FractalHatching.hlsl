// Analytic nested hatching research prototype, 2026. SPDX-License-Identifier: MIT
// Conceptual lineage: Rune Skovbo Johansen's Surface-Stable Fractal Dithering
// and Praun et al., Real-Time Hatching (2001). Independently written code.
#ifndef FRACTAL_HATCHING_INCLUDED
#define FRACTAL_HATCHING_INCLUDED

float FHIntegral(float phase, float stripeWidth) {
    float shiftedPhase = phase + 0.5 * stripeWidth;
    return floor(shiftedPhase) * stripeWidth + min(frac(shiftedPhase), stripeWidth);
}

float FHStripe(float phase, float width, float footprint) {
    float wrappedPhase = frac(phase);
    float stripeWidth = saturate(width);
    float pixelFootprint = max(footprint, 1e-6);
    return saturate((FHIntegral(wrappedPhase + pixelFootprint * 0.5, stripeWidth) -
                     FHIntegral(wrappedPhase - pixelFootprint * 0.5, stripeWidth)) /
                    pixelFootprint);
}

// Pixel shader only. phaseGradient = float2(ddx(phase), ddy(phase)), computed
// before discontinuous operations or divergent branches. Use float precision.
float FHFamilyState(float phase, float2 phaseGradient, float2 scaleGradient, float inkCoverage,
                    float spacingPixels) {
    float phasePerPixel = max(length(scaleGradient), 1e-10);
    float continuousOctave = clamp(-log2(max(spacingPixels, 2.0) * phasePerPixel), -20.0, 20.0);
    float parentOctave = floor(continuousOctave);
    float subdivision = exp2(frac(continuousOctave));
    float childActivation = subdivision - 1.0;
    float linesPerUnit = exp2(parentOctave);
    float parentCoordinate = phase * linesPerUnit;
    float footprint = max((abs(phaseGradient.x) + abs(phaseGradient.y)) * linesPerUnit, 1e-6);
    // Share the requested coverage between the existing grid and new lines.
    float parentWidth = saturate(inkCoverage) / subdivision;
    float childWidth = parentWidth * childActivation;
    return saturate(FHStripe(parentCoordinate, parentWidth, footprint) +
                    FHStripe(parentCoordinate - 0.5, childWidth, footprint));
}

// Convenience entry points: use the same gradient for scale and filtering.
float FHFamilyGrad(float phase, float2 phaseGradient, float inkCoverage, float spacingPixels) {
    return FHFamilyState(phase, phaseGradient, phaseGradient, inkCoverage, spacingPixels);
}

float FHFamily(float phase, float inkCoverage, float spacingPixels) {
    return FHFamilyGrad(phase, float2(ddx(phase), ddy(phase)), inkCoverage, spacingPixels);
}

float FHCross(float2 phase, float inkCoverage, float spacingPixels) {
    float primaryCoverage = min(saturate(inkCoverage), 0.46);
    float crossCoverage = (saturate(inkCoverage) - primaryCoverage) / (1.0 - primaryCoverage);
    float primaryInk = FHFamily(phase.x, primaryCoverage, spacingPixels);
    float crossInk = FHFamily(phase.y, crossCoverage, spacingPixels);
    return primaryInk + crossInk - primaryInk * crossInk;
}

// Analytic phase gradient in a sampled camera, independent of the live camera.
// Supply the current objectToClip and viewport size. surfaceNormal and
// phaseGradient are in object coordinates; the normal need not be normalized.
float2 FHReferenceGradient(float3 surfacePosition, float3 surfaceNormal, float3 phaseGradient,
                           float4x4 objectToClip, float2 viewport) {
    float4 clipPosition = mul(objectToClip, float4(surfacePosition, 1.0));
    float clipWSquared = max(clipPosition.w * clipPosition.w, 1e-10);
    float3 screenGradientX =
        0.5 * viewport.x *
        (objectToClip[0].xyz * clipPosition.w - objectToClip[3].xyz * clipPosition.x) /
        clipWSquared;
    float3 screenGradientY =
        0.5 * viewport.y *
        (objectToClip[1].xyz * clipPosition.w - objectToClip[3].xyz * clipPosition.y) /
        clipWSquared;
    float determinant = dot(screenGradientX, cross(screenGradientY, surfaceNormal));
    determinant = (determinant < 0.0 ? -1.0 : 1.0) * max(abs(determinant), 1e-5);
    return float2(dot(phaseGradient, cross(screenGradientY, surfaceNormal)),
                  dot(phaseGradient, cross(surfaceNormal, screenGradientX))) /
           determinant;
}

float FHCrossState(float2 phase, float2 stateGradient1, float2 stateGradient2, float inkCoverage,
                   float spacingPixels) {
    float2 phaseDx = ddx(phase);
    float2 phaseDy = ddy(phase);
    float primaryCoverage = min(saturate(inkCoverage), 0.46);
    float crossCoverage = (saturate(inkCoverage) - primaryCoverage) / (1.0 - primaryCoverage);
    float primaryInk = FHFamilyState(phase.x, float2(phaseDx.x, phaseDy.x), stateGradient1,
                                     primaryCoverage, spacingPixels);
    float crossInk = FHFamilyState(phase.y, float2(phaseDx.y, phaseDy.y), stateGradient2,
                                   crossCoverage, spacingPixels);
    return primaryInk + crossInk - primaryInk * crossInk;
}

// Unity Shader Graph file-mode Custom Function: name FractalHatch,
// precision Float; inputs Phase(Vector2), Ink(Float), Spacing(Float),
// output Coverage(Float). Connect to the fragment stage only.
void FractalHatch_float(float2 Phase, float Ink, float Spacing, out float Coverage) {
    Coverage = FHCross(Phase, Ink, Spacing);
}
#endif
