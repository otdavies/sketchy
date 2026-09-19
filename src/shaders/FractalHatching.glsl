// Analytic nested hatching research prototype, 2026. SPDX-License-Identifier: MIT
// Conceptual lineage: Rune Skovbo Johansen's Surface-Stable Fractal Dithering
// and Praun et al., Real-Time Hatching (2001). Independently written code.

// Antiderivative of a unit-period stripe of full width stripeWidth, centered on integers.
float fhIntegral(float phase, float stripeWidth) {
    float shiftedPhase = phase + 0.5 * stripeWidth;
    return floor(shiftedPhase) * stripeWidth + min(fract(shiftedPhase), stripeWidth);
}

// Exact integral for a 1D box footprint; approximation to a 2D pixel filter.
// Reducing phase BEFORE the integral avoids subtracting two large integrals.
float fhStripe(float phase, float width, float footprint) {
    float wrappedPhase = fract(phase);
    float stripeWidth = clamp(width, 0.0, 1.0);
    float pixelFootprint = max(footprint, 1e-6);
    return clamp((fhIntegral(wrappedPhase + pixelFootprint * 0.5, stripeWidth) -
                  fhIntegral(wrappedPhase - pixelFootprint * 0.5, stripeWidth)) /
                     pixelFootprint,
                 0.0, 1.0);
}

// phase is a continuous, SURFACE-ATTACHED scalar. Derivatives must be taken
// BEFORE floor/fract/LOD selection, in uniform fragment control flow.
// spacingPixels is measured in output pixels. inkCoverage is desired area coverage.
float fhFamilyState(float phase, vec2 phaseGradient, vec2 scaleGradient, float inkCoverage,
                    float spacingPixels) {
    float phasePerPixel = max(length(scaleGradient), 1e-10);
    float continuousOctave = clamp(-log2(max(spacingPixels, 2.0) * phasePerPixel), -20.0, 20.0);
    float parentOctave = floor(continuousOctave);
    float subdivision = exp2(fract(continuousOctave));
    float childActivation = subdivision - 1.0;
    float linesPerUnit = exp2(parentOctave);
    float parentCoordinate = phase * linesPerUnit;
    float footprint = max((abs(phaseGradient.x) + abs(phaseGradient.y)) * linesPerUnit, 1e-6);
    // Share the requested coverage between the existing grid and new lines.
    float parentWidth = clamp(inkCoverage, 0.0, 1.0) / subdivision;
    float childWidth = parentWidth * childActivation;
    return clamp(fhStripe(parentCoordinate, parentWidth, footprint) +
                     fhStripe(parentCoordinate - 0.5, childWidth, footprint),
                 0.0, 1.0);
}

// Convenience entry points: use the same gradient for scale and filtering.
float fhFamilyGrad(float phase, vec2 phaseGradient, float inkCoverage, float spacingPixels) {
    return fhFamilyState(phase, phaseGradient, phaseGradient, inkCoverage, spacingPixels);
}

float fhFamily(float phase, float inkCoverage, float spacingPixels) {
    return fhFamilyGrad(phase, vec2(dFdx(phase), dFdy(phase)), inkCoverage, spacingPixels);
}

// Under locally independent crossing phases, union coverage equals ink.
// On curved charts / correlated phases this is a local tone approximation.
// 0.46 caps the first direction; the second supplies the remaining darkness.
float fhCross(vec2 phase, float inkCoverage, float spacingPixels) {
    float primaryCoverage = min(clamp(inkCoverage, 0.0, 1.0), 0.46);
    float crossCoverage =
        (clamp(inkCoverage, 0.0, 1.0) - primaryCoverage) / (1.0 - primaryCoverage);
    float primaryInk = fhFamily(phase.x, primaryCoverage, spacingPixels);
    float crossInk = fhFamily(phase.y, crossCoverage, spacingPixels);
    return primaryInk + crossInk - primaryInk * crossInk;
}
