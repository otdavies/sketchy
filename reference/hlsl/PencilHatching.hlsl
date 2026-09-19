// Optional compile-time chart support; default retains the general shader.
#ifndef PN_CHART_MASK
#define PN_CHART_MASK 7
#endif
#ifndef PENCIL_HATCHING_INCLUDED
#define PENCIL_HATCHING_INCLUDED
// Nested pencil marks, 2026. MIT. See RESEARCH.md for provenance and limits.
// Parent/child centers retain the dyadic ancestry of the original experiment.

float pnHash(float2 p) {
    float3 q=frac(float3(p.xyx)*float3(0.1031,0.1030,0.0973));
    q+=dot(q,q.yzx+33.33);
    return frac((q.x+q.y)*q.z);
}
float pnNoise(float2 p) {
    float2 i=floor(p),f=frac(p);f=f*f*(3.0-2.0*f);
    return lerp(lerp(pnHash(i),pnHash(i+float2(1,0)),f.x),
               lerp(pnHash(i+float2(0,1)),pnHash(i+float2(1,1)),f.x),f.y);
}

// Reducing the dyadic fraction (index / 2^level) gives a persistent line ID.
// Five bit tests find trailing zero count, including negative indices.
float2 pnLineKey(float index,float level) {
    int j=int(abs(index));
    if(j==0)return float2(0,-12);
    int count=0;
    if((j&65535)==0){j>>=16;count+=16;}
    if((j&255)==0){j>>=8;count+=8;}
    if((j&15)==0){j>>=4;count+=4;}
    if((j&3)==0){j>>=2;count+=2;}
    if((j&1)==0){j>>=1;count+=1;}
    return float2(float(j)*sign(index),level-float(count));
}

// A finite pressure stroke attached to one persistent centerline. The length
// and gap structure depend on its BIRTH level, never its current octave label.
float pnStroke(float across,float along,float level,float index,float width,
               float activation,float acrossRate,float alongRate,float frameSeed,float familySeed) {
    float frequency=exp2(level);
    float2 key=pnLineKey(index,level)+float2(familySeed*17.0,0);
    float r=pnHash(key+1.13), r2=pnHash(key+31.77);
    float birthFrequency=exp2(key.y);
    float segmentRate=birthFrequency/(4.5+6.0*r);
    float t=along*segmentRate+r2*19.0;
    float cell=floor(t), f=frac(t);
    float segment=pnHash(key+float2(cell,13.71));
    float birthRank=0.0001+0.9998*pnHash(key+float2(cell+31.0,73.9));
    float exists=step(birthRank,activation);
    // Rejected children contribute exactly zero; no pressure/noise work needed.
    if(exists==0.0)return 0.0;
    float fwidthT=max(alongRate*segmentRate,0.001);
    float tip=min(f,1.0-f);
    float mask=smoothstep(0.045,0.14+0.12*segment,tip);
    // If the segment is subpixel, use its approximate mean instead of flicker.
    mask=lerp(mask,0.73,smoothstep(0.25,0.8,fwidthT));
    float pressure=(0.62+0.50*r)*(0.72+0.28*sin(3.141593*f));
    float jitter=pnHash(key+float2(frameSeed*0.719,91.0))-0.5;
    float wobble=sin(t*6.283185+r*6.0)+0.4*sin(t*17.0+r2*9.0);
    // Small screen-space displacement, seeded by persistent line identity.
    // It is unchanged by parent/child relabeling at the same viewing scale.
    float offset=(0.35*wobble+0.75*jitter)*acrossRate*frequency;
    float distance=across*frequency-index+offset;
    float actualWidth=width*pressure*(0.76+0.24*mask);
    float footprint=max(acrossRate*frequency,0.00001);
    float core=clamp((actualWidth*0.5-abs(distance))/footprint+0.5,0.0,1.0);
    if(core==0.0)return 0.0;
    float newPressure=0.78+0.44*pnHash(key+float2(frameSeed*0.33,cell+101.0));
    return core*mask*newPressure*exists;
}

float pnFamily(float2 uv,float2 dx,float2 dy,float angle,float gap,float seed,float frameSeed) {
    float2 a=float2(cos(angle),sin(angle)),b=float2(-a.y,a.x);
    float across=dot(uv,a)+seed*0.173;
    float along=dot(uv,b);
    float acrossRate=max(length(float2(dot(dx,a),dot(dy,a))),1e-9);
    float alongRate=max(length(float2(dot(dx,b),dot(dy,b))),1e-9);
    float lod=clamp(-log2(gap*acrossRate),-16.0,16.0);
    float level=floor(lod), sub=exp2(frac(lod)), birth=sub-1.0;
    float u=across*exp2(level);
    float parentIndex=floor(u+0.5), childIndex=2.0*floor(u)+1.0;
    float parent=pnStroke(across,along,level,parentIndex,0.21/sub,1.0,
                          acrossRate,alongRate,frameSeed,seed);
    float child=pnStroke(across,along,level+1.0,childIndex,0.42/sub,birth,
                         acrossRate,alongRate,frameSeed,seed);
    return min(1.0,parent+child);
}

float pnChart(float2 uv,float2 dx,float2 dy,float tone,float chartSeed,float frameSeed) {
    // A view-independent, smooth chart deformation: no latitude/longitude pole.
    float2 q=uv+0.024*float2(sin(uv.y*4.1+chartSeed),sin(uv.x*3.3-chartSeed));
    float2 warpX=float2(1.0,0.0792*cos(uv.x*3.3-chartSeed));
    float2 warpY=float2(0.0984*cos(uv.y*4.1+chartSeed),1.0);
    float2 gx=warpX*dx.x+warpY*dx.y, gy=warpX*dy.x+warpY*dy.y;
    float first=pnFamily(q,gx,gy,-0.64,3.8,chartSeed+1.0,frameSeed);
    float crossAmount=smoothstep(0.18,0.68,tone);
    float second=0.0;
    if(crossAmount>0.0)second=pnFamily(q,gx,gy,0.26,3.15,chartSeed+4.0,frameSeed);
    float third=pnFamily(q,gx,gy,-0.83,2.5,chartSeed+9.0,frameSeed);
    float broad=0.83+0.25*pnNoise(q*18.0+chartSeed);
    return 0.25*broad + 2.9*first + 2.5*second*crossAmount + 1.3*third;
}

// A partition of unity over three well-conditioned planar charts. Pole-prone
// charts lose support before their projected coordinate system collapses.
float pnPencil(float3 p,float3 normal,float3 dpdx,float3 dpdy,float tone,float frameSeed) {
    // Derivatives are supplied by the caller before this branch.
    // Lit paper and zero-weight charts have analytically zero contributions.
    if(tone<=0.0)return 0.0;
    float deposit=0.0;
    float3 weights=pow(max(abs(normal)-float3(0.22,0.22,0.22),float3(0,0,0)),float3(4,4,4));
    weights/=max(dot(weights,float3(1,1,1)),1e-6);
#if (PN_CHART_MASK & 1)
    if(weights.x>0.0)deposit+=weights.x*pnChart(p.yz,dpdx.yz,dpdy.yz,tone,1.0,frameSeed);
#endif
#if (PN_CHART_MASK & 2)
    if(weights.y>0.0)deposit+=weights.y*pnChart(p.zx,dpdx.zx,dpdy.zx,tone,5.0,frameSeed);
#endif
#if (PN_CHART_MASK & 4)
    if(weights.z>0.0)deposit+=weights.z*pnChart(p.xy,dpdx.xy,dpdy.xy,tone,9.0,frameSeed);
#endif
    float opticalDepth=-log(max(1.0-tone,0.01));
    return 1.0-exp(-opticalDepth*deposit*1.12);
}

#endif
