// Fit each occupied edge-seed pixel ONCE. The compose pass only finds the
// nearest fitted descriptor. All distances are in native screen pixels.
vec4 poSeed(ivec2 q){return texelFetch(edgeSeeds,clamp(q,ivec2(0),textureSize(edgeSeeds,0)-1),0);}
vec2 poNormal(vec4 e){float a=(e.b-.5)*3.14159265;return vec2(cos(a),sin(a));}
vec2 poOffset(vec4 e){return (e.rg-.5)*2.;}
#ifdef OUTLINE_FIT_PASS
vec4 poFitAtSeed(ivec2 center){
 vec4 seed=poSeed(center);if(seed.a<.01)return vec4(0.);
 vec2 anchor=poOffset(seed),reference=poNormal(seed);
 float total=0.;vec2 sum=vec2(0.);vec3 moments=vec3(0.);
 for(int y=-3;y<=3;y++)for(int x=-3;x<=3;x++){
  vec4 e=poSeed(center+ivec2(x,y));if(e.a<.01)continue;
  vec2 q=vec2(x,y)+poOffset(e);
  // Angle comparison for unoriented lines avoids sin/cos in the neighborhood.
  float angle=abs(e.b-seed.b);angle=min(angle,1.-angle);
  float agreement=1.-smoothstep(.12,.27,angle);
  float track=1.-smoothstep(.65,1.35,abs(dot(q-anchor,reference)));
  float weight=e.a*agreement*track/(1.+dot(q,q)/12.);
  total+=weight;sum+=q*weight;moments+=vec3(q.x*q.x,q.x*q.y,q.y*q.y)*weight;
 }
 if(total<.01)return seed;
 vec2 mean=sum/total;vec3 cov=moments/total-vec3(mean.x*mean.x,mean.x*mean.y,mean.y*mean.y);
 float theta=.5*atan(2.*cov.y,cov.x-cov.z+1e-8);
 vec2 normal=vec2(-sin(theta),cos(theta));if(dot(normal,reference)<0.)normal=-normal;
 float coherence=length(vec2(cov.x-cov.z,2.*cov.y))/max(cov.x+cov.z,.0001);
 float fit=smoothstep(.5,.88,coherence)*smoothstep(.7,2.,total);
 normal=normalize(mix(reference,normal,fit));mean=mix(anchor,mean,fit);
 // Anchor the descriptor near its originating sample, never extend/bridge gaps.
 vec2 offset=anchor+normal*clamp(dot(mean-anchor,normal),-.45,.45);
 float angle=mod(atan(normal.y,normal.x)+1.570796327,3.141592654)-1.570796327;
 return vec4(.5+offset*.5,angle/3.141592654+.5,seed.a);
}
#else
float poFittedInk(vec2 pixel,float drawing,float jitter,int mode){
 // One coarse alpha tap rejects blank areas. At mip 3, bilinear support
 // extends at least four native pixels, conservatively covering the 5x5 search.
 // Mip alpha is occupancy only; descriptor positions always come from mip 0.
 float occupied=textureLod(edgeSeeds,pixel/resolution,3.).a;
 if(occupied<=0.)return 0.;
 ivec2 center=ivec2(pixel);float closest=1e9;vec2 anchor=vec2(0);vec4 best=vec4(0);
 for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){
  vec4 e=poSeed(center+ivec2(x,y));vec2 q=vec2(x,y)+poOffset(e);float d=dot(q,q);
  if(e.a>.01&&d<closest){closest=d;anchor=q;best=e;}
 }
 if(closest>5.5)return 0.;
 float distance=dot(-anchor,poNormal(best));
 float pressure=1.,shift=0.;
 if(mode==2){
  shift=jitter*(2.*pnNoise(pixel*.035+vec2(drawing*3.17,drawing*.91))-1.);
  pressure=.70+.38*pnNoise(pixel*.12+vec2(drawing*.73,11));
 }
 float coverage=clamp(.64*pressure+.6-abs(distance-shift),0.,1.);
 float tooth=mode==2?.76+.24*pnHash(floor(pixel)):1.;
 return coverage*(mode==2?.83:.84)*tooth*best.a;
}
#endif
