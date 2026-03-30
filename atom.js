(function () {
  'use strict';

  const circuitBoard = document.querySelector('[data-circuit-board]');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!circuitBoard) return;

  const MONO_FONT = '"IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace';

  // Nucleus shading — index 0 = brightest highlight, last = darkest shadow
  const NUCLEUS_GLYPHS = '@@@%%##**++==--::.. ';
  const ELECTRON_CHARS = ['@', '#', '*', 'o', '0', 'x', '+', '%', '&'];
  const TRAIL_CHARS    = ['~', '-', '.', ',', '`', "'", ':'];
  const BG_CHARS       = '  ..,:;-=+*#%01/\\|<>[]{}!';
  const FLASH_CHARS    = '!|/\\^~*+#@=';

  const ELECTRON_COLORS = [
    [140, 230, 255],
    [180, 245, 255],
    [220, 250, 255],
    [100, 200, 230],
    [160, 230, 200],
    [200, 220, 255],
  ];

  // --- Math helpers ---
  const clamp       = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const mix         = (a, b, t)   => a + (b - a) * t;
  const easeOutQuad = t => t * (2 - t);
  const rand        = ()          => Math.random();
  const randInt     = n           => Math.floor(rand() * n);

  // Rotate (x,y,z) around X axis
  const rotX = (x, y, z, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [x, y * c - z * s, y * s + z * c];
  };
  // Rotate (x,y,z) around Y axis
  const rotY = (x, y, z, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [x * c + z * s, y, -x * s + z * c];
  };
  // Perspective projection onto screen
  const project = (x, y, z, cx, cy, fov) => {
    const scale = fov / (z + fov);
    return { sx: cx + x * scale, sy: cy + y * scale, scale };
  };

  // --- Electron factory ---
  const createElectron = (nucleusR) => {
    const rgb = ELECTRON_COLORS[randInt(ELECTRON_COLORS.length)];
    return {
      incl:       rand() * Math.PI,
      lan:        rand() * Math.PI * 2,
      arg:        rand() * Math.PI * 2,
      speed:      (0.0014 + rand() * 0.0030) * (rand() < 0.5 ? 1 : -1),
      radius:     nucleusR * (1.6 + rand() * 1.9),
      trailLen:   14 + randInt(18),
      trail:      [],
      glyph:      ELECTRON_CHARS[randInt(ELECTRON_CHARS.length)],
      flashPhase: rand() * 3000,
      rgb,
    };
  };

  // Compute 3-D position of electron at given time
  const electronPos3D = (e, time) => {
    const a = e.arg + e.speed * time;
    let [x, y, z] = [e.radius * Math.cos(a), 0, e.radius * Math.sin(a)];
    [x, y, z] = rotX(x, y, z, e.incl);
    [x, y, z] = rotY(x, y, z, e.lan);
    return [x, y, z];
  };

  // --- Scene state ---
  const scene = {
    width: 0, height: 0, dpr: 1, scale: 1,
    cx: 0, cy: 0,
    nucleusR: 0,
    fov: 520,
    rafId: 0,
    startedAt: 0,
    reduced: false,
    resizeTimer: 0,
    electrons: [],
    bgNoiseCells: [],
    lastBgRebuild: -9999,
    scanlinePattern: null,
  };

  // --- DOM canvas ---
  const canvas       = circuitBoard.querySelector('[data-board-canvas]');
  const context      = canvas?.getContext('2d');
  const signalCanvas = document.createElement('canvas');
  const bloomCanvas  = document.createElement('canvas');
  const vigCanvas    = document.createElement('canvas');
  const signalCtx    = signalCanvas.getContext('2d');
  const bloomCtx     = bloomCanvas.getContext('2d');
  const vigCtx       = vigCanvas.getContext('2d');

  if (!context || !signalCtx || !bloomCtx || !vigCtx) return;

  // --- Canvas sync helpers ---
  const syncMainCanvas = () => {
    canvas.width  = Math.max(1, Math.round(scene.width * scene.dpr));
    canvas.height = Math.max(1, Math.round(scene.height * scene.dpr));
    canvas.style.width  = `${scene.width}px`;
    canvas.style.height = `${scene.height}px`;
    context.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
  };

  const syncOffscreen = (c, ctx) => {
    c.width  = Math.max(1, Math.round(scene.width));
    c.height = Math.max(1, Math.round(scene.height));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  const syncMeasurements = () => {
    const rect   = circuitBoard.getBoundingClientRect();
    scene.width  = Math.max(1, Math.round(rect.width));
    scene.height = Math.max(1, Math.round(rect.height));
    scene.dpr    = clamp(window.devicePixelRatio || 1, 1, 3);
    scene.scale  = clamp(scene.width / 860, 0.5, 1.8);
    scene.cx     = scene.width  * 0.5;
    scene.cy     = scene.height * 0.5;
    scene.nucleusR = scene.scale * 82;
    scene.fov    = scene.width * 0.64;

    const needed = Math.max(8, Math.floor(7 + scene.scale * 11));
    if (scene.electrons.length !== needed) {
      scene.electrons = Array.from({ length: needed }, () => createElectron(scene.nucleusR));
    } else {
      scene.electrons.forEach(e => {
        e.radius = scene.nucleusR * (1.6 + rand() * 1.9);
      });
    }

    syncMainCanvas();
    [[signalCanvas, signalCtx], [bloomCanvas, bloomCtx], [vigCanvas, vigCtx]]
      .forEach(([c, ctx]) => syncOffscreen(c, ctx));
    buildScanlinePattern();
    buildVignetteCache();
  };

  // --- Scanline pattern ---
  const buildScanlinePattern = () => {
    const p  = document.createElement('canvas');
    p.width  = 1; p.height = 3;
    const pc = p.getContext('2d');
    pc.fillStyle = 'rgba(0,0,0,0.12)';
    pc.fillRect(0, 2, 1, 1);
    scene.scanlinePattern = context.createPattern(p, 'repeat') || null;
  };

  // --- Vignette ---
  const buildVignetteCache = () => {
    vigCanvas.width  = Math.max(1, Math.round(scene.width));
    vigCanvas.height = Math.max(1, Math.round(scene.height));
    vigCtx.clearRect(0, 0, scene.width, scene.height);
    const vg = vigCtx.createRadialGradient(
      scene.cx, scene.cy, scene.width * 0.15,
      scene.cx, scene.cy, scene.width * 0.72
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.58)');
    vigCtx.fillStyle = vg;
    vigCtx.fillRect(0, 0, scene.width, scene.height);
  };

  // --- Background noise field ---
  const rebuildBgNoise = (time) => {
    const charW = 9, charH = 13;
    const cols = Math.ceil(scene.width  / charW) + 1;
    const rows = Math.ceil(scene.height / charH) + 1;
    const t = time * 0.00005;
    scene.bgNoiseCells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const n = Math.sin(c * 1.71 + t * 2.9 + r * 0.88)
                + Math.cos(c * 0.87 + t * 1.3 + r * 1.33);
        const idx = Math.abs(Math.floor(n * 800)) % BG_CHARS.length;
        const alpha = 0.04 + 0.07 * Math.abs(n) * 0.5;
        scene.bgNoiseCells.push({ x: c * charW, y: r * charH, ch: BG_CHARS[idx], alpha });
      }
    }
    scene.lastBgRebuild = time;
  };

  const drawBackground = (ctx, time) => {
    // Deep space fill
    ctx.fillStyle = '#060d1a';
    ctx.fillRect(0, 0, scene.width, scene.height);

    // Subtle radial glow at center
    const glow = ctx.createRadialGradient(
      scene.cx, scene.cy, 0,
      scene.cx, scene.cy, scene.nucleusR * 5.5
    );
    glow.addColorStop(0,   'rgba(60,130,200,0.18)');
    glow.addColorStop(0.4, 'rgba(30,80,160,0.08)');
    glow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, scene.width, scene.height);

    // Noise cells
    if (time - scene.lastBgRebuild > 110) rebuildBgNoise(time);
    ctx.font = `9px ${MONO_FONT}`;
    ctx.textBaseline = 'top';
    for (const cell of scene.bgNoiseCells) {
      ctx.fillStyle = `rgba(100,180,240,${cell.alpha.toFixed(3)})`;
      ctx.fillText(cell.ch, cell.x, cell.y);
    }
  };

  // --- Nucleus ---
  const drawNucleus = (ctx, bloomCtxRef, time) => {
    const { cx, cy, nucleusR: r, scale } = scene;
    const pulse = 0.96 + 0.04 * Math.sin(time * 0.0018);
    const pr = r * pulse;
    const charW = Math.max(6, Math.round(scale * 7.5));
    const charH = Math.max(9, Math.round(scale * 10));
    const fontSize = Math.round(scale * 9);

    ctx.font = `bold ${fontSize}px ${MONO_FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // Shade the sphere with distance-from-center mapping to glyph brightness
    const cols = Math.ceil((pr * 2) / charW) + 2;
    const rows = Math.ceil((pr * 2) / charH) + 2;
    const lightDir = [0.6, -0.5, 0.8]; // normalised light source
    const lLen = Math.hypot(...lightDir);
    const [lx, ly, lz] = lightDir.map(v => v / lLen);

    for (let ri = 0; ri < rows; ri++) {
      for (let ci = 0; ci < cols; ci++) {
        const px = cx - pr + ci * charW;
        const py = cy - pr + ri * charH;
        const dx = (px - cx) / pr;
        const dy = (py - cy) / pr;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const dz = Math.sqrt(1 - d2);
        // Lambertian diffuse
        const diff = clamp(dx * lx + dy * ly + dz * lz, 0, 1);
        // Specular highlight
        const spec = Math.pow(diff, 18) * 0.7;
        const bright = diff * 0.82 + spec;
        const gIdx  = Math.floor((1 - bright) * (NUCLEUS_GLYPHS.length - 1));
        const glyph = NUCLEUS_GLYPHS[clamp(gIdx, 0, NUCLEUS_GLYPHS.length - 1)];
        if (!glyph.trim()) continue;
        // Flash some cells
        const flashT = time * 0.003 + ci * 0.41 + ri * 0.73;
        const flashOn = Math.sin(flashT) > 0.88;
        const alpha = flashOn ? 1.0 : (0.55 + bright * 0.45);
        const rr = Math.round(180 + bright * 75);
        const gg = Math.round(220 + bright * 35);
        const bb = 255;
        ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha})`;
        ctx.fillText(glyph, px, py);

        // Bloom pass — write bright cells to bloom canvas
        if (bright > 0.6) {
          bloomCtxRef.font = ctx.font;
          bloomCtxRef.textBaseline = 'middle';
          bloomCtxRef.textAlign = 'center';
          bloomCtxRef.fillStyle = `rgba(${rr},${gg},${bb},${(bright * 0.5).toFixed(3)})`;
          bloomCtxRef.fillText(glyph, px, py);
        }
      }
    }
    ctx.textAlign = 'left';
  };

  // --- Orbit ring (ellipse projected in 3D) ---
  const drawOrbitRing = (ctx, e, time) => {
    const { cx, cy, fov } = scene;
    const steps = 64;
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      let [x, y, z] = [e.radius * Math.cos(a), 0, e.radius * Math.sin(a)];
      [x, y, z] = rotX(x, y, z, e.incl);
      [x, y, z] = rotY(x, y, z, e.lan);
      const p = project(x, y, z, cx, cy, fov);
      points.push({ ...p, z });
    }
    // Depth-fade: front is brighter
    ctx.save();
    ctx.lineWidth = 0.5;
    for (let i = 0; i < steps; i++) {
      const p0 = points[i], p1 = points[i + 1];
      const depth = clamp((p0.z + scene.nucleusR * 3) / (scene.nucleusR * 6), 0, 1);
      const alpha = 0.04 + depth * 0.09;
      ctx.strokeStyle = `rgba(120,200,240,${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(p0.sx, p0.sy);
      ctx.lineTo(p1.sx, p1.sy);
      ctx.stroke();
    }
    ctx.restore();
  };

  // --- Electron trail + head ---
  const drawElectron = (ctx, bloomCtxRef, e, time) => {
    const { cx, cy, fov } = scene;
    if (e.trail.length < 2) return;

    // Draw trail
    for (let i = 0; i < e.trail.length; i++) {
      const tp = e.trail[i];
      const age = i / e.trail.length;          // 0 = oldest, 1 = newest
      const alpha = age * age * 0.55;
      if (alpha < 0.01) continue;
      const fontSize = Math.max(6, Math.round(6 + tp.scale * 7 * age));
      ctx.font = `${fontSize}px ${MONO_FONT}`;
      ctx.textBaseline = 'middle';
      const trailCh = TRAIL_CHARS[Math.floor(age * (TRAIL_CHARS.length - 1))];
      const [rr, gg, bb] = e.rgb;
      ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha.toFixed(3)})`;
      ctx.fillText(trailCh, tp.sx, tp.sy);
    }

    // Draw head (newest trail point)
    const head = e.trail[e.trail.length - 1];
    const flashT   = time * 0.004 + e.flashPhase;
    const flashOn  = Math.sin(flashT) > 0.72;
    const headChar = flashOn
      ? FLASH_CHARS[Math.floor(time * 0.012 + e.flashPhase) % FLASH_CHARS.length]
      : e.glyph;
    const headSize = Math.max(8, Math.round(8 + head.scale * 9));
    const alpha    = flashOn ? 1.0 : 0.92;
    const [rr, gg, bb] = e.rgb;

    ctx.font = `bold ${headSize}px ${MONO_FONT}`;
    ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha})`;
    ctx.fillText(headChar, head.sx, head.sy);

    // Bloom for head
    bloomCtxRef.font = ctx.font;
    bloomCtxRef.textBaseline = 'middle';
    bloomCtxRef.fillStyle = `rgba(${rr},${gg},${bb},${(alpha * 0.6).toFixed(3)})`;
    bloomCtxRef.fillText(headChar, head.sx, head.sy);
  };

  // --- Update electron trails ---
  const updateElectrons = (time) => {
    for (const e of scene.electrons) {
      const [x, y, z] = electronPos3D(e, time);
      const p = project(x, y, z, scene.cx, scene.cy, scene.fov);
      e.trail.push({ sx: p.sx, sy: p.sy, scale: p.scale });
      if (e.trail.length > e.trailLen) e.trail.shift();
    }
  };

  // --- Render signal surface to offscreen canvases ---
  const renderSignalSurface = (time) => {
    // Clear all offscreen
    signalCtx.clearRect(0, 0, scene.width, scene.height);
    bloomCtx.clearRect(0, 0, scene.width, scene.height);

    // Background
    drawBackground(signalCtx, time);

    // Sort electrons by Z so back ones draw first (painter's algorithm)
    const sorted = scene.electrons
      .map(e => {
        const [x, y, z] = electronPos3D(e, time);
        return { e, z };
      })
      .sort((a, b) => a.z - b.z);

    // Orbit rings (back-to-front)
    for (const { e } of sorted) {
      drawOrbitRing(signalCtx, e, time);
    }

    // Electrons behind nucleus
    for (const { e, z } of sorted) {
      if (z < 0) drawElectron(signalCtx, bloomCtx, e, time);
    }

    // Nucleus on top of behind-electrons
    drawNucleus(signalCtx, bloomCtx, time);

    // Electrons in front of nucleus
    for (const { e, z } of sorted) {
      if (z >= 0) drawElectron(signalCtx, bloomCtx, e, time);
    }
  };

  // --- Curved CRT composite (same trick as app.js) ---
  const drawCurvedSurface = (src, alpha, xShift, curvature) => {
    const { width: w, height: h } = scene;
    context.save();
    context.globalAlpha = alpha;
    if (curvature > 0.01) {
      const bend = curvature * 18;
      context.beginPath();
      context.moveTo(0, 0);
      context.bezierCurveTo(bend, -bend, w - bend, -bend, w, 0);
      context.bezierCurveTo(w + bend, bend, w + bend, h - bend, w, h);
      context.bezierCurveTo(w - bend, h + bend, bend, h + bend, 0, h);
      context.bezierCurveTo(-bend, h - bend, -bend, bend, 0, 0);
      context.closePath();
      context.save();
      context.clip();
    }
    context.drawImage(src, xShift, 0, w, h);
    if (curvature > 0.01) context.restore();
    context.restore();
  };

  // --- Scanlines ---
  const drawScanlines = () => {
    if (!scene.scanlinePattern) return;
    context.save();
    context.globalAlpha = 1;
    context.fillStyle = scene.scanlinePattern;
    context.fillRect(0, 0, scene.width, scene.height);
    context.restore();
  };

  // --- Vignette ---
  const drawVignette = () => {
    context.save();
    context.globalAlpha = 1;
    context.drawImage(vigCanvas, 0, 0, scene.width, scene.height);
    context.restore();
  };

  // --- Composite everything to main canvas ---
  const compositeFrame = (time) => {
    const elapsed = time - scene.startedAt;
    const curvature = scene.reduced ? 1 : easeOutQuad(Math.min(elapsed / 3200, 1));
    const chromaShift = scene.reduced ? 0 : 3 * Math.exp(-elapsed / 800);

    // Reset main canvas
    context.clearRect(0, 0, scene.width, scene.height);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';

    drawCurvedSurface(signalCanvas, 1.0, 0, curvature);

    // Bloom pass
    context.save();
    context.globalCompositeOperation = 'screen';
    context.filter = `blur(${Math.round(scene.scale * 5)}px)`;
    drawCurvedSurface(bloomCanvas, 0.44, 0, curvature);
    context.restore();
    context.filter = 'none';

    // Chromatic aberration on startup
    if (!scene.reduced && chromaShift > 0.4) {
      context.save();
      context.globalCompositeOperation = 'screen';
      drawCurvedSurface(signalCanvas, 0.07,  chromaShift, curvature);
      drawCurvedSurface(signalCanvas, 0.05, -chromaShift, curvature);
      context.restore();
    }

    drawScanlines();
    drawVignette();
  };

  // --- Animation loop ---
  const tick = (time) => {
    scene.rafId = 0;
    updateElectrons(time);
    renderSignalSurface(time);
    compositeFrame(time);
    if (!scene.reduced) {
      scene.rafId = window.requestAnimationFrame(t => tick(t));
    }
  };

  const stopAnimation = () => {
    if (scene.rafId) {
      window.cancelAnimationFrame(scene.rafId);
      scene.rafId = 0;
    }
  };

  const renderScene = () => {
    stopAnimation();
    syncMeasurements();
    scene.startedAt = performance.now();
    // Pre-seed trails so electrons appear immediately
    for (let i = 0; i < 40; i++) {
      updateElectrons(scene.startedAt - (40 - i) * 16);
    }
    if (scene.reduced) {
      updateElectrons(scene.startedAt);
      renderSignalSurface(scene.startedAt);
      compositeFrame(scene.startedAt);
      return;
    }
    scene.rafId = window.requestAnimationFrame(t => tick(t));
  };

  // --- Event listeners ---
  const handleResize = () => {
    window.clearTimeout(scene.resizeTimer);
    scene.resizeTimer = window.setTimeout(() => renderScene(), 80);
  };

  const handleMotion = () => {
    scene.reduced = prefersReducedMotion.matches;
    renderScene();
  };

  try {
    renderScene();
    window.addEventListener('resize', handleResize, { passive: true });
    if (typeof prefersReducedMotion.addEventListener === 'function') {
      prefersReducedMotion.addEventListener('change', handleMotion);
    } else if (typeof prefersReducedMotion.addListener === 'function') {
      prefersReducedMotion.addListener(handleMotion);
    }
  } catch (err) {
    // Fallback: draw error state on main canvas
    const rect = circuitBoard.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    canvas.width  = w; canvas.height = h;
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;
    context.fillStyle = '#061434';
    context.fillRect(0, 0, w, h);
    context.strokeStyle = 'rgba(223,250,255,0.9)';
    context.lineWidth = 2;
    context.strokeRect(24, 24, w - 48, h - 48);
    context.fillStyle = 'rgba(239,252,255,1)';
    context.font = '16px monospace';
    context.fillText('[ ATOM SURFACE FAULT ]', 48, 56);
    context.font = '13px monospace';
    context.fillText(String(err?.message || err), 48, 90);
    console.error(err);
  }

}());
