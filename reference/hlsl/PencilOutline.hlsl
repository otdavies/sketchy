#ifndef SCREEN_SPACE_PENCIL_OUTLINE_INCLUDED
#define SCREEN_SPACE_PENCIL_OUTLINE_INCLUDED
// Engine-independent translation; not compiled in Unity. Bind edgeSeeds,
// edgeLinearSampler (bilinear + nearest mip), resolution; include PencilHatching.
// Compile once with OUTLINE_FIT_PASS to produce descriptors. Generate mips.
// Compile without the define to composite descriptors in pixel space.
float poMod(float value, float period) {
    return value - period * floor(value / period);
}
// Descriptor layout: RG = local pixel offset * 0.5 + 0.5,
// B = unoriented normal angle / pi + 0.5, A = confidence (zero means empty).
// Weighted second moments and covariance store (xx, xy, yy).
// Fit each occupied edge-seed pixel ONCE. The compose pass only finds the
// nearest fitted descriptor. All distances are in native screen pixels.
float4 poSeed(int2 pixel) {
    uint textureWidth;
    uint textureHeight;
    edgeSeeds.GetDimensions(textureWidth, textureHeight);
    return edgeSeeds.Load(int3(clamp(pixel, int2(0, 0), int2(textureWidth, textureHeight) - 1), 0));
}
float2 poNormal(float4 descriptor) {
    float normalAngle = (descriptor.b - 0.5) * 3.14159265;
    return float2(cos(normalAngle), sin(normalAngle));
}
float2 poOffset(float4 descriptor) {
    return (descriptor.rg - 0.5) * 2.0;
}
#ifdef OUTLINE_FIT_PASS
float4 poFitAtSeed(int2 centerPixel) {
    float4 centerSeed = poSeed(centerPixel);
    if (centerSeed.a < 0.01) {
        return float4(0, 0, 0, 0);
    }
    float2 seedOffset = poOffset(centerSeed);
    float2 seedNormal = poNormal(centerSeed);

    // Collect nearby crossings that agree with this seed's direction and contour.
    float totalWeight = 0.0;
    float2 weightedPosition = float2(0, 0);
    float3 weightedMoments = float3(0, 0, 0);
    for (int y = -3; y <= 3; y++) {
        for (int x = -3; x <= 3; x++) {
            float4 neighborSeed = poSeed(centerPixel + int2(x, y));
            if (neighborSeed.a < 0.01) {
                continue;
            }
            float2 neighborOffset = float2(x, y) + poOffset(neighborSeed);
            // Angle comparison for unoriented lines avoids sin/cos in the neighborhood.
            float angleDifference = abs(neighborSeed.b - centerSeed.b);
            angleDifference = min(angleDifference, 1.0 - angleDifference);
            float directionAgreement = 1.0 - smoothstep(0.12, 0.27, angleDifference);
            float sameContourWeight =
                1.0 - smoothstep(0.65, 1.35, abs(dot(neighborOffset - seedOffset, seedNormal)));
            float weight = neighborSeed.a * directionAgreement * sameContourWeight /
                           (1.0 + dot(neighborOffset, neighborOffset) / 12.0);
            totalWeight += weight;
            weightedPosition += neighborOffset * weight;
            weightedMoments +=
                float3(neighborOffset.x * neighborOffset.x, neighborOffset.x * neighborOffset.y,
                       neighborOffset.y * neighborOffset.y) *
                weight;
        }
    }
    if (totalWeight < 0.01) {
        return centerSeed;
    }
    float2 meanOffset = weightedPosition / totalWeight;
    float3 covariance = weightedMoments / totalWeight - float3(meanOffset.x * meanOffset.x,
                                                               meanOffset.x * meanOffset.y,
                                                               meanOffset.y * meanOffset.y);

    // The major covariance axis is the fitted tangent. Its perpendicular is the
    // line normal; align its sign with the seed before blending.
    float tangentAngle = 0.5 * atan2(2.0 * covariance.y, covariance.x - covariance.z + 1e-8);
    float2 fittedNormal = float2(-sin(tangentAngle), cos(tangentAngle));
    if (dot(fittedNormal, seedNormal) < 0.0) {
        fittedNormal = -fittedNormal;
    }

    // A clear dominant axis and enough supporting weight justify a fitted line.
    // Otherwise keep the original seed, especially at corners and junctions.
    float lineCoherence = length(float2(covariance.x - covariance.z, 2.0 * covariance.y)) /
                          max(covariance.x + covariance.z, 0.0001);
    float fitConfidence = smoothstep(0.5, 0.88, lineCoherence) * smoothstep(0.7, 2.0, totalWeight);
    fittedNormal = normalize(lerp(seedNormal, fittedNormal, fitConfidence));
    meanOffset = lerp(seedOffset, meanOffset, fitConfidence);
    // Anchor the descriptor near its originating sample, never extend/bridge gaps.
    float2 fittedOffset =
        seedOffset + fittedNormal * clamp(dot(meanOffset - seedOffset, fittedNormal), -0.45, 0.45);
    float encodedNormalAngle =
        poMod(atan2(fittedNormal.y, fittedNormal.x) + 1.570796327, 3.141592654) - 1.570796327;
    return float4(0.5 + fittedOffset * 0.5, encodedNormalAngle / 3.141592654 + 0.5, centerSeed.a);
}
#else
float poFittedInk(float2 pixelPosition, float frameSeed, float jitterPixels, int outlineMode) {
    // Mip alpha is conservative occupancy; positions are always from mip 0.
    float occupancy = edgeSeeds.SampleLevel(edgeLinearSampler, pixelPosition / resolution, 3.0).a;
    if (occupancy <= 0.0) {
        return 0.0;
    }
    int2 centerPixel = int2(pixelPosition);
    float closestDistanceSquared = 1e9;
    float2 closestOffset = float2(0, 0);
    float4 closestDescriptor = float4(0, 0, 0, 0);
    for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
            float4 descriptor = poSeed(centerPixel + int2(x, y));
            float2 neighborOffset = float2(x, y) + poOffset(descriptor);
            float distanceSquared = dot(neighborOffset, neighborOffset);
            if (descriptor.a > 0.01 && distanceSquared < closestDistanceSquared) {
                closestDistanceSquared = distanceSquared;
                closestOffset = neighborOffset;
                closestDescriptor = descriptor;
            }
        }
    }
    if (closestDistanceSquared > 5.5) {
        return 0.0;
    }

    // Shade the closest local line. Only Pencil fit (mode 2) varies its placement
    // and pressure; Stable fit and Lines only keep their fixed line appearance.
    float distanceToLine = dot(-closestOffset, poNormal(closestDescriptor));
    float linePressure = 1.0;
    float lineDisplacement = 0.0;
    if (outlineMode == 2) {
        lineDisplacement =
            jitterPixels *
            (2.0 * pnNoise(pixelPosition * 0.035 + float2(frameSeed * 3.17, frameSeed * 0.91)) -
             1.0);
        linePressure = 0.70 + 0.38 * pnNoise(pixelPosition * 0.12 + float2(frameSeed * 0.73, 11));
    }
    float lineCoverage =
        clamp(0.64 * linePressure + 0.6 - abs(distanceToLine - lineDisplacement), 0.0, 1.0);
    float paperContact = outlineMode == 2 ? 0.76 + 0.24 * pnHash(floor(pixelPosition)) : 1.0;
    return lineCoverage * (outlineMode == 2 ? 0.83 : 0.84) * paperContact * closestDescriptor.a;
}
#endif

#endif
