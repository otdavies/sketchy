// Shared by the city and sculpture. Matches Unity's default PaperStyle values.
// Unit light intensity, zero ambient fill. Material ink is independent of light.
float pencilSurfaceTone(float illumination, float materialInk) {
    float darkness = 1.0 - clamp(illumination, 0.0, 1.0);
    float tone = darkness * mix(0.38, 0.86, darkness);
    return materialInk + (1.0 - materialInk) * tone;
}
