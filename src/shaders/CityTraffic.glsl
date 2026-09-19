// Shared by the camera and shadow passes so moving cars stay aligned.
// Material IDs >= 16 encode a car number and its local material category.
// Distances below describe the existing rectangular road route in scene units.
uniform float trafficTime;
void vehicle(inout vec3 worldPosition, inout vec3 worldNormal, inout float materialId) {
    if (materialId < 16.0) {
        return;
    }
    float vehicleId = floor((materialId - 16.0) / 8.0);
    materialId = mod(materialId, 8.0);
    float routeDistance = mod(trafficTime * 0.72 + vehicleId * 8.24, 32.96);
    vec2 vehicleCenter;
    vec2 travelDirection;
    if (routeDistance < 8.84) {
        vehicleCenter = vec2(-4.42 + routeDistance, -3.82);
        travelDirection = vec2(1, 0);
    } else if (routeDistance < 16.48) {
        vehicleCenter = vec2(4.42, -3.82 + (routeDistance - 8.84));
        travelDirection = vec2(0, 1);
    } else if (routeDistance < 25.32) {
        vehicleCenter = vec2(4.42 - (routeDistance - 16.48), 3.82);
        travelDirection = vec2(-1, 0);
    } else {
        vehicleCenter = vec2(-4.42, 3.82 - (routeDistance - 25.32));
        travelDirection = vec2(0, -1);
    }
    mat2 vehicleRotation = mat2(travelDirection, vec2(-travelDirection.y, travelDirection.x));
    worldPosition.xz = vehicleRotation * worldPosition.xz + vehicleCenter;
    worldNormal.xz = vehicleRotation * worldNormal.xz;
}
