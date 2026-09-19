#ifndef SCREEN_SPACE_PENCIL_OUTLINE_INCLUDED
#define SCREEN_SPACE_PENCIL_OUTLINE_INCLUDED
// Engine-independent translation; not compiled in Unity. Bind edgeSeeds,
// edgeLinearSampler (bilinear + nearest mip), resolution; include PencilHatching.
// Compile once with OUTLINE_FIT_PASS to produce descriptors. Generate mips.
// Compile without the define to composite descriptors in pixel space.
float poMod(float a,float b){return a-b*floor(a/b);}
// Fit each occupied edge-seed pixel ONCE. The compose pass only finds the
// nearest fitted descriptor. All distances are in native screen pixels.
float4 poSeed(int2 q){uint w,h;edgeSeeds.GetDimensions(w,h);return edgeSeeds.Load(int3(clamp(q,int2(0,0),int2(w,h)-1),0));}
float2 poNormal(float4 e){float a=(e.b-.5)*3.14159265;return float2(cos(a),sin(a));}
float2 poOffset(float4 e){return (e.rg-.5)*2.;}
#ifdef OUTLINE_FIT_PASS
float4 poFitAtSeed(int2 center){
 float4 seed=poSeed(center);if(seed.a<.01)return float4(0,0,0,0);
 float2 anchor=poOffset(seed),reference=poNormal(seed);
 float total=0.;float2 sum=float2(0,0);float3 moments=float3(0,0,0);
 for(int y=-3;y<=3;y++)for(int x=-3;x<=3;x++){
  float4 e=poSeed(center+int2(x,y));if(e.a<.01)continue;
  float2 q=float2(x,y)+poOffset(e);
  // Angle comparison for unoriented lines avoids sin/cos in the neighborhood.
  float angle=abs(e.b-seed.b);angle=min(angle,1.-angle);
  float agreement=1.-smoothstep(.12,.27,angle);
  float track=1.-smoothstep(.65,1.35,abs(dot(q-anchor,reference)));
  float weight=e.a*agreement*track/(1.+dot(q,q)/12.);
  total+=weight;sum+=q*weight;moments+=float3(q.x*q.x,q.x*q.y,q.y*q.y)*weight;
 }
 if(total<.01)return seed;
 float2 mean=sum/total;float3 cov=moments/total-float3(mean.x*mean.x,mean.x*mean.y,mean.y*mean.y);
 float theta=.5*atan2(2.*cov.y,cov.x-cov.z+1e-8);
 float2 normal=float2(-sin(theta),cos(theta));if(dot(normal,reference)<0.)normal=-normal;
 float coherence=length(float2(cov.x-cov.z,2.*cov.y))/max(cov.x+cov.z,.0001);
 float fit=smoothstep(.5,.88,coherence)*smoothstep(.7,2.,total);
 normal=normalize(lerp(reference,normal,fit));mean=lerp(anchor,mean,fit);
 // Anchor the descriptor near its originating sample, never extend/bridge gaps.
 float2 offset=anchor+normal*clamp(dot(mean-anchor,normal),-.45,.45);
 float angle=poMod(atan2(normal.y,normal.x)+1.570796327,3.141592654)-1.570796327;
 return float4(.5+offset*.5,angle/3.141592654+.5,seed.a);
}
#else
float poFittedInk(float2 pixel,float drawing,float jitter,int mode){
 // Mip alpha is conservative occupancy; positions are always from mip 0.
 float occupied=edgeSeeds.SampleLevel(edgeLinearSampler,pixel/resolution,3.).a;
 if(occupied<=0.)return 0.;
 int2 center=int2(pixel);float closest=1e9;float2 anchor=float2(0,0);float4 best=float4(0,0,0,0);
 for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){
  float4 e=poSeed(center+int2(x,y));float2 q=float2(x,y)+poOffset(e);float d=dot(q,q);
  if(e.a>.01&&d<closest){closest=d;anchor=q;best=e;}
 }
 if(closest>5.5)return 0.;
 float distance=dot(-anchor,poNormal(best));
 float pressure=1.,shift=0.;
 if(mode==2){
  shift=jitter*(2.*pnNoise(pixel*.035+float2(drawing*3.17,drawing*.91))-1.);
  pressure=.70+.38*pnNoise(pixel*.12+float2(drawing*.73,11));
 }
 float coverage=clamp(.64*pressure+.6-abs(distance-shift),0.,1.);
 float tooth=mode==2?.76+.24*pnHash(floor(pixel)):1.;
 return coverage*(mode==2?.83:.84)*tooth*best.a;
}
#endif

#endif
