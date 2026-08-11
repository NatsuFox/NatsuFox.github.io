(() => {
  "use strict";

  const GLYPHS = "01#@%&*+=-_:;.,/\\|[]{}<>~^";
  const IMAGE_CHARS = " .,:;-=+*#%@";
  const STATES = ["SYNC", "NOISE", "TRACE", "GHOST", "PHASE", "CARRIER"];
  const SESSION_KEY = "natsufox.terminal.protocol.session.v1";
  const THEME_KEY = "natsufox.terminal.theme.v1";
  const SESSION_TTL = 45 * 60 * 1000;
  const SESSION_LIMIT = 36;
  const CLOSE_DELAY = 190;
  const PROTOCOL_ARTIFACT_URL = "data/terminal-protocol.json";
  const ASSET_VERSION = "20260512-terminal-cadence";
  const TERMINAL_SHELL_ATTR = "data-terminal-protocol-shell";
  const LEGACY_SUPPRESS_MS = 900;
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );

  let timer = 0;
  let commandQueue = Promise.resolve();
  let followOutput = true;
  let programmaticScroll = false;
  let userHoldScroll = false;
  let userScrollIntentUntil = 0;
  let suppressLegacyActivationUntil = 0;
  let lastScrollTop = 0;
  let sessionEntries = [];
  let protocolArtifactState = "inline";
  let protocolArtifactError = "";
  let protocolArtifactPromise = null;
  const routeContentCache = new Map();

  const rand = (max) => Math.floor(Math.random() * max);
  const pick = (source) => source[rand(source.length)];
  const delay = (ms) =>
    new Promise((resolve) => window.setTimeout(resolve, ms));

  let THEMES = {
    aurora: {
      label: "Aurora Signal",
      description: "Cyan glass, warm amber telemetry, and soft magenta noise.",
      vars: {
        "--terminal-bg-a": "rgba(0,12,20,.96)",
        "--terminal-bg-b": "rgba(0,5,12,.94)",
        "--terminal-fg": "#d5ffff",
        "--terminal-muted": "#7fdfe6",
        "--terminal-accent": "#7df9ff",
        "--terminal-warm": "#ffbd66",
        "--terminal-hot": "#ff6d93",
        "--terminal-user": "#ffd58a",
        "--terminal-border": "rgba(125,250,255,.72)",
        "--terminal-shadow": "rgba(0,238,255,.2)",
      },
    },
    ember: {
      label: "Ember Relay",
      description: "Amber phosphor over charcoal with teal secondary traces.",
      vars: {
        "--terminal-bg-a": "rgba(20,12,4,.96)",
        "--terminal-bg-b": "rgba(5,7,9,.95)",
        "--terminal-fg": "#ffe9bd",
        "--terminal-muted": "#e0b46d",
        "--terminal-accent": "#65f0d6",
        "--terminal-warm": "#ffb24d",
        "--terminal-hot": "#ff6f4d",
        "--terminal-user": "#92ffe6",
        "--terminal-border": "rgba(255,183,77,.74)",
        "--terminal-shadow": "rgba(255,156,54,.2)",
      },
    },
    jade: {
      label: "Jade Vector",
      description: "Green CRT text with brass accents and deep graphite base.",
      vars: {
        "--terminal-bg-a": "rgba(4,17,12,.97)",
        "--terminal-bg-b": "rgba(3,7,8,.96)",
        "--terminal-fg": "#d8ffe5",
        "--terminal-muted": "#8ee7b4",
        "--terminal-accent": "#72ff9f",
        "--terminal-warm": "#e9c46a",
        "--terminal-hot": "#ff7a5f",
        "--terminal-user": "#f7d98a",
        "--terminal-border": "rgba(114,255,159,.68)",
        "--terminal-shadow": "rgba(88,255,140,.2)",
      },
    },
    ion: {
      label: "Ion Bloom",
      description:
        "Electric blue foreground with lemon and coral interference.",
      vars: {
        "--terminal-bg-a": "rgba(5,9,23,.97)",
        "--terminal-bg-b": "rgba(1,3,12,.95)",
        "--terminal-fg": "#dbe7ff",
        "--terminal-muted": "#9bb7ff",
        "--terminal-accent": "#6ecbff",
        "--terminal-warm": "#f3f174",
        "--terminal-hot": "#ff7b7b",
        "--terminal-user": "#f3f174",
        "--terminal-border": "rgba(110,203,255,.72)",
        "--terminal-shadow": "rgba(95,142,255,.22)",
      },
    },
  };

  const COMMAND_ORDER = [
    "/theme",
    "/help",
    "/protocol",
    "/about",
    "/products",
    "/image",
    "/careers",
    "/support",
    "/partners",
    "/contact",
    "/status",
  ];

  const COMMAND_PROTOCOL = {
    version: "terminal-content-protocol/1.0",
    capabilities: ["text", "image", "theme", "command-list"],
    cache: {
      key: SESSION_KEY,
      ttlMs: SESSION_TTL,
      maxEntries: SESSION_LIMIT,
    },
    schema: {
      command: "A slash command route, for example /about or /products.",
      route: "{ label: string, summary?: string, blocks: TerminalBlock[] }",
      blocks: {
        text: '{ type: "text", lines: string[] }',
        image:
          '{ type: "image", src: string, alt?: string, caption?: string, maxColumns?: number, maxRows?: number }',
        theme: '{ type: "theme" }',
        status: '{ type: "status" }',
        commandList: '{ type: "command-list" }',
      },
      imageRenderer:
        "canvas pixel sampling -> reduced columns/rows -> brightness glyphs -> sampled RGB phosphor color",
    },
    commands: {
      "/help": {
        label: "Command Index",
        summary: "List every mounted terminal route.",
        blocks: [
          {
            type: "text",
            speed: "fast",
            lines: [
              "COMMAND INDEX",
              "Each route is rendered inside this terminal. No page navigation is required.",
            ],
          },
          { type: "command-list" },
        ],
      },
      "/protocol": {
        label: "Protocol",
        summary: "Show the command-to-content protocol contract.",
        contentUrl: "data/terminal-content/protocol.json",
        blocks: [
          {
            type: "text",
            speed: "fast",
            lines: [
              "PROTOCOL / terminal-content-protocol/1.0",
              "A command maps to an ordered list of content blocks.",
            ],
          },
          {
            type: "text",
            speed: "fast",
            lines: [
              "route       -> { label, summary?, contentUrl?, blocks }",
              'block.text  -> { type: "text", lines }',
              'block.image -> { type: "image", src, alt?, caption?, maxColumns?, maxRows? }',
              'block.theme -> { type: "theme" }',
              "The image renderer samples source pixels on a canvas, downsamples them, maps brightness to glyphs, and keeps sampled color as terminal phosphor tint.",
              'Runtime API -> window.NatsuFoxTerminalProtocol.registerCommand("/route", { label, summary, blocks })',
              "Introspection -> window.NatsuFoxTerminalProtocol.describe() returns schema, routes, themes, and cache policy.",
            ],
          },
        ],
      },
      "/about": {
        label: "About",
        summary: "Render the root-domain organization profile.",
        contentUrl: "data/terminal-content/about.json",
        blocks: [
          {
            type: "text",
            lines: [
              "ABOUT / NatsuFox",
              "Root-domain signal processor for AI-native systems, project surfaces, and experimental interface work.",
            ],
          },
          {
            type: "text",
            lines: [
              "The site is intentionally terminal-first: corporate page sections are modeled as commands and rendered as CRT output.",
            ],
          },
          {
            type: "image",
            src: "assets/social-root.png",
            alt: "NatsuFox root-domain social card",
            maxColumns: 58,
            caption: "root signal card sampled into terminal phosphor",
          },
        ],
      },
      "/products": {
        label: "Products",
        summary: "Render product and project entries.",
        contentUrl: "data/terminal-content/products.json",
        blocks: [
          {
            type: "text",
            speed: "fast",
            lines: [
              "PRODUCT LIST",
              "Tapestry      Knowledge-base ingestion and viewer surface.",
              "A-Stockit     Market signal workspace and project landing surface.",
              "NatsuFox.io   Root routing layer for the broader project constellation.",
            ],
          },
          {
            type: "image",
            src: "assets/social-tapestry.png",
            alt: "Tapestry project preview",
            maxColumns: 54,
            caption: "project card / tapestry",
          },
        ],
      },
      "/careers": {
        label: "Careers",
        summary: "Render collaboration and role guidance.",
        contentUrl: "data/terminal-content/careers.json",
        blocks: [
          {
            type: "text",
            lines: [
              "CAREERS / SUPPORT ROLES",
              "Open collaboration is framed as protocol design, interface experiments, evaluation, documentation, and field testing.",
            ],
          },
          {
            type: "text",
            lines: [
              "Current priority: builders who can keep strong visual taste while preserving operational clarity.",
            ],
          },
        ],
      },
      "/support": {
        label: "Support",
        summary: "Render support and regression-report guidance.",
        contentUrl: "data/terminal-content/support.json",
        blocks: [
          {
            type: "text",
            lines: [
              "SUPPORT",
              "For project questions, start from the linked GitHub repositories and issue trackers.",
              "For site routing or visual regressions, capture the command, viewport, and the visible terminal state.",
            ],
          },
        ],
      },
      "/partners": {
        label: "Partners",
        summary: "Render partnership model and project media.",
        contentUrl: "data/terminal-content/partners.json",
        blocks: [
          {
            type: "text",
            lines: [
              "PARTNERS",
              "The collaboration surface is intentionally modular: each project can expose a route, media card, and terminal protocol entry without requiring a separate page.",
            ],
          },
          {
            type: "image",
            src: "assets/social-astockit.png",
            alt: "A-Stockit project preview",
            maxColumns: 54,
            caption: "project card / a-stockit",
          },
        ],
      },
      "/contact": {
        label: "Contact",
        summary: "Render contact links.",
        contentUrl: "data/terminal-content/contact.json",
        blocks: [
          {
            type: "text",
            lines: [
              "CONTACT",
              "GitHub: https://github.com/NatsuFox",
              "Root:   https://natsufox.github.io/",
            ],
          },
        ],
      },
      "/image": {
        label: "Image Raster",
        summary: "Demonstrate colored image-to-glyph rendering.",
        contentUrl: "data/terminal-content/image.json",
        blocks: [
          {
            type: "text",
            speed: "fast",
            lines: [
              "IMAGE RASTER DEMO",
              "The renderer below reads the source pixels, downsamples resolution, and maps color plus brightness into terminal glyph cells.",
            ],
          },
          {
            type: "image",
            src: "assets/social-root.png",
            alt: "NatsuFox root-domain social card",
            maxColumns: 64,
            caption: "sampled from assets/social-root.png",
          },
        ],
      },
      "/status": {
        label: "Status",
        summary: "Render runtime telemetry and cache status.",
        blocks: [{ type: "status" }],
      },
      "/theme": {
        label: "Theme Selector",
        summary: "Select or inspect terminal color schemes.",
        blocks: [{ type: "theme" }],
      },
    },
  };

  const SYSTEM_COMMANDS = {
    "/clear": {
      label: "Clear",
      summary: "Clear terminal output and cached session.",
    },
  };

  window.NatsuFoxTerminalProtocol = COMMAND_PROTOCOL;

  const normalizeCommand = (value) => {
    const input = String(value || "").trim();
    if (!input) return "/help";
    return input.startsWith("/")
      ? input.toLowerCase()
      : `/${input.toLowerCase()}`;
  };

  const parseCommand = (raw) => {
    const normalized = normalizeCommand(raw);
    const parts = normalized.split(/\s+/).filter(Boolean);
    return { command: parts[0] || "/help", args: parts.slice(1) };
  };

  const serializeRoute = ([command, route]) => ({
    command,
    label: route.label,
    summary: route.summary || "",
    contentUrl: route.contentUrl || "",
    blocks: route.blocks.map((block) => ({ ...block })),
  });

  const buildNoiseLine = (width) => {
    const segments = [];
    for (let i = 0; i < width; i += 1) {
      const gap = Math.random() < 0.2;
      segments.push(gap ? " " : pick(GLYPHS));
    }
    return segments.join("");
  };

  const getOverlays = () => [
    ...document.querySelectorAll("[data-terminal-overlay]"),
  ];
  const getOwnedOverlay = () =>
    document.querySelector(
      `[data-terminal-overlay][${TERMINAL_SHELL_ATTR}="true"]`,
    );
  const getOverlay = () => getOwnedOverlay();
  const getPanel = () =>
    getOverlay()?.querySelector("[data-terminal-panel]") || null;
  const getOutput = () =>
    getOverlay()?.querySelector("[data-terminal-output]") || null;
  const getInput = () =>
    getOverlay()?.querySelector("[data-terminal-input]") || null;

  const removeLegacyTerminalOverlays = (keep = getOwnedOverlay()) => {
    let removed = 0;
    for (const overlay of getOverlays()) {
      if (keep && overlay === keep) continue;
      overlay.remove();
      removed += 1;
    }
    return removed;
  };

  const orderedEntries = (source) => {
    const entries = Object.entries(source || {});
    return entries.sort(([a], [b]) => {
      const ai = COMMAND_ORDER.indexOf(a);
      const bi = COMMAND_ORDER.indexOf(b);
      if (ai !== -1 || bi !== -1)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.localeCompare(b);
    });
  };

  const getCommandEntries = () => [
    ...orderedEntries(COMMAND_PROTOCOL.commands),
    ...Object.entries(SYSTEM_COMMANDS),
  ];

  const appendVersion = (source) => {
    const url = resolveImageSource(source);
    if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
    try {
      const parsed = new URL(url, document.baseURI);
      parsed.searchParams.set("v", ASSET_VERSION);
      return parsed.href;
    } catch (_) {
      return url;
    }
  };

  const applyProtocolArtifact = (artifact) => {
    if (!artifact || typeof artifact !== "object") return false;
    if (artifact.version) COMMAND_PROTOCOL.version = String(artifact.version);
    if (Array.isArray(artifact.capabilities))
      COMMAND_PROTOCOL.capabilities = artifact.capabilities.map(String);
    if (artifact.cache && typeof artifact.cache === "object") {
      COMMAND_PROTOCOL.cache = {
        ...COMMAND_PROTOCOL.cache,
        ...artifact.cache,
        key: SESSION_KEY,
      };
    }
    if (artifact.schema && typeof artifact.schema === "object")
      COMMAND_PROTOCOL.schema = artifact.schema;
    if (artifact.commands && typeof artifact.commands === "object")
      COMMAND_PROTOCOL.commands = artifact.commands;
    if (artifact.themes && typeof artifact.themes === "object")
      THEMES = artifact.themes;
    protocolArtifactState = "loaded";
    protocolArtifactError = "";
    installRail();
    applyTheme(getCurrentTheme());
    return true;
  };

  const loadProtocolArtifact = () => {
    if (protocolArtifactPromise) return protocolArtifactPromise;
    protocolArtifactPromise = fetch(
      `${PROTOCOL_ARTIFACT_URL}?v=${ASSET_VERSION}`,
      { cache: "no-store" },
    )
      .then((response) => {
        if (!response.ok) throw new Error(`artifact fetch ${response.status}`);
        return response.json();
      })
      .then((artifact) => {
        applyProtocolArtifact(artifact);
        return artifact;
      })
      .catch((error) => {
        protocolArtifactState = "fallback";
        protocolArtifactError =
          error && error.message ? error.message : String(error);
        return null;
      });
    return protocolArtifactPromise;
  };

  const loadRouteContent = async (route) => {
    if (!route || !route.contentUrl) return route ? route.blocks : [];
    const source = route.contentUrl;
    if (routeContentCache.has(source)) return routeContentCache.get(source);
    try {
      const response = await fetch(`${source}?v=${ASSET_VERSION}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`content fetch ${response.status}`);
      const content = await response.json();
      const blocks = Array.isArray(content.blocks) ? content.blocks : [];
      routeContentCache.set(source, blocks);
      return blocks;
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      return [
        {
          type: "text",
          lines: [`content artifact unavailable: ${source}`, message],
        },
      ];
    }
  };

  const createEl = (tag, attrs = {}, text = "") => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false || value === null || value === undefined) continue;
      if (value === true) node.setAttribute(key, "");
      else node.setAttribute(key, value);
    }
    if (text) node.textContent = text;
    return node;
  };

  const isTerminalOpen = () => {
    const overlay = getOverlay();
    return (
      overlay &&
      overlay.getAttribute("data-terminal-state") === "open" &&
      !overlay.hidden
    );
  };

  const createTerminalShell = () => {
    const existing = getOwnedOverlay();
    if (existing) {
      removeLegacyTerminalOverlays(existing);
      return existing;
    }

    removeLegacyTerminalOverlays(null);

    const overlay = createEl("div", {
      "data-terminal-overlay": true,
      [TERMINAL_SHELL_ATTR]: "true",
      "data-terminal-version": ASSET_VERSION,
      "data-terminal-state": "closed",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "NatsuFox terminal protocol",
      hidden: true,
    });
    const panel = createEl("section", {
      "data-terminal-panel": true,
      role: "document",
    });
    const topbar = createEl("header", { "data-terminal-topbar": true });
    const identity = createEl("div", { "data-terminal-identity": true });
    const mark = createEl("span", { "data-terminal-mark": true }, "NF");
    const title = createEl(
      "span",
      { "data-terminal-title": true },
      "NatsuFox intelligent terminal",
    );
    const controls = createEl("div", { "data-terminal-controls": true });
    const led = createEl("span", {
      "data-terminal-led": true,
      "aria-hidden": "true",
    });
    const close = createEl(
      "button",
      {
        type: "button",
        "data-terminal-close": true,
        "aria-label": "Close terminal",
      },
      "X",
    );
    const output = createEl("div", {
      "data-terminal-output": true,
      role: "log",
      "aria-live": "polite",
      "aria-relevant": "additions text",
    });
    const rail = createEl("nav", {
      "data-terminal-rail": true,
      "aria-label": "Preset terminal commands",
    });
    const form = createEl("form", { "data-terminal-form": true });
    const prompt = createEl(
      "span",
      { "data-terminal-prompt": true, "aria-hidden": "true" },
      "nf-agent>",
    );
    const input = createEl("input", {
      "data-terminal-input": true,
      type: "text",
      autocomplete: "off",
      autocapitalize: "none",
      spellcheck: "false",
      inputmode: "text",
      placeholder: "/help",
      "aria-label": "Terminal command",
    });

    identity.append(mark, title);
    controls.append(led, close);
    topbar.append(identity, controls);
    form.append(prompt, input);
    panel.append(topbar, output, rail, form);
    overlay.append(panel);
    document.body.append(overlay);
    removeLegacyTerminalOverlays(overlay);
    return overlay;
  };

  const openTerminal = (options = {}) => {
    suppressLegacyActivationUntil = Date.now() + LEGACY_SUPPRESS_MS;
    const overlay = createTerminalShell();
    overlay.hidden = false;
    overlay.setAttribute("data-terminal-state", "open");
    document.documentElement.setAttribute("data-terminal-active", "true");
    enhanceTerminal();
    window.setTimeout(() => removeLegacyTerminalOverlays(overlay), 0);
    window.setTimeout(() => removeLegacyTerminalOverlays(overlay), 120);
    window.setTimeout(() => {
      if (options.focus === false) return;
      getInput()?.focus({ preventScroll: true });
    }, 60);
  };

  const closeTerminal = () => {
    const overlay = getOverlay();
    if (!overlay) return;
    saveSession();
    overlay.setAttribute("data-terminal-state", "closed");
    document.documentElement.removeAttribute("data-terminal-active");
    window.setTimeout(() => {
      if (overlay.getAttribute("data-terminal-state") === "closed")
        overlay.hidden = true;
    }, CLOSE_DELAY);
  };

  const isAtBottom = () => {
    const output = getOutput();
    if (!output) return true;
    return output.scrollHeight - output.clientHeight - output.scrollTop <= 24;
  };

  const setFollowState = (next) => {
    followOutput = next;
    if (next) userHoldScroll = false;
    const output = getOutput();
    if (output)
      output.setAttribute("data-terminal-follow", next ? "on" : "off");
  };

  const holdFollow = () => {
    userHoldScroll = true;
    setFollowState(false);
  };

  const maybeFollow = () => {
    const output = getOutput();
    if (!output || !followOutput) return;
    programmaticScroll = true;
    output.scrollTop = output.scrollHeight;
    lastScrollTop = output.scrollTop;
    window.requestAnimationFrame(() => {
      programmaticScroll = false;
    });
  };

  const bindScrollFollow = () => {
    const output = getOutput();
    if (!output || output.dataset.followBound === "true") return;
    output.dataset.followBound = "true";
    lastScrollTop = output.scrollTop;
    setFollowState(isAtBottom());
    const handleScroll = () => {
      if (programmaticScroll && followOutput) return;
      const currentTop = output.scrollTop;
      const movedUp = currentTop < lastScrollTop - 2;
      if (
        movedUp ||
        (followOutput && !isAtBottom() && Date.now() < userScrollIntentUntil)
      )
        holdFollow();
      else if (isAtBottom()) setFollowState(true);
      lastScrollTop = currentTop;
    };
    const handleWheel = (event) => {
      userScrollIntentUntil = Date.now() + 500;
      if (event.deltaY < 0) {
        holdFollow();
        return;
      }
      window.requestAnimationFrame(() => {
        if (isAtBottom()) setFollowState(true);
      });
    };
    const handlePointer = () => {
      userScrollIntentUntil = Date.now() + 1200;
    };
    const handleTouch = () => {
      userScrollIntentUntil = Date.now() + 1200;
      holdFollow();
      window.requestAnimationFrame(() => {
        if (isAtBottom()) setFollowState(true);
      });
    };
    output.addEventListener("scroll", handleScroll, { passive: true });
    output.addEventListener("wheel", handleWheel, { passive: true });
    output.addEventListener("pointerdown", handlePointer, { passive: true });
    output.addEventListener("touchmove", handleTouch, { passive: true });
    const panel = getPanel();
    if (panel) {
      panel.addEventListener(
        "wheel",
        (event) => {
          if (
            !output.contains(event.target instanceof Node ? event.target : null)
          )
            return;
          handleWheel(event);
        },
        { passive: true },
      );
      panel.addEventListener(
        "touchmove",
        (event) => {
          if (
            !output.contains(event.target instanceof Node ? event.target : null)
          )
            return;
          handleTouch(event);
        },
        { passive: true },
      );
    }
  };

  const loadSession = () => {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!parsed || Date.now() - Number(parsed.updatedAt || 0) > SESSION_TTL) {
        window.localStorage.removeItem(SESSION_KEY);
        return [];
      }
      return Array.isArray(parsed.entries)
        ? parsed.entries.slice(-SESSION_LIMIT)
        : [];
    } catch (_) {
      return [];
    }
  };

  const loadSessionMeta = () => {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  };

  const saveSession = () => {
    try {
      if (!sessionEntries.length) {
        window.localStorage.removeItem(SESSION_KEY);
        return;
      }
      window.localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          updatedAt: Date.now(),
          entries: sessionEntries.slice(-SESSION_LIMIT),
        }),
      );
    } catch (_) {
      // localStorage is optional for private browsing or locked-down contexts.
    }
  };

  const getCurrentTheme = () => {
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      return THEMES[stored] ? stored : "aurora";
    } catch (_) {
      return "aurora";
    }
  };

  const applyTheme = (themeId) => {
    const id = THEMES[themeId] ? themeId : "aurora";
    const overlay = getOverlay();
    const panel = getPanel();
    const target = overlay || panel || document.documentElement;
    const alreadyApplied =
      target.dataset.terminalAppliedTheme === id &&
      target.getAttribute("data-terminal-theme") === id &&
      (!panel || panel.dataset.terminalAppliedTheme === id);
    if (alreadyApplied) return id;
    target.setAttribute("data-terminal-theme", id);
    target.dataset.terminalAppliedTheme = id;
    if (panel) panel.setAttribute("data-terminal-theme", id);
    if (panel) panel.dataset.terminalAppliedTheme = id;
    for (const [key, value] of Object.entries(THEMES[id].vars)) {
      target.style.setProperty(key, value);
      if (panel) panel.style.setProperty(key, value);
    }
    try {
      window.localStorage.setItem(THEME_KEY, id);
    } catch (_) {
      // Theme persistence is progressive enhancement.
    }
    return id;
  };

  const renderIcon = () => {
    const mark = getPanel()?.querySelector("[data-terminal-mark]");
    if (!mark || mark.dataset.iconUpgraded === "true") return;
    mark.dataset.iconUpgraded = "true";
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = [
      '<svg viewBox="0 0 64 64" focusable="false" aria-hidden="true">',
      '<path class="terminal-icon-frame" d="M32 5 55 18v28L32 59 9 46V18Z"/>',
      '<path class="terminal-icon-ear" d="M18 18 27 10l5 12 5-12 9 8"/>',
      '<path class="terminal-icon-face" d="M18 24h28l-6 18-8 7-8-7Z"/>',
      '<path class="terminal-icon-line" d="M23 28h9M32 28h9M24 38l8 6 8-6"/>',
      '<path class="terminal-icon-core" d="M32 23v20"/>',
      "</svg>",
    ].join("");
  };

  const resolveImageSource = (source) => {
    try {
      return new URL(String(source || ""), document.baseURI).href;
    } catch (_) {
      return String(source || "");
    }
  };

  const updateArtifacts = () => {
    const panel = getPanel();
    const output = getOutput();
    if (!panel) return false;

    const overlay = panel.closest("[data-terminal-overlay]");
    const isOpen =
      overlay &&
      overlay.getAttribute("data-terminal-state") === "open" &&
      !overlay.hidden;
    if (!isOpen || prefersReducedMotion.matches) return false;

    const width = Math.max(
      48,
      Math.min(96, Math.round(panel.clientWidth / 10)),
    );
    panel.setAttribute("data-terminal-noise-a", buildNoiseLine(width));
    panel.setAttribute("data-terminal-noise-b", buildNoiseLine(width));
    panel.setAttribute("data-terminal-noise-c", buildNoiseLine(width));
    panel.style.setProperty("--terminal-noise-x", `${rand(5) - 2}px`);
    panel.style.setProperty("--terminal-noise-y", `${rand(3) - 1}px`);

    if (output) {
      const phase = String(rand(256)).padStart(2, "0");
      const drift = (Math.random() * 0.38 + 0.62).toFixed(2);
      const hold = followOutput ? "FOLLOW" : "HOLD";
      output.setAttribute(
        "data-terminal-scan",
        `${hold} // ${pick(STATES)} // ${phase} :: ${buildNoiseLine(20)} :: drift=${drift}`,
      );
    }

    return true;
  };

  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(
      () => {
        updateArtifacts();
        schedule();
      },
      360 + rand(520),
    );
  };

  const appendUser = (text, persist = true) => {
    const output = getOutput();
    if (!output) return;
    const entry = createEl(
      "div",
      { "data-terminal-entry": "user" },
      `nf-agent> ${text}`,
    );
    output.append(entry);
    if (persist) {
      sessionEntries.push({ kind: "user", text });
      saveSession();
    }
    maybeFollow();
  };

  const appendSystemShell = (persistedCommand = "") => {
    const output = getOutput();
    if (!output) return null;
    const entry = createEl("div", { "data-terminal-entry": "system" });
    if (persistedCommand) entry.dataset.command = persistedCommand;
    output.append(entry);
    maybeFollow();
    return entry;
  };

  const scramblePreview = (text) => {
    if (!text) return "";
    return [...text]
      .map((char, index) => {
        if (char === " " || index % 3 !== 0 || Math.random() > 0.35)
          return char;
        return pick(GLYPHS);
      })
      .join("");
  };

  const typeLine = async (container, line, options = {}) => {
    const lineNode = createEl("div", { "data-terminal-line": true });
    container.append(lineNode);
    const text = String(line || "");
    const fast = options.fast || text.length > 96;
    if (prefersReducedMotion.matches || options.instant || text.length > 180) {
      lineNode.textContent = text;
      maybeFollow();
      return;
    }

    // Character-by-character streaming
    lineNode.setAttribute("data-terminal-line-state", "streaming");
    const chars = [...text];
    const charDelay = fast ? 25 : 50;
    const variance = fast ? 15 : 25;

    for (let i = 0; i < chars.length; i += 1) {
      lineNode.textContent = chars.slice(0, i + 1).join("");
      maybeFollow();
      await delay(charDelay + rand(variance));
    }

    lineNode.setAttribute("data-terminal-line-state", "stable");
    await delay(fast ? 40 : 80);
  };

  const renderTextBlock = async (entry, block) => {
    const lines = Array.isArray(block.lines)
      ? block.lines
      : [String(block.text || "")];
    const fast = block.speed === "fast" || lines.length > 4;
    for (const line of lines)
      await typeLine(entry, line, { fast, instant: block.instant });
  };

  const quantizeColor = (r, g, b, brightness) => {
    const lift = 0.72 + brightness * 0.44;
    const tint = [
      Math.min(255, Math.round(r * lift + 12)),
      Math.min(255, Math.round(g * lift + 18)),
      Math.min(255, Math.round(b * lift + 24)),
    ];
    return `rgb(${tint[0]},${tint[1]},${tint[2]})`;
  };

  const loadRasterSource = async (source) => {
    const response = await fetch(source, { cache: "force-cache" });
    if (!response.ok) throw new Error(`image fetch ${response.status}`);
    const blob = await response.blob();
    if (typeof window.createImageBitmap === "function")
      return window.createImageBitmap(blob);

    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(blob);
      const release = () => URL.revokeObjectURL(objectUrl);
      image.decoding = "async";
      image.onload = () => {
        release();
        resolve(image);
      };
      image.onerror = () => {
        release();
        reject(new Error("image decode failed"));
      };
      image.src = objectUrl;
    });
  };

  const rasterizeImage = async (block, pre) => {
    const source = appendVersion(block.src);
    let timeout = 0;
    const timeoutPromise = new Promise((_, reject) => {
      timeout = window.setTimeout(
        () =>
          reject(new Error(`image decode timed out: ${source || block.src}`)),
        3600,
      );
    });

    try {
      const image = await Promise.race([
        loadRasterSource(source),
        timeoutPromise,
      ]);
      window.clearTimeout(timeout);
      const sourceWidth = image.naturalWidth || image.width || 1;
      const sourceHeight = image.naturalHeight || image.height || 1;
      const columns = Math.max(
        24,
        Math.min(Number(block.maxColumns) || 56, 72),
      );
      const ratio = sourceHeight / sourceWidth || 0.55;
      const rowLimit = Math.max(8, Math.min(Number(block.maxRows) || 28, 36));
      const rows = Math.max(
        8,
        Math.min(rowLimit, Math.round(columns * ratio * 0.45)),
      );
      const canvas = document.createElement("canvas");
      canvas.width = columns;
      canvas.height = rows;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("image canvas unavailable");
      context.drawImage(image, 0, 0, columns, rows);
      if (typeof image.close === "function") image.close();
      const pixels = context.getImageData(0, 0, columns, rows).data;
      pre.replaceChildren();
      for (let y = 0; y < rows; y += 1) {
        const row = createEl("div", { "data-terminal-image-row": true });
        for (let x = 0; x < columns; x += 1) {
          const offset = (y * columns + x) * 4;
          const alpha = pixels[offset + 3] / 255;
          const r = pixels[offset];
          const g = pixels[offset + 1];
          const b = pixels[offset + 2];
          const brightness = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          const noisy = Math.max(
            0,
            Math.min(1, brightness + (Math.random() - 0.5) * 0.08),
          );
          const charIndex = Math.min(
            IMAGE_CHARS.length - 1,
            Math.round(noisy * (IMAGE_CHARS.length - 1)),
          );
          const cell = createEl(
            "span",
            { "data-terminal-image-cell": true },
            alpha < 0.08 ? " " : IMAGE_CHARS[charIndex],
          );
          cell.style.color = quantizeColor(r, g, b, noisy);
          cell.style.opacity = String(Math.max(0.42, alpha));
          row.append(cell);
        }
        pre.append(row);
      }
    } catch (error) {
      window.clearTimeout(timeout);
      pre.textContent = error && error.message ? error.message : String(error);
    }
    maybeFollow();
  };

  const renderImageBlock = async (entry, block) => {
    const figure = createEl("figure", { "data-terminal-image": true });
    const source = appendVersion(block.src);
    figure.setAttribute("data-terminal-image-src", source);
    const header = createEl(
      "figcaption",
      {},
      `${block.caption || block.alt || "terminal image"} // ${block.src}`,
    );
    const pre = createEl(
      "pre",
      { "data-terminal-image-raster": true },
      "sampling pixels...",
    );
    figure.append(header, pre);
    entry.append(figure);
    maybeFollow();
    await rasterizeImage(block, pre);
  };

  const renderCommandListBlock = async (entry) => {
    const lines = getCommandEntries().map(
      ([command, route]) =>
        `${command.padEnd(10, " ")} ${route.label}${route.summary ? ` // ${route.summary}` : ""}`,
    );
    await renderTextBlock(entry, { lines, instant: true });
  };

  const renderThemeBlock = async (entry) => {
    const current = getCurrentTheme();
    await renderTextBlock(entry, {
      instant: true,
      lines: [
        `THEME / active=${current}`,
        "Use /theme <name> or select one of the inline commands below.",
      ],
    });
    const grid = createEl("div", { "data-terminal-theme-grid": true });
    for (const [id, theme] of Object.entries(THEMES)) {
      const button = createEl("button", {
        type: "button",
        "data-terminal-command": `/theme ${id}`,
        "data-terminal-theme-choice": id,
      });
      button.append(
        createEl("span", {}, id),
        createEl("small", {}, theme.description),
      );
      grid.append(button);
    }
    entry.append(grid);
    maybeFollow();
  };

  const renderBootInstant = async (entry) => {
    await renderTextBlock(entry, {
      instant: true,
      lines: [
        "BOOT / NatsuFox terminal protocol online",
        `Protocol artifact: ${PROTOCOL_ARTIFACT_URL} [${protocolArtifactState}]`,
        "Use /theme first to inspect or switch color schemes. Use /help, /about, /products, or /image for content.",
      ],
    });
    await renderCommandListBlock(entry);
    await renderThemeBlock(entry);
  };

  const renderStatusBlock = async (entry) => {
    const routeCount = Object.keys(COMMAND_PROTOCOL.commands).length;
    const phase = pick(STATES);
    const phosphor = 72 + rand(20);
    const sessionMeta = loadSessionMeta();
    const cacheAge = sessionMeta
      ? Math.max(
          0,
          Math.round(
            (Date.now() - Number(sessionMeta.updatedAt || Date.now())) / 1000,
          ),
        )
      : 0;
    await renderTextBlock(entry, {
      lines: [
        "STATUS / CRT TELEMETRY",
        `phase=${phase}  phosphor=${phosphor}%  follow=${followOutput ? "on" : "hold"}`,
        `protocol=${COMMAND_PROTOCOL.version}  routes=${routeCount}  cache_ttl=${Math.round(SESSION_TTL / 60000)}m  cache_entries=${sessionEntries.length}/${SESSION_LIMIT}`,
        `artifact=${PROTOCOL_ARTIFACT_URL}  artifact_state=${protocolArtifactState}${protocolArtifactError ? `  error=${protocolArtifactError}` : ""}`,
        `theme=${getCurrentTheme()}  image_renderer=canvas-glyph-color`,
      ],
    });
    if (cacheAge)
      await renderTextBlock(entry, { lines: [`cache_age=${cacheAge}s`] });
  };

  const renderBlocks = async (entry, blocks) => {
    for (const block of blocks) {
      if (block.type === "text") await renderTextBlock(entry, block);
      else if (block.type === "image") await renderImageBlock(entry, block);
      else if (block.type === "command-list")
        await renderCommandListBlock(entry);
      else if (block.type === "theme") await renderThemeBlock(entry);
      else if (block.type === "status") await renderStatusBlock(entry);
    }
  };

  const randomFallback = (command) => {
    const variants = [
      [
        `No route mounted for '${command}'. Try /help to inspect the protocol table.`,
      ],
      [
        `The interface heard '${command}', but this build serves only preset terminal routes.`,
      ],
      [
        `Command '${command}' fell through the carrier. Available routes remain in /help.`,
      ],
    ];
    return {
      label: "Unmapped Command",
      blocks: [{ type: "text", lines: pick(variants) }],
    };
  };

  const resolveRoute = (command, args) => {
    let route = COMMAND_PROTOCOL.commands[command] || randomFallback(command);
    if (command === "/theme" && args[0] && THEMES[args[0]]) {
      const selected = applyTheme(args[0]);
      route = {
        label: "Theme Applied",
        blocks: [
          {
            type: "text",
            lines: [
              `THEME / applied=${selected}`,
              THEMES[selected].description,
            ],
          },
          { type: "theme" },
        ],
      };
    } else if (command === "/theme" && args[0] && !THEMES[args[0]]) {
      route = {
        label: "Theme Missing",
        blocks: [
          { type: "text", lines: [`No theme named '${args[0]}'.`] },
          { type: "theme" },
        ],
      };
    }
    return route;
  };

  const appendResolvedCommand = async (display) => {
    const { command, args } = parseCommand(display);
    const entry = appendSystemShell(command);
    if (!entry) return;
    const route = resolveRoute(command, args);
    const blocks = await loadRouteContent(route);
    await renderBlocks(entry, blocks.length ? blocks : route.blocks);
  };

  const executeCommand = (raw, options = {}) => {
    if (!getOutput()) openTerminal({ focus: false });
    const { command, args } = parseCommand(raw);
    const display = [command, ...args].join(" ");
    setFollowState(isAtBottom());

    if (command === "/theme" && args[0] && THEMES[args[0]]) applyTheme(args[0]);

    if (command === "/clear") {
      const output = getOutput();
      if (output) output.replaceChildren();
      sessionEntries = [];
      saveSession();
      setFollowState(true);
      return;
    }

    if (!options.replayUser) appendUser(display);

    const renderTask = commandQueue
      .catch(() => undefined)
      .then(async () => {
        await appendResolvedCommand(display);
        if (!options.replaySystem) {
          sessionEntries.push({ kind: "system", command: display });
          saveSession();
        }
      });
    commandQueue = renderTask.catch(() => undefined);
  };

  COMMAND_PROTOCOL.registerCommand = (command, route) => {
    const normalized = normalizeCommand(command);
    if (!route || !Array.isArray(route.blocks)) return false;
    COMMAND_PROTOCOL.commands[normalized] = {
      label: String(route.label || normalized),
      summary: String(route.summary || ""),
      blocks: route.blocks,
    };
    installRail();
    return true;
  };

  COMMAND_PROTOCOL.execute = (raw) => executeCommand(raw);

  COMMAND_PROTOCOL.open = () => openTerminal();

  COMMAND_PROTOCOL.close = () => closeTerminal();

  COMMAND_PROTOCOL.getCommand = (command) =>
    COMMAND_PROTOCOL.commands[normalizeCommand(command)] || null;

  COMMAND_PROTOCOL.describe = () => ({
    version: COMMAND_PROTOCOL.version,
    capabilities: [...COMMAND_PROTOCOL.capabilities],
    artifact: {
      url: PROTOCOL_ARTIFACT_URL,
      state: protocolArtifactState,
      error: protocolArtifactError,
    },
    cache: { ...COMMAND_PROTOCOL.cache },
    schema: { ...COMMAND_PROTOCOL.schema },
    routes: orderedEntries(COMMAND_PROTOCOL.commands).map(serializeRoute),
    systemCommands: Object.entries(SYSTEM_COMMANDS).map(([command, route]) => ({
      command,
      label: route.label,
      summary: route.summary,
    })),
    themes: Object.fromEntries(
      Object.entries(THEMES).map(([id, theme]) => [
        id,
        {
          label: theme.label,
          description: theme.description,
        },
      ]),
    ),
  });

  const replaySession = () => {
    const output = getOutput();
    if (!output) return;
    commandQueue = Promise.resolve();
    output.replaceChildren();
    sessionEntries = loadSession();
    if (!sessionEntries.length) {
      const intro = appendSystemShell("/help");
      if (intro) {
        renderBootInstant(intro);
      }
      return;
    }
    const copy = [...sessionEntries];
    sessionEntries = [];
    commandQueue = commandQueue
      .catch(() => undefined)
      .then(async () => {
        for (const entry of copy) {
          if (entry.kind === "user") appendUser(entry.text, false);
          if (entry.kind === "system")
            await appendResolvedCommand(entry.command);
        }
        sessionEntries = copy;
      });
  };

  const installRail = () => {
    const rail = getPanel()?.querySelector("[data-terminal-rail]");
    if (!rail) return;
    const commandSignature = getCommandEntries()
      .map(([command]) => command)
      .join("|");
    const renderedSignature = [
      ...rail.querySelectorAll("[data-terminal-command]"),
    ]
      .map((button) => button.textContent.trim())
      .join("|");
    if (
      rail.dataset.protocolCommands === commandSignature &&
      rail.dataset.protocolRail === "true" &&
      renderedSignature === commandSignature
    )
      return;
    rail.dataset.protocolRail = "true";
    rail.dataset.protocolCommands = commandSignature;
    rail.replaceChildren();
    getCommandEntries().forEach(([command, route]) => {
      rail.append(
        createEl(
          "button",
          {
            type: "button",
            "data-terminal-command": command,
            title: route.summary || route.label || command,
          },
          command,
        ),
      );
    });
  };

  const bindShellEvents = () => {
    if (document.documentElement.dataset.terminalShellEvents === "true") return;
    document.documentElement.dataset.terminalShellEvents = "true";
    document.addEventListener(
      "pointerup",
      (event) => {
        if (isTerminalOpen()) return;
        const target = event.target instanceof Element ? event.target : null;
        if (
          !target ||
          target.closest(
            'a,button,input,textarea,select,label,[role="button"],[data-terminal-overlay]',
          )
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        openTerminal();
      },
      true,
    );
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (
          Date.now() < suppressLegacyActivationUntil &&
          !target.closest("[data-terminal-overlay]")
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          removeLegacyTerminalOverlays(getOwnedOverlay());
          return;
        }
        if (target.closest("[data-terminal-close]")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeTerminal();
          return;
        }
        const overlay = target.closest("[data-terminal-overlay]");
        if (overlay && target === overlay) {
          event.preventDefault();
          closeTerminal();
        }
      },
      true,
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && isTerminalOpen()) {
          event.preventDefault();
          closeTerminal();
        }
      },
      true,
    );
  };

  const interceptCommandEvents = () => {
    if (document.documentElement.dataset.terminalProtocolEvents === "true")
      return;
    document.documentElement.dataset.terminalProtocolEvents = "true";
    document.addEventListener(
      "click",
      (event) => {
        const target =
          event.target instanceof Element
            ? event.target.closest("[data-terminal-command]")
            : null;
        if (!target || !getPanel()?.contains(target)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        executeCommand(target.getAttribute("data-terminal-command") || "/help");
      },
      true,
    );
    document.addEventListener(
      "submit",
      (event) => {
        const form =
          event.target instanceof Element
            ? event.target.closest("[data-terminal-form]")
            : null;
        if (!form || !getPanel()?.contains(form)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const input = getInput();
        const value = input ? input.value : "";
        if (input) input.value = "";
        executeCommand(value);
      },
      true,
    );
  };

  const enhanceTerminal = () => {
    createTerminalShell();
    const panel = getPanel();
    const output = getOutput();
    if (!panel || !output) return false;
    loadProtocolArtifact();
    renderIcon();
    installRail();
    bindScrollFollow();
    interceptCommandEvents();
    applyTheme(getCurrentTheme());
    if (output.dataset.protocolBooted !== "true") {
      output.dataset.protocolBooted = "true";
      loadProtocolArtifact().then(() => window.setTimeout(replaySession, 80));
    }
    return true;
  };

  const syncLoop = () => {
    removeLegacyTerminalOverlays(getOwnedOverlay());
    const isOpen = isTerminalOpen();
    if (isOpen) enhanceTerminal();

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
    attributeFilter: ["data-terminal-state", "hidden"],
  });

  window.addEventListener("pointerup", () => window.setTimeout(syncLoop, 40), {
    passive: true,
  });
  window.addEventListener("keydown", () => window.setTimeout(syncLoop, 40), {
    passive: true,
  });

  if (typeof prefersReducedMotion.addEventListener === "function") {
    prefersReducedMotion.addEventListener("change", syncLoop);
  }

  bindShellEvents();
  syncLoop();
})();
