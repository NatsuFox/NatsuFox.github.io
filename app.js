const circuitBoard = document.querySelector('[data-circuit-board]');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const backgroundGlyphs = '  ..,:;-=+*#%@01/\\|<>[]{}';
const pulseGlyphs = '=-~+*#';
const monoFont = '"IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace';

const panelCatalog = [
  { label: 'IDENTITY GLYPH', size: 'md', lines: [' /\\__/\\ ', '< FOX-SIG >', ' \\_==_/ '] },
  { label: 'ASCII BLOOM', size: 'sm', lines: [' ..+.. ', '.<*>. ', '<#0#> '] },
  { label: 'SIGNAL MAP', size: 'md', lines: ['o--o--o', ' \\/ \\ |', 'o--o--o', ' | /\\/ '] },
  { label: 'WAVE GARDEN', size: 'md', lines: ['~^~~^~~', ' /\\ /\\ ', '<><><><', ' \\/ \\/ '] },
  { label: 'MEMORY KNOT', size: 'sm', lines: [' /\\=/\\ ', ' \\/_\\/ ', ' /\\_/\\ '] },
  { label: 'PULSE POEM', size: 'md', lines: ['root=>bus', 'name=>glw', 'pulse>home'] },
  { label: 'CHIP FOX', size: 'sm', lines: ['[\\__/]', '[ o  o]', '[ /__\\]'] },
  { label: 'NODE FIELD', size: 'lg', lines: ['o-o-o-o-o', '|\\|/|\\|', 'o-o#o-o-o', '|/|\\|/|', 'o-o-o-o-o'] },
  { label: 'CARRIER WAVE', size: 'sm', lines: ['~><~><~', ' <><>< ', '~><~><~'] },
  { label: 'CACHE BRAID', size: 'md', lines: ['=/\\=/\\=', '\\/==\\/=', '=/\\==/\\'] },
];

const cpuLines = [
  '.======================.',
  '|[ ROOT BUS // SIGNAL ]|',
  '|< TRACE MATRIX 01/0 >|',
  '|[ GLASS CORE :: NF  ]|',
  "'======================'",
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const mix = (start, end, progress) => start + (end - start) * progress;
const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);
const easeOutQuad = (value) => value * (2 - value);

const buildNoiseRow = (length, seed) =>
  Array.from({ length }, (_, index) => {
    const noise = Math.sin(seed * 0.37 + index * 1.71) + Math.cos(seed * 0.13 + index * 0.87);
    return backgroundGlyphs[Math.abs(Math.floor(noise * 1000)) % backgroundGlyphs.length];
  }).join('');

const buildNoiseLines = (panel) =>
  panel.lines.map((line, lineIndex) => buildNoiseRow(Math.max(8, line.length), panel.index * 9 + lineIndex * 3));

if (circuitBoard) {
  try {
    const canvas = circuitBoard.querySelector('[data-board-canvas]');
    const context = canvas?.getContext('2d');

    if (!canvas || !context) {
      throw new Error('Circuit board canvas could not be initialized.');
    }

    const signalCanvas = document.createElement('canvas');
    const bloomCanvas = document.createElement('canvas');
    const noiseCanvas = document.createElement('canvas');
    const vignetteCanvas = document.createElement('canvas');
    const signalContext = signalCanvas.getContext('2d');
    const bloomContext = bloomCanvas.getContext('2d');
    const noiseContext = noiseCanvas.getContext('2d');
    const vignetteContext = vignetteCanvas.getContext('2d');

    if (!signalContext || !bloomContext || !noiseContext || !vignetteContext) {
      throw new Error('Signal surface canvases could not be initialized.');
    }

    const panelSizeMap = {
      sm: { width: 176, height: 100 },
      md: { width: 214, height: 118 },
      lg: { width: 252, height: 140 },
    };

    const panels = panelCatalog.map((entry, index) => ({
      ...entry,
      index,
      active: false,
      revealed: false,
      revealedAt: 0,
      slotIndex: null,
      mountedAt: 0,
      nextCycleAt: 0,
      lastShuffle: 0,
      noiseLines: buildNoiseLines({ ...entry, index }),
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      center: { x: 0, y: 0 },
    }));

    const scene = {
      width: 0,
      height: 0,
      dpr: 1,
      scale: 1,
      cpu: { x: 0, y: 0, width: 0, height: 0, radius: 0 },
      slots: [],
      pinRails: { top: [], right: [], bottom: [], left: [] },
      rafId: 0,
      resizeTimer: 0,
      reduced: prefersReducedMotion.matches,
      startedAt: performance.now(),
      lastRecycleAt: 0,
      lastNoiseTime: -999,
      curvature: 0,
      scanlinePattern: null,
    };

    const scaleMetric = (value) => value * scene.scale;

    const syncMainCanvas = () => {
      canvas.width = Math.max(1, Math.round(scene.width * scene.dpr));
      canvas.height = Math.max(1, Math.round(scene.height * scene.dpr));
      canvas.style.width = `${scene.width}px`;
      canvas.style.height = `${scene.height}px`;
      context.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
    };

    const syncOffscreenCanvas = (targetCanvas, targetContext) => {
      targetCanvas.width = Math.max(1, Math.round(scene.width));
      targetCanvas.height = Math.max(1, Math.round(scene.height));
      targetContext.setTransform(1, 0, 0, 1, 0, 0);
    };

    const buildScanlinePattern = () => {
      const patCanvas = document.createElement('canvas');
      patCanvas.width = 1;
      patCanvas.height = 3;
      const patCtx = patCanvas.getContext('2d');
      patCtx.fillStyle = 'rgba(0,0,0,0.12)';
      patCtx.fillRect(0, 2, 1, 1);
      scene.scanlinePattern = context.createPattern(patCanvas, 'repeat') || null;
    };

    const buildVignetteCache = () => {
      vignetteCanvas.width = Math.max(1, Math.round(scene.width));
      vignetteCanvas.height = Math.max(1, Math.round(scene.height));
      const vCtx = vignetteContext;
      vCtx.clearRect(0, 0, scene.width, scene.height);
      const vignette = vCtx.createRadialGradient(
        scene.width * 0.5, scene.height * 0.5, scene.width * 0.2,
        scene.width * 0.5, scene.height * 0.5, scene.width * 0.68
      );
      vignette.addColorStop(0, 'rgba(255,255,255,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.52)');
      vCtx.fillStyle = vignette;
      vCtx.fillRect(0, 0, scene.width, scene.height);
    };

    const clearContext = (targetContext) => {
      targetContext.setTransform(targetContext === context ? scene.dpr : 1, 0, 0, targetContext === context ? scene.dpr : 1, 0, 0);
      targetContext.clearRect(0, 0, scene.width, scene.height);
      targetContext.globalAlpha = 1;
      targetContext.globalCompositeOperation = 'source-over';
      targetContext.filter = 'none';
      targetContext.shadowBlur = 0;
      targetContext.shadowColor = 'transparent';
    };

    const drawRoundedRectPath = (targetContext, x, y, width, height, radius) => {
      const r = Math.min(radius, width / 2, height / 2);
      targetContext.beginPath();
      if (typeof targetContext.roundRect === 'function') {
        targetContext.roundRect(x, y, width, height, r);
        return;
      }
      targetContext.moveTo(x + r, y);
      targetContext.arcTo(x + width, y, x + width, y + height, r);
      targetContext.arcTo(x + width, y + height, x, y + height, r);
      targetContext.arcTo(x, y + height, x, y, r);
      targetContext.arcTo(x, y, x + width, y, r);
    };

    const getPanelMetrics = (panel) => {
      const preset = panelSizeMap[panel.size] || panelSizeMap.md;
      return {
        width: Math.round(preset.width * scene.scale),
        height: Math.round(preset.height * scene.scale),
      };
    };

    const buildSlots = () => {
      const width = scene.width;
      const height = scene.height;
      const insetX = scaleMetric(116);
      const insetY = scaleMetric(96);
      scene.slots = [
        { side: 'top', x: width * 0.13, y: insetY },
        { side: 'top', x: width * 0.31, y: insetY + scaleMetric(8) },
        { side: 'top', x: width * 0.50, y: insetY },
        { side: 'top', x: width * 0.69, y: insetY + scaleMetric(8) },
        { side: 'top', x: width * 0.87, y: insetY },
        { side: 'right', x: width - insetX, y: height * 0.23 },
        { side: 'right', x: width - insetX + scaleMetric(8), y: height * 0.49 },
        { side: 'right', x: width - insetX, y: height * 0.76 },
        { side: 'bottom', x: width * 0.80, y: height - insetY },
        { side: 'bottom', x: width * 0.54, y: height - insetY + scaleMetric(4) },
        { side: 'bottom', x: width * 0.28, y: height - insetY },
        { side: 'left', x: insetX, y: height * 0.76 },
        { side: 'left', x: insetX - scaleMetric(8), y: height * 0.49 },
        { side: 'left', x: insetX, y: height * 0.23 },
      ];
    };

    const buildRail = (side) => {
      const count = 12;
      return Array.from({ length: count }, (_, index) => {
        const progress = count === 1 ? 0.5 : index / (count - 1);
        if (side === 'top' || side === 'bottom') {
          return {
            x: mix(scene.cpu.x + scaleMetric(20), scene.cpu.x + scene.cpu.width - scaleMetric(20), progress),
            y: side === 'top' ? scene.cpu.y - scaleMetric(12) : scene.cpu.y + scene.cpu.height + scaleMetric(12),
            width: scaleMetric(12),
            height: scaleMetric(4),
          };
        }
        return {
          x: side === 'left' ? scene.cpu.x - scaleMetric(12) : scene.cpu.x + scene.cpu.width + scaleMetric(12),
          y: mix(scene.cpu.y + scaleMetric(20), scene.cpu.y + scene.cpu.height - scaleMetric(20), progress),
          width: scaleMetric(4),
          height: scaleMetric(12),
        };
      });
    };

    const availableSlotIndexes = (currentPanel = null) =>
      scene.slots
        .map((slot, index) => ({ slot, index }))
        .filter(({ index }) => panels.every((panel) => !panel.active || panel === currentPanel || panel.slotIndex !== index))
        .map(({ index }) => index);

    const positionPanel = (panel) => {
      const slot = scene.slots[panel.slotIndex];
      if (!slot) return;
      const metrics = getPanelMetrics(panel);
      const left = clamp(slot.x - metrics.width / 2, scaleMetric(18), scene.width - metrics.width - scaleMetric(18));
      const top = clamp(slot.y - metrics.height / 2, scaleMetric(18), scene.height - metrics.height - scaleMetric(18));
      panel.left = left;
      panel.top = top;
      panel.width = metrics.width;
      panel.height = metrics.height;
      panel.center = { x: left + metrics.width / 2, y: top + metrics.height / 2 };
    };

    const syncMeasurements = () => {
      const rect = circuitBoard.getBoundingClientRect();
      scene.width = Math.max(1, Math.round(rect.width));
      scene.height = Math.max(1, Math.round(rect.height));
      scene.scale = clamp(scene.width / 1280, 0.68, 1.08);
      scene.dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      scene.cpu = {
        x: scene.width / 2 - scaleMetric(168),
        y: scene.height / 2 - scaleMetric(142),
        width: scaleMetric(336),
        height: scaleMetric(284),
        radius: scaleMetric(28),
      };
      buildSlots();
      scene.pinRails = {
        top: buildRail('top'),
        right: buildRail('right'),
        bottom: buildRail('bottom'),
        left: buildRail('left'),
      };
      syncMainCanvas();
      syncOffscreenCanvas(signalCanvas, signalContext);
      syncOffscreenCanvas(bloomCanvas, bloomContext);
      syncOffscreenCanvas(noiseCanvas, noiseContext);
      scene.lastNoiseTime = -999;
      buildScanlinePattern();
      buildVignetteCache();
      panels.forEach((panel) => {
        if (panel.active) {
          positionPanel(panel);
        }
      });
    };

    const deactivatePanel = (panel) => {
      panel.active = false;
      panel.revealed = false;
      panel.slotIndex = null;
    };

    const revealPanel = (panel, time) => {
      if (panel.revealed) return;
      panel.revealed = true;
      panel.revealedAt = time;
    };

    const activatePanel = (panel, time) => {
      const available = availableSlotIndexes(panel);
      if (!available.length) return;
      panel.slotIndex = available[Math.floor(Math.random() * available.length)];
      panel.active = true;
      panel.revealed = false;
      panel.revealedAt = 0;
      panel.mountedAt = time;
      panel.nextCycleAt = time + 2800 + Math.random() * 1600;
      panel.lastShuffle = 0;
      panel.noiseLines = buildNoiseLines(panel);
      positionPanel(panel);
    };

    const getAnchorPoint = (panel) => {
      const slot = scene.slots[panel.slotIndex];
      if (!slot) {
        return { x: scene.width / 2, y: scene.height / 2, side: 'top' };
      }
      if (slot.side === 'top') {
        return {
          x: clamp(panel.center.x, scene.cpu.x + scaleMetric(24), scene.cpu.x + scene.cpu.width - scaleMetric(24)),
          y: scene.cpu.y,
          side: 'top',
        };
      }
      if (slot.side === 'bottom') {
        return {
          x: clamp(panel.center.x, scene.cpu.x + scaleMetric(24), scene.cpu.x + scene.cpu.width - scaleMetric(24)),
          y: scene.cpu.y + scene.cpu.height,
          side: 'bottom',
        };
      }
      if (slot.side === 'left') {
        return {
          x: scene.cpu.x,
          y: clamp(panel.center.y, scene.cpu.y + scaleMetric(24), scene.cpu.y + scene.cpu.height - scaleMetric(24)),
          side: 'left',
        };
      }
      return {
        x: scene.cpu.x + scene.cpu.width,
        y: clamp(panel.center.y, scene.cpu.y + scaleMetric(24), scene.cpu.y + scene.cpu.height - scaleMetric(24)),
        side: 'right',
      };
    };

    const buildTracePoints = (panel) => {
      const slot = scene.slots[panel.slotIndex];
      const anchor = getAnchorPoint(panel);
      const offset = scaleMetric(24);
      const approach = scaleMetric(18 + (panel.index % 3) * 6);

      if (slot.side === 'top') {
        const breakoutY = scene.cpu.y - offset;
        const laneY = panel.top + panel.height + approach;
        return [anchor, { x: anchor.x, y: breakoutY }, { x: anchor.x, y: laneY }, { x: panel.center.x, y: laneY }, { x: panel.center.x, y: panel.top + panel.height }];
      }
      if (slot.side === 'bottom') {
        const breakoutY = scene.cpu.y + scene.cpu.height + offset;
        const laneY = panel.top - approach;
        return [anchor, { x: anchor.x, y: breakoutY }, { x: anchor.x, y: laneY }, { x: panel.center.x, y: laneY }, { x: panel.center.x, y: panel.top }];
      }
      if (slot.side === 'left') {
        const breakoutX = scene.cpu.x - offset;
        const laneX = panel.left + panel.width + approach;
        return [anchor, { x: breakoutX, y: anchor.y }, { x: laneX, y: anchor.y }, { x: laneX, y: panel.center.y }, { x: panel.left + panel.width, y: panel.center.y }];
      }
      const breakoutX = scene.cpu.x + scene.cpu.width + offset;
      const laneX = panel.left - approach;
      return [anchor, { x: breakoutX, y: anchor.y }, { x: laneX, y: anchor.y }, { x: laneX, y: panel.center.y }, { x: panel.left, y: panel.center.y }];
    };

    const measurePolyline = (points) => {
      const segments = [];
      let total = 0;
      for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1];
        const end = points[index];
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        segments.push({ start, end, length, startDistance: total });
        total += length;
      }
      return { segments, total };
    };

    const pointAtDistance = (metric, distance) => {
      if (!metric.segments.length) {
        return { x: 0, y: 0 };
      }
      const target = clamp(distance, 0, metric.total);
      for (const segment of metric.segments) {
        if (target <= segment.startDistance + segment.length || segment === metric.segments[metric.segments.length - 1]) {
          const progress = segment.length === 0 ? 0 : (target - segment.startDistance) / segment.length;
          return {
            x: mix(segment.start.x, segment.end.x, progress),
            y: mix(segment.start.y, segment.end.y, progress),
          };
        }
      }
      const last = metric.segments[metric.segments.length - 1];
      return { x: last.end.x, y: last.end.y };
    };

    const buildVisiblePoints = (metric, distance) => {
      if (!metric.segments.length) return [];
      const target = clamp(distance, 0, metric.total);
      const points = [metric.segments[0].start];
      for (const segment of metric.segments) {
        if (segment.startDistance + segment.length <= target) {
          points.push(segment.end);
          continue;
        }
        points.push(pointAtDistance(metric, target));
        break;
      }
      return points;
    };

    const drawPolyline = (targetContext, points) => {
      if (!points.length) return;
      targetContext.beginPath();
      targetContext.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) {
        targetContext.lineTo(points[index].x, points[index].y);
      }
    };

    const drawSignalWindow = (targetContext, x, y, width, height, radius, strength = 1) => {
      const fill = targetContext.createLinearGradient(x, y, x, y + height);
      fill.addColorStop(0, `rgba(255, 255, 255, ${0.08 * strength})`);
      fill.addColorStop(0.18, `rgba(12, 26, 56, ${0.64 * strength})`);
      fill.addColorStop(1, `rgba(7, 15, 31, ${0.86 * strength})`);
      drawRoundedRectPath(targetContext, x, y, width, height, radius);
      targetContext.fillStyle = fill;
      targetContext.fill();

      targetContext.save();
      drawRoundedRectPath(targetContext, x, y, width, height, radius);
      targetContext.clip();
      const gloss = targetContext.createLinearGradient(x, y, x + width, y + height);
      gloss.addColorStop(0, 'rgba(255,255,255,0.16)');
      gloss.addColorStop(0.35, 'rgba(255,255,255,0.03)');
      gloss.addColorStop(1, 'rgba(255,255,255,0)');
      targetContext.fillStyle = gloss;
      targetContext.fillRect(x, y, width, height);
      targetContext.restore();

      drawRoundedRectPath(targetContext, x, y, width, height, radius);
      targetContext.strokeStyle = `rgba(214, 247, 255, ${0.22 + strength * 0.16})`;
      targetContext.lineWidth = scaleMetric(1.2);
      targetContext.stroke();

      targetContext.strokeStyle = `rgba(120, 208, 245, ${0.18 + strength * 0.12})`;
      targetContext.lineWidth = scaleMetric(1);
      targetContext.beginPath();
      targetContext.moveTo(x + scaleMetric(10), y + scaleMetric(12));
      targetContext.lineTo(x + width - scaleMetric(10), y + scaleMetric(12));
      targetContext.stroke();
    };

    const drawNoiseField = (time) => {
      const cx = scene.width * 0.5;
      const cy = scene.height * 0.5;
      const speed = 0.00028;
      const scroll = (time * speed) % 1;

      noiseContext.fillStyle = '#000d1a';
      noiseContext.fillRect(0, 0, scene.width, scene.height);

      const layers = 32;
      const baseSize = Math.round(scaleMetric(17));
      const tick = Math.floor(time * 0.05);

      // Radial rays from vanishing point (center) to screen boundary.
      // Each ray is one sequence of glyphs extending to the far edge.
      const hRays = 18;
      const vRays = 10;
      const rays = [];

      for (let i = 0; i < hRays; i++) {
        const t = (i + 0.5) / hRays;
        const ex = t * scene.width;
        const dx0 = ex - cx, dy0 = -cy;
        const len0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
        rays.push({ ux: dx0 / len0, uy: dy0 / len0, maxDist: len0 });
        const dx1 = ex - cx, dy1 = scene.height - cy;
        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        rays.push({ ux: dx1 / len1, uy: dy1 / len1, maxDist: len1 });
      }

      for (let i = 0; i < vRays; i++) {
        const t = (i + 0.5) / vRays;
        const ey = t * scene.height;
        const dx2 = -cx, dy2 = ey - cy;
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        rays.push({ ux: dx2 / len2, uy: dy2 / len2, maxDist: len2 });
        const dx3 = scene.width - cx, dy3 = ey - cy;
        const len3 = Math.sqrt(dx3 * dx3 + dy3 * dy3);
        rays.push({ ux: dx3 / len3, uy: dy3 / len3, maxDist: len3 });
      }

      const rg = (ri, li) => {
        const h = (ri * 7919 + li * 1301 + tick * 13) & 0x7fffffff;
        return backgroundGlyphs[h % backgroundGlyphs.length];
      };
      const ra = (ri, li, base) => {
        const h = (ri * 6271 + li * 1009 + tick * 17) & 0x7fffffff;
        return base * (0.45 + 0.55 * ((h % 100) / 100));
      };

      rays.forEach((ray, ri) => {
        for (let li = 0; li < layers; li++) {
          // depth 0 = near screen edge, depth 1 = far (vanishing point)
          // scroll drives glyphs flying toward viewer
          const depth = 1 - ((li / layers) + scroll) % 1;
          const dist = depth * ray.maxDist;
          if (dist < 2) continue;

          const x = cx + ray.ux * dist;
          const y = cy + ray.uy * dist;

          const nearness = 1 - depth;
          const fontSize = Math.max(7, Math.round(baseSize * (0.3 + 0.7 * nearness)));
          const baseAlpha = clamp(nearness * 1.1 - 0.05, 0.04, 0.95) *
            (0.7 + 0.3 * Math.sin(time * 0.006 + ri * 1.37 + li * 0.5));
          const r = Math.round(60  + nearness * 180);
          const g = Math.round(120 + nearness * 130);
          const b = Math.round(200 + nearness * 55);
          const a = ra(ri, li, baseAlpha);

          noiseContext.font = `${fontSize}px ${monoFont}`;
          noiseContext.textBaseline = 'middle';
          noiseContext.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
          noiseContext.fillText(rg(ri, li), x, y);
        }
      });

      // Dynamic radial fog — breathes in alpha and inner radius independently.
      const fogBreath = 0.5 + 0.5 * Math.sin(time * 0.0019);
      const fogPulse  = 0.5 + 0.5 * Math.sin(time * 0.0031 + 1.3);
      const fogWaver  = 0.5 + 0.5 * Math.sin(time * 0.0013 + 2.7);
      // Inner fog opacity pulses between very dim and moderately dim.
      const fogAlpha0 = 0.10 + 0.12 * fogPulse;          // center: 0.10–0.22
      const fogAlpha1 = 0.06 + 0.07 * fogBreath;          // mid:    0.06–0.13
      // Inner radius breathes so the clear core expands/contracts visibly.
      const fogInner  = Math.min(cx, cy) * (0.08 + 0.14 * fogWaver);
      const fogOuter  = Math.max(cx, cy) * 1.6;           // always covers full canvas
      const fog = noiseContext.createRadialGradient(cx, cy, fogInner, cx, cy, fogOuter);
      fog.addColorStop(0,    `rgba(0,10,26,${fogAlpha0.toFixed(3)})`);
      fog.addColorStop(0.25, `rgba(0,10,26,${fogAlpha1.toFixed(3)})`);
      fog.addColorStop(0.6,  'rgba(0,10,26,0.02)');
      fog.addColorStop(1,    'rgba(0,0,0,0)');
      noiseContext.fillStyle = fog;
      noiseContext.fillRect(0, 0, scene.width, scene.height);

      signalContext.drawImage(noiseCanvas, 0, 0);
    };

    const drawGlowText = (text, x, y, fontSize, color, alpha = 1) => {
      bloomContext.save();
      bloomContext.font = `${Math.round(fontSize)}px ${monoFont}`;
      bloomContext.textBaseline = 'top';
      bloomContext.fillStyle = color;
      bloomContext.globalAlpha = alpha;
      bloomContext.fillText(text, x, y);
      bloomContext.restore();
    };

    const drawCpuZone = (time) => {
      drawSignalWindow(signalContext, scene.cpu.x, scene.cpu.y, scene.cpu.width, scene.cpu.height, scene.cpu.radius, 1.2);

      const pulse = (Math.sin(time * 0.0036) + 1) / 2;
      signalContext.save();
      signalContext.strokeStyle = `rgba(225, 250, 255, ${0.18 + pulse * 0.22})`;
      signalContext.lineWidth = scaleMetric(1.1);
      signalContext.strokeRect(scene.cpu.x + scaleMetric(14), scene.cpu.y + scaleMetric(14), scene.cpu.width - scaleMetric(28), scene.cpu.height - scaleMetric(28));
      signalContext.restore();

      signalContext.save();
      signalContext.font = `${Math.round(scaleMetric(11))}px ${monoFont}`;
      signalContext.textBaseline = 'top';
      signalContext.fillStyle = 'rgba(205, 245, 255, 0.94)';
      signalContext.fillText('[ SIGNAL PROCESSOR ]', scene.cpu.x + scaleMetric(18), scene.cpu.y + scaleMetric(18));
      drawGlowText('[ SIGNAL PROCESSOR ]', scene.cpu.x + scaleMetric(18), scene.cpu.y + scaleMetric(18), scaleMetric(11), 'rgba(220, 250, 255, 0.9)', 0.9);

      const lineHeight = scaleMetric(20);
      signalContext.font = `${Math.round(scaleMetric(16))}px ${monoFont}`;
      signalContext.fillStyle = 'rgba(240, 252, 255, 0.98)';
      cpuLines.forEach((line, index) => {
        const y = scene.cpu.y + scaleMetric(52) + index * lineHeight;
        signalContext.fillText(line, scene.cpu.x + scaleMetric(18), y);
        drawGlowText(line, scene.cpu.x + scaleMetric(18), y, scaleMetric(16), 'rgba(210, 249, 255, 1)', 0.78);
      });

      signalContext.font = `${Math.round(scaleMetric(9.6))}px ${monoFont}`;
      signalContext.fillStyle = 'rgba(184, 236, 255, 0.72)';
      signalContext.fillText('[ CURVED / CHROMA / SCAN ]', scene.cpu.x + scaleMetric(18), scene.cpu.y + scene.cpu.height - scaleMetric(30));
      signalContext.restore();
    };

    const drawPanelZone = (panel, time, staticMode = false) => {
      if (!panel.active) return;
      const appearProgress = staticMode ? 1 : clamp((time - panel.mountedAt) / 420, 0, 1);
      const alpha = easeOutCubic(appearProgress);
      const revealProgress = panel.revealed ? (staticMode ? 1 : clamp((time - panel.revealedAt) / 260, 0, 1)) : 0;
      const lines = revealProgress >= 0.98 ? panel.lines : panel.noiseLines;

      signalContext.save();
      signalContext.globalAlpha = alpha;
      signalContext.translate(0, mix(scaleMetric(10), 0, alpha));
      drawSignalWindow(signalContext, panel.left, panel.top, panel.width, panel.height, scaleMetric(16), 0.9);

      signalContext.font = `${Math.round(scaleMetric(9.2))}px ${monoFont}`;
      signalContext.textBaseline = 'top';
      signalContext.fillStyle = 'rgba(214, 248, 255, 0.98)';
      signalContext.fillText(panel.label, panel.left + scaleMetric(14), panel.top + scaleMetric(12));

      const artY = panel.top + scaleMetric(31);
      signalContext.font = `${Math.round(scaleMetric(12.4))}px ${monoFont}`;
      signalContext.fillStyle = panel.revealed ? 'rgba(245, 253, 255, 1)' : 'rgba(202, 244, 255, 0.94)';
      lines.forEach((line, index) => {
        const y = artY + index * scaleMetric(15);
        signalContext.fillText(line, panel.left + scaleMetric(14), y);
        if (panel.revealed) {
          drawGlowText(line, panel.left + scaleMetric(14), y, scaleMetric(12.4), 'rgba(214, 249, 255, 1)', 0.64);
        }
      });

      if (panel.revealed && revealProgress < 1) {
        signalContext.globalAlpha = 1 - revealProgress;
        signalContext.fillStyle = 'rgba(180, 238, 255, 0.78)';
        panel.noiseLines.forEach((line, index) => {
          signalContext.fillText(line, panel.left + scaleMetric(14), artY + index * scaleMetric(15));
        });
      }
      signalContext.restore();
    };

    const renderPinRails = (time) => {
      const sides = ['top', 'right', 'bottom', 'left'];
      sides.forEach((side, sideIndex) => {
        const pins = scene.pinRails[side];
        const sweep = ((time * 0.0038) + sideIndex * 2.1) % pins.length;
        pins.forEach((pin, index) => {
          const distance = Math.min(Math.abs(index - sweep), pins.length - Math.abs(index - sweep));
          const intensity = clamp(1 - distance / 2.4, 0.16, 1);
          signalContext.save();
          signalContext.fillStyle = `rgba(213, 246, 255, ${0.12 + intensity * 0.18})`;
          signalContext.fillRect(pin.x - pin.width / 2, pin.y - pin.height / 2, pin.width, pin.height);
          signalContext.font = `${Math.round(scaleMetric(8))}px ${monoFont}`;
          signalContext.textBaseline = 'middle';
          signalContext.fillStyle = `rgba(224, 251, 255, ${0.16 + intensity * 0.44})`;
          signalContext.fillText(side === 'top' || side === 'bottom' ? '=' : '|', pin.x - scaleMetric(2.5), pin.y - scaleMetric(3));
          signalContext.restore();

          if (intensity > 0.5) {
            bloomContext.save();
            bloomContext.fillStyle = 'rgba(220, 250, 255, 0.95)';
            bloomContext.globalAlpha = 0.18 + intensity * 0.28;
            bloomContext.fillRect(pin.x - pin.width / 2, pin.y - pin.height / 2, pin.width, pin.height);
            bloomContext.restore();
          }
        });
      });
    };

    const renderPanelTrace = (panel, time, staticMode = false) => {
      if (!panel.active) return;
      const points = buildTracePoints(panel);
      const metric = measurePolyline(points);
      if (!metric.total) return;
      const progress = staticMode ? 1 : clamp((time - panel.mountedAt) / 960, 0, 1);
      const visibleDistance = metric.total * progress;
      const visiblePoints = buildVisiblePoints(metric, visibleDistance);
      const tip = pointAtDistance(metric, visibleDistance);
      const endPoint = points[points.length - 1];

      signalContext.save();
      signalContext.strokeStyle = 'rgba(118, 198, 255, 0.12)';
      signalContext.lineWidth = scaleMetric(2.2);
      signalContext.setLineDash([scaleMetric(4), scaleMetric(16)]);
      drawPolyline(signalContext, points);
      signalContext.stroke();
      signalContext.setLineDash([]);

      if (visiblePoints.length > 1) {
        signalContext.strokeStyle = 'rgba(232, 251, 255, 0.78)';
        signalContext.lineWidth = scaleMetric(2);
        drawPolyline(signalContext, visiblePoints);
        signalContext.stroke();

        signalContext.font = `${Math.round(scaleMetric(8.8))}px ${monoFont}`;
        signalContext.textBaseline = 'middle';
        signalContext.fillStyle = 'rgba(220, 248, 255, 0.76)';
        for (let distance = scaleMetric(18); distance < visibleDistance; distance += scaleMetric(28)) {
          const point = pointAtDistance(metric, distance);
          const glyph = pulseGlyphs[(Math.floor(distance / scaleMetric(18)) + panel.index) % pulseGlyphs.length];
          signalContext.fillText(glyph, point.x - scaleMetric(3), point.y - scaleMetric(3));
        }
      }

      signalContext.fillStyle = 'rgba(226, 249, 255, 0.3)';
      signalContext.beginPath();
      signalContext.arc(endPoint.x, endPoint.y, scaleMetric(5), 0, Math.PI * 2);
      signalContext.fill();
      signalContext.restore();

      bloomContext.save();
      bloomContext.strokeStyle = 'rgba(199, 246, 255, 0.84)';
      bloomContext.lineWidth = scaleMetric(3.4);
      bloomContext.lineCap = 'round';
      bloomContext.lineJoin = 'round';
      if (visiblePoints.length > 1) {
        drawPolyline(bloomContext, visiblePoints);
        bloomContext.stroke();
      }
      bloomContext.fillStyle = 'rgba(240, 252, 255, 0.98)';
      bloomContext.beginPath();
      bloomContext.arc(tip.x, tip.y, scaleMetric(5.2), 0, Math.PI * 2);
      bloomContext.fill();
      bloomContext.restore();

      if (!panel.revealed && progress >= 0.98) {
        revealPanel(panel, time);
      }
    };

    const renderSignalSurface = (time, staticMode = false) => {
      clearContext(signalContext);
      clearContext(bloomContext);
      drawNoiseField(time);
      renderPinRails(time);
      panels.forEach((panel) => renderPanelTrace(panel, time, staticMode));
      drawCpuZone(time);
      panels.forEach((panel) => drawPanelZone(panel, time, staticMode));
    };

    const drawCurvedSurface = (source, alpha = 1, offsetX = 0, curvature = 1) => {
      context.save();
      context.globalAlpha = alpha;
      const step = 4;
      const sw = source.width;
      for (let y = 0; y < scene.height; y += step) {
        const ny = y / Math.max(scene.height - 1, 1);
        const centered = ny * 2 - 1;
        // Concave: center rows wider (zoomed out), edges narrower (zoomed in).
        const widthScale = 1 + 0.085 * curvature - 0.12 * curvature * centered * centered;
        const sourceY = clamp(y - centered * centered * curvature * 6 + curvature * 2, 0, scene.height - step);
        // Crop source inward instead of shrinking dest — fills edge-to-edge with no black arcs.
        const srcW = clamp(sw * widthScale, 1, sw);
        const srcX = clamp((sw - srcW) / 2 + offsetX, 0, sw - srcW);
        context.drawImage(source, srcX, sourceY, srcW, step, 0, y, scene.width, step + 0.8);
      }
      context.restore();
    };

    const drawScanlines = (time) => {
      if (!scene.scanlinePattern) return;
      context.save();
      const offset = Math.floor((time * 0.02) % 3);
      context.translate(0, offset);
      context.fillStyle = scene.scanlinePattern;
      context.fillRect(0, -offset, scene.width, scene.height + 3);
      context.restore();
    };

    const drawVignette = () => {
      context.save();
      context.drawImage(vignetteCanvas, 0, 0, scene.width, scene.height);
      context.restore();
    };

    const compositeSignalSurface = (time) => {
      clearContext(context);
      const elapsed = time - scene.startedAt;
      const curvature = scene.reduced ? 1 : easeOutQuad(Math.min(elapsed / 3000, 1));
      const chromaShift = scene.reduced ? 0 : 3 * Math.exp(-elapsed / 750);

      drawCurvedSurface(signalCanvas, 1.0, 0, curvature);

      context.save();
      context.globalCompositeOperation = 'screen';
      context.filter = `blur(${Math.round(scaleMetric(5))}px)`;
      drawCurvedSurface(bloomCanvas, 0.42, 0, curvature);
      context.restore();

      if (!scene.reduced && chromaShift > 0.4) {
        context.save();
        context.globalCompositeOperation = 'screen';
        drawCurvedSurface(signalCanvas, 0.08, chromaShift, curvature);
        drawCurvedSurface(signalCanvas, 0.05, -chromaShift, curvature);
        context.restore();
      }

      drawScanlines(time);
      drawVignette();
    };

    const recyclePanel = (panel, time) => {
      deactivatePanel(panel);
      const hiddenPool = panels.filter((candidate) => !candidate.active && candidate !== panel);
      const next = hiddenPool[Math.floor(Math.random() * hiddenPool.length)] || panel;
      activatePanel(next, time);
    };

    const seedPanels = (time) => {
      panels.forEach((panel) => deactivatePanel(panel));
      const shuffled = [...panels].sort(() => Math.random() - 0.5);
      const activePanels = shuffled.slice(0, 8);
      activePanels.forEach((panel) => activatePanel(panel, time));
      activePanels.slice(0, 3).forEach((panel) => {
        panel.mountedAt = time - 1200;
        revealPanel(panel, time - 260);
      });
    };

    const drawScene = (time, staticMode = false) => {
      renderSignalSurface(time, staticMode);
      compositeSignalSurface(time);
    };

    const tick = (time) => {
      scene.rafId = 0;

      panels.forEach((panel) => {
        if (!panel.active || panel.revealed) return;
        if (time - panel.lastShuffle > 118 + panel.index * 24) {
          panel.noiseLines = buildNoiseLines(panel);
          panel.lastShuffle = time;
        }
      });

      const recyclable = panels
        .filter((panel) => panel.active && panel.revealed && time >= panel.nextCycleAt)
        .sort((left, right) => left.nextCycleAt - right.nextCycleAt);

      if (recyclable.length && time - scene.lastRecycleAt > 440) {
        recyclePanel(recyclable[0], time);
        scene.lastRecycleAt = time;
      }

      drawScene(time);

      if (!scene.reduced) {
        scene.rafId = window.requestAnimationFrame((nextTime) => tick(nextTime));
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
      seedPanels(scene.startedAt);
      if (scene.reduced) {
        panels.forEach((panel) => {
          if (panel.active) revealPanel(panel, scene.startedAt);
        });
        drawScene(scene.startedAt, true);
        return;
      }
      scene.rafId = window.requestAnimationFrame((time) => tick(time));
    };

    const handleResize = () => {
      window.clearTimeout(scene.resizeTimer);
      scene.resizeTimer = window.setTimeout(() => {
        renderScene();
      }, 80);
    };

    const handleMotionPreference = () => {
      scene.reduced = prefersReducedMotion.matches;
      renderScene();
    };

    renderScene();
    window.addEventListener('resize', handleResize, { passive: true });

    if (typeof prefersReducedMotion.addEventListener === 'function') {
      prefersReducedMotion.addEventListener('change', handleMotionPreference);
    } else if (typeof prefersReducedMotion.addListener === 'function') {
      prefersReducedMotion.addListener(handleMotionPreference);
    }
  } catch (error) {
    const fallbackCanvas = circuitBoard.querySelector('[data-board-canvas]');
    const fallbackContext = fallbackCanvas?.getContext('2d');
    const rect = circuitBoard.getBoundingClientRect();
    if (fallbackCanvas && fallbackContext) {
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      fallbackCanvas.width = width;
      fallbackCanvas.height = height;
      fallbackCanvas.style.width = `${width}px`;
      fallbackCanvas.style.height = `${height}px`;
      fallbackContext.clearRect(0, 0, width, height);
      fallbackContext.fillStyle = '#061434';
      fallbackContext.fillRect(0, 0, width, height);
      fallbackContext.strokeStyle = 'rgba(223, 250, 255, 0.9)';
      fallbackContext.lineWidth = 2;
      fallbackContext.strokeRect(24, 24, width - 48, height - 48);
      fallbackContext.fillStyle = 'rgba(239, 252, 255, 1)';
      fallbackContext.font = '16px monospace';
      fallbackContext.fillText('[ SIGNAL BOARD FAULT ]', 48, 56);
      fallbackContext.font = '14px monospace';
      fallbackContext.fillText(String(error?.message || error), 48, 92);
    }
    console.error(error);
  }
}
