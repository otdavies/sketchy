#version 300 es
// A single oversized triangle covers the viewport without a shared diagonal.
void main() {
    vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(corner * 2.0 - 1.0, 0, 1);
}
