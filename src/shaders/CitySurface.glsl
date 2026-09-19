// Pixel ray / geometric plane intersection (orthographic or perspective). The position and its
// footprint come from the SAME mapping, independent of triangle raster snapping.
// Camera basis and plane data are in world space. planeDistance = dot(surfaceNormal, surfacePosition).
// worldPerPixel is constant for orbit views; for perspective it is the scale
// at unit view depth. sampleScale converts supersample pixels to output pixels.
uniform vec3 eye;
uniform vec3 cameraRight;
uniform vec3 cameraUp;
uniform vec3 cameraForward;
uniform vec2 resolution;
uniform float worldPerPixel;
uniform float sampleScale;
uniform int cameraPerspective;
uniform mat4 lightProjection;

vec3 citySurfacePoint(vec3 surfaceNormal, float planeDistance, out vec3 positionDx,
                      out vec3 positionDy) {
    // Perspective: intersect the varying pixel ray with this face, then
    // differentiate that same intersection with respect to screen x and y.
    if (cameraPerspective == 1) {
        vec2 screenOffset = (gl_FragCoord.xy / sampleScale - resolution * 0.5) * worldPerPixel;
        vec3 pixelRay = cameraForward + cameraRight * screenOffset.x + cameraUp * screenOffset.y;
        float rayPlaneDenominator = dot(surfaceNormal, pixelRay);
        rayPlaneDenominator =
            (rayPlaneDenominator < 0.0 ? -1.0 : 1.0) * max(abs(rayPlaneDenominator), 1e-7);
        float viewDepth = (planeDistance - dot(surfaceNormal, eye)) / rayPlaneDenominator;
        positionDx =
            viewDepth * worldPerPixel *
            (cameraRight - pixelRay * dot(surfaceNormal, cameraRight) / rayPlaneDenominator);
        positionDy = viewDepth * worldPerPixel *
                     (cameraUp - pixelRay * dot(surfaceNormal, cameraUp) / rayPlaneDenominator);
        return eye + pixelRay * viewDepth;
    }

    // Orthographic: every ray has the same direction and a different origin.
    float rayPlaneDenominator = dot(surfaceNormal, cameraForward);
    rayPlaneDenominator =
        (rayPlaneDenominator < 0.0 ? -1.0 : 1.0) * max(abs(rayPlaneDenominator), 1e-7);
    vec2 screenOffset = (gl_FragCoord.xy / sampleScale - resolution * 0.5) * worldPerPixel;
    vec3 rayOrigin = eye + cameraRight * screenOffset.x + cameraUp * screenOffset.y;
    positionDx = worldPerPixel * (cameraRight - cameraForward * dot(surfaceNormal, cameraRight) /
                                                    rayPlaneDenominator);
    positionDy = worldPerPixel *
                 (cameraUp - cameraForward * dot(surfaceNormal, cameraUp) / rayPlaneDenominator);
    return rayOrigin +
           cameraForward * ((planeDistance - dot(surfaceNormal, rayOrigin)) / rayPlaneDenominator);
}
