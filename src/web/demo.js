// Standalone WebGL2 harness. No dependencies or network requests.
(function () {
  const root = document.getElementById("fractal-hatching");
  const canvas = root.querySelector("canvas");
  const status = root.querySelector("[data-status]");
  const controls = Object.fromEntries(
    [...root.querySelectorAll("[data-control]")].map((e) => [
      e.dataset.control,
      e,
    ]),
  );
  // Named, shareable entry points use one renderer and one set of controls.
  const presets = {
    city: { scene: 3 },
    traffic: { scene: 4 },
    walk: { scene: 5 },
    sculpture: { scene: 0, zoom: -0.45 },
    flat: { scene: 1 },
    tone: { scene: 2 },
    outlines: { scene: 3, outline: 3 },
    shadows: { scene: 3, view: 1 },
  };
  const preset = presets[new URLSearchParams(location.search).get("study")];
  if (preset)
    for (const [name, value] of Object.entries(preset))
      controls[name].value = String(value);
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) {
    status.textContent =
      "This demo needs a browser with WebGL 2 enabled.";
    status.setAttribute("role", "alert");
    return;
  }
  function shader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  let program, cityRenderer, extendedRenderer;
  try {
    program = gl.createProgram();
    gl.attachShader(
      program,
      shader(
        gl.VERTEX_SHADER,
        CITY_SHADERS.fullscreen,
      ),
    );
    gl.attachShader(
      program,
      shader(
        gl.FRAGMENT_SHADER,
        root.querySelector("[data-fragment]").textContent.trim(),
      ),
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(program));
    cityRenderer = createPencilCity(
      gl,
      root.querySelector("[data-pencil-core]").textContent.trim(),
      root.querySelector("[data-edge-fragment]").textContent.trim(),
      root.querySelector("[data-composite-fragment]").textContent.trim(),
    );
  } catch (e) {
    status.textContent = e.message;
    status.setAttribute("role", "alert");
    throw e;
  }
  gl.useProgram(program);
  const uniforms = Object.fromEntries(
    [
      "resolution",
      "zoomStops",
      "lightAngle",
      "spacing",
      "orbit",
      "pan",
      "scene",
      "method",
      "flow",
      "paper",
      "pen",
      "frameSeed",
      "hatchBrightnessRange",
    ].map((n) => [n, gl.getUniformLocation(program, n)]),
  );
  let yaw = +controls.scene.value >= 3 ? 0.68 : 0.34,
    pitch = +controls.scene.value >= 3 ? 0.52 : 0.25,
    pan = [0.0, 0.0],
    pending = false;
  let state = null;
  let trafficClock = 0,
    trafficLast = performance.now();
  const frameSeed = 0;
  let rendered = false;
  let animationStart = null,
    animationLight = 0,
    animationFrame = 0,
    animationKind = "light",
    animationZoom = 0;
  const walker = createPencilWalk(canvas, root.querySelector('[data-walk-panel]'), requestDraw);
  function updateNavigation() {
    const walking = +controls.scene.value === 5;
    walker.setEnabled(walking);
    root.dataset.walking = String(walking);
    controls.zoom.disabled = walking;
    root.querySelector('[data-play-kind="zoom"]').disabled = walking;
    canvas.setAttribute('aria-label', walking
      ? 'Walk through town. WASD moves, arrow keys move and turn, and dragging looks around.'
      : 'Pencil shading demo. Drag to orbit, or pan the flat surface. Use Zoom to inspect the strokes.');
    if (walking) canvas.setAttribute('aria-describedby', 'walk-help');
    else canvas.removeAttribute('aria-describedby');
    const navigationHint = document.querySelector('[data-navigation-hint]');
    if (navigationHint) navigationHint.textContent = walking
      ? 'WASD to walk. Drag to look. Esc releases the mouse.' : 'Drag to orbit. Scroll to zoom.';
  }
  updateNavigation();
  document.addEventListener("DOMContentLoaded", updateNavigation, { once: true });
  function draw() {
    pending = false;
    const requested = {
      yaw,
      pitch,
      walkPose: +controls.scene.value === 5 ? walker.pose() : null,
      zoom: +controls.zoom.value,
      light: +controls.light.value,
      pan: [...pan],
      scene: +controls.scene.value,
      method: +controls.method.value,
      outline: +controls.outline.value,
      jitter: +controls.jitter.value,
      quality: +controls.quality.value,
      view: +controls.view.value,
      hatchStartBrightness: +controls.hatchStartBrightness.value,
      fullHatchBrightness: +controls.fullHatchBrightness.value,
      trafficTime: trafficClock,
    };
    const dirty = JSON.stringify(state) !== JSON.stringify(requested);
    state = requested;
    const w = Math.max(1, Math.round(canvas.clientWidth)),
      h = Math.max(1, Math.round(canvas.clientHeight));
    // One framebuffer pixel per CSS pixel makes the spacing control consistent.
    const resized = canvas.width !== w || canvas.height !== h;
    if (resized) {
      canvas.width = w;
      canvas.height = h;
    }
    if (dirty || resized || !rendered) {
      if (state.scene >= 3) {
        if (state.scene >= 4 && !extendedRenderer)
          extendedRenderer = createPencilCity(
            gl,
            root.querySelector("[data-pencil-core]").textContent.trim(),
            root.querySelector("[data-edge-fragment]").textContent.trim(),
            root.querySelector("[data-composite-fragment]").textContent.trim(),
            true,
          );
        (state.scene >= 4 ? extendedRenderer : cityRenderer).draw(
          state,
          w,
          h,
          frameSeed,
        );
      } else {
        gl.viewport(0, 0, w, h);
        gl.useProgram(program);
        gl.uniform2f(uniforms.resolution, w, h);
        gl.uniform1f(uniforms.zoomStops, state.zoom);
        gl.uniform1f(uniforms.lightAngle, state.light);
        gl.uniform1f(uniforms.spacing, 7.0);
        gl.uniform2f(uniforms.orbit, state.yaw, state.pitch);
        gl.uniform2fv(uniforms.pan, state.pan);
        gl.uniform1i(uniforms.scene, state.scene);
        gl.uniform1i(uniforms.method, state.method);
        gl.uniform1i(uniforms.flow, 1);
        gl.uniform1f(uniforms.frameSeed, frameSeed);
        gl.uniform2f(uniforms.hatchBrightnessRange, state.fullHatchBrightness,
          state.hatchStartBrightness);
        // Graphite and paper are physical artwork materials, not inverted UI colors.
        gl.uniform3fv(uniforms.paper, [0.984, 0.978, 0.958]);
        gl.uniform3fv(uniforms.pen, [0.125, 0.119, 0.115]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      rendered = true;
    }
    root.querySelector("[data-zoom-value]").textContent = expLabel(
      +controls.zoom.value,
    );
    root.querySelector("[data-light-label]").textContent =
      +controls.scene.value === 0 || +controls.scene.value >= 3
        ? "Light direction"
        : "Input darkness";
    root.querySelector("[data-light-value]").textContent =
      +controls.scene.value === 0 || +controls.scene.value >= 3
        ? Math.round(+controls.light.value * 360) + "°"
        : Math.round(controls.light.value * 100) + "%";
    controls.light.disabled = +controls.scene.value === 2;
    const city = +controls.scene.value >= 3,
      raw = city && +controls.view.value > 0;
    controls.view.disabled = !city;
    controls.method.disabled = raw;
    controls.hatchStartBrightness.disabled = raw;
    controls.fullHatchBrightness.disabled = raw;
    root.querySelector("[data-hatch-start-value]").textContent =
      Math.round(state.hatchStartBrightness * 100) + "%";
    root.querySelector("[data-full-hatch-value]").textContent =
      Math.round(state.fullHatchBrightness * 100) + "%";
    controls.outline.disabled = !city || raw;
    controls.quality.disabled = !city || raw;
    controls.jitter.disabled = !city || raw || +controls.outline.value !== 2;
    controls.traffic.disabled = +controls.scene.value < 4;
    root.querySelector("[data-jitter-value]").textContent =
      (+controls.jitter.value).toFixed(2) + " px";
    status.textContent = raw
      ? +controls.view.value === 2
        ? "Light only · no cast shadows"
        : "Raw shadows · white: sunlit · black: shaded"
      : "Continuous · " +
        [
          "drag to orbit",
          "drag to pan",
          "light to dark",
          "drag to orbit",
          "drag to orbit",
          "walk through town",
        ][+controls.scene.value];
  }
  function expLabel(s) {
    let z = Math.pow(2, s);
    return (z >= 10 ? z.toFixed(0) : z.toFixed(2)) + "×";
  }
  function requestDraw() {
    if (!pending) {
      pending = true;
      requestAnimationFrame(draw);
    }
  }
  Object.values(controls).forEach((e) =>
    e.addEventListener("input", () => {
      // Keep the range ordered while letting either slider move its endpoint.
      if (+controls.fullHatchBrightness.value > +controls.hatchStartBrightness.value) {
        if (e === controls.fullHatchBrightness)
          controls.hatchStartBrightness.value = controls.fullHatchBrightness.value;
        else controls.fullHatchBrightness.value = controls.hatchStartBrightness.value;
      }
      requestDraw();
    }),
  );
  controls.scene.addEventListener("change", () => {
    if (animationStart !== null) play(animationKind);
    updateNavigation();
    controls.zoom.value = 0;
    pan = [0, 0];
    yaw = +controls.scene.value >= 3 ? 0.68 : 0.34;
    pitch = +controls.scene.value >= 3 ? 0.52 : 0.25;
    requestDraw();
  });
  // Traffic uses continuous frame time and never changes the stationary stroke seed.
  function animateTraffic(now) {
    const dt = Math.min(0.3, Math.max(0, (now - trafficLast) / 1000));
    trafficLast = now;
    if (
      +controls.scene.value >= 4 &&
      controls.traffic.checked &&
      !document.hidden
    ) {
      trafficClock += dt;
      requestDraw();
    }
    requestAnimationFrame(animateTraffic);
  }
  requestAnimationFrame(animateTraffic);
  function play(kind) {
    if (kind === "zoom" && +controls.scene.value === 5 && animationStart === null) return;
    const buttons = [...root.querySelectorAll("[data-play-kind]")];
    function labels() {
      buttons.forEach(
        (b) =>
          (b.textContent =
            b.dataset.playKind === "zoom" ? "Play zoom" : "Play light"),
      );
    }
    if (animationStart !== null) {
      cancelAnimationFrame(animationFrame);
      animationStart = null;
      labels();
      return;
    }
    animationKind = kind;
    if (+controls.scene.value < 3) controls.scene.value = "0";
    animationStart = performance.now();
    animationLight = +controls.light.value;
    animationZoom = +controls.zoom.value;
    root.querySelector("[data-play-kind=" + kind + "]").textContent = "Stop";
    function step(now) {
      const progress = Math.min(1, (now - animationStart) / 4000);
      if (animationKind === "light")
        controls.light.value = (animationLight + progress) % 1;
      else controls.zoom.value = Math.min(6, animationZoom + progress * 3.0);
      draw();
      if (progress < 1) animationFrame = requestAnimationFrame(step);
      else {
        animationStart = null;
        labels();
      }
    }
    animationFrame = requestAnimationFrame(step);
  }
  root
    .querySelectorAll("[data-play-kind]")
    .forEach((b) =>
      b.addEventListener("click", () => play(b.dataset.playKind)),
    );
  let pointer = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (+controls.scene.value === 5) return;
    pointer = { x: e.clientX, y: e.clientY, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (+controls.scene.value === 5 || !pointer || e.pointerId !== pointer.id) return;
    let dx = e.clientX - pointer.x,
      dy = e.clientY - pointer.y;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    if (+controls.scene.value === 0 || +controls.scene.value >= 3) {
      yaw -= dx * 0.006;
      pitch = Math.max(0.03, Math.min(1.25, pitch + dy * 0.005));
    } else {
      let scale = 4 / (canvas.clientHeight * Math.pow(2, +controls.zoom.value));
      pan[0] -= dx * scale;
      pan[1] += dy * scale;
    }
    requestDraw();
  });
  canvas.addEventListener("pointerup", () => (pointer = null));
  canvas.addEventListener("pointercancel", () => (pointer = null));
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (+controls.scene.value === 5) return;
      e.preventDefault();
      controls.zoom.value = Math.max(
        -2,
        Math.min(6, +controls.zoom.value - e.deltaY * 0.003),
      );
      requestDraw();
    },
    { passive: false },
  );
  new ResizeObserver(requestDraw).observe(canvas);
  const themeObserver = new MutationObserver(requestDraw);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener(
    "change",
    requestDraw,
  );
  // Explicit hook for reproducible render checks; no background animation.
  root.fractalDemo = {
    draw,
    get cityRenderer() {
      return state.scene >= 4 ? extendedRenderer : cityRenderer;
    },
    setCamera: (y, p) => {
      yaw = y;
      pitch = p;
      draw();
    },
    gl,
    getState: () => ({ ...state }),
    getFrameSeed: () => frameSeed,
  };
  draw();
})();
