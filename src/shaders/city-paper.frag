#version 300 es
precision highp float;
in vec3 worldNormal;
flat in float materialId;
uniform float sampleScale;
layout(location = 0) out vec4 color;
layout(location = 1) out vec4 meta;
// PENCIL_CORE_INSERT
void main() {
    float paperTooth = pnHash(floor(gl_FragCoord.xy / sampleScale));
    color = vec4(vec3(0.984, 0.978, 0.958) * (0.978 + 0.022 * paperTooth), 1);
    meta = vec4(worldNormal * 0.5 + 0.5, materialId * 0.25);
}
