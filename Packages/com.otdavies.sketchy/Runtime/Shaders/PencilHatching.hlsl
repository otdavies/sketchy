// Optional compile-time chart support; default retains the general shader.
#ifndef PN_CHART_MASK
#define PN_CHART_MASK 7
#endif
#ifndef PENCIL_HATCHING_INCLUDED
#define PENCIL_HATCHING_INCLUDED
// Nested pencil marks. MIT. See docs/hatching.md and docs/references.md.
// Read from pnPencil down the call chain: chart -> family -> stroke -> line key.
// Position and derivatives use the same surface coordinates. Pixel distances
// refer to the final output resolution, including when shading is supersampled.

float pnHash(float2 coordinate) {
    float3 hashState = frac(float3(coordinate.xyx) * float3(0.1031, 0.1030, 0.0973));
    hashState += dot(hashState, hashState.yzx + 33.33);
    return frac((hashState.x + hashState.y) * hashState.z);
}

float pnNoise(float2 coordinate) {
    float2 cell = floor(coordinate);
    float2 blendWeight = frac(coordinate);
    blendWeight = blendWeight * blendWeight * (3.0 - 2.0 * blendWeight);
    return lerp(lerp(pnHash(cell), pnHash(cell + float2(1, 0)), blendWeight.x),
                lerp(pnHash(cell + float2(0, 1)), pnHash(cell + float2(1, 1)), blendWeight.x),
                blendWeight.y);
}

// Reducing the dyadic fraction (lineIndex / 2^octave) gives a persistent line ID.
// Five bit tests find trailing zero count, including negative indices.
float2 pnLineKey(float lineIndex, float octave) {
    int reducedIndex = int(abs(lineIndex));
    if (reducedIndex == 0) {
        return float2(0, -12);
    }
    int removedDoublings = 0;
    if ((reducedIndex & 65535) == 0) {
        reducedIndex >>= 16;
        removedDoublings += 16;
    }
    if ((reducedIndex & 255) == 0) {
        reducedIndex >>= 8;
        removedDoublings += 8;
    }
    if ((reducedIndex & 15) == 0) {
        reducedIndex >>= 4;
        removedDoublings += 4;
    }
    if ((reducedIndex & 3) == 0) {
        reducedIndex >>= 2;
        removedDoublings += 2;
    }
    if ((reducedIndex & 1) == 0) {
        reducedIndex >>= 1;
        removedDoublings += 1;
    }
    return float2(float(reducedIndex) * sign(lineIndex), octave - float(removedDoublings));
}

// A finite pressure stroke attached to one persistent centerline. The length
// and gap structure depend on its BIRTH level, never its current octave label.
// across/along coordinates are measured in the chart's surface units.
// nominalWidth is a fraction of the current line spacing; birthActivation is
// the fraction of eligible child segments. The two rates are units per pixel.
float pnStroke(float acrossCoordinate, float alongCoordinate, float octave, float lineIndex,
               float nominalWidth, float birthActivation, float acrossPerPixel, float alongPerPixel,
               float frameSeed, float familySeed) {
    // Persistent line identity controls length, gaps and the birth threshold.
    float linesPerUnit = exp2(octave);
    float2 lineKey = pnLineKey(lineIndex, octave) + float2(familySeed * 17.0, 0);
    float shapeRandom = pnHash(lineKey + 1.13);
    float phaseRandom = pnHash(lineKey + 31.77);
    float birthLinesPerUnit = exp2(lineKey.y);
    float segmentsPerUnit = birthLinesPerUnit / (4.5 + 6.0 * shapeRandom);
    float segmentCoordinate = alongCoordinate * segmentsPerUnit + phaseRandom * 19.0;
    float segmentIndex = floor(segmentCoordinate);
    float segmentFraction = frac(segmentCoordinate);
    float segmentRandom = pnHash(lineKey + float2(segmentIndex, 13.71));
    float birthRank = 0.0001 + 0.9998 * pnHash(lineKey + float2(segmentIndex + 31.0, 73.9));
    float isBorn = step(birthRank, birthActivation);
    // Rejected children contribute exactly zero; no pressure/noise work needed.
    if (isBorn == 0.0) {
        return 0.0;
    }

    // Taper each end, then average away gaps that are smaller than a pixel.
    float segmentFootprint = max(alongPerPixel * segmentsPerUnit, 0.001);
    float distanceToTip = min(segmentFraction, 1.0 - segmentFraction);
    float tipCoverage = smoothstep(0.045, 0.14 + 0.12 * segmentRandom, distanceToTip);
    // If the segment is subpixel, use its approximate mean instead of flicker.
    tipCoverage = lerp(tipCoverage, 0.73, smoothstep(0.25, 0.8, segmentFootprint));

    // Shape and drawing variation stay attached to this line's key.
    float strokePressure =
        (0.62 + 0.50 * shapeRandom) * (0.72 + 0.28 * sin(3.141593 * segmentFraction));
    float frameOffset = pnHash(lineKey + float2(frameSeed * 0.719, 91.0)) - 0.5;
    float centerlineWave = sin(segmentCoordinate * 6.283185 + shapeRandom * 6.0) +
                           0.4 * sin(segmentCoordinate * 17.0 + phaseRandom * 9.0);
    // Small screen-space displacement, seeded by persistent line identity.
    // It is unchanged by parent/child relabeling at the same viewing scale.
    float centerlineOffset =
        (0.35 * centerlineWave + 0.75 * frameOffset) * acrossPerPixel * linesPerUnit;
    float distanceToLine = acrossCoordinate * linesPerUnit - lineIndex + centerlineOffset;

    // Convert distance to antialiased coverage, then apply taper and drawing pressure.
    float strokeWidth = nominalWidth * strokePressure * (0.76 + 0.24 * tipCoverage);
    float lineFootprint = max(acrossPerPixel * linesPerUnit, 0.00001);
    float lineCoverage =
        clamp((strokeWidth * 0.5 - abs(distanceToLine)) / lineFootprint + 0.5, 0.0, 1.0);
    if (lineCoverage == 0.0) {
        return 0.0;
    }
    float framePressure =
        0.78 + 0.44 * pnHash(lineKey + float2(frameSeed * 0.33, segmentIndex + 101.0));
    return lineCoverage * tipCoverage * framePressure * isBorn;
}

// A family is a set of parallel strokes. The parent grid remains in place;
// odd sites in the next finer grid become the new children as spacing changes.
float pnFamily(float2 chartPosition, float2 chartDx, float2 chartDy, float angleRadians,
               float spacingPixels, float familySeed, float frameSeed) {
    float2 acrossDirection = float2(cos(angleRadians), sin(angleRadians));
    float2 alongDirection = float2(-acrossDirection.y, acrossDirection.x);
    float acrossCoordinate = dot(chartPosition, acrossDirection) + familySeed * 0.173;
    float alongCoordinate = dot(chartPosition, alongDirection);
    float acrossPerPixel =
        max(length(float2(dot(chartDx, acrossDirection), dot(chartDy, acrossDirection))), 1e-9);
    float alongPerPixel =
        max(length(float2(dot(chartDx, alongDirection), dot(chartDy, alongDirection))), 1e-9);

    // Keep spacing near spacingPixels, including between integer octaves.
    float continuousOctave = clamp(-log2(spacingPixels * acrossPerPixel), -16.0, 16.0);
    float parentOctave = floor(continuousOctave);
    float subdivision = exp2(frac(continuousOctave));
    float childActivation = subdivision - 1.0;

    // Evaluate the nearest parent and the child between two parents.
    float parentCoordinate = acrossCoordinate * exp2(parentOctave);
    float parentIndex = floor(parentCoordinate + 0.5);
    float childIndex = 2.0 * floor(parentCoordinate) + 1.0;
    float parentInk =
        pnStroke(acrossCoordinate, alongCoordinate, parentOctave, parentIndex, 0.21 / subdivision,
                 1.0, acrossPerPixel, alongPerPixel, frameSeed, familySeed);
    float childInk = pnStroke(acrossCoordinate, alongCoordinate, parentOctave + 1.0, childIndex,
                              0.42 / subdivision, childActivation, acrossPerPixel, alongPerPixel,
                              frameSeed, familySeed);
    return min(1.0, parentInk + childInk);
}

// One planar chart contributes three stroke directions plus broad graphite.
// The result is graphite deposit, not yet a final [0, 1] ink coverage.
float pnChart(float2 chartPosition, float2 chartDx, float2 chartDy, float tone, float chartSeed,
              float frameSeed) {
    // A view-independent, smooth chart deformation: no latitude/longitude pole.
    float2 warpedPosition = chartPosition + 0.024 * float2(sin(chartPosition.y * 4.1 + chartSeed),
                                                           sin(chartPosition.x * 3.3 - chartSeed));
    // Columns of the warp Jacobian; 0.0792 = 0.024 * 3.3,
    // and 0.0984 = 0.024 * 4.1. Apply it to both pixel derivatives.
    float2 warpDerivativeX = float2(1.0, 0.0792 * cos(chartPosition.x * 3.3 - chartSeed));
    float2 warpDerivativeY = float2(0.0984 * cos(chartPosition.y * 4.1 + chartSeed), 1.0);
    float2 warpedDx = warpDerivativeX * chartDx.x + warpDerivativeY * chartDx.y;
    float2 warpedDy = warpDerivativeX * chartDy.x + warpDerivativeY * chartDy.y;

    // Crossing strokes build darker tones without rotating the surface chart.
    float primaryInk =
        pnFamily(warpedPosition, warpedDx, warpedDy, -0.64, 3.8, chartSeed + 1.0, frameSeed);
    float crossAmount = smoothstep(0.18, 0.68, tone);
    float crossInk = 0.0;
    if (crossAmount > 0.0) {
        crossInk =
            pnFamily(warpedPosition, warpedDx, warpedDy, 0.26, 3.15, chartSeed + 4.0, frameSeed);
    }
    float detailInk =
        pnFamily(warpedPosition, warpedDx, warpedDy, -0.83, 2.5, chartSeed + 9.0, frameSeed);
    float broadDeposit = 0.83 + 0.25 * pnNoise(warpedPosition * 18.0 + chartSeed);
    return 0.25 * broadDeposit + 2.9 * primaryInk + 2.5 * crossInk * crossAmount + 1.3 * detailInk;
}

// A partition of unity over three well-conditioned planar charts. Pole-prone
// charts lose support before their projected coordinate system collapses.
float pnPencil(float3 surfacePosition, float3 surfaceNormal, float3 positionDx, float3 positionDy,
               float tone, float frameSeed) {
    // Derivatives are supplied by the caller before this branch.
    // Lit paper and zero-weight charts have analytically zero contributions.
    if (tone <= 0.0) {
        return 0.0;
    }
    float graphiteDeposit = 0.0;
    float3 chartWeights =
        pow(max(abs(surfaceNormal) - float3(0.22, 0.22, 0.22), float3(0, 0, 0)), float3(4, 4, 4));
    chartWeights /= max(dot(chartWeights, float3(1, 1, 1)), 1e-6);
#if (PN_CHART_MASK & 1)
    if (chartWeights.x > 0.0) {
        graphiteDeposit += chartWeights.x * pnChart(surfacePosition.yz, positionDx.yz,
                                                    positionDy.yz, tone, 1.0, frameSeed);
    }
#endif
#if (PN_CHART_MASK & 2)
    if (chartWeights.y > 0.0) {
        graphiteDeposit += chartWeights.y * pnChart(surfacePosition.zx, positionDx.zx,
                                                    positionDy.zx, tone, 5.0, frameSeed);
    }
#endif
#if (PN_CHART_MASK & 4)
    if (chartWeights.z > 0.0) {
        graphiteDeposit += chartWeights.z * pnChart(surfacePosition.xy, positionDx.xy,
                                                    positionDy.xy, tone, 9.0, frameSeed);
    }
#endif

    // Convert accumulated graphite to coverage. tone == 0 stays bare paper;
    // overlapping strokes approach solid graphite as optical depth increases.
    float opticalDepth = -log(max(1.0 - tone, 0.01));
    return 1.0 - exp(-opticalDepth * graphiteDeposit * 1.12);
}

#endif
