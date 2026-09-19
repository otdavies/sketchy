// Light direction points FROM the surface TOWARD the sun. Camera-independent.
// Geometric face normals are required for receiver-plane filtering.
uniform vec3 lightDirection,lightRight,lightUp;
uniform float shadowPlaneScale;
vec2 cityPlaneSlope(vec3 n){
 float facing=dot(n,lightDirection);
 facing=(facing<0.?-1.:1.)*max(abs(facing),1e-7);
 return shadowPlaneScale*vec2(dot(n,lightRight),dot(n,lightUp))/facing;
}
uniform highp sampler2DShadow shadowMap;
float cityShadowVisibility(vec4 shadowPos,vec3 n){
 // Opaque back-facing surfaces receive no direct sun. This is visibility, not
 // the artistic form-tone term; raw mode must not paint these faces white.
 float facing=dot(n,lightDirection);
 if(facing<=0.)return 0.;
 vec3 s=shadowPos.xyz/shadowPos.w*.5+.5;
 if(any(lessThan(s,vec3(0)))||any(greaterThan(s,vec3(1))))return 1.;
 // Exact receiver plane in light space. Its slope is independent of the camera,
 // and is not arbitrarily clamped at grazing incidence.
 vec2 slope=cityPlaneSlope(n);
 ivec2 size=textureSize(shadowMap,0),base=ivec2(floor(s.xy*vec2(size)));
 // Comparison tolerance includes a depth-precision floor and a fraction of one
 // world-space shadow texel. It is independent of camera distance/resolution.
 float bias=2./65535.+.125*shadowPlaneScale/float(size.x);
 vec2 f=fract(s.xy*vec2(size))-.5;
 vec3 wx=vec3(.5*(.5-f.x)*(.5-f.x),.75-f.x*f.x,.5*(.5+f.x)*(.5+f.x));
 vec3 wy=vec3(.5*(.5-f.y)*(.5-f.y),.75-f.y*f.y,.5*(.5+f.y)*(.5+f.y));
 float blocked=0.;
 for(int ix=-1;ix<=1;ix++)for(int iy=-1;iy<=1;iy++){
  ivec2 cell=base+ivec2(ix,iy);
  // Border taps are clear. Clamping would stretch an edge occluder outward.
  if(any(lessThan(cell,ivec2(0)))||any(greaterThanEqual(cell,size)))continue;
  vec2 center=(vec2(cell)+.5)/vec2(size);
  // NEAREST samples this texel CENTER, not the unquantized requested UV.
  float receiver=s.z+dot(slope,center-s.xy);
  // At grazing incidence a neighboring receiver-plane point can leave the
  // light's depth volume even when the center pixel is inside it. Such a tap
  // has no valid shadow information; comparing it with clear depth creates a
  // false half-shadow and map-border patterns.
  if(receiver<0.||receiver>1.)continue;
  // Compare in the depth texture unit; do not fetch/round depth into color math.
  float clear=textureLod(shadowMap,vec3(center,receiver-bias),0.);
  blocked+=(1.-clear)*wx[ix+1]*wy[iy+1];
 }
 // Summing occlusion preserves EXACTLY zero shadow on an unoccluded plane.
 return 1.-(blocked>0.999999?1.:clamp(blocked,0.,1.));
}
// Indirect illumination keeps ordinary turning faces lighter than cast shadows.
// This controls ink demand, not stroke placement or the paper/graphite colors.
float cityPencilTone(vec3 n,float visible,float material){
 float form=1.-smoothstep(-.25,.48,dot(n,lightDirection));
 // Keep unlit form shading separate from additional cast-shadow ink. Direct
 // visibility is zero on reverse faces, but they need not become black pencil.
 float occlusion=(1.-visible)*smoothstep(.01,.03,dot(n,lightDirection));
 if(material>2.5)return .87*occlusion;
 if(material>1.5)return .70+.22*max(form,occlusion);
 return max(.38*pow(form,1.12),.86*pow(occlusion,1.12));
}
