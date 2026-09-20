#version 300 es
precision highp float;
in vec3 worldPosition;
in vec3 worldNormal;
in vec4 lightClipPosition;
flat in float materialId;
flat in float planeDistance;
layout(location = 0) out vec4 color;
layout(location = 1) out vec4 meta;
uniform int fastSampling;
uniform float drawing;
uniform int method;
#include "CitySurface.glsl"
#include "CityLighting.glsl"
// PENCIL_CORE_INSERT

// Pipeline: surface position -> sun visibility -> ink demand -> stroke coverage
// -> paper contact. Shading methods: 0 pencil, 1 engraving, 2 fixed stripes.
void main() {
    // Reconstruct position and footprint together before evaluating the hatching.
    vec3 positionDx;
    vec3 positionDy;
    vec3 surfacePosition = citySurfacePoint(worldNormal, planeDistance, positionDx, positionDy);
    float sunVisibility =
        cityShadowVisibility(lightProjection * vec4(surfacePosition, 1), worldNormal);
    float tone = cityPencilTone(worldNormal, sunVisibility, materialId);

    // Paper and roads retain their original base colors even without hatch ink.
    float paperTooth = pnHash(floor(gl_FragCoord.xy / sampleScale));
    vec3 paperColor = vec3(0.984, 0.978, 0.958) * (0.978 + 0.022 * paperTooth);
    if (materialId > 3.5) {
        paperColor *= 0.96;
    }
    meta = vec4(worldNormal * 0.5 + 0.5, materialId * 0.25);
    // Exit the FRAGMENT entry point, not only the nested hatch helper. This makes
    // complete paper quads cheap even on backends that flatten helper branches.
    if (tone <= 0.0) {
        color = vec4(paperColor, 1);
        return;
    }
    // Roofs share paper highlights; no decorative ink on fully lit surfaces.
    // Two symmetric samples preserve the fine graphite coverage. Geometry uses
    // native MSAA; outlines retain the original independent 2x metadata samples.
    vec3 sampleOffset = fastSampling == 1 ? 0.25 * (positionDx + positionDy) : vec3(0.0);
    float inkCoverage = pnPencil(surfacePosition - sampleOffset, worldNormal, positionDx,
                                 positionDy, tone, drawing);
    if (fastSampling == 1) {
        inkCoverage = 0.5 * (inkCoverage + pnPencil(surfacePosition + sampleOffset, worldNormal,
                                                    positionDx, positionDy, tone, drawing));
    }

    // Comparison modes reuse the same surface and its matching derivatives.
    if (method > 0) {
        vec2 chartPosition =
            abs(worldNormal.y) > 0.8
                ? surfacePosition.xz
                : (abs(worldNormal.x) > 0.7 ? surfacePosition.zy : surfacePosition.xy);
        float phase = dot(chartPosition, vec2(1, 0.6));
        vec2 chartDx = abs(worldNormal.y) > 0.8
                           ? positionDx.xz
                           : (abs(worldNormal.x) > 0.7 ? positionDx.zy : positionDx.xy);
        vec2 chartDy = abs(worldNormal.y) > 0.8
                           ? positionDy.xz
                           : (abs(worldNormal.x) > 0.7 ? positionDy.zy : positionDy.xy);
        vec2 phaseGradient = vec2(dot(chartDx, vec2(1, 0.6)), dot(chartDy, vec2(1, 0.6)));
        inkCoverage = method == 1 ? fhFamilyState(phase, phaseGradient, phaseGradient, tone, 7.0)
                                  : fhStripe(phase * 32.0, tone,
                                             (abs(phaseGradient.x) + abs(phaseGradient.y)) * 32.0);
    }

    // Paper contact affects light deposits more strongly than dense overlaps.
    float paperFibre = pnNoise(gl_FragCoord.xy / sampleScale * vec2(0.13, 0.87));
    inkCoverage *= mix(clamp(0.80 + 0.27 * paperTooth + 0.13 * paperFibre, 0.0, 1.0), 1.0,
                       pow(inkCoverage, 3.0));
    color = vec4(mix(paperColor, vec3(0.125, 0.119, 0.115), inkCoverage), 1);
    meta = vec4(worldNormal * 0.5 + 0.5, materialId * 0.25);
}
