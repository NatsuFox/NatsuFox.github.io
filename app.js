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
    const signalContext = signalCanvas.getContext('2d');
    const bloomContext = bloomCanvas.getContext('2d');

    if (!signalContext || !bloomContext) {
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
      signalContext.fillStyle = '#061434';
      signalContext.fillRect(0, 0, scene.width, scene.height);

      const aura = signalContext.createRadialGradient(scene.width * 0.5, scene.height * 0.5, scene.width * 0.08, scene.width * 0.5, scene.height * 0.5, scene.width * 0.62);
      aura.addColorStop(0, 'rgba(140, 210, 255, 0.12)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      signalContext.fillStyle = aura;
      signalContext.fillRect(0, 0, scene.width, scene.height);

      const cellWidth = Math.max(7, scaleMetric(9.5));
      const cellHeight = Math.max(10, scaleMetric(13));
      const cols = Math.max(60, Math.floor(scene.width / cellWidth));
      const rows = Math.max(34, Math.floor(scene.height / cellHeight));
      const offsetX = (scene.width - cols * cellWidth) / 2;
      const offsetY = (scene.height - rows * cellHeight) / 2;

      signalContext.font = `${Math.round(cellHeight * 0.94)}px ${monoFont}`;
      signalContext.textBaseline = 'top';

      for (let row = 0; row < rows; row += 1) {
        const ny = row / Math.max(rows - 1, 1);
        for (let col = 0; col < cols; col += 1) {
          const nx = col / Math.max(cols - 1, 1);
          const wave =
            Math.sin(nx * 18 + time * 0.0016) +
            Math.cos(ny * 21 - time * 0.0012) +
            Math.sin((nx + ny) * 14 + time * 0.0021);
          const radial = Math.hypot(nx - 0.5, ny - 0.5);
          const drift = Math.sin(col * 0.17 + row * 0.11 + time * 0.0015);
          const glyphIndex = Math.abs(Math.floor((wave + drift + radial * 4) * 1000)) % backgroundGlyphs.length;
          const glyph = backgroundGlyphs[glyphIndex];
          const alpha = clamp(0.06 + (wave + 3) / 6 * 0.18 - radial * 0.08, 0.03, 0.22);
          signalContext.fillStyle = `rgba(102, 142, 245, ${alpha})`;
          signalContext.fillText(glyph, offsetX + col * cellWidth, offsetY + row * cellHeight);
        }
      }

      for (let band = 0; band < 4; band += 1) {
        const y = ((time * 0.02 + band * scene.height * 0.22) % scene.height) - scaleMetric(18);
        const bandGradient = signalContext.createLinearGradient(0, y, 0, y + scaleMetric(44));
        bandGradient.addColorStop(0, 'rgba(255,255,255,0)');
        bandGradient.addColorStop(0.5, 'rgba(154, 224, 255, 0.035)');
        bandGradient.addColorStop(1, 'rgba(255,255,255,0)');
        signalContext.fillStyle = bandGradient;
        signalContext.fillRect(0, y, scene.width, scaleMetric(44));
      }
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
      drawRoundedRectPath(context, scaleMetric(8), scaleMetric(8), scene.width - scaleMetric(16), scene.height - scaleMetric(16), scaleMetric(28));
      context.clip();
      const step = 2;
      for (let y = 0; y < scene.height; y += step) {
        const ny = y / Math.max(scene.height - 1, 1);
        const centered = ny * 2 - 1;
        const widthScale = 1 - 0.085 * curvature + 0.12 * curvature * centered * centered;
        const sourceY = clamp(y + centered * centered * curvature * 6 - curvature * 2, 0, scene.height - step);
        const destWidth = scene.width * widthScale;
        const destX = (scene.width - destWidth) / 2 + offsetX;
        context.globalAlpha = alpha;
        context.drawImage(source, 0, sourceY, scene.width, step, destX, y, destWidth, step + 0.8);
      }
      context.restore();
    };

    const drawScanlines = (time) => {
      context.save();
      drawRoundedRectPath(context, scaleMetric(8), scaleMetric(8), scene.width - scaleMetric(16), scene.height - scaleMetric(16), scaleMetric(28));
      context.clip();
      context.fillStyle = 'rgba(0, 0, 0, 0.12)';
      const offset = Math.floor((time * 0.02) % 3);
      for (let y = offset; y < scene.height; y += 3) {
        context.fillRect(0, y, scene.width, 1);
      }
      context.restore();
    };

    const drawVignette = () => {
      const vignette = context.createRadialGradient(scene.width * 0.5, scene.height * 0.5, scene.width * 0.2, scene.width * 0.5, scene.height * 0.5, scene.width * 0.68);
      vignette.addColorStop(0, 'rgba(255,255,255,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.52)');
      context.save();
      drawRoundedRectPath(context, scaleMetric(8), scaleMetric(8), scene.width - scaleMetric(16), scene.height - scaleMetric(16), scaleMetric(28));
      context.clip();
      context.fillStyle = vignette;
      context.fillRect(0, 0, scene.width, scene.height);
      context.restore();
    };

    const drawDisplayBorder = () => {
      context.save();
      drawRoundedRectPath(context, scaleMetric(10), scaleMetric(10), scene.width - scaleMetric(20), scene.height - scaleMetric(20), scaleMetric(27));
      context.strokeStyle = 'rgba(228, 250, 255, 0.24)';
      context.lineWidth = scaleMetric(1.4);
      context.stroke();
      context.restore();
    };

    const compositeSignalSurface = (time) => {
      clearContext(context);
      const elapsed = time - scene.startedAt;
      const curvature = scene.reduced ? 1 : easeOutQuad(Math.min(elapsed / 3000, 1));
      const chromaShift = scene.reduced ? 0 : 3 * Math.exp(-elapsed / 750);

      context.save();
      context.globalAlpha = 0.22;
      context.drawImage(signalCanvas, 0, 0, scene.width, scene.height);
      context.restore();

      drawCurvedSurface(signalCanvas, 0.92, 0, curvature);

      context.save();
      context.globalCompositeOperation = 'screen';
      context.filter = `blur(${Math.round(scaleMetric(8))}px)`;
      drawCurvedSurface(bloomCanvas, 0.42, 0, curvature);
      context.restore();

      if (!scene.reduced) {
        context.save();
        context.globalCompositeOperation = 'screen';
        drawCurvedSurface(signalCanvas, 0.08, chromaShift, curvature);
        drawCurvedSurface(signalCanvas, 0.05, -chromaShift, curvature);
        context.restore();
      }

      drawScanlines(time);
      drawVignette();
      drawDisplayBorder();
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
