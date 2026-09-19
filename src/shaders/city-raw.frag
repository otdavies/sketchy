#version 300 es
precision highp float;
in vec3 worldNormal;
flat in float planeDistance;
out vec4 color;
uniform int debugView;
#include "CitySurface.glsl"
#include "CityLighting.glsl"
void main() {
    if (debugView == 2) {
        color = vec4(vec3(max(dot(worldNormal, lightDirection), 0.0)), 1);
        return;
    }
    vec3 positionDx;
    vec3 positionDy;
    vec3 surfacePosition = citySurfacePoint(worldNormal, planeDistance, positionDx, positionDy);
    color = vec4(
        vec3(cityShadowVisibility(lightProjection * vec4(surfacePosition, 1), worldNormal)), 1);
}
