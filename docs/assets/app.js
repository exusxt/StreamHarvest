/* StreamHarvest — website interactions.
   Theme data mirrors src/renderer/src/lib.ts so the site's look matches the app. */

const THEMES = [
  {
    id: "gallery",
    name: "Gallery Glass",
    type: "Gallery",
    vars: { "--sc64-bg": "#0b1020", "--sc64-panel": "rgba(17, 26, 48, 0.68)", "--sc64-panel2": "rgba(14, 21, 38, 0.60)", "--sc64-deep": "#070b16", "--sc64-border": "#223052", "--sc64-borderlight": "#2e3f6b", "--sc64-accent": "#38bdf8", "--sc64-accent2": "#a78bfa", "--sc64-good": "#34d399", "--sc64-warn": "#fbbf24", "--sc64-bad": "#f87171", "--sc64-muted": "#8b98b8", "--sc64-text": "#e2e8f0", "--sc64-glow": "0 0 24px rgba(56, 189, 248, 0.25)" }
  },
  {
    id: "galleryblack",
    name: "Gallery Black Glass",
    type: "Gallery",
    vars: { "--sc64-bg": "#0b1020", "--sc64-panel": "rgba(8, 10, 17, 0.74)", "--sc64-panel2": "rgba(5, 7, 12, 0.66)", "--sc64-deep": "#05070d", "--sc64-border": "#1b2338", "--sc64-borderlight": "#2b3a55", "--sc64-accent": "#cbd5e1", "--sc64-accent2": "#94a3b8", "--sc64-good": "#34d399", "--sc64-warn": "#fbbf24", "--sc64-bad": "#f87171", "--sc64-muted": "#8b98b8", "--sc64-text": "#e2e8f0", "--sc64-glow": "0 0 24px rgba(203, 213, 225, 0.22)" }
  },
  {
    id: "gallerygreen",
    name: "Gallery Green Glass",
    type: "Gallery",
    vars: { "--sc64-bg": "#0b1020", "--sc64-panel": "rgba(12, 30, 22, 0.68)", "--sc64-panel2": "rgba(9, 24, 17, 0.60)", "--sc64-deep": "#04120c", "--sc64-border": "#1e3b2f", "--sc64-borderlight": "#2c5847", "--sc64-accent": "#34d399", "--sc64-accent2": "#a3e635", "--sc64-good": "#6ee7b7", "--sc64-warn": "#fbbf24", "--sc64-bad": "#f87171", "--sc64-muted": "#87a89a", "--sc64-text": "#e7f5ee", "--sc64-glow": "0 0 24px rgba(52, 211, 153, 0.25)" }
  },
  {
    id: "galleryblue",
    name: "Gallery Blue Glass",
    type: "Gallery",
    vars: { "--sc64-bg": "#0b1020", "--sc64-panel": "rgba(13, 24, 46, 0.68)", "--sc64-panel2": "rgba(10, 19, 37, 0.60)", "--sc64-deep": "#04070d", "--sc64-border": "#1e3452", "--sc64-borderlight": "#2b4c7a", "--sc64-accent": "#60a5fa", "--sc64-accent2": "#22d3ee", "--sc64-good": "#34d399", "--sc64-warn": "#fbbf24", "--sc64-bad": "#fb7185", "--sc64-muted": "#8aa4c8", "--sc64-text": "#e0f2fe", "--sc64-glow": "0 0 24px rgba(96, 165, 250, 0.25)" }
  },
  {
    id: "galleryred",
    name: "Gallery Red Glass",
    type: "Gallery",
    vars: { "--sc64-bg": "#0b1020", "--sc64-panel": "rgba(38, 16, 20, 0.68)", "--sc64-panel2": "rgba(30, 12, 15, 0.60)", "--sc64-deep": "#170506", "--sc64-border": "#47222a", "--sc64-borderlight": "#66313b", "--sc64-accent": "#fb7185", "--sc64-accent2": "#fbbf24", "--sc64-good": "#34d399", "--sc64-warn": "#facc15", "--sc64-bad": "#fb7185", "--sc64-muted": "#d39aa3", "--sc64-text": "#fde8ea", "--sc64-glow": "0 0 24px rgba(251, 113, 133, 0.25)" }
  },
  {
    id: "galleryorange",
    name: "Gallery Orange Glass",
    type: "Gallery",
    vars: { "--sc64-bg": "#0b1020", "--sc64-panel": "rgba(40, 24, 12, 0.68)", "--sc64-panel2": "rgba(32, 18, 9, 0.60)", "--sc64-deep": "#180b03", "--sc64-border": "#4a3017", "--sc64-borderlight": "#6b4520", "--sc64-accent": "#fb923c", "--sc64-accent2": "#fbbf24", "--sc64-good": "#34d399", "--sc64-warn": "#fbbf24", "--sc64-bad": "#f87171", "--sc64-muted": "#d3ad92", "--sc64-text": "#fdf0e3", "--sc64-glow": "0 0 24px rgba(251, 146, 60, 0.25)" }
  },
  {
    id: "gallerypurple",
    name: "Gallery Purple Glass",
    type: "Gallery",
    vars: { "--sc64-bg": "#0b1020", "--sc64-panel": "rgba(30, 18, 48, 0.68)", "--sc64-panel2": "rgba(24, 14, 38, 0.60)", "--sc64-deep": "#0f0718", "--sc64-border": "#3a2a55", "--sc64-borderlight": "#553d78", "--sc64-accent": "#a78bfa", "--sc64-accent2": "#f472b6", "--sc64-good": "#34d399", "--sc64-warn": "#fbbf24", "--sc64-bad": "#f87171", "--sc64-muted": "#b5a6d8", "--sc64-text": "#f3ecfc", "--sc64-glow": "0 0 24px rgba(167, 139, 250, 0.25)" }
  },
  {
    id: "midnight",
    name: "Midnight",
    type: "Solid",
    vars: { "--sc64-bg": "#0b1020", "--sc64-panel": "#111a30", "--sc64-panel2": "#0e1526", "--sc64-deep": "#070b16", "--sc64-border": "#223052", "--sc64-borderlight": "#2e3f6b", "--sc64-accent": "#38bdf8", "--sc64-accent2": "#a78bfa", "--sc64-good": "#34d399", "--sc64-warn": "#fbbf24", "--sc64-bad": "#f87171", "--sc64-muted": "#8b98b8", "--sc64-text": "#e2e8f0", "--sc64-glow": "0 0 24px rgba(56, 189, 248, 0.25)" }
  },
  {
    id: "ocean",
    name: "Ocean",
    type: "Solid",
    vars: { "--sc64-bg": "#04141f", "--sc64-panel": "#082b3d", "--sc64-panel2": "#06212f", "--sc64-deep": "#020d14", "--sc64-border": "#0e3d56", "--sc64-borderlight": "#17567a", "--sc64-accent": "#22d3ee", "--sc64-accent2": "#60a5fa", "--sc64-good": "#34d399", "--sc64-warn": "#facc15", "--sc64-bad": "#fb7185", "--sc64-muted": "#7aa2bb", "--sc64-text": "#e0f2fe", "--sc64-glow": "0 0 24px rgba(34, 211, 238, 0.25)" }
  },
  {
    id: "forest",
    name: "Forest",
    type: "Solid",
    vars: { "--sc64-bg": "#0c1512", "--sc64-panel": "#14241d", "--sc64-panel2": "#0f1d17", "--sc64-deep": "#070d0a", "--sc64-border": "#1e3b2f", "--sc64-borderlight": "#2c5847", "--sc64-accent": "#34d399", "--sc64-accent2": "#a3e635", "--sc64-good": "#4ade80", "--sc64-warn": "#fbbf24", "--sc64-bad": "#f87171", "--sc64-muted": "#87a89a", "--sc64-text": "#e7f5ee", "--sc64-glow": "0 0 24px rgba(52, 211, 153, 0.25)" }
  },
  {
    id: "sunset",
    name: "Sunset",
    type: "Solid",
    vars: { "--sc64-bg": "#1d0f1e", "--sc64-panel": "#2d1530", "--sc64-panel2": "#251226", "--sc64-deep": "#150a16", "--sc64-border": "#47224a", "--sc64-borderlight": "#653466", "--sc64-accent": "#fb7185", "--sc64-accent2": "#fbbf24", "--sc64-good": "#4ade80", "--sc64-warn": "#fbbf24", "--sc64-bad": "#fb7185", "--sc64-muted": "#b58ab5", "--sc64-text": "#fce7f3", "--sc64-glow": "0 0 24px rgba(251, 113, 133, 0.25)" }
  },
  {
    id: "royal",
    name: "Royal",
    type: "Solid",
    vars: { "--sc64-bg": "#0d0b21", "--sc64-panel": "#171436", "--sc64-panel2": "#13102c", "--sc64-deep": "#08071a", "--sc64-border": "#2a2652", "--sc64-borderlight": "#3d3780", "--sc64-accent": "#818cf8", "--sc64-accent2": "#c084fc", "--sc64-good": "#34d399", "--sc64-warn": "#fbbf24", "--sc64-bad": "#f87171", "--sc64-muted": "#9aa3d8", "--sc64-text": "#e6e7f5", "--sc64-glow": "0 0 24px rgba(129, 140, 248, 0.25)" }
  },
  {
    id: "candy",
    name: "Candy",
    type: "Solid",
    vars: { "--sc64-bg": "#1a0b2e", "--sc64-panel": "#261040", "--sc64-panel2": "#1f0c36", "--sc64-deep": "#120623", "--sc64-border": "#3d1d63", "--sc64-borderlight": "#5b2f8f", "--sc64-accent": "#f472b6", "--sc64-accent2": "#22d3ee", "--sc64-good": "#4ade80", "--sc64-warn": "#fbbf24", "--sc64-bad": "#fb7185", "--sc64-muted": "#c39bd8", "--sc64-text": "#fae8ff", "--sc64-glow": "0 0 24px rgba(244, 114, 182, 0.28)" }
  },
  {
    id: "paper",
    name: "Paper",
    type: "Light",
    vars: { "--sc64-bg": "#f1f5f9", "--sc64-panel": "#ffffff", "--sc64-panel2": "#e2e8f0", "--sc64-deep": "#cbd5e1", "--sc64-border": "#cbd5e1", "--sc64-borderlight": "#94a3b8", "--sc64-accent": "#2563eb", "--sc64-accent2": "#7c3aed", "--sc64-good": "#16a34a", "--sc64-warn": "#d97706", "--sc64-bad": "#dc2626", "--sc64-muted": "#64748b", "--sc64-text": "#1e293b", "--sc64-glow": "0 0 24px rgba(37, 99, 235, 0.18)" }
  }
];

const rootEl = document.documentElement;
let activeTheme = "gallery";

function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  for (const [key, value] of Object.entries(theme.vars)) {
    rootEl.style.setProperty(key, value);
  }
  rootEl.dataset.theme = id;
  document.body.classList.toggle("gallery", theme.type === "Gallery");
  activeTheme = id;
  document.querySelectorAll(".theme-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.theme === id);
  });
}

function buildThemePicker() {
  const grid = document.getElementById("themeGrid");
  THEMES.forEach((theme) => {
    const card = document.createElement("button");
    card.className = "theme-card";
    card.dataset.theme = theme.id;
    card.setAttribute("aria-pressed", "false");
    card.innerHTML =
      '<span class="theme-swatch">' +
      '<span style="background:var(--sc64-deep)"></span>' +
      '<span style="background:' + theme.vars["--sc64-accent"] + '"></span>' +
      '<span style="background:' + theme.vars["--sc64-accent2"] + '"></span>' +
      "</span>" +
      '<span class="theme-name">' + theme.name + "</span>" +
      '<span class="theme-type">' + theme.type + " · " + theme.id + "</span>";
    card.addEventListener("click", () => {
      applyTheme(theme.id);
      card.setAttribute("aria-pressed", "true");
    });
    grid.appendChild(card);
  });
  applyTheme(activeTheme);
}

/* Interactive app preview: screen switching (sidebar + tabs below window). */
function initPreviewScreens() {
  const sideItems = document.querySelectorAll(".app-side .s-item");
  const tabs = document.querySelectorAll(".demo-tabs .dtab");
  const screens = document.querySelectorAll(".screen");
  if (!screens.length) return;
  const go = (id) => {
    screens.forEach((s) => s.classList.toggle("active", s.dataset.screen === id));
    sideItems.forEach((b) => b.classList.toggle("active", b.dataset.screen === id));
    tabs.forEach((b) => b.classList.toggle("active", b.dataset.screen === id));
  };
  document.querySelectorAll("[data-screen]").forEach((el) => {
    if (el.classList.contains("screen")) return;
    el.addEventListener("click", () => go(el.dataset.screen));
  });
}

/* Titlebar Theme dropdown — same list as the in-app menu. */
function initTitlebarTheme() {
  const menu = document.getElementById("titlebarTheme");
  if (!menu) return;
  const btn = menu.querySelector(".t-menu-btn");
  const pop = menu.querySelector(".t-menu-pop");
  function renderPop() {
    pop.innerHTML = "";
    THEMES.forEach((theme) => {
      const item = document.createElement("button");
      item.type = "button";
      if (theme.id === activeTheme) item.classList.add("on");
      item.innerHTML =
        "<span>" + theme.name + "</span>" + (theme.id === activeTheme ? '<span>✓</span>' : "");
      item.addEventListener("click", () => {
        applyTheme(theme.id);
        menu.classList.remove("open");
        renderPop();
      });
      pop.appendChild(item);
    });
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    renderPop();
    menu.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target)) menu.classList.remove("open");
  });
}

/* Mini theme swatches inside the preview's Settings screen. */
function initMiniThemes() {
  const wrap = document.querySelector(".mini-themes");
  if (!wrap) return;
  wrap.querySelectorAll("button[data-theme]").forEach((b) => {
    const theme = THEMES.find((t) => t.id === b.dataset.theme);
    if (!theme) return;
    b.style.background =
      "linear-gradient(135deg," +
      theme.vars["--sc64-deep"] + " 20%," +
      theme.vars["--sc64-accent"] + ")";
    b.title = theme.name;
    b.addEventListener("click", () => {
      applyTheme(theme.id);
      wrap.querySelectorAll("button").forEach((x) =>
        x.classList.toggle("on", x.dataset.theme === activeTheme)
      );
    });
  });
  document.addEventListener("click", () => {
    wrap.querySelectorAll("button").forEach((x) =>
      x.classList.toggle("on", x.dataset.theme === activeTheme)
    );
  });
}

/* Fake live progress so the Downloads screen feels alive. */
function initFakeProgress() {
  const bars = [
    { el: document.getElementById("bar1"), label: document.getElementById("pv1"), v: 72, max: 98 },
    { el: document.getElementById("bar2"), label: document.getElementById("pv2"), v: 38, max: 95 }
  ].filter((b) => b.el && b.label);
  if (!bars.length) return;
  setInterval(() => {
    let allDone = true;
    bars.forEach((b) => {
      if (b.v < b.max) {
        b.v = Math.min(b.max, b.v + Math.random() * 2);
        allDone = false;
      }
    });
    bars.forEach((b) => {
      b.el.style.width = b.v + "%";
      b.label.textContent = Math.round(b.v) + "%";
    });
    if (allDone) {
      bars.forEach((b) => (b.v = 8));
    }
  }, 2200);
}

/* Mobile nav. */
const toggle = document.querySelector(".nav-toggle");
const navLinks = document.getElementById("navLinks");
if (toggle && navLinks) {
  toggle.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  navLinks.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      navLinks.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    })
  );
}

/* Scroll reveal. */
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

/* FAQ accordion. */
document.querySelectorAll(".faq-item").forEach((item) => {
  const q = item.querySelector(".faq-q");
  const a = item.querySelector(".faq-a");
  q.addEventListener("click", () => {
    const open = item.classList.toggle("open");
    q.setAttribute("aria-expanded", String(open));
    a.style.maxHeight = open ? a.scrollHeight + "px" : "0";
  });
});

buildThemePicker();
initPreviewScreens();
initTitlebarTheme();
initMiniThemes();
initFakeProgress();
