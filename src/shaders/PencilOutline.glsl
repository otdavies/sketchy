// Descriptor layout: RG = local pixel offset * 0.5 + 0.5,
// B = unoriented normal angle / pi + 0.5, A = confidence (zero means empty).
// Weighted second moments and covariance store (xx, xy, yy).
// Fit each occupied edge-seed pixel ONCE. The compose pass only finds the
// nearest fitted descriptor. All distances are in native screen pixels.
vec4 poSeed(ivec2 pixel) {
    return texelFetch(edgeSeeds, clamp(pixel, ivec2(0), textureSize(edgeSeeds, 0) - 1), 0);
}

vec2 poNormal(vec4 descriptor) {
    float normalAngle = (descriptor.b - 0.5) * 3.14159265;
    return vec2(cos(normalAngle), sin(normalAngle));
}

vec2 poOffset(vec4 descriptor) {
    return (descriptor.rg - 0.5) * 2.0;
}
#ifdef OUTLINE_FIT_PASS
vec4 poFitAtSeed(ivec2 centerPixel) {
    vec4 centerSeed = poSeed(centerPixel);
    if (centerSeed.a < 0.01) {
        return vec4(0.0);
    }
    vec2 seedOffset = poOffset(centerSeed);
    vec2 seedNormal = poNormal(centerSeed);

    // Collect nearby crossings that agree with this seed's direction and contour.
    float totalWeight = 0.0;
    vec2 weightedPosition = vec2(0.0);
    vec3 weightedMoments = vec3(0.0);
    for (int y = -3; y <= 3; y++) {
        for (int x = -3; x <= 3; x++) {
            vec4 neighborSeed = poSeed(centerPixel + ivec2(x, y));
            if (neighborSeed.a < 0.01) {
                continue;
            }
            vec2 neighborOffset = vec2(x, y) + poOffset(neighborSeed);
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
                vec3(neighborOffset.x * neighborOffset.x, neighborOffset.x * neighborOffset.y,
                     neighborOffset.y * neighborOffset.y) *
                weight;
        }
    }
    if (totalWeight < 0.01) {
        return centerSeed;
    }
    vec2 meanOffset = weightedPosition / totalWeight;
    vec3 covariance =
        weightedMoments / totalWeight -
        vec3(meanOffset.x * meanOffset.x, meanOffset.x * meanOffset.y, meanOffset.y * meanOffset.y);

    // The major covariance axis is the fitted tangent. Its perpendicular is the
    // line normal; align its sign with the seed before blending.
    float tangentAngle = 0.5 * atan(2.0 * covariance.y, covariance.x - covariance.z + 1e-8);
    vec2 fittedNormal = vec2(-sin(tangentAngle), cos(tangentAngle));
    if (dot(fittedNormal, seedNormal) < 0.0) {
        fittedNormal = -fittedNormal;
    }

    // A clear dominant axis and enough supporting weight justify a fitted line.
    // Otherwise keep the original seed, especially at corners and junctions.
    float lineCoherence = length(vec2(covariance.x - covariance.z, 2.0 * covariance.y)) /
                          max(covariance.x + covariance.z, 0.0001);
    float fitConfidence = smoothstep(0.5, 0.88, lineCoherence) * smoothstep(0.7, 2.0, totalWeight);
    fittedNormal = normalize(mix(seedNormal, fittedNormal, fitConfidence));
    meanOffset = mix(seedOffset, meanOffset, fitConfidence);
    // Anchor the descriptor near its originating sample, never extend/bridge gaps.
    vec2 fittedOffset =
        seedOffset + fittedNormal * clamp(dot(meanOffset - seedOffset, fittedNormal), -0.45, 0.45);
    float encodedNormalAngle =
        mod(atan(fittedNormal.y, fittedNormal.x) + 1.570796327, 3.141592654) - 1.570796327;
    return vec4(0.5 + fittedOffset * 0.5, encodedNormalAngle / 3.141592654 + 0.5, centerSeed.a);
}
#else
float poFittedInk(vec2 pixelPosition, float frameSeed, float jitterPixels, int outlineMode) {
    // One coarse alpha tap rejects blank areas. At mip 3, bilinear support
    // extends at least four native pixels, conservatively covering the 5x5 search.
    // Mip alpha is occupancy only; descriptor positions always come from mip 0.
    float occupancy = textureLod(edgeSeeds, pixelPosition / resolution, 3.0).a;
    if (occupancy <= 0.0) {
        return 0.0;
    }
    ivec2 centerPixel = ivec2(pixelPosition);
    float closestDistanceSquared = 1e9;
    vec2 closestOffset = vec2(0);
    vec4 closestDescriptor = vec4(0);
    for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
            vec4 descriptor = poSeed(centerPixel + ivec2(x, y));
            vec2 neighborOffset = vec2(x, y) + poOffset(descriptor);
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
            (2.0 * pnNoise(pixelPosition * 0.035 + vec2(frameSeed * 3.17, frameSeed * 0.91)) - 1.0);
        linePressure = 0.70 + 0.38 * pnNoise(pixelPosition * 0.12 + vec2(frameSeed * 0.73, 11));
    }
    float lineCoverage =
        clamp(0.64 * linePressure + 0.6 - abs(distanceToLine - lineDisplacement), 0.0, 1.0);
    float paperContact = outlineMode == 2 ? 0.76 + 0.24 * pnHash(floor(pixelPosition)) : 1.0;
    return lineCoverage * (outlineMode == 2 ? 0.83 : 0.84) * paperContact * closestDescriptor.a;
}
#endif
