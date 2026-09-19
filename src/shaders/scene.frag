#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 resolution;
uniform float zoomStops;
uniform float lightAngle;
uniform float spacing;
uniform float frameSeed;
uniform vec2 orbit;
uniform vec2 heldOrbit;
uniform float heldZoom;
uniform float heldLight;
uniform vec2 pan;
uniform int scene;
uniform int method;
uniform bool flow;
uniform vec3 paper;
uniform vec3 pen;

// Shared pencil and engraving kernels, inserted by the build.
// CORE_INSERT

vec3 targetAtZoom(float zoom) {
    return mix(vec3(-0.12, -0.12, 0.0), vec3(0.5, -0.46, 0.1), smoothstep(0.0, 1.5, zoom));
}
// Signed-distance scene query: x = nearest distance, y = material category.
vec2 mapScene(vec3 position) {
    vec2 nearestSurface = vec2(length(position - vec3(0.35, 0.04, 0.0)) - 0.86, 1.0);
    vec3 ringPosition = position - vec3(-0.99, -0.43, 0.27);
    ringPosition.xy = mat2(0.92, 0.39, -0.39, 0.92) * ringPosition.xy;
    float ringDistance = length(vec2(length(ringPosition.xy) - 0.40, ringPosition.z)) - 0.16;
    if (ringDistance < nearestSurface.x) {
        nearestSurface = vec2(ringDistance, 2.0);
    }
    vec2 pedestalSection =
        abs(vec2(length((position - vec3(0.35, 0, 0)).xz), position.y + 0.92)) - vec2(0.67, 0.10);
    float pedestalDistance =
        min(max(pedestalSection.x, pedestalSection.y), 0.0) + length(max(pedestalSection, 0.0));
    if (pedestalDistance < nearestSurface.x) {
        nearestSurface = vec2(pedestalDistance, 3.0);
    }
    float floorDistance = position.y + 1.02;
    if (floorDistance < nearestSurface.x) {
        nearestSurface = vec2(floorDistance, 4.0);
    }
    return nearestSurface;
}

vec3 normalAt(vec3 position) {
    vec2 sampleOffset = vec2(0.001, 0.0);
    return normalize(
        vec3(mapScene(position + sampleOffset.xyy).x - mapScene(position - sampleOffset.xyy).x,
             mapScene(position + sampleOffset.yxy).x - mapScene(position - sampleOffset.yxy).x,
             mapScene(position + sampleOffset.yyx).x - mapScene(position - sampleOffset.yyx).x));
}
// Soft visibility estimate for the sculpture; the city uses a shadow map.
float shadowAt(vec3 position, vec3 lightDirection) {
    float rayDistance = 0.015;
    float visibility = 1.0;
    for (int stepIndex = 0; stepIndex < 32; stepIndex++) {
        float surfaceDistance = mapScene(position + lightDirection * rayDistance).x;
        visibility = min(visibility, 14.0 * surfaceDistance / rayDistance);
        rayDistance += clamp(surfaceDistance, 0.012, 0.25);
        if (surfaceDistance < 0.001 || rayDistance > 5.0) {
            break;
        }
    }
    return clamp(visibility, 0.0, 1.0);
}

float comparisonFamily(float phase, float ink, vec2 phaseGradient, vec2 scaleGradient) {
    float phasePerPixel = max(length(scaleGradient), 1e-10);
    if (method == 2) {
        return fhStripe(phase * 32.0, ink, (abs(phaseGradient.x) + abs(phaseGradient.y)) * 32.0);
    }
    return fhFamilyState(phase, phaseGradient, scaleGradient, ink, spacing);
}

float renderHatch(vec2 phases, float ink, vec2 stateFirst, vec2 stateSecond) {
    vec2 phaseDx = dFdx(phases);
    vec2 phaseDy = dFdy(phases);
    float primaryCoverage = min(ink, 0.46);
    float crossCoverage = (ink - primaryCoverage) / (1.0 - primaryCoverage);
    float primaryInk =
        comparisonFamily(phases.x, primaryCoverage, vec2(phaseDx.x, phaseDy.x), stateFirst);
    float crossInk =
        comparisonFamily(phases.y, crossCoverage, vec2(phaseDx.y, phaseDy.y), stateSecond);
    return primaryInk + crossInk - primaryInk * crossInk;
}
// Phase gradient in the HELD camera's pixel coordinates at this surface point.
// Its local tangent-plane Jacobian is independent of current camera motion.
vec2 heldGradient(vec3 position, vec3 surfaceNormal, vec3 phaseGradient) {
    vec3 target = targetAtZoom(heldZoom);
    vec3 cameraOrigin = target + 5.0 * vec3(sin(heldOrbit.x) * cos(heldOrbit.y), sin(heldOrbit.y),
                                            cos(heldOrbit.x) * cos(heldOrbit.y));
    vec3 cameraForward = normalize(target - cameraOrigin);
    vec3 cameraRight = normalize(cross(cameraForward, vec3(0, 1, 0)));
    vec3 cameraUp = cross(cameraRight, cameraForward);
    vec3 cameraToPoint = position - cameraOrigin;
    float viewDepth = max(dot(cameraToPoint, cameraForward), 0.001);
    float pixelsPerUnit = resolution.y * 1.75 * exp2(heldZoom) / viewDepth;
    vec3 screenGradientX =
        pixelsPerUnit * (cameraRight - cameraForward * dot(cameraToPoint, cameraRight) / viewDepth);
    vec3 screenGradientY =
        pixelsPerUnit * (cameraUp - cameraForward * dot(cameraToPoint, cameraUp) / viewDepth);
    float determinant = dot(screenGradientX, cross(screenGradientY, surfaceNormal));
    determinant = (determinant < 0.0 ? -1.0 : 1.0) * max(abs(determinant), 0.00001);
    return vec2(dot(phaseGradient, cross(screenGradientY, surfaceNormal)),
                dot(phaseGradient, cross(surfaceNormal, screenGradientX))) /
           determinant;
}

void main() {
    vec2 screenPosition = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float coverage = 0.0;
    // Flat chart and tone ramp.
    if (scene > 0) {
        vec2 surfacePosition = screenPosition * 4.0 / exp2(zoomStops) + pan;
        vec2 phases = vec2(surfacePosition.x + surfacePosition.y * 0.58,
                           -surfacePosition.x * 0.36 + surfacePosition.y);
        vec2 firstPhaseGradient = vec2(1.0, 0.58);
        vec2 secondPhaseGradient = vec2(-0.36, 1.0);
        if (flow) {
            phases += 0.035 * vec2(sin(4.0 * surfacePosition.y) + sin(2.3 * surfacePosition.x),
                                   sin(3.1 * surfacePosition.x));
        }
        if (flow) {
            firstPhaseGradient += 0.035 * vec2(2.3 * cos(2.3 * surfacePosition.x),
                                               4.0 * cos(4.0 * surfacePosition.y));
            secondPhaseGradient.x += 0.035 * 3.1 * cos(3.1 * surfacePosition.x);
        }
        float tone = scene == 2 ? clamp(gl_FragCoord.x / resolution.x, 0.0, 1.0)
                                : clamp(heldLight, 0.0, 1.0);
        float heldStep = 4.0 / (resolution.y * exp2(heldZoom));
        coverage = method == 0 ? pnPencil(vec3(surfacePosition, 0), vec3(0, 0, 1),
                                          vec3(dFdx(surfacePosition), 0),
                                          vec3(dFdy(surfacePosition), 0), tone, frameSeed)
                               : renderHatch(phases, tone, firstPhaseGradient * heldStep,
                                             secondPhaseGradient * heldStep);
    } else {
        // Raymarch the sculpture, then evaluate its surface-attached hatching.
        float yaw = orbit.x;
        float pitch = orbit.y;
        vec3 target = targetAtZoom(zoomStops);
        vec3 cameraOrigin =
            target + 5.0 * vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch));
        vec3 forward = normalize(target - cameraOrigin);
        vec3 right = normalize(cross(forward, vec3(0, 1, 0)));
        vec3 up = cross(right, forward);
        vec3 rayDirection = normalize(
            forward * 1.75 + (screenPosition.x * right + screenPosition.y * up) / exp2(zoomStops));
        float rayDistance = 0.0;
        float materialId = 0.0;
        for (int stepIndex = 0; stepIndex < 80; stepIndex++) {
            vec2 sceneDistance = mapScene(cameraOrigin + rayDirection * rayDistance);
            materialId = sceneDistance.y;
            if (sceneDistance.x < 0.0006 || rayDistance > 20.0) {
                break;
            }
            rayDistance += sceneDistance.x * 0.85;
        }
        bool hit = rayDistance < 20.0;
        vec3 surfacePosition = cameraOrigin + rayDirection * min(rayDistance, 20.0);
        vec3 surfaceNormal = normalAt(surfacePosition);
        float lightRadians = heldLight * 6.283185;
        vec3 lightDirection =
            normalize(vec3(cos(lightRadians) * 0.8, 0.85, sin(lightRadians) * 0.8));
        float visibility = shadowAt(surfacePosition + surfaceNormal * 0.004, lightDirection);
        float formShadow = 1.0 - smoothstep(-0.25, 0.48, dot(surfaceNormal, lightDirection));
        float shadow = max(formShadow, 1.0 - visibility);
        float tone = 0.95 * pow(shadow, 1.12);
        if (materialId > 3.5) {
            tone = 0.93 * (1.0 - visibility) *
                   (1.0 - smoothstep(2.0, 4.0, length(surfacePosition.xz)));
        }
        vec2 phases = vec2(dot(surfacePosition, vec3(0.75, 1.0, 0.25)),
                           dot(surfacePosition, vec3(-0.65, 0.65, 0.80)));
        vec3 firstPhaseGradient = vec3(0.75, 1.0, 0.25);
        vec3 secondPhaseGradient = vec3(-0.65, 0.65, 0.80);
        if (materialId > 3.5) {
            phases = vec2(surfacePosition.x + surfacePosition.z * 0.50,
                          surfacePosition.z - surfacePosition.x * 0.45);
            firstPhaseGradient = vec3(1, 0, 0.50);
            secondPhaseGradient = vec3(-0.45, 0, 1);
        }
        if (flow) {
            phases += 0.055 * vec2(sin(surfacePosition.y * 5.0 + surfacePosition.z * 2.0),
                                   sin(surfacePosition.x * 4.0 - surfacePosition.z * 2.0));
            firstPhaseGradient +=
                0.055 * cos(surfacePosition.y * 5.0 + surfacePosition.z * 2.0) * vec3(0, 5, 2);
            secondPhaseGradient +=
                0.055 * cos(surfacePosition.x * 4.0 - surfacePosition.z * 2.0) * vec3(4, 0, -2);
        }
        // Derivatives occur for every invocation in this uniform scene branch.
        coverage =
            method == 0
                ? pnPencil(surfacePosition, surfaceNormal, dFdx(surfacePosition),
                           dFdy(surfacePosition), tone, frameSeed)
                : renderHatch(phases, tone,
                              heldGradient(surfacePosition, surfaceNormal, firstPhaseGradient),
                              heldGradient(surfacePosition, surfaceNormal, secondPhaseGradient));
        float viewFacing = abs(dot(surfaceNormal, -rayDirection));
        float silhouetteInk = 1.0 - smoothstep(0.035, 0.095, viewFacing);
        if (materialId < 3.5) {
            coverage = max(coverage, silhouetteInk * 0.83 * pow(tone, 0.45) *
                                         (0.45 + 0.55 * pnNoise(surfacePosition.xy * 29.0)));
        }
        if (!hit) {
            coverage = 0.0;
        }
        if (materialId > 3.5) {
            coverage *= 1.0 - smoothstep(7.0, 15.0, length(surfacePosition.xz));
        }
    }

    // Apply the same paper contact and grain to every study.
    float paperTooth = pnHash(floor(gl_FragCoord.xy));
    float paperFibre = pnNoise(gl_FragCoord.xy * vec2(0.13, 0.87));
    float paperContact = clamp(0.80 + 0.27 * paperTooth + 0.13 * paperFibre, 0.0, 1.0);
    coverage *= mix(paperContact, 1.0, pow(coverage, 3.0));
    vec3 paperGrain = paper * (0.978 + 0.022 * paperTooth);
    outColor = vec4(mix(paperGrain, pen, coverage), 1.0);
}
