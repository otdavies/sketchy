#version 300 es
precision highp float;
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in float material;
uniform mat4 viewProjection, lightProjection;
out vec3 worldPosition;
out vec3 worldNormal;
out vec4 lightClipPosition;
flat out float materialId;
flat out float planeDistance;
invariant gl_Position;
#include "CityTraffic.glsl"
// Keep exactly this vertex transform for every camera pass: equal-depth
// testing depends on identical rasterized positions in visibility and shading.
void main() {
    worldPosition = position;
    worldNormal = normal;
    materialId = material;
    vehicle(worldPosition, worldNormal, materialId);
    planeDistance = dot(worldNormal, worldPosition);
    lightClipPosition = lightProjection * vec4(worldPosition, 1);
    gl_Position = viewProjection * vec4(worldPosition, 1);
}
