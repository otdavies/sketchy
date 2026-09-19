#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 resolution;
uniform float zoomStops;
uniform float lightAngle;
uniform float spacing;
uniform float frameSeed;
uniform vec2 orbit;
uniform vec2 heldOrbit;
uniform float heldZoom;
uniform float heldLight;
uniform vec2 pan;
uniform int scene;
uniform int method;
uniform bool flow;
uniform vec3 paper;
uniform vec3 pen;

// The build step inserts FractalHatching.glsl here.
// CORE_INSERT

vec3 targetAtZoom(float z) {
    return mix(vec3(-0.12,-0.12,0.0),vec3(0.5,-0.46,0.1),smoothstep(0.0,1.5,z));
}
vec2 mapScene(vec3 p) {
    vec2 d = vec2(length(p - vec3(0.35, 0.04, 0.0)) - 0.86, 1.0);
    vec3 q = p - vec3(-0.99, -0.43, 0.27);
    q.xy = mat2(0.92, 0.39, -0.39, 0.92) * q.xy;
    float ring = length(vec2(length(q.xy) - 0.40, q.z)) - 0.16;
    if (ring < d.x) d = vec2(ring, 2.0);
    vec2 c = abs(vec2(length((p - vec3(0.35,0,0)).xz), p.y + 0.92)) - vec2(0.67, 0.10);
    float base = min(max(c.x,c.y),0.0) + length(max(c,0.0));
    if (base < d.x) d = vec2(base, 3.0);
    float floorDist = p.y + 1.02;
    if (floorDist < d.x) d = vec2(floorDist, 4.0);
    return d;
}
vec3 normalAt(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(mapScene(p+e.xyy).x-mapScene(p-e.xyy).x,
                          mapScene(p+e.yxy).x-mapScene(p-e.yxy).x,
                          mapScene(p+e.yyx).x-mapScene(p-e.yyx).x));
}
float shadowAt(vec3 p, vec3 l) {
    float t = 0.015, visibility = 1.0;
    for (int i=0; i<32; i++) {
        float h = mapScene(p+l*t).x;
        visibility = min(visibility, 14.0*h/t);
        t += clamp(h,0.012,0.25);
        if (h < 0.001 || t > 5.0) break;
    }
    return clamp(visibility,0.0,1.0);
}
float comparisonFamily(float phase, float ink, vec2 grad, vec2 stateGrad) {
    float g = max(length(stateGrad),1e-10);
    if (method == 2) {
        return fhStripe(phase*32.0,ink,(abs(grad.x)+abs(grad.y))*32.0);
    }
    return fhFamilyState(phase,grad,stateGrad,ink,spacing);
}
float renderHatch(vec2 phases, float ink, vec2 stateFirst, vec2 stateSecond) {
    vec2 dx = dFdx(phases), dy = dFdy(phases);
    float a = min(ink,0.46), b = (ink-a)/(1.0-a);
    float first = comparisonFamily(phases.x,a,vec2(dx.x,dy.x),stateFirst);
    float second = comparisonFamily(phases.y,b,vec2(dx.y,dy.y),stateSecond);
    return first + second - first*second;
}
// Phase gradient in the HELD camera's pixel coordinates at this surface point.
// Its local tangent-plane Jacobian is independent of current camera motion.
vec2 heldGradient(vec3 p, vec3 n, vec3 phaseGradient) {
    vec3 target = targetAtZoom(heldZoom);
    vec3 ro = target + 5.0*vec3(sin(heldOrbit.x)*cos(heldOrbit.y),sin(heldOrbit.y),cos(heldOrbit.x)*cos(heldOrbit.y));
    vec3 f = normalize(target-ro);
    vec3 r = normalize(cross(f,vec3(0,1,0)));
    vec3 u = cross(r,f);
    vec3 v = p-ro;
    float z = max(dot(v,f),0.001);
    float scale = resolution.y*1.75*exp2(heldZoom)/z;
    vec3 a = scale*(r-f*dot(v,r)/z);
    vec3 b = scale*(u-f*dot(v,u)/z);
    float det = dot(a,cross(b,n));
    det = (det<0.0?-1.0:1.0)*max(abs(det),0.00001);
    return vec2(dot(phaseGradient,cross(b,n)),dot(phaseGradient,cross(n,a)))/det;
}
void main() {
    vec2 st = (gl_FragCoord.xy-0.5*resolution)/resolution.y;
    float coverage = 0.0;
    if (scene > 0) {
        vec2 p = st*4.0/exp2(zoomStops)+pan;
        vec2 phases = vec2(p.x+p.y*0.58, -p.x*0.36+p.y);
        vec2 grad1=vec2(1.0,0.58), grad2=vec2(-0.36,1.0);
        if (flow) phases += 0.035*vec2(sin(4.0*p.y)+sin(2.3*p.x),sin(3.1*p.x));
        if (flow) {grad1+=0.035*vec2(2.3*cos(2.3*p.x),4.0*cos(4.0*p.y));grad2.x+=0.035*3.1*cos(3.1*p.x);}
        float tone = scene==2 ? clamp(gl_FragCoord.x/resolution.x,0.0,1.0)
                             : clamp(heldLight,0.0,1.0);
        float heldStep=4.0/(resolution.y*exp2(heldZoom));
        coverage = method==0 ? pnPencil(vec3(p,0),vec3(0,0,1),vec3(dFdx(p),0),vec3(dFdy(p),0),tone,frameSeed) : renderHatch(phases,tone,grad1*heldStep,grad2*heldStep);
    } else {
        float yaw = orbit.x, pitch = orbit.y;
        vec3 target = targetAtZoom(zoomStops);
        vec3 ro = target + 5.0*vec3(sin(yaw)*cos(pitch),sin(pitch),cos(yaw)*cos(pitch));
        vec3 forward = normalize(target-ro);
        vec3 right = normalize(cross(forward,vec3(0,1,0)));
        vec3 up = cross(right,forward);
        vec3 rd = normalize(forward*1.75 + (st.x*right+st.y*up)/exp2(zoomStops));
        float t=0.0, id=0.0;
        for (int i=0; i<80; i++) {
            vec2 d = mapScene(ro+rd*t);
            id = d.y;
            if (d.x < 0.0006 || t>20.0) break;
            t += d.x*0.85;
        }
        bool hit = t<20.0;
        vec3 p = ro+rd*min(t,20.0);
        vec3 n = normalAt(p);
        float a = heldLight*6.283185;
        vec3 l = normalize(vec3(cos(a)*0.8,0.85,sin(a)*0.8));
        float visibility = shadowAt(p+n*0.004,l);
        float formShadow = 1.0-smoothstep(-0.25,0.48,dot(n,l));
        float shadow = max(formShadow,1.0-visibility);
        float tone = 0.95*pow(shadow,1.12);
        if (id>3.5) tone = 0.93*(1.0-visibility)*(1.0-smoothstep(2.0,4.0,length(p.xz)));
        vec2 phases = vec2(dot(p,vec3(0.75,1.0,0.25)),dot(p,vec3(-0.65,0.65,0.80)));
        vec3 grad1=vec3(0.75,1.0,0.25), grad2=vec3(-0.65,0.65,0.80);
        if (id>3.5) {phases = vec2(p.x+p.z*0.50,p.z-p.x*0.45);grad1=vec3(1,0,0.50);grad2=vec3(-0.45,0,1);}
        if (flow) {
            phases += 0.055*vec2(sin(p.y*5.0+p.z*2.0),sin(p.x*4.0-p.z*2.0));
            grad1+=0.055*cos(p.y*5.0+p.z*2.0)*vec3(0,5,2);
            grad2+=0.055*cos(p.x*4.0-p.z*2.0)*vec3(4,0,-2);
        }
        // Derivatives occur for every invocation in this uniform scene branch.
        coverage = method==0 ? pnPencil(p,n,dFdx(p),dFdy(p),tone,frameSeed) : renderHatch(phases,tone,heldGradient(p,n,grad1),heldGradient(p,n,grad2));
        float ndv = abs(dot(n,-rd));
        float edge = 1.0-smoothstep(0.035,0.095,ndv);
        if (id<3.5) coverage = max(coverage,edge*0.83*pow(tone,0.45)*(0.45+0.55*pnNoise(p.xy*29.0)));
        if (!hit) coverage = 0.0;
        if (id>3.5) coverage *= 1.0-smoothstep(7.0,15.0,length(p.xz));
    }
    float tooth=pnHash(floor(gl_FragCoord.xy));
    float fibre=pnNoise(gl_FragCoord.xy*vec2(0.13,0.87));
    float contact=clamp(0.80+0.27*tooth+0.13*fibre,0.0,1.0);
    coverage*=mix(contact,1.0,pow(coverage,3.0));
    vec3 paperGrain=paper*(0.978+0.022*tooth);
    outColor = vec4(mix(paperGrain,pen,coverage),1.0);
}
