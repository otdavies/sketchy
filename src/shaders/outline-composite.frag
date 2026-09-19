#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D sceneTexture,edgeSeeds;
uniform vec2 resolution;
uniform int outlineMode;
uniform float drawing,jitter;
out vec4 color;
// CORE_INSERT
// OUTLINE_CORE_INSERT
void main(){
 vec3 base=texture(sceneTexture,gl_FragCoord.xy/resolution).rgb;
 float ink=outlineMode>0?poFittedInk(gl_FragCoord.xy,drawing,jitter,outlineMode):0.;
 if(outlineMode==3)base=vec3(.984,.978,.958);
 color=vec4(mix(base,vec3(.125,.119,.115),ink),1.);
}
