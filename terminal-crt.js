(() => {
  'use strict';

  const GLYPHS = '01#@%&*+=-_:;.,/\\|[]{}<>~^';
  const STATES = ['SYNC', 'NOISE', 'TRACE', 'GHOST', 'PHASE', 'CARRIER'];
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer = 0;

  const rand = (max) => Math.floor(Math.random() * max);
  const pick = (source) => source[rand(source.length)];

  const buildNoiseLine = (width) => {
    const segments = [];
    for (let i = 0; i < width; i += 1) {
      const gap = Math.random() < 0.2;
      segments.push(gap ? ' ' : pick(GLYPHS));
    }
    return segments.join('');
  };

  const updateArtifacts = () => {
    const panel = document.querySelector('[data-terminal-panel]');
    const output = document.querySelector('[data-terminal-output]');
    if (!panel) return false;

    const overlay = panel.closest('[data-terminal-overlay]');
    const isOpen = overlay && overlay.getAttribute('data-terminal-state') === 'open' && !overlay.hidden;
    if (!isOpen || prefersReducedMotion.matches) return false;

    const width = Math.max(48, Math.min(96, Math.round(panel.clientWidth / 10)));
    panel.setAttribute('data-terminal-noise-a', buildNoiseLine(width));
    panel.setAttribute('data-terminal-noise-b', buildNoiseLine(width));
    panel.setAttribute('data-terminal-noise-c', buildNoiseLine(width));
    panel.style.setProperty('--terminal-noise-x', `${rand(5) - 2}px`);
    panel.style.setProperty('--terminal-noise-y', `${rand(3) - 1}px`);

    if (output) {
      const phase = String(rand(256)).padStart(2, '0');
      const drift = (Math.random() * 0.38 + 0.62).toFixed(2);
      output.setAttribute(
        'data-terminal-scan',
        `${pick(STATES)} // ${phase} :: ${buildNoiseLine(24)} :: drift=${drift}`,
      );
    }

    return true;
  };

  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      updateArtifacts();
      schedule();
    }, 360 + rand(520));
  };

  const syncLoop = () => {
    const panel = document.querySelector('[data-terminal-panel]');
    const overlay = panel?.closest('[data-terminal-overlay]');
    const isOpen = overlay && overlay.getAttribute('data-terminal-state') === 'open' && !overlay.hidden;

    if (isOpen && !prefersReducedMotion.matches) {
      updateArtifacts();
      if (!timer) schedule();
      return;
    }

    window.clearTimeout(timer);
    timer = 0;
  };

  const observer = new MutationObserver(syncLoop);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-terminal-state', 'hidden'],
  });

  window.addEventListener('pointerup', () => window.setTimeout(syncLoop, 40), { passive: true });
  window.addEventListener('keydown', () => window.setTimeout(syncLoop, 40), { passive: true });

  if (typeof prefersReducedMotion.addEventListener === 'function') {
    prefersReducedMotion.addEventListener('change', syncLoop);
  }

  syncLoop();
})();
