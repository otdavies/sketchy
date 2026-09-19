#version 300 es
precision highp float;
in vec3 worldNormal;
flat in float materialId;
layout(location = 1) out vec4 meta;
void main() {
    meta = vec4(worldNormal * 0.5 + 0.5, materialId * 0.25);
}
