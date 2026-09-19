// Light direction points FROM the surface TOWARD the sun. Camera-independent.
// Geometric face normals are required for receiver-plane filtering.
uniform vec3 lightDirection;
uniform vec3 lightRight;
uniform vec3 lightUp;
uniform float shadowPlaneScale;
uniform highp sampler2DShadow shadowMap;

// Change in normalized light depth per unit of shadow-map UV.
vec2 cityPlaneSlope(vec3 surfaceNormal) {
    float lightFacing = dot(surfaceNormal, lightDirection);
    lightFacing = (lightFacing < 0.0 ? -1.0 : 1.0) * max(abs(lightFacing), 1e-7);
    return shadowPlaneScale * vec2(dot(surfaceNormal, lightRight), dot(surfaceNormal, lightUp)) /
           lightFacing;
}

float cityShadowVisibility(vec4 lightClipPosition, vec3 surfaceNormal) {
    // Opaque back-facing surfaces receive no direct sun. This is visibility, not
    // the artistic form-tone term; raw mode must not paint these faces white.
    float lightFacing = dot(surfaceNormal, lightDirection);
    if (lightFacing <= 0.0) {
        return 0.0;
    }
    vec3 shadowCoordinate = lightClipPosition.xyz / lightClipPosition.w * 0.5 + 0.5;
    if (any(lessThan(shadowCoordinate, vec3(0))) || any(greaterThan(shadowCoordinate, vec3(1)))) {
        return 1.0;
    }
    // Exact receiver plane in light space. Its slope is independent of the camera,
    // and is not arbitrarily clamped at grazing incidence.
    vec2 receiverSlope = cityPlaneSlope(surfaceNormal);
    ivec2 shadowSize = textureSize(shadowMap, 0);
    ivec2 baseTexel = ivec2(floor(shadowCoordinate.xy * vec2(shadowSize)));
    // Comparison tolerance includes a depth-precision floor and a fraction of one
    // world-space shadow texel. It is independent of camera distance/resolution.
    float depthBias = 2.0 / 65535.0 + 0.125 * shadowPlaneScale / float(shadowSize.x);

    // Separable quadratic B-spline weights across a 3x3 texel neighborhood.
    // Compute each comparison at its texel center to avoid receiver-plane acne.
    vec2 texelOffset = fract(shadowCoordinate.xy * vec2(shadowSize)) - 0.5;
    vec3 weightsX = vec3(0.5 * (0.5 - texelOffset.x) * (0.5 - texelOffset.x),
                         0.75 - texelOffset.x * texelOffset.x,
                         0.5 * (0.5 + texelOffset.x) * (0.5 + texelOffset.x));
    vec3 weightsY = vec3(0.5 * (0.5 - texelOffset.y) * (0.5 - texelOffset.y),
                         0.75 - texelOffset.y * texelOffset.y,
                         0.5 * (0.5 + texelOffset.y) * (0.5 + texelOffset.y));

    float occlusion = 0.0;
    for (int tapX = -1; tapX <= 1; tapX++) {
        for (int tapY = -1; tapY <= 1; tapY++) {
            ivec2 tapTexel = baseTexel + ivec2(tapX, tapY);
            // Border taps are clear. Clamping would stretch an edge occluder outward.
            if (any(lessThan(tapTexel, ivec2(0))) || any(greaterThanEqual(tapTexel, shadowSize))) {
                continue;
            }
            vec2 tapUV = (vec2(tapTexel) + 0.5) / vec2(shadowSize);
            // NEAREST samples this texel CENTER, not the unquantized requested UV.
            float receiverDepth =
                shadowCoordinate.z + dot(receiverSlope, tapUV - shadowCoordinate.xy);
            // At grazing incidence a neighboring receiver-plane point can leave the
            // light's depth volume even when the center pixel is inside it. Such a tap
            // has no valid shadow information; comparing it with clear depth creates a
            // false half-shadow and map-border patterns.
            if (receiverDepth < 0.0 || receiverDepth > 1.0) {
                continue;
            }
            // Compare in the depth texture unit; do not fetch/round depth into color math.
            float visibility = textureLod(shadowMap, vec3(tapUV, receiverDepth - depthBias), 0.0);
            occlusion += (1.0 - visibility) * weightsX[tapX + 1] * weightsY[tapY + 1];
        }
    }
    // Summing occlusion preserves EXACTLY zero shadow on an unoccluded plane.
    return 1.0 - (occlusion > 0.999999 ? 1.0 : clamp(occlusion, 0.0, 1.0));
}

// Indirect illumination keeps ordinary turning faces lighter than cast shadows.
// This controls ink demand, not stroke placement or the paper/graphite colors.
float cityPencilTone(vec3 surfaceNormal, float sunVisibility, float material) {
    float formShadow = 1.0 - smoothstep(-0.25, 0.48, dot(surfaceNormal, lightDirection));
    // Keep unlit form shading separate from additional cast-shadow ink. Direct
    // visibility is zero on reverse faces, but they need not become black pencil.
    float castShadow =
        (1.0 - sunVisibility) * smoothstep(0.01, 0.03, dot(surfaceNormal, lightDirection));
    // Material categories: 0/1 = walls and roofs, 2 = dark facade details,
    // 3/4 = ground, paving and roads. Constants below are the existing art direction.
    if (material > 2.5) {
        return 0.87 * castShadow;
    }
    if (material > 1.5) {
        return 0.70 + 0.22 * max(formShadow, castShadow);
    }
    return max(0.38 * pow(formShadow, 1.12), 0.86 * pow(castShadow, 1.12));
}
