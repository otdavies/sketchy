#version 300 es
precision highp float;
precision highp sampler2D;
// A depth texture's return precision follows its SAMPLER, not the float default.
// Lower precision here creates false discontinuities across perfectly flat faces.
uniform sampler2D normalsTexture,depthTexture;
uniform vec2 resolution;
uniform vec3 cameraRight,cameraUp,cameraForward;
uniform float worldPerPixel;
uniform int cameraPerspective;
out vec4 edge;
ivec2 bounded(ivec2 q){return clamp(q,ivec2(0),textureSize(depthTexture,0)-1);}
vec4 metadata(ivec2 q){vec4 m=texelFetch(normalsTexture,bounded(q),0);return vec4(m.xyz*2.-1.,m.a*4.);}
float depth(ivec2 q){
 float d=texelFetch(depthTexture,bounded(q),0).r;
 return cameraPerspective==1?(.03*40.)/(40.-d*(40.-.03)):d*39.9+.1;
}
float different(vec4 na,vec4 nb,float za,float zb,ivec2 a,ivec2 b){
 if(za>39.999&&zb>39.999)return 0.;
 if((za>39.999)!=(zb>39.999))return 1.;
 vec2 ds=vec2(bounded(b)-bounded(a))*.5*worldPerPixel;
 float pixelSize=worldPerPixel;
 float depthError=39.9*2./16777215.;
 if(cameraPerspective==1){
  vec2 sa=((vec2(bounded(a))+.5)*.5-resolution*.5)*worldPerPixel;
  vec2 sb=((vec2(bounded(b))+.5)*.5-resolution*.5)*worldPerPixel;
  ds=sb*zb-sa*za;
  pixelSize*=min(za,zb);
  // Nonlinear depth24 error grows with distance. Include the view-ray length.
  depthError=(za*za+zb*zb)*(40.-.03)/(.03*40.*16777215.)
    *(1.+max(length(sa),length(sb)));
 }
 vec3 delta=cameraRight*ds.x+cameraUp*ds.y+cameraForward*(zb-za);
 float residual=max(abs(dot(na.xyz,delta)),abs(dot(nb.xyz,delta)));
 // Conservative bound for RGB8 normal quantization + depth24 rounding.
 // No division by the grazing angle and no global increase in world-space bias.
 float uncertainty=dot(abs(delta),vec3(1./255.))+depthError;
 float normalEdge=step(.18,length(na.xyz-nb.xyz));
 float planeEdge=step(.008+pixelSize*.09+uncertainty,residual);
 float materialEdge=step(.5,abs(na.a-nb.a));
 return max(max(normalEdge,planeEdge),materialEdge);
}
void main(){
 ivec2 base=ivec2(gl_FragCoord.xy)*2;
 // Reuse a 3x3 patch (unused corner omitted): 16 fetches instead of repeatedly fetching each pair,
 // and take orientation from real edge crossings (no extra depth gradients).
 float count=0.;vec2 sum=vec2(0.);vec3 moments=vec3(0.);vec2 crossing=vec2(0.);
 vec4 m00=metadata(base+ivec2(0,0));float z00=depth(base+ivec2(0,0));
 vec4 m10=metadata(base+ivec2(1,0));float z10=depth(base+ivec2(1,0));
 vec4 m20=metadata(base+ivec2(2,0));float z20=depth(base+ivec2(2,0));
 vec4 m01=metadata(base+ivec2(0,1));float z01=depth(base+ivec2(0,1));
 vec4 m11=metadata(base+ivec2(1,1));float z11=depth(base+ivec2(1,1));
 vec4 m21=metadata(base+ivec2(2,1));float z21=depth(base+ivec2(2,1));
 vec4 m02=metadata(base+ivec2(0,2));float z02=depth(base+ivec2(0,2));
 vec4 m12=metadata(base+ivec2(1,2));float z12=depth(base+ivec2(1,2));
 {float e=different(m00,m10,z00,z10,base+ivec2(0,0),base+ivec2(1,0));vec2 q=vec2(0.000,-0.250);sum+=e*q;moments+=e*vec3(q.x*q.x,q.x*q.y,q.y*q.y);count+=e;crossing+=e*vec2(1.,0.);}
 {float e=different(m00,m01,z00,z01,base+ivec2(0,0),base+ivec2(0,1));vec2 q=vec2(-0.250,0.000);sum+=e*q;moments+=e*vec3(q.x*q.x,q.x*q.y,q.y*q.y);count+=e;crossing+=e*vec2(0.,1.);}
 {float e=different(m10,m20,z10,z20,base+ivec2(1,0),base+ivec2(2,0));vec2 q=vec2(0.500,-0.250);sum+=e*q;moments+=e*vec3(q.x*q.x,q.x*q.y,q.y*q.y);count+=e;crossing+=e*vec2(1.,0.);}
 {float e=different(m10,m11,z10,z11,base+ivec2(1,0),base+ivec2(1,1));vec2 q=vec2(0.250,0.000);sum+=e*q;moments+=e*vec3(q.x*q.x,q.x*q.y,q.y*q.y);count+=e;crossing+=e*vec2(0.,1.);}
 {float e=different(m01,m11,z01,z11,base+ivec2(0,1),base+ivec2(1,1));vec2 q=vec2(0.000,0.250);sum+=e*q;moments+=e*vec3(q.x*q.x,q.x*q.y,q.y*q.y);count+=e;crossing+=e*vec2(1.,0.);}
 {float e=different(m01,m02,z01,z02,base+ivec2(0,1),base+ivec2(0,2));vec2 q=vec2(-0.250,0.500);sum+=e*q;moments+=e*vec3(q.x*q.x,q.x*q.y,q.y*q.y);count+=e;crossing+=e*vec2(0.,1.);}
 {float e=different(m11,m21,z11,z21,base+ivec2(1,1),base+ivec2(2,1));vec2 q=vec2(0.500,0.250);sum+=e*q;moments+=e*vec3(q.x*q.x,q.x*q.y,q.y*q.y);count+=e;crossing+=e*vec2(1.,0.);}
 {float e=different(m11,m12,z11,z12,base+ivec2(1,1),base+ivec2(1,2));vec2 q=vec2(0.250,0.500);sum+=e*q;moments+=e*vec3(q.x*q.x,q.x*q.y,q.y*q.y);count+=e;crossing+=e*vec2(0.,1.);}
 if(count<.5){edge=vec4(0);return;}
 vec2 offset=sum/count;
 vec3 cov=moments/count-vec3(offset.x*offset.x,offset.x*offset.y,offset.y*offset.y);
 // Multiple subpixel crossings yield a normal from their positional covariance.
 // A lone crossing keeps its x/y finite-difference direction until the local fit.
 float angle=count>1.5?.5*atan(2.*cov.y,cov.x-cov.z+1e-8)+1.570796327:atan(crossing.y,crossing.x);
 angle=mod(angle+1.570796327,3.141592654)-1.570796327;
 edge=vec4(.5+offset*.5,angle/3.141592654+.5,min(1.,count*.5));
}
