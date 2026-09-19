// Pure scene data: position, geometric face normal, material (7 floats).
// The camera mesh starts with the ground. The caster mesh omits ground and decals.
function buildPencilCityGeometry(extended = false, castersOnly = false, colliders = null) {
  const sub = (a, b) => a.map((v, i) => v - b[i]),
    dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const norm = (a) => {
    let n = Math.hypot(...a);
    return a.map((v) => v / n);
  };
  const add = (a, b) => a.map((v, i) => v + b[i]),
    scale = (a, s) => a.map((v) => v * s);
  const vertices = [];
  function face(points, normal, material = 0, casts = true) {
    if (castersOnly && !casts) return;
    if (
      dot(cross(sub(points[1], points[0]), sub(points[2], points[0])), normal) <
      0
    )
      points = [...points].reverse();
    for (let i = 1; i < points.length - 1; i++)
      for (const p of [points[0], points[i], points[i + 1]])
        vertices.push(...p, ...normal, material);
  }

  function box(x, y, z, hx, hy, hz, mat = 0, casts = true) {
    // Walking shares the actual building/prop dimensions. Curbs are walkable;
    // high roofs and animated cars are excluded from these static obstacles.
    if (colliders && mat < 16 && y - hy < .52 && y + hy > .18)
      colliders.push([x - hx, z - hz, x + hx, z + hz]);
    const q = (a, b, c) => [x + a * hx, y + b * hy, z + c * hz];
    face(
      [q(-1, -1, 1), q(1, -1, 1), q(1, 1, 1), q(-1, 1, 1)],
      [0, 0, 1],
      mat,
      casts,
    );
    face(
      [q(-1, -1, -1), q(-1, 1, -1), q(1, 1, -1), q(1, -1, -1)],
      [0, 0, -1],
      mat,
      casts,
    );
    face(
      [q(1, -1, -1), q(1, 1, -1), q(1, 1, 1), q(1, -1, 1)],
      [1, 0, 0],
      mat,
      casts,
    );
    face(
      [q(-1, -1, -1), q(-1, -1, 1), q(-1, 1, 1), q(-1, 1, -1)],
      [-1, 0, 0],
      mat,
      casts,
    );
    face(
      [q(-1, 1, -1), q(-1, 1, 1), q(1, 1, 1), q(1, 1, -1)],
      [0, 1, 0],
      mat,
      casts,
    );
    face(
      [q(-1, -1, -1), q(1, -1, -1), q(1, -1, 1), q(-1, -1, 1)],
      [0, -1, 0],
      mat,
      casts,
    );
  }
  function roof(x, y, z, w, d, h) {
    const a = [x - w, y, z - d],
      b = [x + w, y, z - d],
      c = [x, y + h, z - d],
      aa = [x - w, y, z + d],
      bb = [x + w, y, z + d],
      cc = [x, y + h, z + d];
    face([a, b, c], [0, 0, -1]);
    face([aa, cc, bb], [0, 0, 1]);
    face([a, c, cc, aa], norm([-h, w, 0]), 1);
    face([c, b, bb, cc], norm([h, w, 0]), 1);
  }
  function pyramid(x, y, z, w, d, h) {
    const q = [
        [x - w, y, z - d],
        [x + w, y, z - d],
        [x + w, y, z + d],
        [x - w, y, z + d],
      ],
      top = [x, y + h, z];
    for (let i = 0; i < 4; i++) {
      let a = q[i],
        b = q[(i + 1) % 4];
      face([a, b, top], norm(cross(sub(top, a), sub(b, a))), 1);
    }
  }
  // Facade markings receive light/shadow but have no physical casting thickness.
  function windowFace(x, y, z, horizontal, hw, hh, normal) {
    const q = (a, b) => [x + horizontal[0] * a, y + b, z + horizontal[2] * a];
    face([q(-hw, -hh), q(hw, -hh), q(hw, hh), q(-hw, hh)], normal, 2, false);
    // Thin paper mullion down the middle, and a horizontal sash.
    face(
      [q(-0.012, -hh), q(0.012, -hh), q(0.012, hh), q(-0.012, hh)].map((p) =>
        add(p, scale(normal, 0.004)),
      ),
      normal,
      0,
      false,
    );
    face(
      [q(-hw, -0.011), q(hw, -0.011), q(hw, 0.011), q(-hw, 0.011)].map((p) =>
        add(p, scale(normal, 0.006)),
      ),
      normal,
      0,
      false,
    );
  }
  function house(x, z, w, d, h, kind) {
    box(x, h / 2 + 0.1, z, w, h / 2, d);
    if (kind % 3 === 0) {
      box(x, h + 0.15, z, w + 0.07, 0.06, d + 0.07, 0);
      box(x + 0.18, h + 0.33, z - 0.1, 0.25, 0.12, 0.25, 1);
    } else roof(x, h + 0.1, z, w + 0.09, d + 0.09, 0.42 + (kind % 2) * 0.12);
    if (kind % 2 === 0)
      box(x - w * 0.42, h + 0.54, z - 0.12, 0.09, 0.26, 0.095, 0);
    const floors = Math.max(1, Math.floor(h / 0.65));
    for (let f = 0; f < floors; f++) {
      let yy = 0.46 + f * 0.66;
      for (let sx of [-0.5, 0.5])
        for (let side of [-1, 1])
          windowFace(
            x + sx * w,
            yy,
            z + side * (d + 0.006),
            [1, 0, 0],
            0.115,
            0.16,
            [0, 0, side],
          );
      for (let sz of [-0.45, 0.45])
        for (let side of [-1, 1])
          windowFace(
            x + side * (w + 0.006),
            yy,
            z + sz * d,
            [0, 0, 1],
            0.11,
            0.16,
            [side, 0, 0],
          );
    }
    // Front door and a stone step; the door darkens independently of illumination.
    face(
      [
        [x - 0.105, 0.1, z + d + 0.008],
        [x + 0.105, 0.1, z + d + 0.008],
        [x + 0.105, 0.62, z + d + 0.008],
        [x - 0.105, 0.62, z + d + 0.008],
      ],
      [0, 0, 1],
      2,
      false,
    );
    box(x, 0.055, z + d + 0.12, 0.19, 0.055, 0.15, 0);
  }
  face(
    [
      [-30, -0.01, -30],
      [-30, -0.01, 30],
      [30, -0.01, 30],
      [30, -0.01, -30],
    ],
    [0, 1, 0],
    3,
    false,
  );
  // Quiet blocks of pavement leave the crossing streets as paper.
  for (const x of [-1.95, 1.95])
    for (const z of [-1.7, 1.7]) box(x, 0.035, z, 1.23, 0.035, 1.17, 3);
  const homes = [
    [-2.1, -1.8, 0.61, 0.58, 1.65, 1],
    [-0.58, -1.95, 0.53, 0.6, 2.15, 2],
    [1.05, -1.85, 0.61, 0.59, 1.55, 3],
    [2.43, -1.48, 0.52, 0.58, 2.0, 4],
    [-2.22, 0.15, 0.63, 0.53, 1.28, 5],
    [-2.04, 1.75, 0.65, 0.55, 1.75, 1],
    [-0.5, 1.95, 0.48, 0.51, 1.15, 3],
    [1.1, 1.77, 0.59, 0.6, 1.6, 2],
    [2.48, 0.35, 0.52, 0.61, 1.35, 1],
  ];
  homes.forEach((h) => house(...h));
  // Central clock tower and three shallow steps into a small square.
  box(0.2, 0.07, -0.05, 0.79, 0.07, 0.77, 3);
  box(0.2, 1.58, -0.05, 0.42, 1.48, 0.42, 0);
  box(0.2, 2.82, -0.05, 0.47, 0.055, 0.47, 0);
  box(0.2, 3.13, -0.05, 0.52, 0.075, 0.52, 0);
  pyramid(0.2, 3.205, -0.05, 0.56, 0.56, 0.65);
  box(0.2, 3.93, -0.05, 0.025, 0.11, 0.025, 2);
  for (let f = 0; f < 3; f++)
    for (const side of [-1, 1]) {
      windowFace(
        0.2,
        0.65 + f * 0.62,
        -0.05 + side * 0.427,
        [1, 0, 0],
        0.1,
        0.19,
        [0, 0, side],
      );
      windowFace(
        0.2 + side * 0.427,
        0.65 + f * 0.62,
        -0.05,
        [0, 0, 1],
        0.1,
        0.19,
        [side, 0, 0],
      );
    }
  function clock(center, horizontal, normal) {
    const q = (a, b) => add(center, add(scale(horizontal, a), [0, b, 0]));
    for (let i = 0; i < 48; i++) {
      let a = (i * Math.PI) / 24,
        b = ((i + 1) * Math.PI) / 24;
      face(
        [
          q(Math.cos(a) * 0.24, Math.sin(a) * 0.24),
          q(Math.cos(b) * 0.24, Math.sin(b) * 0.24),
          q(Math.cos(b) * 0.218, Math.sin(b) * 0.218),
          q(Math.cos(a) * 0.218, Math.sin(a) * 0.218),
        ],
        normal,
        2,
        false,
      );
    }
    face(
      [q(-0.012, -0.02), q(0.012, -0.02), q(0.012, 0.16), q(-0.012, 0.16)],
      normal,
      2,
      false,
    );
    face(
      [q(-0.005, -0.018), q(0.14, 0.055), q(0.13, 0.075), q(-0.015, 0.004)],
      normal,
      2,
      false,
    );
  }
  clock([0.2, 2.48, 0.377], [1, 0, 0], [0, 0, 1]);
  clock([0.627, 2.48, -0.05], [0, 0, 1], [1, 0, 0]);
  // A café awning and two benches add a small human scale.
  box(-2.04, 0.94, 2.44, 0.59, 0.035, 0.26, 0);
  for (let xx of [-2.57, -1.51]) box(xx, 0.47, 2.64, 0.018, 0.43, 0.018, 2);
  for (const zz of [-0.78, 0.82]) {
    box(1.2, 0.26, zz, 0.32, 0.035, 0.11, 1);
    for (let xx of [0.98, 1.42]) box(xx, 0.14, zz, 0.025, 0.12, 0.07, 2);
  }
  if (extended) {
    // A few quieter blocks beyond the original square.
    [
      [-4.6, -5.15, 0.52, 0.48, 1.4, 1],
      [-2.9, -5.3, 0.59, 0.5, 2.0, 2],
      [-1.15, -5.15, 0.5, 0.53, 1.25, 3],
      [1.2, -5.3, 0.58, 0.48, 1.75, 4],
      [3, -5.2, 0.6, 0.52, 1.35, 5],
      [4.7, -5.15, 0.48, 0.52, 1.9, 1],
      [-5.65, -1.5, 0.5, 0.56, 1.25, 2],
      [5.65, -1.25, 0.5, 0.58, 1.6, 3],
    ].forEach((h) => house(...h));
    const road = (x0, z0, x1, z1) =>
      face(
        [
          [x0, 0.003, z0],
          [x0, 0.003, z1],
          [x1, 0.003, z1],
          [x1, 0.003, z0],
        ],
        [0, 1, 0],
        4,
        false,
      );
    road(-4.65, -4.05, 4.65, -3.15);
    road(-4.65, 3.15, 4.65, 4.05);
    road(-4.65, -3.15, -3.75, 3.15);
    road(3.75, -3.15, 4.65, 3.15);
    // Sparse graphite center dashes, with white shoulders.
    for (let x = -3.5; x <= 3.5; x += 0.9)
      for (const z of [-3.6, 3.6])
        box(x, 0.006, z, 0.15, 0.002, 0.015, 2, false);
    for (let z = -2.7; z <= 2.7; z += 0.9)
      for (const x of [-4.2, 4.2])
        box(x, 0.006, z, 0.015, 0.002, 0.15, 2, false);
    for (let id = 0; id < 4; id++) {
      const m = 16 + id * 8;
      box(0, 0.17, 0, 0.29, 0.075, 0.135, m);
      box(-0.025, 0.285, 0, 0.16, 0.075, 0.118, m + 2);
      box(-0.025, 0.365, 0, 0.175, 0.015, 0.126, m);
      for (const x of [-0.185, 0.185])
        for (const z of [-0.142, 0.142])
          box(x, 0.09, z, 0.058, 0.072, 0.026, m + 2);
      box(0.296, 0.18, 0, 0.006, 0.022, 0.072, m + 2);
    }
  }
  return vertices;
}
