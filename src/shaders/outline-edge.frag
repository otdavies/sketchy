#version 300 es
precision highp float;
precision highp sampler2D;
// A depth texture's return precision follows its SAMPLER, not the float default.
// Lower precision here creates false discontinuities across perfectly flat faces.
uniform sampler2D normalsTexture;
uniform sampler2D depthTexture;
uniform vec2 resolution;
uniform vec3 cameraRight;
uniform vec3 cameraUp;
uniform vec3 cameraForward;
uniform float worldPerPixel;
uniform int cameraPerspective;
out vec4 edge;

ivec2 clampSamplePixel(ivec2 pixel) {
    return clamp(pixel, ivec2(0), textureSize(depthTexture, 0) - 1);
}

vec4 readSurfaceMetadata(ivec2 pixel) {
    vec4 encodedMetadata = texelFetch(normalsTexture, clampSamplePixel(pixel), 0);
    return vec4(encodedMetadata.xyz * 2.0 - 1.0, encodedMetadata.a * 4.0);
}

float readLinearDepth(ivec2 pixel) {
    float deviceDepth = texelFetch(depthTexture, clampSamplePixel(pixel), 0).r;
    return cameraPerspective == 1 ? (0.03 * 40.0) / (40.0 - deviceDepth * (40.0 - 0.03))
                                  : deviceDepth * 39.9 + 0.1;
}

float edgeBetweenSamples(vec4 metadataA, vec4 metadataB, float depthA, float depthB, ivec2 pixelA,
                         ivec2 pixelB) {
    if (depthA > 39.999 && depthB > 39.999) {
        return 0.0;
    }
    if ((depthA > 39.999) != (depthB > 39.999)) {
        return 1.0;
    }
    vec2 lateralDisplacement =
        vec2(clampSamplePixel(pixelB) - clampSamplePixel(pixelA)) * 0.5 * worldPerPixel;
    float pixelSize = worldPerPixel;
    // 16777215 is the largest depth24 code; 39.9 is the orbit depth span.
    float depthError = 39.9 * 2.0 / 16777215.0;
    if (cameraPerspective == 1) {
        vec2 rayOffsetA =
            ((vec2(clampSamplePixel(pixelA)) + 0.5) * 0.5 - resolution * 0.5) * worldPerPixel;
        vec2 rayOffsetB =
            ((vec2(clampSamplePixel(pixelB)) + 0.5) * 0.5 - resolution * 0.5) * worldPerPixel;
        lateralDisplacement = rayOffsetB * depthB - rayOffsetA * depthA;
        pixelSize *= min(depthA, depthB);
        // Nonlinear depth24 error grows with distance. Include the view-ray length.
        depthError = (depthA * depthA + depthB * depthB) * (40.0 - 0.03) /
                     (0.03 * 40.0 * 16777215.0) *
                     (1.0 + max(length(rayOffsetA), length(rayOffsetB)));
    }
    vec3 worldDisplacement = cameraRight * lateralDisplacement.x +
                             cameraUp * lateralDisplacement.y + cameraForward * (depthB - depthA);
    float planeResidual =
        max(abs(dot(metadataA.xyz, worldDisplacement)), abs(dot(metadataB.xyz, worldDisplacement)));
    // Conservative bound for RGB8 normal quantization + depth24 rounding.
    // No division by the grazing angle and no global increase in world-space bias.
    float quantizationAllowance = dot(abs(worldDisplacement), vec3(1.0 / 255.0)) + depthError;
    float normalEdge = step(0.18, length(metadataA.xyz - metadataB.xyz));
    float planeEdge = step(0.008 + pixelSize * 0.09 + quantizationAllowance, planeResidual);
    float materialEdge = step(0.5, abs(metadataA.a - metadataB.a));
    return max(max(normalEdge, planeEdge), materialEdge);
}

// Accumulate subpixel crossings before estimating the local edge direction.
// secondMoments packs (xx, xy, yy); positions are relative to the output pixel.
struct EdgeCrossings {
    float count;
    vec2 positionSum;
    vec3 secondMoments;
    vec2 directionSum;
};

void addCrossing(inout EdgeCrossings crossings, float strength, vec2 offset, vec2 direction) {
    crossings.positionSum += strength * offset;
    crossings.secondMoments +=
        strength * vec3(offset.x * offset.x, offset.x * offset.y, offset.y * offset.y);
    crossings.count += strength;
    crossings.directionSum += strength * direction;
}

void main() {
    // Metadata is 2x output resolution. Suffixes below are (x, y) grid offsets.
    ivec2 patchOrigin = ivec2(gl_FragCoord.xy) * 2;
    // Reuse a 3x3 patch (unused corner omitted): 16 fetches instead of repeatedly fetching each pair,
    // and take orientation from real edge crossings (no extra depth gradients).
    EdgeCrossings crossings = EdgeCrossings(0.0, vec2(0.0), vec3(0.0), vec2(0.0));
    vec4 metadata00 = readSurfaceMetadata(patchOrigin + ivec2(0, 0));
    float depth00 = readLinearDepth(patchOrigin + ivec2(0, 0));
    vec4 metadata10 = readSurfaceMetadata(patchOrigin + ivec2(1, 0));
    float depth10 = readLinearDepth(patchOrigin + ivec2(1, 0));
    vec4 metadata20 = readSurfaceMetadata(patchOrigin + ivec2(2, 0));
    float depth20 = readLinearDepth(patchOrigin + ivec2(2, 0));
    vec4 metadata01 = readSurfaceMetadata(patchOrigin + ivec2(0, 1));
    float depth01 = readLinearDepth(patchOrigin + ivec2(0, 1));
    vec4 metadata11 = readSurfaceMetadata(patchOrigin + ivec2(1, 1));
    float depth11 = readLinearDepth(patchOrigin + ivec2(1, 1));
    vec4 metadata21 = readSurfaceMetadata(patchOrigin + ivec2(2, 1));
    float depth21 = readLinearDepth(patchOrigin + ivec2(2, 1));
    vec4 metadata02 = readSurfaceMetadata(patchOrigin + ivec2(0, 2));
    float depth02 = readLinearDepth(patchOrigin + ivec2(0, 2));
    vec4 metadata12 = readSurfaceMetadata(patchOrigin + ivec2(1, 2));
    float depth12 = readLinearDepth(patchOrigin + ivec2(1, 2));

    addCrossing(crossings,
                edgeBetweenSamples(metadata00, metadata10, depth00, depth10,
                                   patchOrigin + ivec2(0, 0), patchOrigin + ivec2(1, 0)),
                vec2(0.000, -0.250), vec2(1.0, 0.0));
    addCrossing(crossings,
                edgeBetweenSamples(metadata00, metadata01, depth00, depth01,
                                   patchOrigin + ivec2(0, 0), patchOrigin + ivec2(0, 1)),
                vec2(-0.250, 0.000), vec2(0.0, 1.0));
    addCrossing(crossings,
                edgeBetweenSamples(metadata10, metadata20, depth10, depth20,
                                   patchOrigin + ivec2(1, 0), patchOrigin + ivec2(2, 0)),
                vec2(0.500, -0.250), vec2(1.0, 0.0));
    addCrossing(crossings,
                edgeBetweenSamples(metadata10, metadata11, depth10, depth11,
                                   patchOrigin + ivec2(1, 0), patchOrigin + ivec2(1, 1)),
                vec2(0.250, 0.000), vec2(0.0, 1.0));
    addCrossing(crossings,
                edgeBetweenSamples(metadata01, metadata11, depth01, depth11,
                                   patchOrigin + ivec2(0, 1), patchOrigin + ivec2(1, 1)),
                vec2(0.000, 0.250), vec2(1.0, 0.0));
    addCrossing(crossings,
                edgeBetweenSamples(metadata01, metadata02, depth01, depth02,
                                   patchOrigin + ivec2(0, 1), patchOrigin + ivec2(0, 2)),
                vec2(-0.250, 0.500), vec2(0.0, 1.0));
    addCrossing(crossings,
                edgeBetweenSamples(metadata11, metadata21, depth11, depth21,
                                   patchOrigin + ivec2(1, 1), patchOrigin + ivec2(2, 1)),
                vec2(0.500, 0.250), vec2(1.0, 0.0));
    addCrossing(crossings,
                edgeBetweenSamples(metadata11, metadata12, depth11, depth12,
                                   patchOrigin + ivec2(1, 1), patchOrigin + ivec2(1, 2)),
                vec2(0.250, 0.500), vec2(0.0, 1.0));

    // Empty pixels have no descriptor. Otherwise fit orientation to crossings.
    if (crossings.count < 0.5) {
        edge = vec4(0);
        return;
    }
    vec2 meanOffset = crossings.positionSum / crossings.count;
    vec3 covariance =
        crossings.secondMoments / crossings.count -
        vec3(meanOffset.x * meanOffset.x, meanOffset.x * meanOffset.y, meanOffset.y * meanOffset.y);
    // Multiple subpixel crossings yield a normal from their positional covariance.
    // A lone crossing keeps its x/y finite-difference direction until the local fit.
    float angle =
        crossings.count > 1.5
            ? 0.5 * atan(2.0 * covariance.y, covariance.x - covariance.z + 1e-8) + 1.570796327
            : atan(crossings.directionSum.y, crossings.directionSum.x);
    angle = mod(angle + 1.570796327, 3.141592654) - 1.570796327;
    edge = vec4(0.5 + meanOffset * 0.5, angle / 3.141592654 + 0.5, min(1.0, crossings.count * 0.5));
}
