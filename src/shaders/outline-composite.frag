#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D sceneTexture;
uniform sampler2D edgeSeeds;
uniform vec2 resolution;
uniform int outlineMode;
uniform float drawing;
uniform float jitter;
out vec4 color;
// CORE_INSERT
// OUTLINE_CORE_INSERT
#ifdef OUTLINE_FIT_PASS
// Write one fitted descriptor per occupied pixel before generating its mipmaps.
void main() {
    color = poFitAtSeed(ivec2(gl_FragCoord.xy));
}
#else
void main() {
    vec3 sceneColor = texture(sceneTexture, gl_FragCoord.xy / resolution).rgb;
    float outlineInk =
        outlineMode > 0 ? poFittedInk(gl_FragCoord.xy, drawing, jitter, outlineMode) : 0.0;
    if (outlineMode == 3) {
        sceneColor = vec3(0.984, 0.978, 0.958);
    }
    color = vec4(mix(sceneColor, vec3(0.125, 0.119, 0.115), outlineInk), 1.0);
}
#endif
