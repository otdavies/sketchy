"""Dependency-free checks of nested membership and the approved shader sources."""
from pathlib import Path
import hashlib
import json
import math
import random

ROOT = Path(__file__).resolve().parents[1]


def canonical(index, level):
    if index == 0:
        return (0, -12)
    while index % 2 == 0:
        index //= 2
        level -= 1
    return (index, level)


def integral(x, width):
    q = x + 0.5 * width
    return math.floor(q) * width + min(q % 1, width)


def stripe(x, width, footprint):
    x %= 1
    return max(0, min(1, (integral(x + footprint / 2, width) - integral(x - footprint / 2, width)) / footprint))


def engraving(x, tone, birth, footprint):
    width = tone / (1 + birth)
    return stripe(x, width, footprint) + stripe(x - 0.5, width * birth, footprint)


for level in range(-16, 16):
    for index in range(-2048, 2049):
        assert canonical(index, level) == canonical(2 * index, level + 1)
        assert index / 2**level == 2 * index / 2**(level + 1)

# An octave boundary has the same coverage under the finer lattice labeling.
rng = random.Random(4107)
worst = 0
for _ in range(12000):
    x = rng.uniform(-100, 100)
    tone = rng.random()
    footprint = rng.uniform(0.01, 4)
    error = abs(engraving(x, tone, 1, footprint) - engraving(2 * x, tone, 0, 2 * footprint))
    worst = max(worst, error)
assert worst < 1e-10, worst

lock = json.loads((ROOT / "tests/hatching-lock.json").read_text())
for name, expected in lock["sha256"].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name

print(json.dumps({"canonical_ids": "pass", "nested_centers": "pass", "engraving_boundary_max_error": worst, "locked_kernels": len(lock["sha256"])}))
