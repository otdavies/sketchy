#version 300 es
precision highp float;
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in float material;
uniform mat4 lightProjection;
#include "CityTraffic.glsl"
void main() {
    vec3 worldPosition = position;
    vec3 worldNormal = normal;
    float materialId = material;
    vehicle(worldPosition, worldNormal, materialId);
    gl_Position = lightProjection * vec4(worldPosition, 1);
}
