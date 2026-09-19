// Pixel ray / geometric plane intersection (orthographic or perspective). The position and its
// footprint come from the SAME mapping, independent of triangle raster snapping.
uniform vec3 eye,cameraRight,cameraUp,cameraForward;
uniform vec2 resolution;
uniform float worldPerPixel,sampleScale;
uniform int cameraPerspective;
uniform mat4 lightProjection;
vec3 citySurfacePoint(vec3 normal,float planeDistance,out vec3 dx,out vec3 dy){
 if(cameraPerspective==1){
  vec2 screen=(gl_FragCoord.xy/sampleScale-resolution*.5)*worldPerPixel;
  vec3 ray=cameraForward+cameraRight*screen.x+cameraUp*screen.y;
  float facing=dot(normal,ray);
  facing=(facing<0.?-1.:1.)*max(abs(facing),1e-7);
  float t=(planeDistance-dot(normal,eye))/facing;
  dx=t*worldPerPixel*(cameraRight-ray*dot(normal,cameraRight)/facing);
  dy=t*worldPerPixel*(cameraUp-ray*dot(normal,cameraUp)/facing);
  return eye+ray*t;
 }
 float facing=dot(normal,cameraForward);
 facing=(facing<0.?-1.:1.)*max(abs(facing),1e-7);
 vec2 screen=(gl_FragCoord.xy/sampleScale-resolution*.5)*worldPerPixel;
 vec3 ray=eye+cameraRight*screen.x+cameraUp*screen.y;
 dx=worldPerPixel*(cameraRight-cameraForward*dot(normal,cameraRight)/facing);
 dy=worldPerPixel*(cameraUp-cameraForward*dot(normal,cameraUp)/facing);
 return ray+cameraForward*((planeDistance-dot(normal,ray))/facing);
}
