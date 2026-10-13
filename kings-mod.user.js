// ==UserScript==
// @name         Magic Garden — Shortcut Sidebar
// @namespace    Quinoa
// @version      3.0.0
// @description  Compact Arie-style mod dock: icon grid with live on/off lights, customize panel (size, columns, labels, opacity, hide buttons), a movable + resizable Garden Almanac, and a weather timer you can switch on/off. Alt+O opens the Almanac.
// @match        https://1227719606223765687.discordsays.com/*
// @match        https://magiccircle.gg/r/*
// @match        https://magicgarden.gg/r/*
// @match        https://starweaver.org/r/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// @license      All rights reserved. Do not redistribute or rebrand without permission.
// @updateURL    https://raw.githubusercontent.com/omit28/kingswo/main/kings-mod.user.js
// @downloadURL  https://raw.githubusercontent.com/omit28/kingswo/main/kings-mod.user.js
// ==/UserScript==

(() => {
  "use strict";
  // Title is stored encoded (two copies + checksum) and re-checked while running, so a quick text edit does not change it.
  const VERSION = "v3.0";
  const _fnv = (str) => { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const TITLE = (() => { const a = String.fromCharCode(...[100,111,77,32,115,39,103,110,105,75].reverse()); return _fnv(a) === 1311861492 ? a : atob("S2luZydzIE1vZA=="); })();
  const DOCK_ID = "mg-shortcut-sidebar", ALMANAC_ID = "mg-garden-almanac", WEATHER_ID = "mg-weather-timer", STYLE_ID = "mg-garden-dock-style", GC_STYLE_ID = "mg-hide-gc-timer";
  const MINI_KEY = "mg-shortcut-sidebar-minimized-v1", POSITION_KEY = "mg-shortcut-sidebar-position-v2", OLD_POSITION_KEY = "mg-shortcut-sidebar-position-v1";
  const SETTINGS_KEY = "mg-shortcut-sidebar-settings-v3", ALMANAC_RECT_KEY = "mg-almanac-rect-v1", WEATHER_POS_KEY = "mg-weather-pos-v1";
  const PET_STR = {"Worm":{"ms":2.0,"h":12.0},"Snail":{"ms":2.0,"h":12.0},"Bee":{"ms":2.5,"h":12.0},"Chicken":{"ms":2.0,"h":24.0},"Bunny":{"ms":2.0,"h":24.0},"Dragonfly":{"ms":2.5,"h":24.0},"Pig":{"ms":2.5,"h":72.0},"Cow":{"ms":2.5,"h":72.0},"Turkey":{"ms":2.5,"h":72.0},"Squirrel":{"ms":2.0,"h":100.0},"Turtle":{"ms":2.5,"h":100.0},"Goat":{"ms":2.0,"h":100.0},"SnowFox":{"ms":2.0,"h":100.0},"Stoat":{"ms":2.0,"h":100.0},"WhiteCaribou":{"ms":2.5,"h":100.0},"Pony":{"ms":2.0,"h":72.0},"Horse":{"ms":2.5,"h":100.0},"FireHorse":{"ms":2.5,"h":144.0},"Butterfly":{"ms":2.5,"h":144.0},"Capybara":{"ms":2.5,"h":144.0},"Peacock":{"ms":2.5,"h":144.0}};
  const BASE_SIZE = 50, MAX_SIZE = 100;
  // Crop mutations a granter pet can hand out: ability id -> mutation and base chance (% per minute at 100 strength).
  const GRANTERS = { RainbowGranter: ["Rainbow", 0.72], GoldGranter: ["Gold", 0.72], FrostGranter: ["Frozen", 6], ThunderstruckGranter: ["Thunderstruck", 5], RainDance: ["Wet", 10], SnowGranter: ["Chilled", 8], DawnlitGranter: ["Dawnlit", 4], AmberlitGranter: ["Ambershine", 2] };
  const MUTATION_ORDER = ["Rainbow", "Gold", "Frozen", "Thunderstruck", "Wet", "Chilled", "Dawnlit", "Ambershine"];
  const MUTATION_COLOUR = { Rainbow: "linear-gradient(90deg,#f43f5e,#f59e0b,#84cc16,#22d3ee,#a78bfa)", Gold: "linear-gradient(90deg,#f59e0b,#fde047)", Frozen: "#7dd3fc", Thunderstruck: "#facc15", Wet: "#38bdf8", Chilled: "#bae6fd", Dawnlit: "#c084fc", Ambershine: "#fb923c", "Max size": "linear-gradient(90deg,#4ade80,#bef264)" };
  const DISPLAY_NAMES = { OrangeTulip: "Tulip", BurrosTail: "Burro's Tail", PineTree: "Pine Tree", Cacao: "Cacao Fruit", Lychee: "Lychee Fruit", DawnCelestial: "Dawnbinder Bulb", MoonCelestial: "Moonbinder Bulb", Starweaver: "Starweaver Fruit" };
  // Dock buttons. `lamp` = settings key of an automation script, so its button can show an on/off light.
  const ITEMS = [
    { id: "almanac", overview: true, icon: "book", label: "Almanac", title: "Garden Almanac — Alt + O" },
    { id: "weather", weather: true, icon: "cloud", label: "Weather", title: "Weather timer — click to turn on / off" },
    { id: "harvest", code: "KeyH", icon: "wheat", label: "Harvest", title: "Auto Harvest — Alt + H", lamp: "mg-auto-harvest-settings-v1" },
    { id: "plant", code: "KeyP", icon: "sprout", label: "Plant", title: "Auto Plant — Alt + P" },
    { id: "silo", code: "KeyU", icon: "silo", label: "Silo", title: "Auto Seed Silo — Alt + U" },
    { id: "trough", code: "KeyY", icon: "bowl", label: "Trough", title: "Auto Feeding Trough — Alt + Y", lamp: "mg-auto-feeding-trough-settings-v1" },
    { id: "feed", code: "KeyF", icon: "apple", label: "Feed", title: "Auto Feed Pets — Alt + F", lamp: "mg-auto-feed-pets-settings-v1" },
    { id: "abilities", code: "KeyA", icon: "sparkles", label: "Abilities", title: "Ability Tracker — Alt + A" },
    { id: "pets", code: "KeyJ", icon: "paw", label: "Pets", title: "Weather Pet Swapper — Alt + J" },
    { id: "buy", code: "KeyB", icon: "cart", label: "Buy", title: "Auto Buy — Alt + B" },
    { id: "sell", code: "KeyG", icon: "coin", label: "Sell", title: "Auto Sell — Alt + G" }
  ];

  const ICONS = {
    book: '<path d="M12 6.5C10.3 5 8 4.5 4 4.5v13c4 0 6.3.5 8 2 1.7-1.5 4-2 8-2v-13c-4 0-6.3.5-8 2z"/><path d="M12 6.5v13"/>',
    wheat: '<path d="M12 21V8"/><path d="M12 8c-2.5 0-4-1.7-4-4 2.5 0 4 1.7 4 4z"/><path d="M12 8c2.5 0 4-1.7 4-4-2.5 0-4 1.7-4 4z"/><path d="M12 14c-2.5 0-4-1.7-4-4 2.5 0 4 1.7 4 4z"/><path d="M12 14c2.5 0 4-1.7 4-4-2.5 0-4 1.7-4 4z"/><path d="M12 20c-2.5 0-4-1.7-4-4 2.5 0 4 1.7 4 4z"/><path d="M12 20c2.5 0 4-1.7 4-4-2.5 0-4 1.7-4 4z"/>',
    sprout: '<path d="M12 21v-9"/><path d="M12 12c0-3.3-2.5-6-6-6 0 3.5 2.5 6 6 6z"/><path d="M12 14c0-2.8 2.2-5 5.5-5 0 3-2.2 5-5.5 5z"/>',
    silo: '<path d="M7 21V8c0-3 2-5 5-5s5 2 5 5v13z"/><path d="M7 9.5h10"/><path d="M7 15h10"/><path d="M5 21h14"/>',
    bowl: '<path d="M3 11h18"/><path d="M4 11c0 4.5 3.4 8 8 8s8-3.5 8-8"/><path d="M9 7.5l1.2-3M13 7.5l1.2-3"/>',
    apple: '<path d="M12 7.5C10 6 6 6.8 6 11.5c0 4 2.5 8.5 6 8.5s6-4.5 6-8.5C18 6.8 14 6 12 7.5z"/><path d="M12 7.5c0-2 1-3.5 3-4"/>',
    sparkles: '<path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    paw: '<circle cx="6.5" cy="10.5" r="1.8"/><circle cx="10.5" cy="6.5" r="1.8"/><circle cx="15.5" cy="6.5" r="1.8"/><circle cx="19" cy="10.5" r="1.8"/><path d="M12.8 12.5c-2.7 0-5 2.2-5 4.2 0 1.6 1.4 2.3 2.8 2.3.8 0 1.4-.3 2.2-.3s1.4.3 2.2.3c1.4 0 2.8-.7 2.8-2.3 0-2-2.3-4.2-5-4.2z"/>',
    cart: '<circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2.5 3.5h3l2.2 11h10.5l2-8H6.2"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9c-.5-1.2-1.6-1.8-2.8-1.8-1.6 0-2.8.9-2.8 2.2 0 3 5.8 1.5 5.8 4.6 0 1.3-1.2 2.2-3 2.2-1.3 0-2.5-.6-3-1.8"/><path d="M12 5.5v2M12 16.5v2"/>',
    cloud: '<path d="M7 14.5a4 4 0 0 1-.5-7.9A5.5 5.5 0 0 1 17 5.8a4.2 4.2 0 0 1 .5 8.7z"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>'
  };
  const iconSvg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pretty = (id) => String(id || "").replace(/([a-z])([A-Z])/g, "$1 $2");
  const cropName = (species) => DISPLAY_NAMES[species] || pretty(species || "Unknown");
  const fmtInt = (n) => Math.round(n).toLocaleString("en-US");
  function fmtDur(ms) {
    if (!Number.isFinite(ms)) return "—"; if (ms <= 0) return "now";
    const s = Math.round(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d) return `${d}d ${h}h`; if (h) return `${h}h ${m}m`; if (m) return `${m}m ${String(sec).padStart(2, "0")}s`; return `${sec}s`;
  }

  // ---------- game data ----------
  let store = null;
  function findStoreViaFiber() { const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__; if (!hook?.renderers?.size || typeof hook.getFiberRoots !== "function") return null; for (const [id] of hook.renderers) { const roots = hook.getFiberRoots(id); if (!roots) continue; for (const root of roots) { const seen = new Set(), stack = [root.current]; while (stack.length) { const fiber = stack.pop(); if (!fiber || seen.has(fiber)) continue; seen.add(fiber); const candidate = fiber.pendingProps?.value; if (candidate && typeof candidate.get === "function" && typeof candidate.sub === "function") return candidate; if (fiber.child) stack.push(fiber.child); if (fiber.sibling) stack.push(fiber.sibling); if (fiber.alternate) stack.push(fiber.alternate); } } } return null; }
  async function getStore() { if (store) return store; const shared = window.__MG_STORE_BRIDGE__; if (shared?.promise?.then) { try { const resolved = await shared.promise; if (resolved && !resolved.__polyfill) return store = resolved; } catch {} } for (let i = 0; i < 20; i++) { const found = findStoreViaFiber(); if (found) return store = found; await sleep(500); } return null; }
  function findAtom(label) { const cache = window.jotaiAtomCache?.cache; if (!cache?.values) return null; for (const atom of cache.values()) if (atom?.debugLabel === label || atom?.label === label) return atom; return null; }
  async function readAtom(activeStore, atom) { if (!atom) return null; try { let v = activeStore.get(atom); if (v && typeof v.then === "function") v = await Promise.race([v, new Promise((r) => setTimeout(() => r(null), 2000))]); return v; } catch { return null; } }
  function strengthOf(slot, species) {
    const info = PET_STR[species]; if (!info) return 87;
    const maxScale = info.ms > 1 ? info.ms : 1, targetScale = typeof slot.targetScale === "number" ? slot.targetScale : 1;
    const maxStrength = Math.max(Math.floor((maxScale > 1 ? (targetScale - 1) / (maxScale - 1) : 0) * 20 + 80), 0);
    const hours = info.h > 0 ? info.h : 1, xp = Math.max(0, Number(slot.xp) || 0);
    return Math.min(Math.max(maxStrength - 30, 0) + Math.min(Math.floor((xp / (hours * 3600)) * 30), 30), maxStrength);
  }
  async function readGame() {
    const activeStore = await getStore(); if (!activeStore) return null;
    const data = await readAtom(activeStore, findAtom("myDataAtom")); const tiles = data?.garden?.tileObjects;
    if (!tiles || typeof tiles !== "object") return null;
    const infos = await readAtom(activeStore, findAtom("myPetInfosAtom")), prims = await readAtom(activeStore, findAtom("myPredictedPetSlotsAtom") || findAtom("myPrimitivePetSlotsAtom"));
    const rawPets = Array.isArray(infos) && infos.length ? infos : Array.isArray(prims) ? prims : [];
    const pets = rawPets.map((entry) => { const slot = entry?.slot && typeof entry.slot === "object" ? entry.slot : entry; if (!slot) return null; const species = String(slot.petSpecies ?? slot.species ?? ""); return { species, name: slot.name ? String(slot.name) : "", fed: Number(slot.hunger) > 0, abilities: Array.isArray(slot.abilities) ? slot.abilities.map(String) : [], strength: strengthOf(slot, species) }; }).filter(Boolean);
    return { tiles, pets };
  }

  // ---------- garden maths ----------
  function computeStats(game, now = Date.now()) {
    const out = { plants: 0, crops: 0, mature: 0, mutated: 0, growthSum: 0, maxSize: 0, nextAt: null, allAt: null, species: new Map(), missing: {}, have: {}, etas: [] };
    const noteMissing = (m) => {
      const thunder = m.includes("Thunderstruck") || m.includes("Thundercharged"), frozen = m.includes("Frozen"), wet = m.includes("Wet"), chilled = m.includes("Chilled");
      const noWeather = !thunder && !frozen && !wet && !chilled, noTime = !m.some((n) => ["Ambershine", "Ambercharged", "Amberbound", "Dawnlit", "Dawncharged", "Dawnbound"].includes(n));
      const need = { Rainbow: !m.includes("Rainbow") && !m.includes("Gold"), Gold: !m.includes("Gold") && !m.includes("Rainbow"), Frozen: !frozen && !thunder, Thunderstruck: noWeather, Wet: !wet && !thunder && !frozen, Chilled: !chilled && !thunder && !frozen, Dawnlit: noTime, Ambershine: noTime };
      for (const [name, missing] of Object.entries(need)) if (missing) out.missing[name] = (out.missing[name] || 0) + 1;
    };
    for (const tile of Object.values(game.tiles)) {
      if (!tile || tile.objectType !== "plant" || !tile.species || !Array.isArray(tile.slots)) continue;
      out.plants++;
      for (const slot of tile.slots) {
        if (!slot || slot.preserved) continue;
        const species = String(slot.species || tile.species); const muts = Array.isArray(slot.mutations) ? slot.mutations : [];
        let row = out.species.get(species); if (!row) { row = { species, plants: 0, crops: 0, mature: 0, growthSum: 0, mutations: new Map() }; out.species.set(species, row); }
        out.crops++; row.crops++; noteMissing(muts);
        const end = Number(slot.endTime) || 0, start = Number(slot.startTime) || 0;
        let growth = 1; if (end > now) { growth = end > start && start > 0 ? Math.max(0, Math.min(1, (now - start) / (end - start))) : 0; out.nextAt = out.nextAt === null ? end : Math.min(out.nextAt, end); out.allAt = out.allAt === null ? end : Math.max(out.allAt, end); } else { out.mature++; row.mature++; }
        out.growthSum += growth; row.growthSum += growth;
        if (muts.length) out.mutated++;
        if (slot.size != null && Number(slot.size) >= MAX_SIZE) out.maxSize++;
        for (const m of muts) row.mutations.set(m, (row.mutations.get(m) || 0) + 1);
      }
    }
    for (const name of MUTATION_ORDER) out.have[name] = out.crops - (out.missing[name] || 0);
    // Completion estimates: every fed pet with a granter ability rolls once a minute; each hit mutates one crop.
    for (const name of MUTATION_ORDER) {
      const sources = []; let petCount = new Set();
      game.pets.forEach((pet, index) => { if (!pet.fed) return; for (const ability of pet.abilities) { const g = GRANTERS[ability]; if (g && g[0] === name) { sources.push(Math.min(1, (g[1] * pet.strength) / 10000)); petCount.add(index); } } });
      if (!sources.length) { out.etas.push({ name, pets: 0 }); continue; }
      const perMinute = 1 - sources.reduce((left, p) => left * (1 - p), 1); const meanMs = 60000 / perMinute; const missing = out.missing[name] || 0;
      out.etas.push({ name, pets: petCount.size, perMinute, missing, totalMs: missing * meanMs });
    }
    return out;
  }

  function ring(id, pct, colourA, colourB) {
    const r = 33, c = 2 * Math.PI * r, shown = Math.max(0, Math.min(1, pct)); const big = `${Math.round(shown * 100)}%`;
    return `<svg viewBox="0 0 84 84"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colourA}"/><stop offset="1" stop-color="${colourB}"/></linearGradient></defs><circle cx="42" cy="42" r="${r}" fill="none" stroke="rgba(0,0,0,.4)" stroke-width="9"/><circle cx="42" cy="42" r="${r}" fill="none" stroke="url(#${id})" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(c * shown).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle" font-family="Georgia,serif" font-size="17" font-weight="700" fill="#fef3c7">${big}</text></svg>`;
  }
  const bar = (pct, colour) => `<div class="ga-bar"><i style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%;background:${colour}"></i></div>`;
  function almanacHtml(game, stats, now) {
    if (!stats.crops) return `<div class="ga-empty">🌱<br>No crops are growing in your garden right now.<br>Plant something and the Almanac fills in.</div>`;
    const ripePct = stats.mature / stats.crops, growthPct = stats.growthSum / stats.crops, mutPct = stats.mutated / stats.crops;
    let html = `<div class="ga-rings"><div class="ga-ring">${ring("gr1", ripePct, "#4ade80", "#bef264")}<b>Ripe now</b><span>${fmtInt(stats.mature)} of ${fmtInt(stats.crops)} crops</span></div><div class="ga-ring">${ring("gr2", growthPct, "#38bdf8", "#a5f3fc")}<b>Growth</b><span>average across ${fmtInt(stats.plants)} plants</span></div><div class="ga-ring">${ring("gr3", mutPct, "#f472b6", "#fde047")}<b>Mutated</b><span>${fmtInt(stats.mutated)} crops</span></div></div>`;
    html += `<div class="ga-pills"><div class="ga-pill"><small>Next crop ripe</small><b>${stats.nextAt === null ? "all ripe" : fmtDur(stats.nextAt - now)}</b></div><div class="ga-pill"><small>Everything ripe</small><b>${stats.allAt === null ? "now" : fmtDur(stats.allAt - now)}</b></div></div>`;
    html += `<div class="ga-h">Mutation progress</div>`;
    for (const name of MUTATION_ORDER) {
      const eta = stats.etas.find((e) => e.name === name), have = stats.have[name], pct = (have / stats.crops) * 100, hasAny = have > 0 || (eta && eta.pets > 0);
      let etaText;
      if (!stats.missing[name]) etaText = `<b>Complete</b> — every crop that can take it has it.`;
      else if (eta && eta.pets) etaText = `${eta.pets} pet${eta.pets > 1 ? "s" : ""} working on it · <b>about ${fmtDur(eta.totalMs)}</b> to finish ${fmtInt(stats.missing[name])} crops`;
      else etaText = `${fmtInt(stats.missing[name])} crops still missing · no fed pet with this granter is active`;
      html += `<div class="ga-mut" data-dim="${hasAny ? "false" : "true"}"><div class="ga-line"><span>${esc(name)}</span><em>${fmtInt(have)} / ${fmtInt(stats.crops)}</em></div>${bar(pct, MUTATION_COLOUR[name])}<div class="ga-eta">${etaText}</div></div>`;
    }
    html += `<div class="ga-mut"><div class="ga-line"><span>Max size</span><em>${fmtInt(stats.maxSize)} / ${fmtInt(stats.crops)}</em></div>${bar((stats.maxSize / stats.crops) * 100, MUTATION_COLOUR["Max size"])}<div class="ga-eta">Crops that reached full size.</div></div>`;
    html += `<div class="ga-h">By species</div><div class="ga-species">`;
    for (const row of [...stats.species.values()].sort((a, b) => b.crops - a.crops)) {
      const chips = [...row.mutations.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, n]) => `<span class="ga-chip" style="background:${(MUTATION_COLOUR[m] || "#a7f3d0")}">${esc(m)} ${n}</span>`).join("");
      html += `<div class="ga-card"><h3>${esc(cropName(row.species))}</h3><div class="ga-line"><em>${fmtInt(row.crops)} crops</em><em>${fmtInt(row.mature)} ripe</em></div>${bar((row.mature / row.crops) * 100, "linear-gradient(90deg,#4ade80,#bef264)")}<div class="ga-eta">growth <b>${Math.round((row.growthSum / row.crops) * 100)}%</b></div>${chips ? `<div class="ga-chips">${chips}</div>` : ""}</div>`;
    }
    html += `</div><div class="ga-note">Preserved crops are skipped. Estimates assume each fed granter pet rolls once a minute and every hit lands on a crop that still needs it.</div>`;
    return html;
  }

  // ---------- settings + small helpers ----------
  const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
  const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pad2 = (n) => String(n).padStart(2, "0");
  const DEFAULTS = { scale: 1, cols: 3, labels: false, opacity: 1, hidden: {}, weather: true, weatherScale: 1, hideGC: true, almanacZoom: 1 };
  const cfg = Object.assign({}, DEFAULTS, readJson(SETTINGS_KEY) || {});
  function sanitizeCfg() {
    cfg.scale = clamp(Number(cfg.scale) || 1, 0.6, 1.6); cfg.weatherScale = clamp(Number(cfg.weatherScale) || 1, 0.7, 1.6);
    cfg.almanacZoom = clamp(Number(cfg.almanacZoom) || 1, 0.7, 1.6); cfg.opacity = clamp(Number(cfg.opacity) || 1, 0.4, 1);
    cfg.cols = [2, 3, 4].includes(Number(cfg.cols)) ? Number(cfg.cols) : 3;
    cfg.labels = cfg.labels === true; cfg.weather = cfg.weather !== false; cfg.hideGC = cfg.hideGC !== false;
    if (!cfg.hidden || typeof cfg.hidden !== "object") cfg.hidden = {};
  }
  sanitizeCfg();
  const saveCfg = () => writeJson(SETTINGS_KEY, cfg);
  const lampOn = (key) => readJson(key)?.enabled === true;
  function toggleLamp(key) { const cur = readJson(key) || {}; cur.enabled = cur.enabled !== true; try { localStorage.setItem(key, JSON.stringify(cur)); } catch {} }

  // Generic "drag this element by that handle" + "keep it on screen" helpers.
  function makeMovable(el, handle, key, onDone) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest?.("button,input,select,[data-nodrag]")) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect(), ox = event.clientX - rect.left, oy = event.clientY - rect.top; handle.style.cursor = "grabbing";
      const move = (e) => {
        const r = el.getBoundingClientRect();
        el.style.left = `${clamp(e.clientX - ox, 0, Math.max(0, window.innerWidth - r.width))}px`; el.style.top = `${clamp(e.clientY - oy, 0, Math.max(0, window.innerHeight - r.height))}px`;
        el.style.right = "auto"; el.style.bottom = "auto"; el.style.transform = "none";
      };
      const finish = () => {
        handle.style.cursor = ""; const next = el.getBoundingClientRect(); writeJson(key, { left: Math.round(next.left), top: Math.round(next.top) }); onDone?.();
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish);
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish);
    });
  }
  function applySavedPos(el, ...keys) {
    for (const key of keys) { const p = readJson(key); if (Number.isFinite(p?.left) && Number.isFinite(p?.top)) { el.style.left = `${p.left}px`; el.style.top = `${p.top}px`; el.style.right = "auto"; el.style.bottom = "auto"; el.style.transform = "none"; return true; } }
    return false;
  }
  function keepOnScreen(el) {
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect(); if (!rect.height || el.style.display === "none") return;
      const top = clamp(rect.top, 4, Math.max(4, window.innerHeight - rect.height - 4)), left = clamp(rect.left, 0, Math.max(0, window.innerWidth - rect.width));
      if (Math.abs(top - rect.top) > 1 || Math.abs(left - rect.left) > 1) { el.style.top = `${Math.round(top)}px`; el.style.left = `${Math.round(left)}px`; el.style.right = "auto"; el.style.bottom = "auto"; el.style.transform = "none"; }
    });
  }

  // ---------- styles ----------
  const U = (n) => `calc(${n}px * var(--s))`;   // dock sizes follow the menu-size setting
  const CSS = `
#${DOCK_ID}{--s:1;--cols:3;--cell:40;--op:1;position:fixed;right:12px;top:90px;z-index:2147483646;box-sizing:border-box;padding:${U(8)};border-radius:${U(18)};background:linear-gradient(180deg,rgba(42,45,44,.97),rgba(27,29,28,.97));border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 28px rgba(0,0,0,.5);color:#e8eeea;font:700 ${U(11)}/1.2 "Trebuchet MS",system-ui,sans-serif;opacity:var(--op);user-select:none;-webkit-user-select:none}
#${DOCK_ID} *{box-sizing:border-box}
#${DOCK_ID} .gd-head{display:flex;align-items:center;gap:${U(6)};padding:0 ${U(2)} ${U(8)};cursor:grab;touch-action:none}
#${DOCK_ID} .gd-live{flex:none;width:${U(7)};height:${U(7)};border-radius:50%;background:#4ade80;box-shadow:0 0 6px #4ade80}
#${DOCK_ID} .gd-title{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:${U(11.5)};letter-spacing:.02em;color:#fde68a}
#${DOCK_ID}[data-cols="2"] .gd-title{display:none}
#${DOCK_ID}[data-cols="2"] .gd-head{justify-content:space-between}
#${DOCK_ID} .gd-hb{flex:none;display:grid;place-items:center;width:${U(22)};height:${U(22)};padding:0;border:1px solid rgba(255,255,255,.12);border-radius:${U(7)};background:rgba(255,255,255,.06);color:#cfd8d2;cursor:pointer}
#${DOCK_ID} .gd-hb:hover{color:#fde047;border-color:rgba(253,224,71,.6)}
#${DOCK_ID} .gd-hb svg{width:${U(13)};height:${U(13)};fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .15s ease}
#${DOCK_ID} .gd-lamps{display:none;align-items:center;gap:${U(4)}}
#${DOCK_ID} .gd-lamps .gd-dot{position:static}
#${DOCK_ID} .gd-grid{display:grid;grid-template-columns:repeat(var(--cols),calc(var(--cell) * 1px * var(--s)));gap:${U(7)}}
#${DOCK_ID} .gd-btn{position:relative;display:grid;place-items:center;align-content:center;gap:${U(2)};min-height:calc(40px * var(--s));padding:${U(4)} 0;border:1px solid rgba(255,255,255,.09);border-radius:${U(12)};background:rgba(255,255,255,.07);color:#dfe7e2;font:inherit;cursor:pointer;transition:transform .12s ease,border-color .12s ease,background .12s ease,color .12s ease}
#${DOCK_ID} .gd-btn:hover{transform:translateY(-1px);border-color:rgba(253,224,71,.6);background:rgba(253,224,71,.12);color:#fde047}
#${DOCK_ID} .gd-btn:active{transform:scale(.96)}
#${DOCK_ID} .gd-btn[data-active="true"]{border-color:rgba(253,224,71,.7);background:rgba(253,224,71,.16);color:#fde047}
#${DOCK_ID} .gd-icon{display:grid;place-items:center;width:${U(20)};height:${U(20)}}
#${DOCK_ID} .gd-icon svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
#${DOCK_ID} .gd-label{display:none;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:${U(8.5)};letter-spacing:.03em;text-transform:uppercase;color:inherit;opacity:.85}
#${DOCK_ID}[data-labels="true"] .gd-label{display:block}
#${DOCK_ID} .gd-dot{position:absolute;top:${U(4)};right:${U(5)};width:${U(6)};height:${U(6)};border-radius:50%;background:#3b4741;box-shadow:inset 0 0 0 1px rgba(0,0,0,.4)}
#${DOCK_ID} .gd-dot[data-on="true"]{background:#fde047;box-shadow:0 0 0 1px rgba(0,0,0,.35),0 0 7px 2px rgba(253,224,71,.7);animation:gd-pulse 2.2s ease-in-out infinite}
@keyframes gd-pulse{50%{box-shadow:0 0 0 1px rgba(0,0,0,.35),0 0 3px 0 rgba(253,224,71,.35)}}
#${DOCK_ID}[data-mini="true"]{padding:${U(6)} ${U(8)}}
#${DOCK_ID}[data-mini="true"] .gd-head{padding:0}
#${DOCK_ID}[data-mini="true"] .gd-grid,#${DOCK_ID}[data-mini="true"] .gd-pop{display:none}
#${DOCK_ID}[data-mini="true"] .gd-lamps{display:flex}
#${DOCK_ID}[data-mini="true"] [data-min] svg{transform:rotate(-90deg)}
#${DOCK_ID} .gd-pop{display:none;position:absolute;top:0;width:236px;max-height:calc(100vh - 16px);overflow-y:auto;padding:12px;border-radius:16px;background:rgba(28,30,29,.98);border:1px solid rgba(255,255,255,.12);box-shadow:0 14px 34px rgba(0,0,0,.55);font:600 12px "Trebuchet MS",system-ui,sans-serif;color:#dfe7e2;scrollbar-width:thin}
#${DOCK_ID} .gd-pop[data-open="true"]{display:block}
.gp-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:14px;color:#fde68a}
.gp-title span{font-size:10px;color:#7d8b83}
.gp-sec{margin:10px 0 5px;font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:#7fb897}
.gp-row{display:flex;align-items:center;gap:8px;min-height:26px}
.gp-row>span{flex:0 0 74px;color:#c2cdc6}
.gp-row input[type=range]{flex:1;min-width:0;accent-color:#fde047}
.gp-row b{flex:0 0 38px;text-align:right;color:#fde68a;font-size:11px}
.gp-sw{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:26px;cursor:pointer;color:#c2cdc6}
.gp-sw input{accent-color:#fde047;width:15px;height:15px}
.gp-seg{display:flex;gap:4px;flex:1}
.gp-seg button,.gp-chip,.gp-foot button{border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.06);color:#dfe7e2;font:700 11px "Trebuchet MS",system-ui,sans-serif;cursor:pointer}
.gp-seg button{flex:1;padding:4px 0}
.gp-seg button[data-on="true"],.gp-chip[data-on="true"]{border-color:rgba(253,224,71,.65);background:rgba(253,224,71,.16);color:#fde047}
.gp-chips{display:flex;flex-wrap:wrap;gap:4px}
.gp-chip{padding:3px 8px;opacity:.55}
.gp-chip[data-on="true"]{opacity:1}
.gp-foot{display:flex;gap:6px;margin-top:12px}
.gp-foot button{flex:1;padding:6px 4px}
.gp-foot button:hover{border-color:rgba(253,224,71,.6)}
#${ALMANAC_ID}{position:fixed;inset:0;z-index:2147483645;display:none;pointer-events:none;font-family:Georgia,"Palatino Linotype",serif;color:#ecf6ee}
#${ALMANAC_ID} .ga-sheet{position:absolute;display:flex;flex-direction:column;min-width:260px;min-height:180px;overflow:hidden;pointer-events:auto;border-radius:18px;background:radial-gradient(120% 40% at 20% 0%,rgba(74,222,128,.14),transparent 70%),linear-gradient(165deg,#102418 0%,#08130d 100%);border:1px solid rgba(134,239,172,.3);box-shadow:0 18px 50px rgba(0,0,0,.6)}
#${ALMANAC_ID} .ga-top{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px 8px;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;background:linear-gradient(180deg,rgba(255,255,255,.05),transparent)}
#${ALMANAC_ID} h2{margin:0;font-size:17px;letter-spacing:.02em;color:#fde68a;font-weight:700;white-space:nowrap}
#${ALMANAC_ID} .ga-sub{font:10px "Trebuchet MS",system-ui,sans-serif;color:#7fb897;letter-spacing:.1em;text-transform:uppercase;margin-top:1px;white-space:nowrap}
#${ALMANAC_ID} .ga-tools{display:flex;gap:5px;flex:none}
#${ALMANAC_ID} .ga-tools button{min-width:28px;height:28px;padding:0 6px;border:1px solid rgba(167,243,208,.25);border-radius:9px;background:rgba(255,255,255,.06);color:#d9f7e4;font:700 12px "Trebuchet MS",system-ui,sans-serif;cursor:pointer;line-height:1}
#${ALMANAC_ID} .ga-tools button:hover{border-color:rgba(253,224,71,.6);color:#fde047}
#${ALMANAC_ID} .ga-body{flex:1;min-height:0;overflow:auto;display:grid;align-content:start;gap:12px;padding:4px 12px 18px;font-family:"Trebuchet MS",system-ui,-apple-system,Segoe UI,sans-serif;scrollbar-width:thin;scrollbar-color:#2f6a49 transparent}
#${ALMANAC_ID} .ga-h-r{position:absolute;top:44px;right:0;bottom:22px;width:7px;cursor:ew-resize;touch-action:none}
#${ALMANAC_ID} .ga-h-b{position:absolute;left:0;right:22px;bottom:0;height:7px;cursor:ns-resize;touch-action:none}
#${ALMANAC_ID} .ga-grip{position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 50%,rgba(253,224,71,.75) 50% 58%,transparent 58% 70%,rgba(253,224,71,.75) 70% 78%,transparent 78%)}
#${ALMANAC_ID} .ga-rings{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
#${ALMANAC_ID} .ga-ring{display:grid;justify-items:center;gap:2px;padding:9px 4px 7px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(167,243,208,.12)}
#${ALMANAC_ID} .ga-ring svg{width:min(70px,100%);height:auto}
#${ALMANAC_ID} .ga-ring b{font-size:12px;color:#fef3c7;letter-spacing:.04em}
#${ALMANAC_ID} .ga-ring span{font-size:10.5px;color:#8fc4a5;text-align:center}
#${ALMANAC_ID} .ga-pills{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}
#${ALMANAC_ID} .ga-pill{padding:8px 11px;border-radius:13px;background:linear-gradient(135deg,rgba(253,224,71,.13),rgba(253,224,71,.03));border:1px solid rgba(253,224,71,.28)}
#${ALMANAC_ID} .ga-pill small{display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#d9c26a}
#${ALMANAC_ID} .ga-pill b{font-size:17px;color:#fef3c7}
#${ALMANAC_ID} .ga-h{display:flex;align-items:center;gap:8px;margin:2px 0 -4px;font-family:Georgia,serif;font-size:14px;color:#fde68a;letter-spacing:.06em}
#${ALMANAC_ID} .ga-h::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(253,224,71,.35),transparent)}
#${ALMANAC_ID} .ga-mut{display:grid;gap:5px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(167,243,208,.1)}
#${ALMANAC_ID} .ga-mut[data-dim="true"]{opacity:.5}
#${ALMANAC_ID} .ga-line{display:flex;justify-content:space-between;gap:8px;font-size:12.5px}
#${ALMANAC_ID} .ga-line em{font-style:normal;color:#9fd1b3}
#${ALMANAC_ID} .ga-bar{height:8px;border-radius:99px;background:rgba(0,0,0,.35);overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.5)}
#${ALMANAC_ID} .ga-bar i{display:block;height:100%;border-radius:99px;min-width:2px}
#${ALMANAC_ID} .ga-eta{font-size:11px;color:#8fc4a5}
#${ALMANAC_ID} .ga-eta b{color:#fde68a;font-weight:700}
#${ALMANAC_ID} .ga-species{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
#${ALMANAC_ID} .ga-card{display:grid;gap:5px;padding:9px;border-radius:13px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.015));border:1px solid rgba(167,243,208,.13)}
#${ALMANAC_ID} .ga-card h3{margin:0;font-size:13px;color:#ecf6ee}
#${ALMANAC_ID} .ga-chips{display:flex;flex-wrap:wrap;gap:3px}
#${ALMANAC_ID} .ga-chip{padding:1px 6px;border-radius:99px;font-size:10px;color:#06150d;font-weight:700}
#${ALMANAC_ID} .ga-note{font-size:11px;line-height:1.5;color:#6fa688;text-align:center;padding:2px 6px}
#${ALMANAC_ID} .ga-empty{padding:30px 10px;text-align:center;color:#8fc4a5;font-size:13px;line-height:1.6}
#${WEATHER_ID}{position:fixed;left:0;top:0;z-index:2147483644;display:none;width:208px;box-sizing:border-box;padding:10px 12px 9px;transform-origin:top left;border-radius:16px;background:linear-gradient(180deg,rgba(42,45,44,.97),rgba(27,29,28,.97));border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 26px rgba(0,0,0,.5);color:#e8eeea;font:600 12px "Trebuchet MS",system-ui,sans-serif;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none}
#${WEATHER_ID} .gw-head{display:flex;align-items:center;gap:9px;margin-bottom:7px}
#${WEATHER_ID} .gw-ico{flex:none;display:grid;place-items:center;width:28px;height:28px;font-size:20px;line-height:1}
#${WEATHER_ID} .gw-ico img{width:28px;height:28px;object-fit:contain}
#${WEATHER_ID} .gw-now{flex:1;min-width:0;display:grid;gap:1px}
#${WEATHER_ID} .gw-now b{font-size:13px;color:#fde68a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${WEATHER_ID} .gw-now small{font-size:10.5px;color:#9db0a5}
#${WEATHER_ID} .gw-x{flex:none;width:22px;height:22px;padding:0;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:rgba(255,255,255,.06);color:#cfd8d2;font-size:14px;line-height:1;cursor:pointer}
#${WEATHER_ID} .gw-x:hover{color:#fde047;border-color:rgba(253,224,71,.6)}
#${WEATHER_ID} .gw-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:5px 0;border-top:1px solid rgba(255,255,255,.07)}
#${WEATHER_ID} .gw-row span{color:#9db0a5;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${WEATHER_ID} .gw-row b{font:700 16px ui-monospace,Consolas,monospace;color:#fef3c7;font-variant-numeric:tabular-nums}`;
  function injectStyles() { if (document.getElementById(STYLE_ID)) return; const style = document.createElement("style"); style.id = STYLE_ID; style.textContent = CSS; (document.head || document.documentElement).append(style); }
  function setHideGC(on) {
    const existing = document.getElementById(GC_STYLE_ID);
    if (on && !existing) { const s = document.createElement("style"); s.id = GC_STYLE_ID; s.textContent = "#gc-lunar,#gc-lunar-mini{display:none!important}"; (document.head || document.documentElement).append(s); }
    else if (!on && existing) existing.remove();
  }

  // ---------- almanac window (movable + resizable) ----------
  let almanac = null, sheet = null, abody = null, asub = null, refreshTimer = null, rendering = false;
  async function renderAlmanac() {
    if (rendering || !abody || almanac.style.display !== "block") return; rendering = true;
    try {
      const game = await readGame(); const keep = abody.scrollTop; const now = Date.now();
      abody.innerHTML = game ? almanacHtml(game, computeStats(game, now), now) : `<div class="ga-empty">Waiting for your garden to load…</div>`;
      abody.scrollTop = keep; asub.textContent = `${TITLE} · ${new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    } finally { rendering = false; }
  }
  function clampRect(r) {
    const width = clamp(r.width, 260, Math.max(260, window.innerWidth - 8)), height = clamp(r.height, 180, Math.max(180, window.innerHeight - 8));
    return { width, height, left: clamp(r.left, 0, Math.max(0, window.innerWidth - width)), top: clamp(r.top, 0, Math.max(0, window.innerHeight - height)) };
  }
  function placeSheet(rect) { const r = clampRect(rect); sheet.style.left = `${r.left}px`; sheet.style.top = `${r.top}px`; sheet.style.width = `${r.width}px`; sheet.style.height = `${r.height}px`; }
  function saveSheetRect() { const b = sheet.getBoundingClientRect(); writeJson(ALMANAC_RECT_KEY, { left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) }); }
  function defaultRect() {
    const d = document.getElementById(DOCK_ID)?.getBoundingClientRect(), width = Math.min(430, window.innerWidth - 24), height = Math.min(580, window.innerHeight - 24);
    if (!d) return { left: 12, top: 12, width, height };
    return { left: d.left > window.innerWidth / 2 ? d.left - width - 10 : d.right + 10, top: d.top, width, height };
  }
  function ensureAlmanac() {
    if (almanac?.isConnected) return almanac;
    almanac = document.createElement("div"); almanac.id = ALMANAC_ID; sheet = document.createElement("div"); sheet.className = "ga-sheet";
    sheet.innerHTML = `<div class="ga-top" title="Drag to move"><div><h2>Garden Almanac</h2><div class="ga-sub"></div></div><div class="ga-tools"><button type="button" data-ga-zoom="-1" title="Smaller text">A−</button><button type="button" data-ga-zoom="1" title="Bigger text">A+</button><button type="button" data-ga-close title="Close" aria-label="Close">×</button></div></div><div class="ga-body"></div><i class="ga-h-r" data-edge="r"></i><i class="ga-h-b" data-edge="b"></i><i class="ga-grip" data-edge="br" title="Drag to resize"></i>`;
    abody = sheet.querySelector(".ga-body"); asub = sheet.querySelector(".ga-sub"); almanac.append(sheet);
    makeMovable(sheet, sheet.querySelector(".ga-top"), ALMANAC_RECT_KEY, () => saveSheetRect());
    sheet.addEventListener("click", (event) => {
      if (event.target.closest?.("[data-ga-close]")) { closeAlmanac(); return; }
      const z = event.target.closest?.("[data-ga-zoom]"); if (z) { cfg.almanacZoom = clamp(Math.round((cfg.almanacZoom + Number(z.dataset.gaZoom) * 0.1) * 10) / 10, 0.7, 1.6); saveCfg(); abody.style.zoom = String(cfg.almanacZoom); syncPop(); }
    });
    sheet.addEventListener("pointerdown", (event) => {
      const edge = event.target.dataset?.edge; if (!edge || event.button !== 0) return; event.preventDefault();
      const start = sheet.getBoundingClientRect(), sx = event.clientX, sy = event.clientY;
      const move = (e) => { placeSheet({ left: start.left, top: start.top, width: edge.includes("r") ? start.width + e.clientX - sx : start.width, height: edge.includes("b") ? start.height + e.clientY - sy : start.height }); };
      const finish = () => { saveSheetRect(); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish);
    });
    window.addEventListener("resize", () => { if (almanac.style.display === "block") { placeSheet(sheet.getBoundingClientRect()); saveSheetRect(); } });
    document.body.append(almanac); return almanac;
  }
  function openAlmanac() {
    ensureAlmanac(); almanac.style.display = "block"; const saved = readJson(ALMANAC_RECT_KEY);
    placeSheet(Number.isFinite(saved?.left) && Number.isFinite(saved?.width) ? saved : defaultRect());
    abody.style.zoom = String(cfg.almanacZoom); abody.innerHTML = `<div class="ga-empty">Reading your garden…</div>`; void renderAlmanac();
    if (refreshTimer) clearInterval(refreshTimer); refreshTimer = setInterval(() => { void renderAlmanac(); }, 1000); refreshActive();
  }
  function closeAlmanac() { if (almanac) almanac.style.display = "none"; if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; } refreshActive(); }
  const toggleAlmanac = () => { if (almanac?.style.display === "block") closeAlmanac(); else openAlmanac(); };

  // ---------- weather timer ----------
  const WEATHER_MS = 10 * 60 * 1000, LUNAR_MS = 4 * 3600 * 1000;
  const W_NAME = { Rain: "Rain", Frost: "Snow", Thunderstorm: "Thunderstorm", Dawn: "Dawn", AmberMoon: "Amber Moon" };
  const W_EMOJI = { Rain: "🌧️", Frost: "❄️", Thunderstorm: "⛈️", Dawn: "🌅", AmberMoon: "🌙" };
  const LUNAR_IDS = new Set(["Dawn", "AmberMoon"]);
  let roomGame = null, seenWeather, seenAt = 0, weatherEl = null, weatherTimer = null, roomHooked = false;
  function hookRoom() {
    if (roomHooked) return true; const conn = window.MagicCircle_RoomConnection; if (typeof conn?.subscribeToPatches !== "function") return false;
    try { conn.subscribeToPatches((_patches, full) => { roomGame = full?.child?.data || null; }); roomHooked = true; } catch { return false; }
    return true;
  }
  function gameNow() { try { const o = window.__gardenCompanionForecastTrace?.()?.serverClockOffsetMs; return Date.now() + (Number.isFinite(o) ? o : 0); } catch { return Date.now(); } }
  const wName = (id) => W_NAME[id] || pretty(id) || "Clear";
  function wIcon(id) { const sprite = window.__gardenCompanionWeatherSprites?.[id]; return sprite ? `<img src="${esc(sprite)}" alt="">` : (W_EMOJI[id] || "☀️"); }
  function fmtClock(ms) { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${pad2(m)}:${pad2(x)}` : `${m}:${pad2(x)}`; }
  function weatherInfo(now) {
    const game = roomGame || window.__gardenCompanionState?.game || null, cur = typeof game?.weather === "string" ? game.weather : "";
    if (game && cur !== seenWeather) { seenAt = seenWeather === undefined ? 0 : now; seenWeather = cur; }
    const list = Array.isArray(game?.weatherForecast) ? game.weatherForecast : []; let endsIn = null, next = null;
    for (const e of list) {
      const id = typeof e?.weatherId === "string" ? e.weatherId : "", s = Number(e?.startsAtMs), en = Number(e?.endsAtMs); if (!Number.isFinite(s)) continue;
      if (cur && id === cur && s <= now && Number.isFinite(en) && en > now) endsIn = en - now;
      if (s > now && (!next || s < next.at)) next = { id, at: s, lunar: e.groupId === "Lunar" || LUNAR_IDS.has(id) };
    }
    if (cur && endsIn === null) {
      if (seenAt && now - seenAt < WEATHER_MS) endsIn = WEATHER_MS - (now - seenAt);
      else if (LUNAR_IDS.has(cur)) { const start = Math.floor(now / LUNAR_MS) * LUNAR_MS; if (now - start < WEATHER_MS) endsIn = WEATHER_MS - (now - start); }
    }
    return { ready: !!game, cur, endsIn, next, lunarIn: (Math.floor(now / LUNAR_MS) + 1) * LUNAR_MS - now };
  }
  function updateWeather() {
    if (!weatherEl || weatherEl.style.display === "none") return; const now = gameNow(), w = weatherInfo(now), q = (s) => weatherEl.querySelector(s);
    q(".gw-ico").innerHTML = wIcon(w.cur); q(".gw-now b").textContent = !w.ready ? "Waiting for game…" : w.cur ? wName(w.cur) : "Clear skies";
    q(".gw-now small").textContent = w.cur && w.endsIn !== null ? `${fmtClock(w.endsIn)} left` : w.ready ? (w.cur ? "time unknown" : "no weather event") : "";
    q(".gw-nl").textContent = w.next ? (w.next.lunar ? "Next: Lunar event" : `Next: ${wName(w.next.id)}`) : "Next weather";
    q(".gw-next").textContent = !w.ready ? "--" : w.next ? fmtClock(w.next.at - now) : "—"; q(".gw-lunar").textContent = fmtClock(w.lunarIn);
  }
  function ensureWeather() {
    if (weatherEl?.isConnected) return weatherEl;
    weatherEl = document.createElement("div"); weatherEl.id = WEATHER_ID; weatherEl.title = "Drag to move";
    weatherEl.innerHTML = `<div class="gw-head"><span class="gw-ico"></span><div class="gw-now"><b>—</b><small></small></div><button class="gw-x" type="button" data-nodrag title="Turn the weather timer off">×</button></div><div class="gw-row"><span class="gw-nl">Next weather</span><b class="gw-next">--</b></div><div class="gw-row"><span>Lunar event</span><b class="gw-lunar">--</b></div>`;
    weatherEl.querySelector(".gw-x").onclick = () => { cfg.weather = false; saveCfg(); applyCfg(); };
    makeMovable(weatherEl, weatherEl, WEATHER_POS_KEY); document.body.append(weatherEl); return weatherEl;
  }
  function placeWeather() {
    if (!weatherEl) return; weatherEl.style.transform = `scale(${cfg.weatherScale})`;
    if (!applySavedPos(weatherEl, WEATHER_POS_KEY)) { const r = weatherEl.getBoundingClientRect(); weatherEl.style.left = `${Math.max(0, window.innerWidth - r.width - 16)}px`; weatherEl.style.top = `${Math.max(0, window.innerHeight - r.height - 16)}px`; weatherEl.style.right = "auto"; weatherEl.style.bottom = "auto"; }
    weatherEl.style.transform = `scale(${cfg.weatherScale})`; keepOnScreen(weatherEl);
  }
  function syncWeather() {
    if (cfg.weather) { ensureWeather(); const wasHidden = weatherEl.style.display !== "block"; weatherEl.style.display = "block"; if (wasHidden || !weatherEl.style.left) placeWeather(); else { weatherEl.style.transform = `scale(${cfg.weatherScale})`; keepOnScreen(weatherEl); } updateWeather(); if (!weatherTimer) weatherTimer = setInterval(updateWeather, 500); }
    else { if (weatherEl) weatherEl.style.display = "none"; if (weatherTimer) { clearInterval(weatherTimer); weatherTimer = null; } }
  }

  // ---------- dock ----------
  let dock = null, grid = null, pop = null, miniLamps = null; const lamps = [];
  function fireShortcut(code) { const key = code.slice(3).toLowerCase(); for (const type of ["keydown", "keyup"]) document.dispatchEvent(new KeyboardEvent(type, { key, code, altKey: true, bubbles: true, cancelable: true })); }
  function refreshActive() {
    if (!grid) return; const a = grid.querySelector('[data-id="almanac"]'), w = grid.querySelector('[data-id="weather"]');
    if (a) a.dataset.active = String(almanac?.style.display === "block"); if (w) w.dataset.active = String(cfg.weather);
  }
  function buildButtons() {
    grid.innerHTML = ""; miniLamps.innerHTML = ""; lamps.length = 0;
    for (const item of ITEMS) {
      if (cfg.hidden[item.id]) continue;
      const button = document.createElement("button"); button.type = "button"; button.className = "gd-btn"; button.dataset.id = item.id;
      button.title = item.title + (item.lamp ? "\nRight-click: turn on / off" : ""); button.setAttribute("aria-label", item.label);
      button.innerHTML = `<span class="gd-icon">${iconSvg(item.icon)}</span><span class="gd-label">${esc(item.label)}</span>`;
      button.onclick = () => { if (item.overview) toggleAlmanac(); else if (item.weather) { cfg.weather = !cfg.weather; saveCfg(); applyCfg(); } else fireShortcut(item.code); };
      if (item.lamp) {
        const dot = document.createElement("span"); dot.className = "gd-dot"; dot.dataset.on = String(lampOn(item.lamp)); button.append(dot); lamps.push([item.lamp, dot]);
        const tiny = document.createElement("span"); tiny.className = "gd-dot"; tiny.title = item.label; tiny.dataset.on = dot.dataset.on; miniLamps.append(tiny); lamps.push([item.lamp, tiny]);
        button.addEventListener("contextmenu", (event) => { event.preventDefault(); toggleLamp(item.lamp); const on = String(lampOn(item.lamp)); for (const [key, other] of lamps) if (key === item.lamp) other.dataset.on = on; });
      }
      grid.append(button);
    }
    refreshActive();
  }
  const rangeRow = (k, label, lo, hi) => `<div class="gp-row"><span>${label}</span><input type="range" min="${lo}" max="${hi}" step="5" data-k="${k}"><b></b></div>`;
  const switchRow = (k, label) => `<label class="gp-sw"><span>${label}</span><input type="checkbox" data-k="${k}"></label>`;
  function popHtml() {
    const chips = ITEMS.map((i) => `<button type="button" class="gp-chip" data-hide="${i.id}">${esc(i.label)}</button>`).join("");
    return `<div class="gp-title">Customize <span>${esc(TITLE)} ${VERSION}</span></div>
<div class="gp-sec">Menu</div>${rangeRow("scale", "Size", 60, 160)}
<div class="gp-row"><span>Columns</span><div class="gp-seg">${[2, 3, 4].map((n) => `<button type="button" data-cols="${n}">${n}</button>`).join("")}</div></div>
${rangeRow("opacity", "Opacity", 40, 100)}${switchRow("labels", "Show names under icons")}
<div class="gp-sec">Weather timer</div>${switchRow("weather", "Show weather timer")}${rangeRow("weatherScale", "Size", 70, 160)}${switchRow("hideGC", "Hide Garden Companion's timer")}
<div class="gp-sec">Almanac</div>${rangeRow("almanacZoom", "Text size", 70, 160)}
<div class="gp-sec">Buttons shown</div><div class="gp-chips">${chips}</div>
<div class="gp-foot"><button type="button" data-reset-pos>Reset positions</button><button type="button" data-reset-all>Reset all</button></div>`;
  }
  function syncPop() {
    if (!pop) return;
    for (const el of pop.querySelectorAll("[data-k]")) {
      const k = el.dataset.k; if (el.type === "checkbox") el.checked = !!cfg[k]; else { el.value = String(Math.round(cfg[k] * 100)); const out = el.parentElement.querySelector("b"); if (out) out.textContent = `${el.value}%`; }
    }
    for (const b of pop.querySelectorAll("[data-cols]")) b.dataset.on = String(Number(b.dataset.cols) === cfg.cols);
    for (const b of pop.querySelectorAll("[data-hide]")) b.dataset.on = String(!cfg.hidden[b.dataset.hide]);
  }
  function placePop() {
    const r = dock.getBoundingClientRect(); pop.style.top = "0px";
    if (r.left > window.innerWidth / 2) { pop.style.left = "auto"; pop.style.right = "calc(100% + 8px)"; } else { pop.style.right = "auto"; pop.style.left = "calc(100% + 8px)"; }
    const overflow = r.top + pop.offsetHeight - (window.innerHeight - 8); if (overflow > 0) pop.style.top = `${-Math.min(overflow, r.top - 8)}px`;
  }
  function applyCfg() {
    if (!dock) return; sanitizeCfg();
    dock.style.setProperty("--s", String(cfg.scale)); dock.style.setProperty("--cols", String(cfg.cols)); dock.style.setProperty("--cell", cfg.labels ? "46" : "40"); dock.style.setProperty("--op", String(cfg.opacity));
    dock.dataset.labels = String(cfg.labels); dock.dataset.cols = String(cfg.cols);
    setHideGC(cfg.hideGC); syncWeather(); if (abody) abody.style.zoom = String(cfg.almanacZoom); syncPop(); refreshActive(); keepOnScreen(dock);
    if (pop?.dataset.open === "true") placePop();
  }
  function installDock() {
    if (document.getElementById(DOCK_ID)) return; injectStyles();
    dock = document.createElement("aside"); dock.id = DOCK_ID; dock.setAttribute("aria-label", "Magic Garden shortcuts");
    dock.dataset.mini = localStorage.getItem(MINI_KEY) === "true" ? "true" : "false";
    const head = document.createElement("div"); head.className = "gd-head"; head.title = "Drag to move · double-click to minimize";
    head.innerHTML = `<span class="gd-live"></span><span class="gd-title">${esc(TITLE)}</span><span class="gd-lamps"></span><button class="gd-hb" type="button" data-gear title="Customize menu" aria-label="Customize menu">${iconSvg("sliders")}</button><button class="gd-hb" type="button" data-min title="Minimize / expand" aria-label="Minimize or expand">${iconSvg("chevron")}</button>`;
    miniLamps = head.querySelector(".gd-lamps"); grid = document.createElement("div"); grid.className = "gd-grid";
    pop = document.createElement("div"); pop.className = "gd-pop"; pop.innerHTML = popHtml(); pop.dataset.open = "false";
    dock.append(head, grid, pop); buildButtons();
    if (!applySavedPos(dock, POSITION_KEY, OLD_POSITION_KEY)) { dock.style.right = "12px"; dock.style.top = "90px"; }
    makeMovable(dock, head, POSITION_KEY, () => { if (pop.dataset.open === "true") placePop(); });
    const setMini = (value) => { dock.dataset.mini = value ? "true" : "false"; try { localStorage.setItem(MINI_KEY, String(value)); } catch {} if (value) pop.dataset.open = "false"; keepOnScreen(dock); };
    head.addEventListener("dblclick", (event) => { if (event.target.closest?.("button")) return; setMini(dock.dataset.mini !== "true"); });
    head.querySelector("[data-min]").addEventListener("click", () => setMini(dock.dataset.mini !== "true"));
    head.querySelector("[data-gear]").addEventListener("click", () => { if (dock.dataset.mini === "true") setMini(false); const open = pop.dataset.open !== "true"; pop.dataset.open = String(open); if (open) { syncPop(); placePop(); } });
    pop.addEventListener("input", (event) => {
      const el = event.target, k = el.dataset?.k; if (!k) return;
      if (el.type === "checkbox") cfg[k] = el.checked; else { cfg[k] = Number(el.value) / 100; const out = el.parentElement.querySelector("b"); if (out) out.textContent = `${el.value}%`; }
      saveCfg(); applyCfg();
    });
    pop.addEventListener("click", (event) => {
      const t = event.target.closest?.("button"); if (!t) return;
      if (t.dataset.cols) { cfg.cols = Number(t.dataset.cols); saveCfg(); applyCfg(); }
      else if (t.dataset.hide) { cfg.hidden[t.dataset.hide] = !cfg.hidden[t.dataset.hide]; saveCfg(); buildButtons(); applyCfg(); }
      else if (t.hasAttribute("data-reset-pos")) {
        for (const key of [POSITION_KEY, OLD_POSITION_KEY, ALMANAC_RECT_KEY, WEATHER_POS_KEY]) { try { localStorage.removeItem(key); } catch {} }
        dock.style.left = ""; dock.style.transform = ""; dock.style.right = "12px"; dock.style.top = "90px";
        if (weatherEl) { weatherEl.style.left = ""; placeWeather(); } if (almanac?.style.display === "block") placeSheet(defaultRect()); placePop();
      } else if (t.hasAttribute("data-reset-all")) { Object.assign(cfg, DEFAULTS, { hidden: {} }); saveCfg(); buildButtons(); applyCfg(); }
    });
    document.addEventListener("pointerdown", (event) => { if (pop.dataset.open === "true" && !dock.contains(event.target)) pop.dataset.open = "false"; }, true);
    document.body.append(dock); applyCfg(); keepOnScreen(dock); window.addEventListener("resize", () => keepOnScreen(dock));
    setInterval(() => { for (const [key, dot] of lamps) dot.dataset.on = String(lampOn(key)); const t = dock.querySelector(".gd-title"); if (_fnv(TITLE) !== 1311861492 || (t && t.textContent !== TITLE)) { if (t) t.textContent = atob("S2luZydzIE1vZA=="); } }, 1500);
  }
  function install() {
    installDock();
    if (!hookRoom()) { const t = setInterval(() => { if (hookRoom()) clearInterval(t); }, 1000); }
    document.addEventListener("keydown", (event) => {
      const target = event.target; if (target?.isContentEditable || /^(input|textarea|select)$/i.test(target?.tagName || "")) return;
      if (event.repeat || !event.altKey || event.ctrlKey || event.shiftKey || event.metaKey || event.code !== "KeyO") return;
      event.preventDefault(); event.stopPropagation(); toggleAlmanac();
    }, true);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && almanac?.style.display === "block") closeAlmanac(); }, true);
  }
  if (document.body) install(); else document.addEventListener("DOMContentLoaded", install, { once: true });
})();
