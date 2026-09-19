// Rasterized city + shadow map + screen-space depth/normal outline fitting.
// No dependencies. The outline passes have no access to mesh edges or IDs.
function createPencilCity(
  gl,
  pencilCore,
  edgeSource,
  compositeSource,
  extended = false,
  geometry = null,
) {
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
  function look(eye, target) {
    let z = norm(sub(eye, target)),
      x = norm(cross([0, 1, 0], z)),
      y = cross(z, x);
    return [
      x[0],
      y[0],
      z[0],
      0,
      x[1],
      y[1],
      z[1],
      0,
      x[2],
      y[2],
      z[2],
      0,
      -dot(x, eye),
      -dot(y, eye),
      -dot(z, eye),
      1,
    ];
  }
  function ortho(l, r, b, t, n, f) {
    return [
      2 / (r - l),
      0,
      0,
      0,
      0,
      2 / (t - b),
      0,
      0,
      0,
      0,
      -2 / (f - n),
      0,
      -(r + l) / (r - l),
      -(t + b) / (t - b),
      -(f + n) / (f - n),
      1,
    ];
  }
  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0,
      0, 0, (far + near) / (near - far), -1,
      0, 0, 2 * far * near / (near - far), 0];
  }
  // Clip the ground shadow rectangle before perspective division. Corners
  // behind the walking camera must not invert or erase its screen bounds.
  function groundScreenBounds(vp, bounds, near) {
    const [x0, z0, x1, z1] = bounds;
    const polygon = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) =>
      [0, 1, 3].map(i => vp[i] * x - vp[4 + i] * .01 + vp[8 + i] * z + vp[12 + i]));
    const clipped = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      if (a[2] >= near) clipped.push(a);
      if ((a[2] >= near) !== (b[2] >= near)) {
        const t = (near - a[2]) / (b[2] - a[2]);
        clipped.push(a.map((v, j) => v + t * (b[j] - v)));
      }
    }
    return clipped.map(p => [p[0] / p[2] * .5 + .5, p[1] / p[2] * .5 + .5]);
  }
  function mul(a, b) {
    let c = Array(16).fill(0);
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++)
        for (let k = 0; k < 4; k++) c[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
    return c;
  }
  function compile(type, source) {
    let s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(v, f) {
    let p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, v));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, f));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(p));
    return p;
  }
  const vertices = geometry || buildPencilCityGeometry(extended);
  function vao(data, stride, attributes) {
    let v = gl.createVertexArray();
    gl.bindVertexArray(v);
    let b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    for (const [loc, size, offset] of attributes) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(
        loc,
        size,
        gl.FLOAT,
        false,
        stride * 4,
        offset * 4,
      );
    }
    gl.bindVertexArray(null);
    return v;
  }
  const mesh = vao(vertices, 7, [
    [0, 3, 0],
    [1, 3, 3],
    [2, 1, 6],
  ]);
  const shadowVertices = geometry
    ? geometry.slice(42)
    : buildPencilCityGeometry(extended, true);
  const shadowMesh = vao(shadowVertices, 7, [
    [0, 3, 0],
    [1, 3, 3],
    [2, 1, 6],
  ]);
  const grouped = {};
  for (let i = 42; i < vertices.length; i += 21) {
    const mask =
      vertices[i + 6] >= 16
        ? 7
        : (Math.abs(vertices[i + 3]) > 0.22 ? 1 : 0) |
          (Math.abs(vertices[i + 4]) > 0.22 ? 2 : 0) |
          (Math.abs(vertices[i + 5]) > 0.22 ? 4 : 0);
    if (!grouped[mask]) grouped[mask] = [];
    grouped[mask].push(...vertices.slice(i, i + 21));
  }
  const batches = Object.entries(grouped)
    .filter(([kind, data]) => data.length)
    .map(([kind, data]) => ({
      kind,
      count: data.length / 7,
      mesh: vao(data, 7, [
        [0, 3, 0],
        [1, 3, 3],
        [2, 1, 6],
      ]),
    }));
  let groundBounds = null;
  // Shader text comes from src/shaders/. build.py resolves its includes once;
  // the caller supplies the pencil kernel used by both the demo and fixtures.
  const withPencil = source => source.replace("// PENCIL_CORE_INSERT", pencilCore);
  const vertex = CITY_SHADERS.vertex;
  const depth = program(vertex, CITY_SHADERS.depth);
  const shadowDepth = program(CITY_SHADERS.shadowVertex, CITY_SHADERS.depth);
  const fillSource = withPencil(CITY_SHADERS.fill);
  const paperProgram = program(vertex, withPencil(CITY_SHADERS.paper));
  const rawProgram = program(vertex, CITY_SHADERS.raw);
  const metadataProgram = program(vertex, CITY_SHADERS.metadata);
  const fullscreen = CITY_SHADERS.fullscreen;
  const detect = program(fullscreen, edgeSource);
  const composite = program(fullscreen, compositeSource);
  // The same source has explicit fitting and composition entry points.
  const fitSource = compositeSource.replace(
    "precision highp float;",
    "precision highp float;\n#define OUTLINE_FIT_PASS",
  );
  const fitProgram = program(fullscreen, fitSource);
  const locations = (p) =>
    Object.fromEntries(
      [
        "viewProjection",
        "lightProjection",
        "lightDirection",
        "lightRight",
        "lightUp",
        "shadowMap",
        "drawing",
        "method",
        "resolution",
        "eye",
        "jitter",
        "outlineMode",
        "sceneTexture",
        "edgeSeeds",
        "normalsTexture",
        "depthTexture",
        "cameraRight",
        "cameraUp",
        "cameraForward",
        "worldPerPixel",
        "cameraPerspective",
        "sampleScale",
        "fastSampling",
        "trafficTime",
        "shadowPlaneScale",
        "debugView",
      ].map((n) => [n, gl.getUniformLocation(p, n)]),
    );
  for (const batch of batches) {
    const define = "#define PN_CHART_MASK " + batch.kind;
    batch.program = program(
      vertex,
      fillSource.replace(
        "precision highp float;",
        "precision highp float;\n" + define,
      ),
    );
    batch.uniforms = locations(batch.program);
  }
  const ru = locations(rawProgram),
    gu = locations(paperProgram),
    mu = locations(metadataProgram),
    du = locations(depth),
    su = locations(shadowDepth),
    eu = locations(detect),
    cu = locations(composite),
    pu = locations(fitProgram);
  const shadowTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.DEPTH_COMPONENT32F,
    1536,
    1536,
    0,
    gl.DEPTH_COMPONENT,
    gl.FLOAT,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_COMPARE_MODE,
    gl.COMPARE_REF_TO_TEXTURE,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const shadowFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.DEPTH_ATTACHMENT,
    gl.TEXTURE_2D,
    shadowTexture,
    0,
  );
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
    throw Error("Shadow framebuffer incomplete");
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  let buffers = null,
    lastPost = null,
    lastLight = null,
    lastGroundLight = null;
  const colorSamples = Array.from(
    gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA8, gl.SAMPLES),
  );
  const zSamples = Array.from(
    gl.getInternalformatParameter(
      gl.RENDERBUFFER,
      gl.DEPTH_COMPONENT24,
      gl.SAMPLES,
    ),
  );
  const samples =
    [4, 2].find((n) => colorSamples.includes(n) && zSamples.includes(n)) || 0;
  function renderbuffer(w, h, format) {
    let r = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, r);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, format, w, h);
    return r;
  }
  const stats = {
    triangles: vertices.length / 21,
    cars: extended ? 4 : 0,
    distantBuildings: extended ? 8 : 0,
    shadowStorage: "depth32f hardware comparison",
    shadowCasterTriangles: shadowVertices.length / 21,
    groundCastsShadow: false,
    decalsCastShadows: false,
    outlineSource: "screen-space depth + normals + material",
    geometryEdgeBuffer: false,
    shadingScale: 2,
    metadataScale: 2,
    shaderBatches: batches.map((b) => ({
      type: b.kind,
      triangles: b.count / 3,
    })),
    shadowUpdates: 0,
    fitUpdates: 0,
    lastPass: "",
  };
  function makeTexture(w, h, depth = false) {
    let t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      depth ? gl.DEPTH_COMPONENT24 : gl.RGBA8,
      w,
      h,
      0,
      depth ? gl.DEPTH_COMPONENT : gl.RGBA,
      depth ? gl.UNSIGNED_INT : gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      depth ? gl.NEAREST : gl.LINEAR,
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MAG_FILTER,
      depth ? gl.NEAREST : gl.LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function resize(w, h) {
    if (buffers && buffers.w === w && buffers.h === h) return;
    if (buffers) {
      for (const t of buffers.textures) gl.deleteTexture(t);
      for (const f of buffers.fbos) gl.deleteFramebuffer(f);
      for (const r of buffers.renderbuffers) gl.deleteRenderbuffer(r);
    }
    const color = makeTexture(w * 2, h * 2),
      normals = makeTexture(w * 2, h * 2),
      z = makeTexture(w * 2, h * 2, true),
      seeds = makeTexture(w, h),
      fitted = makeTexture(w, h);
    let scene = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      color,
      0,
    );
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT1,
      gl.TEXTURE_2D,
      normals,
      0,
    );
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.TEXTURE_2D,
      z,
      0,
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw Error("City buffers incomplete");
    let edge = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, edge);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      seeds,
      0,
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw Error("Outline buffer incomplete");
    gl.bindTexture(gl.TEXTURE_2D, fitted);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_NEAREST,
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    let fittedFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fittedFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      fitted,
      0,
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw Error("Fit buffer incomplete");
    const nativeColor = makeTexture(w, h),
      cSample = renderbuffer(w, h, gl.RGBA8),
      zSample = renderbuffer(w, h, gl.DEPTH_COMPONENT24);
    const shade = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, shade);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.RENDERBUFFER,
      cSample,
    );
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      zSample,
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw Error("MSAA shade buffer incomplete");
    const resolved = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, resolved);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      nativeColor,
      0,
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    buffers = {
      w,
      h,
      color,
      nativeColor,
      normals,
      z,
      seeds,
      fitted,
      scene,
      edge,
      fittedFbo,
      shade,
      resolved,
      textures: [color, nativeColor, normals, z, seeds, fitted],
      fbos: [scene, edge, fittedFbo, shade, resolved],
      renderbuffers: [cSample, zSample],
      fittedKey: null,
      geometryKey: null,
    };
  }
  function bindTexture(t, unit, uniform) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(uniform, unit);
  }
  function draw(state, w, h, drawing) {
    resize(w, h);
    const blend = Math.min(1, Math.max(0, state.zoom / 2)),
      orbitTarget = [0.62 * blend, 0.85 + blend * 0.9, -0.05 * blend];
    const walking = !!state.walkPose;
    const eye = walking ? state.walkPose.eye : add(
      orbitTarget,
      scale(
        [
          Math.sin(state.yaw) * Math.cos(state.pitch),
          Math.sin(state.pitch),
          Math.cos(state.yaw) * Math.cos(state.pitch),
        ],
        13,
      ),
    );
    const half =
      ((extended ? 5.45 : 4.15) * Math.max(1, 1.2 / (w / h))) /
      Math.pow(2, state.zoom);
    const target = walking ? add(eye, [
      Math.sin(state.walkPose.yaw) * Math.cos(state.walkPose.pitch),
      Math.sin(state.walkPose.pitch),
      -Math.cos(state.walkPose.yaw) * Math.cos(state.walkPose.pitch),
    ]) : orbitTarget;
    const view = look(eye, target),
      vp = mul(walking ? perspective(Math.PI / 3, w / h, .03, 40)
        : ortho((-half * w) / h, (half * w) / h, -half, half, 0.1, 40), view);
    // Perspective scale is measured at unit view depth. Surface/edge passes
    // multiply by their actual depth; the orbit path keeps its original scale.
    const pixelScale = walking ? 2 * Math.tan(Math.PI / 6) / h : (half * 2) / h;
    buffers.viewProjection = vp;
    const right = [view[0], view[4], view[8]],
      up = [view[1], view[5], view[9]],
      forward = [-view[2], -view[6], -view[10]];
    const angle = state.light * Math.PI * 2,
      light = norm([Math.cos(angle) * 0.8, 0.95, Math.sin(angle) * 0.8]);
    const lightView = look(add([0, 1, 0], scale(light, 13)), [0, 1, 0]);
    const shadowExtent = extended ? 8.5 : 6;
    const lp = mul(
      ortho(-shadowExtent, shadowExtent, -shadowExtent, shadowExtent, 0.1, 30),
      lightView,
    );
    const trafficTime = extended ? state.trafficTime || 0 : 0;
    if (lastGroundLight !== state.light) {
      lastGroundLight = state.light;
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      // Project every caster vertex onto the ground. Outside this conservative
      // rectangle (+ filter margin) ground is provably unshadowed paper.
      for (let i = 42; i < vertices.length; i += 7) {
        if (vertices[i + 6] >= 16) continue;
        let h = vertices[i + 1] + 0.01,
          x = vertices[i] - (h * light[0]) / light[1],
          z = vertices[i + 2] - (h * light[2]) / light[1];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      if (extended) {
        minX = Math.min(minX, -4.85 - (0.5 * light[0]) / light[1]);
        maxX = Math.max(maxX, 4.85 - (0.5 * light[0]) / light[1]);
        minZ = Math.min(minZ, -4.25 - (0.5 * light[2]) / light[1]);
        maxZ = Math.max(maxZ, 4.25 - (0.5 * light[2]) / light[1]);
      }
      minX -= 0.06;
      maxX += 0.06;
      minZ -= 0.06;
      maxZ += 0.06;
      groundBounds = [minX, minZ, maxX, maxZ];
    }
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(mesh);
    const shadowKey = state.light + ":" + trafficTime;
    if (state.view !== 2 && lastLight !== shadowKey) {
      stats.lastPass = "shadow";
      stats.shadowUpdates++;
      lastLight = shadowKey;
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
      gl.viewport(0, 0, 1536, 1536);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(shadowDepth);
      gl.uniform1f(su.trafficTime, trafficTime);
      gl.uniformMatrix4fv(su.lightProjection, false, lp);
      // The horizontal ground only receives shadows from a light above it.
      // It cannot occlude any visible surface, and must not shadow itself.
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(0.5, 4);
      gl.bindVertexArray(shadowMesh);
      gl.drawArrays(gl.TRIANGLES, 0, shadowVertices.length / 7);
      gl.bindVertexArray(mesh);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    const raw = state.view > 0,
      fast = raw || state.quality !== 0,
      scaleFactor = fast ? 1 : 2;
    const geometryKey = JSON.stringify([
      state.zoom,
      state.yaw,
      state.pitch,
      state.walkPose,
      w,
      h,
      trafficTime,
    ]);
    stats.shadingScale = scaleFactor;
    stats.pencilSamples = raw ? 0 : fast ? 2 : 4;
    stats.view =
      state.view === 2 ? "light only" : raw ? "raw shadows" : "pencil";
    stats.coverageSamples = fast ? samples : 4;
    if (
      !raw &&
      fast &&
      state.outline > 0 &&
      buffers.geometryKey !== geometryKey
    ) {
      stats.lastPass = "outline metadata";
      buffers.geometryKey = geometryKey;
      gl.bindFramebuffer(gl.FRAMEBUFFER, buffers.scene);
      gl.viewport(0, 0, w * 2, h * 2);
      gl.clearBufferfv(gl.COLOR, 1, [0.5, 0.5, 0.5, 0]);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]);
      gl.useProgram(metadataProgram);
      gl.uniform1f(mu.trafficTime, trafficTime);
      gl.uniformMatrix4fv(mu.viewProjection, false, vp);
      gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 7);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    }
    stats.lastPass = "visibility";
    gl.bindFramebuffer(gl.FRAMEBUFFER, fast ? buffers.shade : buffers.scene);
    gl.viewport(0, 0, w * scaleFactor, h * scaleFactor);
    gl.clearBufferfv(
      gl.COLOR,
      0,
      raw ? [1, 1, 1, 1] : [0.984, 0.978, 0.958, 1],
    );
    if (!fast) gl.clearBufferfv(gl.COLOR, 1, [0.5, 0.5, 0.5, 0]);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.drawBuffers(fast ? [gl.NONE] : [gl.NONE, gl.NONE]);
    gl.useProgram(depth);
    gl.uniform1f(du.trafficTime, trafficTime);
    gl.uniformMatrix4fv(du.viewProjection, false, vp);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 7);
    gl.drawBuffers(
      fast
        ? [gl.COLOR_ATTACHMENT0]
        : [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1],
    );
    gl.depthFunc(gl.EQUAL);
    gl.depthMask(false);
    if (raw) {
      stats.lastPass = "raw visibility";
      gl.useProgram(rawProgram);
      gl.bindVertexArray(mesh);
      gl.uniform1i(ru.debugView, state.view);
      gl.uniformMatrix4fv(ru.viewProjection, false, vp);
      gl.uniformMatrix4fv(ru.lightProjection, false, lp);
      gl.uniform1f(ru.trafficTime, trafficTime);
      gl.uniform3fv(ru.eye, eye);
      gl.uniform2f(ru.resolution, w, h);
      gl.uniform3fv(ru.cameraRight, right);
      gl.uniform3fv(ru.cameraUp, up);
      gl.uniform3fv(ru.cameraForward, forward);
      gl.uniform1f(ru.worldPerPixel, pixelScale);
      gl.uniform1i(ru.cameraPerspective, walking ? 1 : 0);
      gl.uniform1f(ru.sampleScale, scaleFactor);
      gl.uniform3fv(ru.lightDirection, light);
      gl.uniform3fv(ru.lightRight, [lightView[0], lightView[4], lightView[8]]);
      gl.uniform3fv(ru.lightUp, [lightView[1], lightView[5], lightView[9]]);
      gl.uniform1f(ru.shadowPlaneScale, (2 * shadowExtent) / 29.9);
      bindTexture(shadowTexture, 0, ru.shadowMap);
      gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 7);
    } else {
      stats.lastPass = "unshadowed ground";
      gl.useProgram(paperProgram);
      gl.uniformMatrix4fv(gu.viewProjection, false, vp);
      gl.uniform1f(gu.sampleScale, scaleFactor);
      gl.bindVertexArray(mesh);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      const groundShader = batches.find((b) => b.kind === "2");
      for (const batch of [
        ...batches,
        { ...groundShader, mesh, count: 6, isGround: true },
      ]) {
        if (batch.isGround) {
          // Clip pixels, not the plane mesh. Re-triangulating the ground changed
          // rasterized depth as the camera rotated, making whole shadows vanish.
          const coords = groundScreenBounds(vp, groundBounds, walking ? .03 : .1);
          if (!coords.length) continue;
          const sw = w * scaleFactor,
            sh = h * scaleFactor;
          const left = Math.max(
              0,
              Math.min(
                sw,
                Math.floor(Math.min(...coords.map((p) => p[0])) * sw) - 2,
              ),
            ),
            right = Math.max(
              0,
              Math.min(
                sw,
                Math.ceil(Math.max(...coords.map((p) => p[0])) * sw) + 2,
              ),
            );
          const bottom = Math.max(
              0,
              Math.min(
                sh,
                Math.floor(Math.min(...coords.map((p) => p[1])) * sh) - 2,
              ),
            ),
            top = Math.max(
              0,
              Math.min(
                sh,
                Math.ceil(Math.max(...coords.map((p) => p[1])) * sh) + 2,
              ),
            );
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(
            left,
            bottom,
            Math.max(0, right - left),
            Math.max(0, top - bottom),
          );
        }
        const fu = batch.uniforms;
        stats.lastPass = "pencil " + batch.kind;
        gl.useProgram(batch.program);
        gl.bindVertexArray(batch.mesh);
        gl.uniform1f(fu.trafficTime, trafficTime);
        gl.uniform1f(fu.shadowPlaneScale, (2 * shadowExtent) / 29.9);
        gl.uniform3fv(fu.eye, eye);
        gl.uniform2f(fu.resolution, w, h);
        gl.uniformMatrix4fv(fu.viewProjection, false, vp);
        gl.uniformMatrix4fv(fu.lightProjection, false, lp);
        gl.uniform3fv(fu.lightDirection, light);
        gl.uniform3fv(fu.lightRight, [
          lightView[0],
          lightView[4],
          lightView[8],
        ]);
        gl.uniform3fv(fu.lightUp, [lightView[1], lightView[5], lightView[9]]);
        gl.uniform3fv(fu.cameraRight, right);
        gl.uniform3fv(fu.cameraUp, up);
        gl.uniform3fv(fu.cameraForward, forward);
        gl.uniform1f(fu.worldPerPixel, pixelScale);
        gl.uniform1i(fu.cameraPerspective, walking ? 1 : 0);
        gl.uniform1f(fu.sampleScale, scaleFactor);
        gl.uniform1i(fu.fastSampling, fast ? 1 : 0);
        gl.uniform1f(fu.drawing, drawing);
        gl.uniform1i(fu.method, state.method);
        bindTexture(shadowTexture, 0, fu.shadowMap);
        gl.drawArrays(gl.TRIANGLES, 0, batch.count);
        if (batch.isGround) gl.disable(gl.SCISSOR_TEST);
      }
    }
    gl.depthMask(true);
    if (!fast) buffers.geometryKey = geometryKey;
    if (fast) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, buffers.shade);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, buffers.resolved);
      gl.blitFramebuffer(
        0,
        0,
        w,
        h,
        0,
        0,
        w,
        h,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
    }
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
    buffers.cameraForward = forward;
    lastPost = (force = false) => {
      if (
        !raw &&
        state.outline > 0 &&
        (force || buffers.fittedKey !== geometryKey)
      ) {
        buffers.fittedKey = geometryKey;
        stats.fitUpdates++;
        stats.lastPass = "detect";
        gl.bindFramebuffer(gl.FRAMEBUFFER, buffers.edge);
        gl.viewport(0, 0, w, h);
        gl.useProgram(detect);
        bindTexture(buffers.normals, 0, eu.normalsTexture);
        bindTexture(buffers.z, 1, eu.depthTexture);
        gl.uniform2f(eu.resolution, w, h);
        gl.uniform3fv(eu.cameraRight, right);
        gl.uniform3fv(eu.cameraUp, up);
        gl.uniform3fv(eu.cameraForward, forward);
        gl.uniform1f(eu.worldPerPixel, pixelScale);
        gl.uniform1i(eu.cameraPerspective, walking ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        stats.lastPass = "fit";
        gl.bindFramebuffer(gl.FRAMEBUFFER, buffers.fittedFbo);
        gl.useProgram(fitProgram);
        bindTexture(buffers.seeds, 0, pu.edgeSeeds);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindTexture(gl.TEXTURE_2D, buffers.fitted);
        gl.generateMipmap(gl.TEXTURE_2D);
      }
      stats.lastPass = "compose";
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.useProgram(composite);
      bindTexture(
        fast ? buffers.nativeColor : buffers.color,
        0,
        cu.sceneTexture,
      );
      bindTexture(buffers.fitted, 1, cu.edgeSeeds);
      gl.uniform2f(cu.resolution, w, h);
      gl.uniform1f(cu.drawing, drawing);
      gl.uniform1f(cu.jitter, state.jitter);
      gl.uniform1i(cu.outlineMode, raw ? 0 : state.outline);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    };
    lastPost();
  }
  return {
    draw,
    redrawPost: () => lastPost && lastPost(true),
    invalidateGeometry: () => {
      if (buffers) {
        buffers.fittedKey = null;
        buffers.geometryKey = null;
      }
    },
    stats,
    getBuffers: () => buffers,
  };
}
