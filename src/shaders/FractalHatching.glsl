// Analytic nested hatching research prototype, 2026. SPDX-License-Identifier: MIT
// Conceptual lineage: Rune Skovbo Johansen's Surface-Stable Fractal Dithering
// and Praun et al., Real-Time Hatching (2001). Independently written code.

// Antiderivative of a unit-period stripe of full width w, centered on integers.
float fhIntegral(float x, float w) {
    float q = x + 0.5 * w;
    return floor(q) * w + min(fract(q), w);
}

// Exact integral for a 1D box footprint; approximation to a 2D pixel filter.
// Reducing phase BEFORE the integral avoids subtracting two large integrals.
float fhStripe(float phase, float width, float footprint) {
    float x = fract(phase);
    float w = clamp(width, 0.0, 1.0);
    float p = max(footprint, 1e-6);
    return clamp((fhIntegral(x + p * 0.5, w)
                - fhIntegral(x - p * 0.5, w)) / p, 0.0, 1.0);
}

// phase is a continuous, SURFACE-ATTACHED scalar. Derivatives must be taken
// BEFORE floor/fract/LOD selection, in uniform fragment control flow.
// gapPx is measured in render-target pixels. ink is desired area coverage.
float fhFamilyState(float phase, vec2 gradient, vec2 stateGradient, float ink, float gapPx) {
    float g = max(length(stateGradient), 1e-10);
    float lod = clamp(-log2(max(gapPx, 2.0) * g), -20.0, 20.0);
    float level = floor(lod);
    float subdivision = exp2(fract(lod));
    float birth = subdivision - 1.0;
    float frequency = exp2(level);
    float u = phase * frequency;
    float footprint = max((abs(gradient.x) + abs(gradient.y)) * frequency, 1e-6);
    float parentWidth = clamp(ink, 0.0, 1.0) / subdivision;
    float childWidth = parentWidth * birth;
    return clamp(fhStripe(u, parentWidth, footprint)
               + fhStripe(u - 0.5, childWidth, footprint), 0.0, 1.0);
}

// Separate held drawing-state metric from the live anti-aliasing footprint.
float fhFamilyGrad(float phase, vec2 gradient, float ink, float gapPx)
{
    return fhFamilyState(phase, gradient, gradient, ink, gapPx);
}

float fhFamily(float phase, float ink, float gapPx) {
    return fhFamilyGrad(phase, vec2(dFdx(phase), dFdy(phase)), ink, gapPx);
}

// Under locally independent crossing phases, union coverage equals ink.
// On curved charts / correlated phases this is a local tone approximation.
float fhCross(vec2 phase, float ink, float gapPx) {
    float a = min(clamp(ink, 0.0, 1.0), 0.46);
    float b = (clamp(ink, 0.0, 1.0) - a) / (1.0 - a);
    float first = fhFamily(phase.x, a, gapPx);
    float second = fhFamily(phase.y, b, gapPx);
    return first + second - first * second;
}
