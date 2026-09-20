// Shared by the city and sculpture. Matches Unity's default PaperStyle values.
// Unit light intensity, zero ambient fill. Material ink is independent of light.
// x = full-hatching brightness, y = clear-paper brightness; both in [0, 1].
uniform vec2 hatchBrightnessRange;

// Remap before the tone curve so threshold changes never move the strokes.
// Work in darkness to also support the flat ink ramp without changing its default.
float pencilRemapDarkness(float darkness) {
    float startDarkness = 1.0 - hatchBrightnessRange.y;
    float fullDarkness = 1.0 - hatchBrightnessRange.x;
    if (fullDarkness <= startDarkness) {
        // Coincident endpoints are a hard cutoff; the cutoff itself stays clear.
        return darkness > startDarkness ? 1.0 : 0.0;
    }
    return clamp((darkness - startDarkness) / (fullDarkness - startDarkness), 0.0, 1.0);
}

float pencilSurfaceTone(float illumination, float materialInk) {
    float darkness = pencilRemapDarkness(1.0 - clamp(illumination, 0.0, 1.0));
    float tone = darkness * mix(0.38, 0.86, darkness);
    return materialInk + (1.0 - materialInk) * tone;
}
