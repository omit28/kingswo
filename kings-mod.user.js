// ==UserScript==
// @name         King's Mod
// @namespace    Quinoa
// @author       King
// @version      3.4.1
// @description  Compact mod dock with live on/off lights, customize panel, a movable + resizable Garden Almanac, weather timer, and new Crop Calculator (Alt+C), Pet Deck (Alt+D), Room (Alt+R) and Alerts (Alt+N) windows with real seed and pet images.
// @match        https://1227719606223765687.discordsays.com/*
// @match        https://magiccircle.gg/r/*
// @match        https://magicgarden.gg/r/*
// @match        https://starweaver.org/r/*
// @run-at       document-start
// @inject-into  page
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      mg-api.ariedam.fr
// @license      All rights reserved. Do not redistribute or rebrand without permission.
// @updateURL    https://raw.githubusercontent.com/omit28/kingswo/main/kings-mod.user.js
// @downloadURL  https://raw.githubusercontent.com/omit28/kingswo/main/kings-mod.user.js
// ==/UserScript==

(() => {
  "use strict";
  // Title is stored encoded (two copies + checksum) and re-checked while running, so a quick text edit does not change it.
  const VERSION_NUM = "3.2.0", VERSION = "v" + VERSION_NUM, UPDATE_URL = "https://raw.githubusercontent.com/omit28/kingswo/main/kings-mod.user.js";   // keep VERSION_NUM equal to @version
  const _fnv = (str) => { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const TITLE = (() => { const a = String.fromCharCode(...[100,111,77,32,115,39,103,110,105,75].reverse()); return _fnv(a) === 1311861492 ? a : atob("S2luZydzIE1vZA=="); })();
  const ALERT_KEY = "mg-king-alerts-v1";
  const DOCK_ID = "mg-shortcut-sidebar", ALMANAC_ID = "mg-garden-almanac", WEATHER_ID = "mg-weather-timer", STYLE_ID = "mg-garden-dock-style", GC_STYLE_ID = "mg-hide-gc-timer";
  const MINI_KEY = "mg-shortcut-sidebar-minimized-v1", POSITION_KEY = "mg-shortcut-sidebar-position-v2", OLD_POSITION_KEY = "mg-shortcut-sidebar-position-v1";
  const SETTINGS_KEY = "mg-shortcut-sidebar-settings-v3", ALMANAC_RECT_KEY = "mg-almanac-rect-v1", WEATHER_POS_KEY = "mg-weather-pos-v1";
  const PET_STR = {"Worm":{"ms":2.0,"h":12.0},"Snail":{"ms":2.0,"h":12.0},"Bee":{"ms":2.5,"h":12.0},"Chicken":{"ms":2.0,"h":24.0},"Bunny":{"ms":2.0,"h":24.0},"Dragonfly":{"ms":2.5,"h":24.0},"Pig":{"ms":2.5,"h":72.0},"Cow":{"ms":2.5,"h":72.0},"Turkey":{"ms":2.5,"h":72.0},"Squirrel":{"ms":2.0,"h":100.0},"Turtle":{"ms":2.5,"h":100.0},"Goat":{"ms":2.0,"h":100.0},"SnowFox":{"ms":2.0,"h":100.0},"Stoat":{"ms":2.0,"h":100.0},"WhiteCaribou":{"ms":2.5,"h":100.0},"Pony":{"ms":2.0,"h":72.0},"Horse":{"ms":2.5,"h":100.0},"FireHorse":{"ms":2.5,"h":144.0},"Butterfly":{"ms":2.5,"h":144.0},"Capybara":{"ms":2.5,"h":144.0},"Peacock":{"ms":2.5,"h":144.0}};
  const BASE_SIZE = 50, MAX_SIZE = 100;

  // ---------- page context + game connection (needed for pet teams and teleport) ----------
  const PW = (typeof unsafeWindow !== "undefined" && unsafeWindow) ? unsafeWindow : window;
  const randomId = () => { try { const u = globalThis.crypto?.randomUUID?.(); if (u) return u; } catch {} return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`; };
  const QUINOA_SCOPE = ["Room", "Quinoa"];
  const QUINOA_COMMANDS = new Set(["PlantSeed", "PlantGardenPlant", "WaterPlant", "HarvestCrop", "PotPlant", "Preserve", "DisplayCrop", "PickupDisplayedCrop", "RemoveGardenObject", "MutationPotion", "CropCleanser", "SellAllCrops", "PlaceDecor", "PickupDecor", "GrowEgg", "HatchEgg", "PlacePet", "PickupPet", "FeedPet", "SellPet", "NamePet", "SwapPet", "SwapPetFromStorage", "MovePetSlot", "RidePet", "DismountPet", "DawnCapture", "Thundercharge", "ReplenishPotion", "XPPotion", "EquipPetCosmetic", "SavePetTeam", "ApplyPetTeam", "DeletePetTeam", "MovePetTeam", "SetPetTeamEmblem", "MoveItem", "ToggleLockItem", "LogItems", "PurchaseShopItem", "Wish"]);
  // The game numbers every command it sends. A command we add has to carry the next number, and the game's own
  // commands after it have to be renumbered, so this part mirrors what the server expects (same as Arie's mod).
  const WS = { sockets: [], main: null, nextSeq: 1, injected: 0, own: new Set(), off: false, welcomed: false };
  const NativeWS = PW.WebSocket;
  function wsReset() { WS.nextSeq = 1; WS.injected = 0; WS.own.clear(); WS.welcomed = false; }
  function wsSeed(executed) { const n = Number(executed); if (!Number.isFinite(n) || n < 0) return; WS.nextSeq = n + 1; WS.injected = 0; WS.own.clear(); WS.welcomed = true; }
  function wsBuild(payload) {
    const { scopePath: rawScope, ...command } = payload; const scopePath = rawScope ?? QUINOA_SCOPE;
    if (!QUINOA_COMMANDS.has(command.type)) return { scopePath, ...command };
    const requestId = randomId(); if (WS.own.size >= 64) WS.own.delete(WS.own.values().next().value); WS.own.add(requestId);
    WS.injected++; return { scopePath, type: "QuinoaCommand", requestId, commandSequence: WS.nextSeq++, command };
  }
  function wsOpen() { if (WS.main && WS.main.readyState === 1) return WS.main; return WS.sockets.find((s) => s.readyState === 1) || null; }
  function sendGame(payload) { if (WS.off) return false; const ws = wsOpen(); if (!ws) return false; try { ws.send(JSON.stringify(wsBuild(payload))); return true; } catch { return false; } }
  function installWsHook() {
    try {
      if (!NativeWS || !NativeWS.prototype) return;
      if (NativeWS.prototype.__qwsSendPatched) { WS.off = true; return; }   // Arie's mod is already handling the socket; do not fight it
      if (NativeWS.prototype.__kxPatched) return;
      const proto = NativeWS.prototype, original = proto.send;
      proto.send = function (data, ...rest) {
        let frame = data;
        try {
          if (typeof data === "string" && data.indexOf('"QuinoaCommand"') !== -1) {
            const parsed = JSON.parse(data);
            if (parsed?.type === "QuinoaCommand" && parsed.command && typeof parsed.command === "object") {
              if (typeof parsed.requestId === "string" && WS.own.delete(parsed.requestId)) { /* ours, already numbered */ }
              else {
                const theirs = Number(parsed.commandSequence);
                if (WS.injected > 0) { if (Number.isFinite(theirs) && theirs > WS.nextSeq) WS.nextSeq = theirs; frame = JSON.stringify({ ...parsed, commandSequence: WS.nextSeq++ }); }
                else if (Number.isFinite(theirs) && theirs >= WS.nextSeq) WS.nextSeq = theirs + 1;
              }
            }
          }
        } catch {}
        return original.call(this, frame, ...rest);
      };
      proto.__kxPatched = true;
      const Wrapped = function (url, protocols) {
        const ws = protocols !== undefined ? new NativeWS(url, protocols) : new NativeWS(url);
        WS.sockets.push(ws);
        ws.addEventListener("open", () => { setTimeout(() => { if (ws.readyState === 1 && !WS.main) WS.main = ws; }, 800); });
        ws.addEventListener("message", (ev) => {
          const d = ev.data;
          if (typeof d === "string") { if (d.indexOf('"Welcome"') === -1) return; try { const j = JSON.parse(d); if (j?.type === "Welcome") { wsSeed(j.executedCommandSequence); WS.main = ws; } } catch {} return; }
          if (WS.welcomed) return;
          const read = d instanceof Blob ? d.text() : d instanceof ArrayBuffer ? Promise.resolve(new TextDecoder().decode(d)) : null;
          read?.then((txt) => { if (txt.indexOf('"Welcome"') === -1) return; try { const j = JSON.parse(txt); if (j?.type === "Welcome") { wsSeed(j.executedCommandSequence); WS.main = ws; } } catch {} }).catch(() => {});
        });
        ws.addEventListener("close", () => { wsReset(); if (WS.main === ws) WS.main = null; const i = WS.sockets.indexOf(ws); if (i >= 0) WS.sockets.splice(i, 1); });
        return ws;
      };
      Wrapped.prototype = NativeWS.prototype;
      for (const k of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) { try { Wrapped[k] = NativeWS[k]; } catch {} }
      PW.WebSocket = Wrapped;
      if (PW !== window) { try { window.WebSocket = Wrapped; } catch {} }
    } catch (error) { console.warn("[King's Mod] websocket hook failed", error); }
  }
  installWsHook();

  const KD = {"crops":{"Carrot":{"n":"Carrot","sn":"Carrot Seed","c":10,"r":"Common","p":20,"w":0.1,"m":3,"ss":"Carrot","cs":"Carrot"},"Cabbage":{"n":"Cabbage","sn":"Cabbage Seed","c":30,"r":"Common","p":42,"w":1,"m":3,"ss":"Cabbage","cs":"Cabbage"},"Strawberry":{"n":"Strawberry","sn":"Strawberry Seed","c":50,"r":"Common","p":14,"w":0.05,"m":2,"ss":"Strawberry","cs":"Strawberry"},"Aloe":{"n":"Aloe","sn":"Aloe Seed","c":135,"r":"Common","p":310,"w":1.5,"m":2.5,"ss":"Aloe","cs":"Aloe"},"Beet":{"n":"Beet","sn":"Beet Seed","c":210,"r":"Common","p":350,"w":0.3,"m":3,"ss":"Beet","cs":"Beet"},"Rose":{"n":"Rose","sn":"Rose Seed","c":229,"r":"Uncommon","p":300,"w":0.01,"m":4,"ss":"Rose","cs":"RoseRed"},"FavaBean":{"n":"Fava Bean Pod","sn":"Fava Bean","c":250,"r":"Uncommon","p":30,"w":0.03,"m":3,"ss":"FavaBean","cs":"FavaBean"},"Delphinium":{"n":"Delphinium","sn":"Delphinium Seed","c":300,"r":"Uncommon","p":530,"w":0.02,"m":3,"ss":"Delphinium","cs":"Delphinium"},"Blueberry":{"n":"Blueberry","sn":"Blueberry Seed","c":400,"r":"Uncommon","p":23,"w":0.01,"m":2,"ss":"Blueberry","cs":"Blueberry"},"Apple":{"n":"Apple","sn":"Apple Seed","c":500,"r":"Uncommon","p":73,"w":0.18,"m":2,"ss":"Apple","cs":"Apple"},"OrangeTulip":{"n":"Tulip","sn":"Tulip Seed","c":600,"r":"Uncommon","p":767,"w":0.01,"m":3,"ss":"Tulip","cs":"Tulip"},"Tomato":{"n":"Tomato","sn":"Tomato Seed","c":800,"r":"Uncommon","p":27,"w":0.3,"m":2,"ss":"Tomato","cs":"Tomato"},"Daffodil":{"n":"Daffodil","sn":"Daffodil Seed","c":1000,"r":"Rare","p":1090,"w":0.01,"m":3,"ss":"Daffodil","cs":"Daffodil"},"Corn":{"n":"Corn","sn":"Corn Kernel","c":1300,"r":"Rare","p":36,"w":1.2,"m":2,"ss":"Corn","cs":"Corn"},"Watermelon":{"n":"Watermelon","sn":"Watermelon Seed","c":2500,"r":"Rare","p":2708,"w":4.5,"m":3,"ss":"Watermelon","cs":"Watermelon"},"Pumpkin":{"n":"Pumpkin","sn":"Pumpkin Seed","c":3000,"r":"Rare","p":3700,"w":6,"m":3,"ss":"Pumpkin","cs":"Pumpkin"},"Echeveria":{"n":"Echeveria","sn":"Echeveria Cutting","c":4200,"r":"Rare","p":4600,"w":0.8,"m":2.75,"ss":"Echeveria","cs":"Echeveria"},"Pear":{"n":"Pear","sn":"Pear Seed","c":6000,"r":"Rare","p":250,"w":0.17,"m":2,"ss":"Pear","cs":"Pear"},"Gentian":{"n":"Gentian","sn":"Gentian Seed","c":9000,"r":"Rare","p":10000,"w":0.02,"m":3,"ss":"Gentian","cs":"Gentian"},"Coconut":{"n":"Coconut","sn":"Coconut Seed","c":10000,"r":"Legendary","p":302,"w":5,"m":3,"ss":"Coconut","cs":"Coconut"},"PineTree":{"n":"Pine Tree","sn":"Pinecone","c":12000,"r":"Legendary","p":15000,"w":1000,"m":3.5,"ss":"Pinecone","cs":"PineTree"},"Banana":{"n":"Banana","sn":"Banana Seed","c":15000,"r":"Legendary","p":1750,"w":0.12,"m":1.7,"ss":"Banana","cs":"Banana"},"Lily":{"n":"Lily","sn":"Lily Seed","c":20000,"r":"Legendary","p":20123,"w":0.02,"m":2.75,"ss":"Lily","cs":"Lily"},"Camellia":{"n":"Camellia","sn":"Camellia Seed","c":55000,"r":"Legendary","p":4875,"w":0.3,"m":2.5,"ss":"Camellia","cs":"Camellia"},"Squash":{"n":"Squash","sn":"Squash Seed","c":55000,"r":"Legendary","p":3500,"w":0.3,"m":2.5,"ss":"Squash","cs":"Squash"},"Peach":{"n":"Peach","sn":"Peach Seed","c":85000,"r":"Legendary","p":9000,"w":0.18,"m":3,"ss":"Peach","cs":"Peach"},"BurrosTail":{"n":"Burro's Tail","sn":"Burro's Tail Cutting","c":93000,"r":"Legendary","p":6000,"w":0.4,"m":2.5,"ss":"BurrosTail","cs":"BurrosTail"},"Mushroom":{"n":"Mushroom","sn":"Mushroom Spore","c":150000,"r":"Mythical","p":160000,"w":25,"m":3.5,"ss":"Mushroom","cs":"Mushroom"},"Cactus":{"n":"Cactus","sn":"Cactus Seed","c":250000,"r":"Mythical","p":261000,"w":1500,"m":1.8,"ss":"Cactus","cs":"Cactus"},"Bamboo":{"n":"Bamboo Shoot","sn":"Bamboo Seed","c":400000,"r":"Mythical","p":500000,"w":1,"m":2,"ss":"Bamboo","cs":"Bamboo"},"Poinsettia":{"n":"Poinsettia","sn":"Poinsettia Seed","c":500000,"r":"Mythical","p":30000,"w":0.02,"m":2,"ss":"Poinsettia","cs":"Poinsettia"},"VioletCort":{"n":"Violet Cort","sn":"Violet Cort Spore","c":520000,"r":"Mythical","p":600000,"w":2,"m":3.5,"ss":"VioletCort","cs":"VioletCort"},"Chrysanthemum":{"n":"Chrysanthemum","sn":"Chrysanthemum Seed","c":670000,"r":"Mythical","p":18000,"w":0.01,"m":2.75,"ss":"Chrysanthemum","cs":"Chrysanthemum"},"Date":{"n":"Date","sn":"Date Seed","c":750000,"r":"Mythical","p":15000,"w":0.02,"m":2,"ss":"Date","cs":"Date"},"Grape":{"n":"Grape","sn":"Grape Seed","c":850000,"r":"Mythical","p":12500,"w":3,"m":2,"ss":"Grape","cs":"Grape"},"Pepper":{"n":"Pepper","sn":"Pepper Seed","c":1000000,"r":"Divine","p":7220,"w":0.5,"m":2,"ss":"Pepper","cs":"Pepper"},"Lemon":{"n":"Lemon","sn":"Lemon Seed","c":2000000,"r":"Divine","p":10000,"w":0.5,"m":3,"ss":"Lemon","cs":"Lemon"},"PassionFruit":{"n":"Passion Fruit","sn":"Passion Fruit Seed","c":2750000,"r":"Divine","p":24500,"w":9.5,"m":2,"ss":"PassionFruit","cs":"PassionFruit"},"DragonFruit":{"n":"Dragon Fruit","sn":"Dragon Fruit Seed","c":5000000,"r":"Divine","p":24500,"w":8.4,"m":2,"ss":"DragonFruit","cs":"DragonFruit"},"Cacao":{"n":"Cacao Fruit","sn":"Cacao Bean","c":10000000,"r":"Divine","p":70000,"w":0.5,"m":2.5,"ss":"Cacao","cs":"Cacao"},"Lychee":{"n":"Lychee Fruit","sn":"Lychee Pit","c":25000000,"r":"Divine","p":50000,"w":9,"m":2,"ss":"Lychee","cs":"Lychee"},"Sunflower":{"n":"Sunflower","sn":"Sunflower Seed","c":100000000,"r":"Divine","p":750000,"w":10,"m":2.5,"ss":"Sunflower","cs":"Sunflower"},"Starweaver":{"n":"Starweaver Fruit","sn":"Starweaver Pod","c":1000000000,"r":"Celestial","p":10000000,"w":10,"m":2,"ss":"Starweaver","cs":"Starweaver"},"DawnCelestial":{"n":"Dawnbinder Bulb","sn":"Dawnbinder Pod","c":10000000000,"r":"Celestial","p":11000000,"w":6,"m":2.5,"ss":"DawnCelestial","cs":"DawnCelestialCrop"},"MoonCelestial":{"n":"Moonbinder Bulb","sn":"Moonbinder Pod","c":50000000000,"r":"Celestial","p":11000000,"w":2,"m":2,"ss":"MoonCelestial","cs":"MoonCelestialCrop"}},"pets":{"Worm":{"n":"Worm","r":"Common","ms":2,"h":12,"hc":500,"sp":5000,"hd":30,"d":["Carrot","Strawberry","Aloe","Tomato","Apple"]},"Snail":{"n":"Snail","r":"Common","ms":2,"h":12,"hc":1000,"sp":10000,"hd":60,"d":["Blueberry","Tomato","Corn","Daffodil","Chrysanthemum"]},"Bee":{"n":"Bee","r":"Common","ms":2.5,"h":12,"hc":1500,"sp":30000,"hd":15,"d":["Strawberry","Blueberry","Daffodil","Lily","Chrysanthemum"]},"Chicken":{"n":"Chicken","r":"Uncommon","ms":2,"h":24,"hc":3000,"sp":50000,"hd":60,"d":["Aloe","Corn","Watermelon","Pumpkin"]},"Bunny":{"n":"Bunny","r":"Uncommon","ms":2,"h":24,"hc":750,"sp":75000,"hd":45,"d":["Carrot","Strawberry","Blueberry","OrangeTulip","Apple"]},"Dragonfly":{"n":"Dragonfly","r":"Uncommon","ms":2.5,"h":24,"hc":250,"sp":150000,"hd":15,"d":["Apple","OrangeTulip","Echeveria"]},"Pig":{"n":"Pig","r":"Rare","ms":2.5,"h":72,"hc":50000,"sp":500000,"hd":60,"d":["Watermelon","Pumpkin","Mushroom","Bamboo"]},"Cow":{"n":"Cow","r":"Rare","ms":2.5,"h":72,"hc":25000,"sp":1000000,"hd":75,"d":["Coconut","Banana","BurrosTail","Mushroom"]},"Turkey":{"n":"Turkey","r":"Rare","ms":2.5,"h":72,"hc":500,"sp":3000000,"hd":60,"d":["FavaBean","Corn","Squash"]},"Squirrel":{"n":"Squirrel","r":"Legendary","ms":2,"h":100,"hc":15000,"sp":5000000,"hd":30,"d":["Pumpkin","Banana","Grape"]},"Turtle":{"n":"Turtle","r":"Legendary","ms":2.5,"h":100,"hc":100000,"sp":10000000,"hd":90,"d":["Watermelon","BurrosTail","Bamboo","Pepper"]},"Goat":{"n":"Goat","r":"Legendary","ms":2,"h":100,"hc":20000,"sp":20000000,"hd":60,"d":["Pumpkin","Coconut","Pepper","Camellia","PassionFruit"]},"SnowFox":{"n":"Snow Fox","r":"Legendary","ms":2,"h":100,"hc":14000,"sp":7000000,"hd":45,"d":["Echeveria","Squash","Grape"]},"Stoat":{"n":"Stoat","r":"Legendary","ms":2,"h":100,"hc":10000,"sp":10000000,"hd":60,"d":["Banana","Pepper","Cactus"]},"WhiteCaribou":{"n":"Caribou","r":"Legendary","ms":2.5,"h":100,"hc":30000,"sp":15000000,"hd":75,"d":["Camellia","BurrosTail","Mushroom"]},"Pony":{"n":"Pony","r":"Legendary","ms":2,"h":72,"hc":4000,"sp":10000000,"hd":60,"d":["Beet","Pear","Coconut"]},"Horse":{"n":"Horse","r":"Legendary","ms":2.5,"h":100,"hc":25000,"sp":50000000,"hd":75,"d":["Squash","Echeveria","Gentian"]},"FireHorse":{"n":"Fire Horse","r":"Mythical","ms":2.5,"h":144,"hc":200000,"sp":150000000,"hd":90,"d":["DragonFruit","Poinsettia","Cacao"]},"Butterfly":{"n":"Butterfly","r":"Mythical","ms":2.5,"h":144,"hc":25000,"sp":50000000,"hd":30,"d":["Daffodil","Lily","Grape","Lemon","Sunflower"]},"Capybara":{"n":"Capybara","r":"Mythical","ms":2.5,"h":144,"hc":150000,"sp":200000000,"hd":60,"d":["Lemon","PassionFruit","DragonFruit","Lychee"]},"Peacock":{"n":"Peacock","r":"Mythical","ms":2.5,"h":144,"hc":100000,"sp":100000000,"hd":60,"d":["Cactus","Sunflower","Lychee"]}},"eggs":{"CommonEgg":{"n":"Common Egg","r":"Common","c":100000,"s":"CommonEgg","t":600},"UncommonEgg":{"n":"Uncommon Egg","r":"Uncommon","c":1000000,"s":"UncommonEgg","t":3600},"RareEgg":{"n":"Rare Egg","r":"Rare","c":10000000,"s":"RareEgg","t":21600},"LegendaryEgg":{"n":"Legendary Egg","r":"Legendary","c":100000000,"s":"LegendaryEgg","t":43200},"MythicalEgg":{"n":"Mythical Egg","r":"Mythical","c":1000000000,"s":"MythicalEgg","t":86400},"WinterEgg":{"n":"Winter Egg","r":"Legendary","c":800000000,"s":"WinterEgg","t":43200},"SnowEgg":{"n":"Snow Egg","r":"Legendary","c":200000000,"s":"SnowEgg","t":43200},"HorseEgg":{"n":"Horse Egg","r":"Legendary","c":200000000,"s":"HorseEgg","t":43200}},"tools":{"WateringCan":{"n":"Watering Can","r":"Common","c":5000,"s":"WateringCan"},"PlanterPot":{"n":"Planter Pot","r":"Common","c":25000,"s":"PlanterPot"},"Shovel":{"n":"Garden Shovel","r":"Uncommon","c":1000000,"s":"Shovel"},"RainbowPotion":{"n":"Rainbow Potion","r":"Celestial","c":null,"s":"RainbowPotion"},"CropCleanser":{"n":"Crop Cleanser","r":"Common","c":80000,"s":"CropCleanser"}},"decor":{"SmallRock":{"n":"Small Garden Rock","r":"Common","c":1000,"s":"SmallRock"},"MediumRock":{"n":"Medium Garden Rock","r":"Common","c":2500,"s":"MediumRock"},"LargeRock":{"n":"Large Garden Rock","r":"Common","c":5000,"s":"LargeRock"},"WoodCaribou":{"n":"Wood Caribou","r":"Common","c":9000,"s":"WoodCaribou"},"WoodBench":{"n":"Wood Bench","r":"Common","c":10000,"s":"WoodBench"},"WoodArch":{"n":"Wood Arch","r":"Common","c":20000,"s":"WoodArch"},"WoodBridge":{"n":"Wood Bridge","r":"Common","c":40000,"s":"WoodBridge"},"WoodLampPost":{"n":"Wood Lamp Post","r":"Common","c":80000,"s":"WoodLampPost"},"WoodOwl":{"n":"Wood Owl","r":"Common","c":90000,"s":"WoodOwl"},"WoodBirdhouse":{"n":"Wood Birdhouse","r":"Common","c":100000,"s":"Birdhouse"},"WoodWindmill":{"n":"Wood Windmill","r":"Common","c":500000,"s":"WoodWindmill"},"WoodPergola":{"n":"Wood Pergola","r":"Common","c":30000,"s":"WoodPergola"},"StoneCaribou":{"n":"Stone Caribou","r":"Uncommon","c":750000,"s":"StoneCaribou"},"StoneBench":{"n":"Stone Bench","r":"Uncommon","c":1000000,"s":"StoneBench"},"StoneArch":{"n":"Stone Arch","r":"Uncommon","c":4000000,"s":"StoneArch"},"StoneBridge":{"n":"Stone Bridge","r":"Uncommon","c":5000000,"s":"StoneBridge"},"StoneLampPost":{"n":"Stone Lamp Post","r":"Uncommon","c":8000000,"s":"StoneLampPost"},"StoneGnome":{"n":"Stone Gnome","r":"Uncommon","c":9000000,"s":"StoneGnome"},"StoneBirdbath":{"n":"Stone Birdbath","r":"Uncommon","c":10000000,"s":"StoneBirdBath"},"MarbleCaribou":{"n":"Marble Caribou","r":"Rare","c":50000000,"s":"MarbleCaribou"},"MarbleBench":{"n":"Marble Bench","r":"Rare","c":75000000,"s":"MarbleBench"},"MarbleArch":{"n":"Marble Arch","r":"Rare","c":100000000,"s":"MarbleArch"},"MarbleBridge":{"n":"Marble Bridge","r":"Rare","c":150000000,"s":"MarbleBridge"},"MarbleLampPost":{"n":"Marble Lamp Post","r":"Rare","c":200000000,"s":"MarbleLampPost"},"MarbleBlobling":{"n":"Marble Blobling","r":"Rare","c":300000000,"s":"MarbleBlobling"},"MarbleFountain":{"n":"Marble Fountain","r":"Rare","c":450000000,"s":"MarbleFountain"},"MiniFairyCottage":{"n":"Mini Fairy Cottage","r":"Rare","c":500000000,"s":"MiniFairyCottage"},"Cauldron":{"n":"Cauldron","r":"Legendary","c":666000000,"s":"Cauldron"},"StrawScarecrow":{"n":"Straw Scarecrow","r":"Legendary","c":1000000000,"s":"StrawScarecrow"},"MiniFairyForge":{"n":"Mini Fairy Forge","r":"Legendary","c":5000000000,"s":"MiniFairyForge"},"MiniFairyKeep":{"n":"Mini Fairy Keep","r":"Mythical","c":25000000000,"s":"MiniFairyKeep"},"PetHutch":{"n":"Pet Hutch","r":"Divine","c":80000000000,"s":"PetHutch"},"FeedingTrough":{"n":"Feeding Trough","r":"Rare","c":10000000,"s":"FeedingTrough"},"DecorShed":{"n":"Decor Shed","r":"Divine","c":60000000000,"s":"DecorShed"},"SeedSilo":{"n":"Seed Silo","r":"Divine","c":100000000000,"s":"SeedSilo"},"MiniWizardTower":{"n":"Mini Wizard Tower","r":"Mythical","c":75000000000,"s":"MiniWizardTower"},"HayBale":{"n":"Hay Bale","r":"Common","c":7000,"s":"HayBale"},"StringLights":{"n":"String Lights","r":"Common","c":7000,"s":"StringLights"},"ColoredStringLights":{"n":"Colored String Lights","r":"Common","c":8000,"s":"ColoredStringLights"},"PaperLantern":{"n":"Paper Lantern","r":"Common","c":9000,"s":"PaperLantern"},"FanousLantern":{"n":"Fanous Lantern","r":"Common","c":9000,"s":"FanousLantern"},"SmallGravestone":{"n":"Small Gravestone","r":"Common","c":8000,"s":"SmallGravestone"},"MediumGravestone":{"n":"Medium Gravestone","r":"Uncommon","c":500000,"s":"MediumGravestone"},"LargeGravestone":{"n":"Large Gravestone","r":"Rare","c":50000000,"s":"LargeGravestone"}},"mut":{"Gold":{"n":"Gold","x":25,"s":"Gold"},"Rainbow":{"n":"Rainbow","x":50,"s":"Rainbow"},"Wet":{"n":"Wet","x":2,"s":"Wet"},"Chilled":{"n":"Chilled","x":2,"s":"Chilled"},"Frozen":{"n":"Frozen","x":6,"s":"Frozen"},"Thunderstruck":{"n":"Thunderstruck","x":5,"s":"Thunderstruck"},"Thundercharged":{"n":"Thundercharged","x":7,"s":"Thundercharged"},"Dawnlit":{"n":"Dawnlit","x":4,"s":"Dawnlit"},"Amberlit":{"n":"Amberlit","x":6,"s":"Amberlit"},"Dawncharged":{"n":"Dawnbound","x":7,"s":"Dawncharged"},"Ambercharged":{"n":"Amberbound","x":10,"s":"Ambercharged"}},"abil":{"ProduceScaleBoost":{"n":"Crop Size Boost I","d":"Increases the size of garden crops"},"ProduceScaleBoostII":{"n":"Crop Size Boost II","d":"Increases the size of garden crops"},"ProduceScaleBoostIII":{"n":"Crop Size Boost III","d":""},"SnowyCropSizeBoost":{"n":"Snow Crop Size Boost","d":""},"DoubleHarvest":{"n":"Double Harvest","d":"Chance to duplicate harvested crops"},"DoubleHatch":{"n":"Double Hatch","d":"Chance to hatch an extra pet from eggs"},"ProduceEater":{"n":"Crop Eater","d":"Harvests non-mutated crops and sells them"},"SellBoostI":{"n":"Sell Boost I","d":"Receive bonus coins when selling crops"},"SellBoostII":{"n":"Sell Boost II","d":"Receive bonus coins when selling crops"},"SellBoostIII":{"n":"Sell Boost III","d":"Receive bonus coins when selling crops"},"SellBoostIV":{"n":"Sell Boost IV","d":"Receive bonus coins when selling crops"},"ProduceRefund":{"n":"Crop Refund","d":"Chance to get crops back when selling"},"PlantGrowthBoost":{"n":"Plant Growth Boost I","d":"Reduces the time for plants to grow"},"PlantGrowthBoostII":{"n":"Plant Growth Boost II","d":"Reduces the time for plants to grow"},"PlantGrowthBoostIII":{"n":"Plant Growth Boost III","d":""},"SnowyPlantGrowthBoost":{"n":"Snow Plant Growth Boost","d":""},"DawnPlantGrowthBoost":{"n":"Dawn Plant Growth Boost","d":""},"AmberPlantGrowthBoost":{"n":"Amber Plant Growth Boost","d":""},"ProduceMutationBoost":{"n":"Weather Mutation Boost I","d":""},"ProduceMutationBoostII":{"n":"Weather Mutation Boost II","d":""},"ProduceMutationBoostIII":{"n":"Weather Mutation Boost III","d":""},"SnowyCropMutationBoost":{"n":"Snow Boost","d":""},"DawnBoost":{"n":"Dawn Boost","d":""},"AmberMoonBoost":{"n":"Amber Moon Boost","d":""},"PetMutationBoost":{"n":"Pet Mutation Boost I","d":"Increases the chance of hatched pets gaining mutations"},"PetMutationBoostII":{"n":"Pet Mutation Boost II","d":"Increases the chance of hatched pets gaining mutations"},"PetMutationBoostIII":{"n":"Pet Mutation Boost III","d":""},"GoldGranter":{"n":"Gold Granter","d":"Grants the Gold mutation to a garden crop"},"RainbowGranter":{"n":"Rainbow Granter","d":"Grants the Rainbow mutation to a garden crop"},"RainDance":{"n":"Rain Dance","d":"Grants the Wet mutation to a garden crop"},"EggGrowthBoost":{"n":"Egg Growth Boost I","d":"Reduces the time for eggs to hatch"},"EggGrowthBoostII_NEW":{"n":"Egg Growth Boost II","d":"Reduces the time for eggs to hatch"},"EggGrowthBoostII":{"n":"Egg Growth Boost III","d":"Reduces the time for eggs to hatch"},"SnowyEggGrowthBoost":{"n":"Snowy Egg Growth Boost","d":""},"PetAgeBoost":{"n":"Hatch XP Boost I","d":"Hatched pets start with bonus XP"},"PetAgeBoostII":{"n":"Hatch XP Boost II","d":"Hatched pets start with bonus XP"},"PetAgeBoostIII":{"n":"Hatch XP Boost III","d":""},"PetHatchSizeBoost":{"n":"Max Strength Boost I","d":"Increases the maximum strength of hatched pets"},"PetHatchSizeBoostII":{"n":"Max Strength Boost II","d":"Increases the maximum strength of hatched pets"},"PetHatchSizeBoostIII":{"n":"Max Strength Boost III","d":""},"PetXpBoost":{"n":"XP Boost I","d":"Gives bonus XP to active pets"},"PetXpBoostII":{"n":"XP Boost II","d":"Gives bonus XP to active pets"},"PetXpBoostIII":{"n":"XP Boost III","d":""},"SnowyPetXpBoost":{"n":"Snow XP Boost","d":""},"HungerRestore":{"n":"Hunger Restore I","d":"Restores the hunger of a random active pet"},"HungerRestoreII":{"n":"Hunger Restore II","d":"Restores the hunger of a random active pet"},"HungerRestoreIII":{"n":"Hunger Restore III","d":""},"SnowyHungerRestore":{"n":"Snowy Hunger Restore","d":""},"HungerBoost":{"n":"Hunger Boost I","d":"Reduces the hunger depletion rate of active pets"},"HungerBoostII":{"n":"Hunger Boost II","d":"Reduces the hunger depletion rate of active pets"},"HungerBoostIII":{"n":"Hunger Boost III","d":""},"SnowyHungerBoost":{"n":"Snowy Hunger Boost","d":""},"PetRefund":{"n":"Pet Refund I","d":"Chance to receive the pet back as an egg when sold"},"PetRefundII":{"n":"Pet Refund II","d":"Chance to receive the pet back as an egg when sold"},"Copycat":{"n":"Copycat","d":"Chance to copy the ability of another active pet"},"CoinFinderI":{"n":"Coin Finder I","d":"Finds coins in your garden"},"CoinFinderII":{"n":"Coin Finder II","d":"Finds coins in your garden"},"CoinFinderIII":{"n":"Coin Finder III","d":"Finds coins in your garden"},"SnowyCoinFinder":{"n":"Snowy Coin Finder","d":""},"SeedFinderI":{"n":"Seed Finder I","d":"Finds common and uncommon seeds in your garden"},"SeedFinderII":{"n":"Seed Finder II","d":"Finds rare and legendary seeds in your garden"},"SeedFinderIII":{"n":"Seed Finder III","d":"Finds mythical seeds in your garden"},"SeedFinderIV":{"n":"Seed Finder IV","d":"Finds divine and celestial seeds in your garden"},"MoonKisser":{"n":"Moon Kisser","d":"Empowers amber moon crops with special mutations"},"DawnKisser":{"n":"Dawn Kisser","d":"Empowers dawn crops with special mutations"},"SnowGranter":{"n":"Snow Granter","d":"Number of times Snow Granter triggered"},"FrostGranter":{"n":"Frost Granter","d":"Number of times Frost Granter triggered"},"DawnlitGranter":{"n":"Dawnlit Granter","d":""},"AmberlitGranter":{"n":"Amberlit Granter","d":""}}};
  // Crop mutations a granter pet can hand out: ability id -> mutation and base chance (% per minute at 100 strength).
  const GRANTERS = { RainbowGranter: ["Rainbow", 0.72], GoldGranter: ["Gold", 0.72], FrostGranter: ["Frozen", 6], ThunderstruckGranter: ["Thunderstruck", 5], RainDance: ["Wet", 10], SnowGranter: ["Chilled", 8], DawnlitGranter: ["Dawnlit", 4], AmberlitGranter: ["Ambershine", 2] };
  const MUTATION_ORDER = ["Rainbow", "Gold", "Frozen", "Thunderstruck", "Wet", "Chilled", "Dawnlit", "Ambershine"];
  const MUTATION_COLOUR = { Rainbow: "linear-gradient(90deg,#f43f5e,#f59e0b,#84cc16,#22d3ee,#a78bfa)", Gold: "linear-gradient(90deg,#f59e0b,#fde047)", Frozen: "#7dd3fc", Thunderstruck: "#facc15", Wet: "#38bdf8", Chilled: "#bae6fd", Dawnlit: "#c084fc", Ambershine: "#fb923c", "Max size": "linear-gradient(90deg,#4ade80,#bef264)" };
  // Real mutation ids -> names the game shows; every mutation a crop carries is counted exactly.
  Object.assign(MUTATION_COLOUR, { Ambershine: "#ff8c00", Thundercharged: "#fbbf24", Dawncharged: "#a855f7", Ambercharged: "#c45e00" });
  const MUT_LABEL = { Ambershine: "Amberlit", Dawncharged: "Dawnbound", Ambercharged: "Amberbound" };
  const mutLabel = (id) => MUT_LABEL[id] || pretty(id);
  const MUT_DISPLAY = ["Rainbow", "Gold", "Frozen", "Thunderstruck", "Thundercharged", "Wet", "Chilled", "Dawnlit", "Dawncharged", "Ambershine", "Ambercharged"];
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
    { id: "petdeck", win: "pets", icon: "deck", label: "Pet Deck", title: "Pet Deck — Alt + D" },
    { id: "pets", code: "KeyJ", icon: "paw", label: "Swapper", title: "Weather Pet Swapper — Alt + J" },
    { id: "calc", win: "calc", icon: "calc", label: "Calculator", title: "Crop Calculator — Alt + C" },
    { id: "room", win: "room", icon: "room", label: "Room", title: "Room — Alt + R" },
    { id: "alerts", win: "alerts", icon: "bell", label: "Alerts", title: "Alerts — Alt + N\nRight-click: turn on / off", lamp: ALERT_KEY },
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
  function findStoreViaFiber() { const hook = PW.__REACT_DEVTOOLS_GLOBAL_HOOK__; if (!hook?.renderers?.size || typeof hook.getFiberRoots !== "function") return null; for (const [id] of hook.renderers) { const roots = hook.getFiberRoots(id); if (!roots) continue; for (const root of roots) { const seen = new Set(), stack = [root.current]; while (stack.length) { const fiber = stack.pop(); if (!fiber || seen.has(fiber)) continue; seen.add(fiber); const candidate = fiber.pendingProps?.value; if (candidate && typeof candidate.get === "function" && typeof candidate.sub === "function") return candidate; if (fiber.child) stack.push(fiber.child); if (fiber.sibling) stack.push(fiber.sibling); if (fiber.alternate) stack.push(fiber.alternate); } } } return null; }
  async function getStore() { if (store) return store; const shared = PW.__MG_STORE_BRIDGE__; if (shared?.promise?.then) { try { const resolved = await shared.promise; if (resolved && !resolved.__polyfill) return store = resolved; } catch {} } for (let i = 0; i < 20; i++) { const found = findStoreViaFiber(); if (found) return store = found; await sleep(500); } return null; }
  function findAtom(label) { const cache = PW.jotaiAtomCache?.cache; if (!cache?.values) return null; for (const atom of cache.values()) if (atom?.debugLabel === label || atom?.label === label) return atom; return null; }
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
    const out = { plants: 0, crops: 0, mature: 0, mutated: 0, growthSum: 0, maxSize: 0, nextAt: null, allAt: null, species: new Map(), missing: {}, have: {}, totals: {}, etas: [] };
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
        for (const m of muts) { row.mutations.set(m, (row.mutations.get(m) || 0) + 1); out.totals[m] = (out.totals[m] || 0) + 1; }
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
    for (const name of MUT_DISPLAY) {
      const have = stats.totals[name] || 0, pct = (have / stats.crops) * 100, eta = stats.etas.find((e) => e.name === name), tracked = MUTATION_ORDER.includes(name), hasAny = have > 0 || (eta && eta.pets > 0);
      let etaText;
      if (!tracked) etaText = `Crops that have ${esc(mutLabel(name))} right now.`;
      else if (!stats.missing[name]) etaText = `<b>Complete</b> — every crop that can take it has it.`;
      else if (eta && eta.pets) etaText = `${eta.pets} pet${eta.pets > 1 ? "s" : ""} working on it · <b>about ${fmtDur(eta.totalMs)}</b> to finish ${fmtInt(stats.missing[name])} crops`;
      else etaText = `${fmtInt(stats.missing[name])} crops can still get it · no fed pet with this granter is active`;
      html += `<div class="ga-mut" data-dim="${hasAny ? "false" : "true"}"><div class="ga-line"><span>${esc(mutLabel(name))}</span><em>${fmtInt(have)} / ${fmtInt(stats.crops)}</em></div>${bar(pct, MUTATION_COLOUR[name] || "#a7f3d0")}<div class="ga-eta">${etaText}</div></div>`;
    }
    html += `<div class="ga-mut"><div class="ga-line"><span>Max size</span><em>${fmtInt(stats.maxSize)} / ${fmtInt(stats.crops)}</em></div>${bar((stats.maxSize / stats.crops) * 100, MUTATION_COLOUR["Max size"])}<div class="ga-eta">Crops that reached full size.</div></div>`;
    html += `<div class="ga-h">By species</div><div class="ga-species">`;
    for (const row of [...stats.species.values()].sort((a, b) => b.crops - a.crops)) {
      const chips = [...row.mutations.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => `<span class="ga-chip" style="background:${(MUTATION_COLOUR[m] || "#a7f3d0")}">${esc(mutLabel(m))} ${n}</span>`).join("");
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
#${DOCK_ID} .gd-ver{flex:none;padding:${U(2)} ${U(6)};border:1px solid rgba(255,255,255,.12);border-radius:99px;background:rgba(255,255,255,.06);color:#9db0a5;font:700 ${U(9)}/1.2 "Trebuchet MS",system-ui,sans-serif;white-space:nowrap;cursor:pointer}
#${DOCK_ID} .gd-ver:hover{color:#fde047;border-color:rgba(253,224,71,.6)}
#${DOCK_ID} .gd-ver[data-update="true"]{border-color:rgba(253,224,71,.85);background:rgba(253,224,71,.2);color:#fde047;animation:gd-pulse 1.8s ease-in-out infinite}
#${DOCK_ID}[data-cols="2"] .gd-ver:not([data-update="true"]){display:none}
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
  function injectStyles() { if (document.getElementById(STYLE_ID)) return; const style = document.createElement("style"); style.id = STYLE_ID; style.textContent = CSS + CSS2; (document.head || document.documentElement).append(style); }
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
  const LUNAR_IDS = new Set(["Dawn", "AmberMoon"]), W_SHOP = { Frost: "snow", Thunderstorm: "thunder", Dawn: "dawn" }, SLOT_MS = 5 * 60 * 1000;
  let roomGame = null, seenWeather, seenAt = 0, weatherEl = null, weatherTimer = null, roomHooked = false;
  function hookRoom() {
    if (roomHooked) return true; const conn = PW.MagicCircle_RoomConnection; if (typeof conn?.subscribeToPatches !== "function") return false;
    try { conn.subscribeToPatches((_patches, full) => { roomGame = full?.child?.data || null; }); roomHooked = true; } catch { return false; }
    return true;
  }
  function gameNow() { try { const o = PW.__gardenCompanionForecastTrace?.()?.serverClockOffsetMs; return Date.now() + (Number.isFinite(o) ? o : 0); } catch { return Date.now(); } }
  const wName = (id) => W_NAME[id] || pretty(id) || "Clear";
  function wIcon(id) { const sprite = PW.__gardenCompanionWeatherSprites?.[id]; return sprite ? `<img src="${esc(sprite)}" alt="">` : (W_EMOJI[id] || "☀️"); }
  function fmtClock(ms) { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${pad2(m)}:${pad2(x)}` : `${m}:${pad2(x)}`; }
  function weatherInfo(now) {
    const game = roomGame || PW.__gardenCompanionState?.game || null, cur = typeof game?.weather === "string" ? game.weather : "";
    if (game && cur !== seenWeather) { { const edge = Math.floor(now / SLOT_MS) * SLOT_MS; seenAt = seenWeather === undefined ? 0 : (now - edge < 20000 ? edge : now); } seenWeather = cur; }
    const list = Array.isArray(game?.weatherForecast) ? game.weatherForecast : []; let endsIn = null, next = null;
    for (const e of list) {
      const id = typeof e?.weatherId === "string" ? e.weatherId : "", s = Number(e?.startsAtMs), en = Number(e?.endsAtMs); if (!Number.isFinite(s)) continue;
      if (cur && id === cur && s <= now && Number.isFinite(en) && en > now) endsIn = en - now;
      if (s > now && (!next || s < next.at)) next = { id, at: s, lunar: e.groupId === "Lunar" || LUNAR_IDS.has(id) };
    }
    if (cur && endsIn === null && W_SHOP[cur]) { const dl = Number(game?.shops?.[W_SHOP[cur]]?.deadlineMs); if (Number.isFinite(dl) && dl > now) endsIn = dl - now; }
    if (cur && endsIn === null) {
      if (seenAt && now - seenAt < WEATHER_MS) endsIn = WEATHER_MS - (now - seenAt);
      else if (LUNAR_IDS.has(cur)) { const start = Math.floor(now / LUNAR_MS) * LUNAR_MS; if (now - start < WEATHER_MS) endsIn = WEATHER_MS - (now - start); }
    }
    let range = null;
    if (cur && endsIn === null) { const seedDl = Number(game?.shops?.seed?.deadlineMs), toEdge = seedDl > now && seedDl - now <= SLOT_MS ? seedDl - now : SLOT_MS - (now % SLOT_MS); range = [toEdge, toEdge + SLOT_MS]; }
    return { ready: !!game, cur, endsIn, range, next, lunarIn: (Math.floor(now / LUNAR_MS) + 1) * LUNAR_MS - now };
  }
  function updateWeather() {
    if (!weatherEl || weatherEl.style.display === "none") return; const now = gameNow(), w = weatherInfo(now), q = (s) => weatherEl.querySelector(s);
    q(".gw-ico").innerHTML = wIcon(w.cur); q(".gw-now b").textContent = !w.ready ? "Waiting for game…" : w.cur ? wName(w.cur) : "Clear skies";
    const mins = (ms) => Math.max(1, Math.ceil(ms / 60000));
    q(".gw-now small").textContent = w.cur && w.endsIn !== null ? `${fmtClock(w.endsIn)} left` : w.cur && w.range ? `about ${mins(w.range[0])}–${mins(w.range[1])} min left` : w.ready ? "no weather event" : "";
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


  // =====================================================================================================
  //  King's Mod 3.1 additions: Calculator, Pet Deck, Room, Alerts (+ real sprites from the game's asset API)
  // =====================================================================================================
  const h = (tag, cls, html) => { const el = document.createElement(tag); if (cls) el.className = cls; if (html != null) el.innerHTML = html; return el; };
  const fmtCoins = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—");
  function fmtShort(n) {
    if (!Number.isFinite(n)) return "—"; const a = Math.abs(n);
    for (const [v, s] of [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]]) if (a >= v) { const x = n / v; return `${x >= 100 ? Math.round(x) : Math.round(x * 10) / 10}${s}`; }
    return String(Math.round(n));
  }
  const RARITY_COLOUR = { Common: "#c9d4cc", Uncommon: "#7ee08f", Rare: "#6fb7ff", Legendary: "#ffd166", Mythical: "#d995ff", Divine: "#ff9d6b", Celestial: "#7df3ff" };
  const rarityColour = (r) => RARITY_COLOUR[r] || "#c9d4cc";
  const cssId = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, "_");

  // ---------- real sprites (same asset API Arie's mod uses) ----------
  const SPRITE_API = "https://mg-api.ariedam.fr/assets/sprites";
  const hasGM = typeof GM_xmlhttpRequest === "function";
  const spriteCache = new Map();
  function gmBlob(url) {
    return new Promise((resolve) => {
      try { GM_xmlhttpRequest({ method: "GET", url, responseType: "blob", timeout: 15000, onload: (r) => resolve(r.status >= 200 && r.status < 300 && r.response ? URL.createObjectURL(r.response) : null), onerror: () => resolve(null), ontimeout: () => resolve(null) }); } catch { resolve(null); }
    });
  }
  function probeImage(url) { return new Promise((resolve) => { const im = new Image(); im.onload = () => resolve(url); im.onerror = () => resolve(null); im.src = url; }); }
  function spriteSrc(url) {
    let p = spriteCache.get(url);
    if (!p) { p = (hasGM ? gmBlob(url).then((b) => b || probeImage(url)) : probeImage(url)); spriteCache.set(url, p); p.then((v) => { if (!v) setTimeout(() => spriteCache.delete(url), 45000); }); }
    return p;
  }
  const spriteUrl = (cat, name) => `${SPRITE_API}/${cat}/${encodeURIComponent(name)}.png`;
  const composedUrl = (prefix, name, muts) => `${SPRITE_API}/composed?key=${encodeURIComponent(`${prefix}/${name}`)}${muts?.length ? `&mutations=${encodeURIComponent(muts.join(","))}` : ""}`;
  // Candidate lists: the first one that loads wins, the emoji shows until then (and stays if nothing loads).
  const SPR = {
    seed: (sp) => [spriteUrl("seeds", KD.crops[sp]?.ss || sp), spriteUrl("seeds", sp)],
    crop: (sp, muts) => { const n = KD.crops[sp]?.cs || sp; const m = (muts || []).filter(Boolean); return [...(m.length ? [composedUrl("sprite/plant", n, m)] : []), spriteUrl("plants", n), spriteUrl("tallPlants", n), spriteUrl("plants", sp)]; },
    pet: (sp, muts) => { const m = (muts || []).filter(Boolean); return [...(m.length ? [composedUrl("sprite/pet", sp, m)] : []), spriteUrl("pets", sp)]; },
    egg: (id) => [spriteUrl("pets", KD.eggs[id]?.s || id), spriteUrl("pets", id)],
    tool: (id) => [spriteUrl("items", KD.tools[id]?.s || id), spriteUrl("items", id)],
    decor: (id) => [spriteUrl("decor", KD.decor[id]?.s || id), spriteUrl("decor", id)],
    mut: (id) => [spriteUrl("mutations", KD.mut[id]?.s || id), spriteUrl("mutations", id), spriteUrl("ui", `Mutation${id}`)]
  };
  const EMOJI = { seed: "🌱", crop: "🥬", pet: "🐾", egg: "🥚", tool: "🧰", decor: "🪴", mut: "✨" };
  function spr(urls, size, emoji, cls) {
    const wrap = h("span", `kx-spr${cls ? ` ${cls}` : ""}`); wrap.style.setProperty("--z", `${size}px`); wrap.textContent = emoji || "";
    (async () => { for (const u of urls) { const src = await spriteSrc(u); if (!src) continue; const im = new Image(); im.alt = ""; im.draggable = false; im.decoding = "async"; im.onload = () => { wrap.textContent = ""; wrap.append(im); }; im.src = src; return; } })();
    return wrap;
  }
  const sprHtml = (urls, size, emoji, cls) => { const holder = h("span"); holder.append(spr(urls, size, emoji, cls)); return holder.innerHTML; };   // static fallback only; prefer spr() for live images


  // ---------- live game data (same /data feed as Arie's mod) so new crops, pets and abilities show up on their own ----------
  const spriteNameOf = (v) => { const t = String(v || "").split(/[?#]/)[0].split("/").pop() || ""; return t.replace(/\.[a-z0-9]+$/i, "") || null; };
  function gmText(url) {
    return new Promise((resolve) => {
      if (hasGM) { try { GM_xmlhttpRequest({ method: "GET", url, timeout: 25000, onload: (r) => resolve(r.status >= 200 && r.status < 300 ? r.responseText : null), onerror: () => resolve(null), ontimeout: () => resolve(null) }); return; } catch {} }
      fetch(url).then((r) => (r.ok ? r.text() : null)).then(resolve).catch(() => resolve(null));
    });
  }
  let liveLoaded = false;
  async function loadLiveData() {
    if (liveLoaded) return;
    let d = null; try { d = JSON.parse(await gmText("https://mg-api.ariedam.fr/data")); } catch {}
    if (!d || typeof d !== "object") { setTimeout(loadLiveData, 30000); return; }
    liveLoaded = true; const R = (x) => (x === "Mythic" ? "Mythical" : x);
    try {
      if (d.plants) { const crops = {}; for (const [k, e] of Object.entries(d.plants)) { const sd = e?.seed || {}, c = e?.crop || {}; if (!(c.baseSellPrice > 0)) continue; crops[k] = { n: c.name || k, sn: sd.name || k, c: sd.coinPrice || 0, r: R(sd.rarity) || "Common", p: c.baseSellPrice, w: c.baseWeight || 0, m: c.maxSizeMultiplier || c.maxScale || 1, ss: spriteNameOf(sd.sprite || sd.tileRef) || KD.crops[k]?.ss || k, cs: spriteNameOf(c.sprite || c.tileRef) || KD.crops[k]?.cs || k }; } if (Object.keys(crops).length) KD.crops = { ...crops, ...Object.fromEntries(Object.entries(KD.crops).filter(([k]) => !(k in crops))) }; }
      if (d.pets) { const pets = {}; for (const [k, v] of Object.entries(d.pets)) pets[k] = { n: v.name || k, r: R(v.rarity), ms: v.maxScale || 1, h: v.hoursToMature || 1, hc: v.coinsToFullyReplenishHunger || 3000, sp: v.maturitySellPrice || 0, hd: KD.pets[k]?.hd || 60, d: v.diet || [] }; KD.pets = { ...KD.pets, ...pets }; }
      if (d.eggs) { const o = {}; for (const [k, v] of Object.entries(d.eggs)) o[k] = { n: v.name || k, r: R(v.rarity), c: v.coinPrice, s: spriteNameOf(v.sprite || v.tileRef) || KD.eggs[k]?.s || k, t: v.secondsToHatch }; KD.eggs = { ...KD.eggs, ...o }; }
      if (d.items) { const o = {}; for (const [k, v] of Object.entries(d.items)) o[k] = { n: v.name || k, r: R(v.rarity), c: v.coinPrice, s: spriteNameOf(v.sprite || v.tileRef) || KD.tools[k]?.s || k }; KD.tools = { ...KD.tools, ...o }; }
      if (d.decor) { const o = {}; for (const [k, v] of Object.entries(d.decor)) o[k] = { n: v.name || k, r: R(v.rarity), c: v.coinPrice, s: spriteNameOf(v.sprite || v.tileRef) || KD.decor[k]?.s || k }; KD.decor = { ...KD.decor, ...o }; }
      if (d.mutations) { const o = {}; for (const [k, v] of Object.entries(d.mutations)) { o[k] = { n: v.name || k, x: v.coinMultiplier, s: spriteNameOf(v.sprite || v.tileRef) || KD.mut[k]?.s || k }; if (v.name && !(v.name in MUT_X) && v.coinMultiplier > 0) MUT_X[v.name] = v.coinMultiplier; } KD.mut = { ...KD.mut, ...o }; }
      if (d.abilities) { const o = {}; for (const [k, v] of Object.entries(d.abilities)) { const e = { n: v.name || k, d: v.description || "" }; if (v.trigger) e.tr = v.trigger; if (typeof v.baseProbability === "number") e.p = v.baseProbability; if (v.baseParameters && typeof v.baseParameters === "object") e.bp = v.baseParameters; o[k] = e; } KD.abil = { ...KD.abil, ...o }; }
    } catch (error) { console.warn("[King's Mod] live data", error); }
    for (const w of Object.values(WINS)) { try { if (w.isOpen()) w.render(); } catch {} }
  }

  // ---------- crop / pet maths (same rules the game uses) ----------
  const CROP_MIN = 50, CROP_MAX = 100;
  const MUT_X = { Gold: 25, Rainbow: 50, Wet: 2, Chilled: 2, Frozen: 6, Thunderstruck: 5, Thundercharged: 7, Dawnlit: 4, Dawnbound: 7, Amberlit: 6, Amberbound: 10 };
  const MUT_ID = { Dawnbound: "Dawncharged", Amberlit: "Ambershine", Amberbound: "Ambercharged" };          // calculator label -> id the game stores
  const MUT_NORM = { golden: "Gold", gold: "Gold", rainbow: "Rainbow", wet: "Wet", chilled: "Chilled", frozen: "Frozen", thunderstruck: "Thunderstruck", thunder: "Thunderstruck", thundercharged: "Thundercharged", dawnlit: "Dawnlit", dawn: "Dawnlit", dawnlight: "Dawnlit", dawnbound: "Dawnbound", dawncharged: "Dawnbound", amberlit: "Amberlit", ambershine: "Amberlit", amberglow: "Amberlit", amberlight: "Amberlit", amberbound: "Amberbound", ambercharged: "Amberbound" };
  const normMut = (m) => MUT_NORM[String(m || "").trim().toLowerCase()] || String(m || "");
  const isColor = (m) => m === "Gold" || m === "Rainbow";
  const isWeatherMut = (m) => ["Wet", "Chilled", "Frozen", "Thunderstruck", "Thundercharged"].includes(m);
  const isTimeMut = (m) => ["Dawnlit", "Dawnbound", "Amberlit", "Amberbound"].includes(m);
  const sizeMult = (sp, size) => { const mx = KD.crops[sp]?.m || 1; if (mx <= 1) return 1; return 1 + (mx - 1) * ((clamp(Math.round(size), CROP_MIN, CROP_MAX) - CROP_MIN) / (CROP_MAX - CROP_MIN)); };
  const cropWeight = (sp, size) => { const w = KD.crops[sp]?.w; return w > 0 ? w * sizeMult(sp, size) : null; };
  const friendMult = (players) => 1 + (clamp(Math.floor(Number(players) || 1), 1, 6) - 1) * 0.1;
  function mutBreakdown(list) {
    const muts = (Array.isArray(list) ? list : []).map(normMut); let color = 1, wet = false, chilled = false; const weather = new Set(), times = new Set();
    for (const m of muts) { if (isColor(m)) color = Math.max(color, MUT_X[m] || 1); else if (m === "Wet") wet = true; else if (m === "Chilled") chilled = true; else if (isWeatherMut(m)) weather.add(m); else if (isTimeMut(m)) times.add(m); }
    if (wet && chilled) weather.add("Frozen"); else if (wet) weather.add("Wet"); else if (chilled) weather.add("Chilled");
    const best = (set) => { let pick = null, top = -1; for (const m of set) if ((MUT_X[m] || 1) > top) { top = MUT_X[m] || 1; pick = m; } return pick; };
    const w = best(weather), t = best(times), parts = [w, t].filter(Boolean).map((m) => MUT_X[m] || 1);
    const wt = parts.length ? parts.reduce((a, b) => a + b, 0) - parts.length + 1 : 1;
    return { color, weather: w, time: t, wt, total: color * wt };
  }
  function cropValue(sp, size, muts, players) {
    const base = KD.crops[sp]?.p; if (!(base > 0)) return 0;
    return Math.max(0, Math.round(base * sizeMult(sp, size) * mutBreakdown(muts).total * friendMult(players)));
  }
  function readCropSize(obj) {
    if (!obj || typeof obj !== "object") return null;
    const direct = Number(obj.size); if (Number.isFinite(direct)) return clamp(Math.round(direct), CROP_MIN, CROP_MAX);
    const legacy = Number(obj.targetScale ?? obj.scale); if (!Number.isFinite(legacy)) return null;
    const up = (KD.crops[obj.species]?.m || 2) > 1 ? KD.crops[obj.species].m : 2, v = Math.min(up, Math.max(1, legacy));
    return clamp(Math.round(CROP_MIN + ((v - 1) / (up - 1)) * (CROP_MAX - CROP_MIN)), CROP_MIN, CROP_MAX);
  }
  function petStrength(slot, species) {
    const info = KD.pets[species]; if (!info) return { s: 0, m: 0 };
    const maxScale = info.ms > 1 ? info.ms : 1, ts = typeof slot.targetScale === "number" ? slot.targetScale : 1;
    const m = Math.max(Math.floor((maxScale > 1 ? (ts - 1) / (maxScale - 1) : 0) * 20 + 80), 0);
    const hours = info.h > 0 ? info.h : 1, xp = Math.max(0, Number(slot.xp) || 0);
    return { s: Math.min(Math.max(m - 30, 0) + Math.min(Math.floor((xp / (hours * 3600)) * 30), 30), m), m };
  }
  function normPet(entry, where) {
    const slot = entry?.slot && typeof entry.slot === "object" ? entry.slot : entry; if (!slot || typeof slot !== "object") return null;
    const species = String(slot.petSpecies ?? slot.species ?? ""), id = String(slot.id ?? slot.petId ?? entry?.id ?? ""); if (!species) return null;
    const info = KD.pets[species], st = petStrength(slot, species), cap = info?.hc || 3000, hunger = Number(slot.hunger) || 0, ts = typeof slot.targetScale === "number" ? slot.targetScale : 1;
    const mutations = Array.isArray(slot.mutations) ? slot.mutations.map(String) : [];
    const mult = mutations.reduce((a, m) => a * (KD.mut[m]?.x > 0 ? KD.mut[m].x : 1), 1);
    const value = st.m > 0 && info ? Math.round(Math.max(0, info.sp * (st.s / st.m) * ts * mult)) : 0;
    const xp = Math.max(0, Number(slot.xp) || 0), matureXp = (info?.h || 1) * 3600;
    return { id, species, name: slot.name ? String(slot.name) : "", xp, matureXp, hunger, hungerPct: clamp((hunger / cap) * 100, 0, 100), targetScale: ts, mutations, abilities: Array.isArray(slot.abilities) ? slot.abilities.map(String) : [], strength: st.s, maxStrength: st.m, value, where: where || "" };
  }

  // ---------- game data readers (extra atoms, same store King's already finds) ----------
  async function atomValue(label) { const s = await getStore(); if (!s) return null; return readAtom(s, findAtom(label)); }
  async function readMine() {
    const data = await atomValue("myDataAtom"); if (!data) return null;
    const infos = await atomValue("myPetInfosAtom"), prims = (await atomValue("myPredictedPetSlotsAtom")) || (await atomValue("myPrimitivePetSlotsAtom"));
    const rawActive = Array.isArray(infos) && infos.length ? infos : Array.isArray(prims) ? prims : [];
    const active = rawActive.map((e) => normPet(e, "Active")).filter(Boolean);
    const inv = (await atomValue("myInventoryAtom")) || data.inventory || null;
    const items = Array.isArray(inv?.items) ? inv.items : [];
    const hutch = (Array.isArray(inv?.storages) ? inv.storages : []).find((s) => s?.id === "PetHutch" || s?.decorId === "PetHutch");
    const seen = new Set(active.map((p) => p.id)), pets = active.slice();
    for (const it of items) { if (it?.itemType !== "Pet") continue; const p = normPet(it, "Backpack"); if (p && !seen.has(p.id)) { seen.add(p.id); pets.push(p); } }
    for (const it of Array.isArray(hutch?.items) ? hutch.items : []) { if (it?.itemType && it.itemType !== "Pet") continue; const p = normPet(it, "Hutch"); if (p && !seen.has(p.id)) { seen.add(p.id); pets.push(p); } }
    return { data, active, pets, inv, teams: Array.isArray(data.petTeams) ? data.petTeams : [] };
  }
  async function readRoomState() { return atomValue("stateAtom"); }
  const iconBtn = (cls, label, html) => { const b = h("button", cls, html); b.type = "button"; b.title = label; b.setAttribute("aria-label", label); return b; };

  // ---------- window shell (movable, resizable, bookmark tabs) ----------
  const WINS = {}; let zTop = 2147483620, winCount = 0;
  const WIN_ICONS = {
    calc: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7.5h7"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>',
    deck: '<rect x="4" y="6" width="11" height="15" rx="2"/><path d="M8 3.5h9a2 2 0 0 1 2 2V17"/><circle cx="9.5" cy="12" r="1.6"/><path d="M7 18c.7-1.6 1.7-2.4 2.5-2.4s1.8.8 2.5 2.4"/>',
    room: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.4"/><path d="M16.5 14.2c2.6.3 4.5 2.4 4.5 5.3"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z"/><path d="M10 21h4"/>'
  };
  Object.assign(ICONS, WIN_ICONS);
  function createWin(o) {
    const idx = winCount++, rectKey = `mg-king-win-${o.id}-rect-v1`, tabKey = `mg-king-win-${o.id}-tab-v1`;
    const root = h("div", "kx-win"); root.id = `kx-win-${o.id}`; root.style.setProperty("--ac", o.accent[0]); root.style.setProperty("--ac2", o.accent[1]); root.style.display = "none";
    root.innerHTML = `<div class="kx-top" title="Drag to move"><span class="kx-mark">${iconSvg(o.icon)}</span><div class="kx-ttl"><h2>${esc(o.title)}</h2><div class="kx-sub"></div></div><div class="kx-tools"></div><button type="button" class="kx-x" data-nodrag title="Close" aria-label="Close">×</button></div><div class="kx-tabs" role="tablist"></div><div class="kx-body"></div><i class="kx-rh" data-edge="r"></i><i class="kx-rh b" data-edge="b"></i><i class="kx-rg" data-edge="br" title="Drag to resize"></i>`;
    const q = (s) => root.querySelector(s), tabsEl = q(".kx-tabs"), body = q(".kx-body"), sub = q(".kx-sub"), tools = q(".kx-tools");
    const win = { id: o.id, root, body, tools, tab: readJson(tabKey) || o.tabs[0].id, timer: null, view: null, open: false };
    const fit = (r) => { const width = clamp(r.width, 300, Math.max(300, window.innerWidth - 8)), height = clamp(r.height, 220, Math.max(220, window.innerHeight - 8)); return { width, height, left: clamp(r.left, 0, Math.max(0, window.innerWidth - width)), top: clamp(r.top, 0, Math.max(0, window.innerHeight - height)) }; };
    const place = (r) => { const f = fit(r); root.style.left = `${f.left}px`; root.style.top = `${f.top}px`; root.style.width = `${f.width}px`; root.style.height = `${f.height}px`; };
    const saveRect = () => { const b = root.getBoundingClientRect(); writeJson(rectKey, { left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) }); };
    const defaultRect = () => { const d = document.getElementById(DOCK_ID)?.getBoundingClientRect(), width = Math.min(o.w || 560, window.innerWidth - 16), height = Math.min(o.h || 560, window.innerHeight - 16), off = idx * 26; if (!d) return { left: 12 + off, top: 12 + off, width, height }; return { left: (d.left > window.innerWidth / 2 ? d.left - width - 10 : d.right + 10) - (d.left > window.innerWidth / 2 ? off : -off), top: d.top + off, width, height }; };
    const front = () => { root.style.zIndex = String(++zTop); };
    function drawTabs() { tabsEl.innerHTML = ""; for (const t of o.tabs) { const b = h("button", "kx-tab", esc(t.label)); b.type = "button"; b.dataset.tab = t.id; b.setAttribute("role", "tab"); b.dataset.on = String(t.id === win.tab); tabsEl.append(b); } }
    function render() {
      const t = o.tabs.find((x) => x.id === win.tab) || o.tabs[0]; win.tab = t.id; drawTabs(); body.replaceChildren(); body.scrollTop = 0;
      try { win.view = t.render(body, win) || null; } catch (error) { console.error("[King's Mod]", error); body.innerHTML = `<div class="kx-empty">Something went wrong drawing this tab.</div>`; win.view = null; }
    }
    win.setSub = (text) => { sub.textContent = text || ""; };
    win.render = render;
    win.isOpen = () => win.open;
    win.openWin = () => { win.open = true; root.style.display = "flex"; const s = readJson(rectKey); place(Number.isFinite(s?.left) && Number.isFinite(s?.width) ? s : defaultRect()); front(); render(); if (win.timer) clearInterval(win.timer); win.timer = setInterval(() => { try { if (!root.contains(document.activeElement) || !/^(input|textarea|select)$/i.test(document.activeElement?.tagName || "")) win.view?.update?.(); } catch {} }, o.every || 1000); refreshActive(); };
    win.closeWin = () => { win.open = false; root.style.display = "none"; if (win.timer) { clearInterval(win.timer); win.timer = null; } o.onClose?.(); refreshActive(); };
    win.toggle = () => (win.open ? win.closeWin() : win.openWin());
    win.reset = () => { try { localStorage.removeItem(rectKey); } catch {} if (win.open) place(defaultRect()); };
    root.addEventListener("pointerdown", front, true);
    root.addEventListener("click", (e) => {
      if (e.target.closest?.(".kx-x")) { win.closeWin(); return; }
      const tb = e.target.closest?.(".kx-tab"); if (tb && tb.dataset.tab !== win.tab) { win.tab = tb.dataset.tab; writeJson(tabKey, win.tab); render(); }
    });
    root.addEventListener("pointerdown", (event) => {
      const edge = event.target.dataset?.edge; if (!edge || event.button !== 0) return; event.preventDefault();
      const s = root.getBoundingClientRect(), sx = event.clientX, sy = event.clientY;
      const move = (e) => place({ left: s.left, top: s.top, width: edge.includes("r") ? s.width + e.clientX - sx : s.width, height: edge.includes("b") ? s.height + e.clientY - sy : s.height });
      const done = () => { saveRect(); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", done); window.removeEventListener("pointercancel", done); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", done); window.addEventListener("pointercancel", done);
    });
    makeMovable(root, q(".kx-top"), rectKey, () => saveRect());
    window.addEventListener("resize", () => { if (win.open) { place(root.getBoundingClientRect()); saveRect(); } });
    win.mount = () => { if (!root.isConnected) document.body.append(root); };
    WINS[o.id] = win; return win;
  }
  const mountWins = () => { for (const w of Object.values(WINS)) w.mount(); };

  // ---------- toasts (used by Alerts and by pet / room actions) ----------
  let toastBox = null;
  function toast(title, detail, o = {}) {
    if (!document.body) return null;
    if (!toastBox?.isConnected) { toastBox = h("div", "kx-toasts"); document.body.append(toastBox); }
    const t = h("div", "kx-toast"); t.dataset.kind = o.kind || "info";
    const icon = h("span", "kx-toast-ic"); if (o.urls) icon.append(spr(o.urls, 34, o.emoji || "🔔")); else icon.textContent = o.emoji || "🔔";
    const text = h("div", "kx-toast-tx", `<b>${esc(title)}</b>${detail ? `<span>${esc(detail)}</span>` : ""}`);
    const x = h("button", "kx-toast-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Dismiss");
    const kill = () => { t.dataset.out = "1"; setTimeout(() => t.remove(), 180); };
    x.onclick = kill; t.append(icon, text, x); toastBox.prepend(t);
    while (toastBox.children.length > 5) toastBox.lastElementChild.remove();
    if (!o.sticky) setTimeout(kill, o.ms || 7000);
    return kill;
  }
  const empty = (emoji, title, hint) => h("div", "kx-empty", `<div class="kx-empty-e">${emoji}</div><b>${esc(title)}</b><span>${esc(hint || "")}</span>`);
  function segmented(options, value, onPick, cls) {
    const wrap = h("div", `kx-seg ${cls || ""}`);
    for (const opt of options) { const b = h("button", "", esc(opt.label ?? opt)); b.type = "button"; b.dataset.v = String(opt.value ?? opt); b.dataset.on = String((opt.value ?? opt) === value); b.onclick = () => { for (const x of wrap.children) x.dataset.on = String(x === b); onPick(opt.value ?? opt); }; wrap.append(b); }
    wrap.set = (v) => { for (const x of wrap.children) x.dataset.on = String(x.dataset.v === String(v)); };
    return wrap;
  }

  // ---------- Calculator: the seed shelf and the market stall ----------
  const CALC_KEY = "mg-king-calc-v1";
  const CALC_COLOR = ["None", "Gold", "Rainbow"], CALC_WEATHER = ["None", "Wet", "Chilled", "Frozen", "Thunderstruck", "Thundercharged"], CALC_LIGHT = ["None", "Dawnlit", "Dawnbound", "Amberlit", "Amberbound"];
  const calcSaved = Object.assign({ species: null, states: {} }, readJson(CALC_KEY) || {});
  const calcState = (sp) => (calcSaved.states[sp] = Object.assign({ size: 50, color: "None", weather: "None", light: "None", friends: 1 }, calcSaved.states[sp] || {}));
  const calcMuts = (s) => [s.color, s.weather, s.light].filter((x) => x !== "None");
  function mutChip(label, on, onClick) {
    const b = h("button", "kx-mchip"); b.type = "button"; b.dataset.on = String(on);
    const id = label === "None" ? null : (MUT_ID[label] || label);
    b.append(id ? spr(SPR.mut(id), 20, "✨") : h("span", "kx-mchip-none", "∅"));
    b.append(h("span", "", `${esc(label)}${id ? `<small>×${MUT_X[label]}</small>` : ""}`)); b.onclick = onClick; return b;
  }
  function renderCalc(body, win) {
    const species = Object.keys(KD.crops);
    if (!species.includes(calcSaved.species)) calcSaved.species = species[0];
    body.classList.add("kx-calc");
    const shelf = h("div", "kx-shelf"), stall = h("div", "kx-stall");
    const search = h("input", "kx-search"); search.type = "search"; search.placeholder = "Find a seed"; search.setAttribute("aria-label", "Find a seed");
    const list = h("div", "kx-packets"); shelf.append(search, list); body.append(shelf, stall);
    const packets = new Map();
    for (const sp of species) {
      const c = KD.crops[sp], b = h("button", "kx-packet"); b.type = "button"; b.style.setProperty("--rc", rarityColour(c.r)); b.title = `${c.sn} · ${c.r}`;
      b.append(spr(SPR.seed(sp), 34, EMOJI.seed), h("span", "kx-packet-n", esc(c.n))); b.onclick = () => { calcSaved.species = sp; writeJson(CALC_KEY, calcSaved); draw(); }; packets.set(sp, b); list.append(b);
    }
    search.oninput = () => { const t = search.value.trim().toLowerCase(); for (const [sp, b] of packets) b.hidden = !!t && !(`${KD.crops[sp].n} ${KD.crops[sp].sn} ${sp}`.toLowerCase().includes(t)); };
    function draw() {
      const sp = calcSaved.species, c = KD.crops[sp], s = calcState(sp);
      for (const [k, b] of packets) b.dataset.on = String(k === sp);
      packets.get(sp)?.scrollIntoView({ block: "nearest" });
      stall.replaceChildren();
      const hero = h("div", "kx-hero"); hero.style.setProperty("--rc", rarityColour(c.r));
      const stage = h("div", "kx-stage"), name = h("div", "kx-hero-n", `<h3>${esc(c.n)}</h3><span>${esc(c.r)} · ${esc(c.sn)}</span>`);
      const price = h("div", "kx-price"), weight = h("div", "kx-weight"), brk = h("div", "kx-break");
      const sizeIn = h("input", "kx-range"); sizeIn.type = "range"; sizeIn.min = CROP_MIN; sizeIn.max = CROP_MAX; sizeIn.step = 1; sizeIn.value = s.size; sizeIn.setAttribute("aria-label", "Size");
      const sizeLbl = h("b", "kx-size-v");
      const sizeRow = h("div", "kx-sizerow", `<span>Size</span>`); sizeRow.append(sizeIn, sizeLbl);
      const jack = h("div", "kx-jack");
      let spriteKey = "";
      function refresh() {
        const muts = calcMuts(s).map((m) => MUT_ID[m] || m), key = `${sp}|${muts.join(",")}`;
        if (key !== spriteKey) { spriteKey = key; stage.replaceChildren(spr(SPR.crop(sp, muts), 96, EMOJI.crop, "kx-crop")); }
        stage.firstChild.style.transform = `scale(${0.55 + (s.size - CROP_MIN) / (CROP_MAX - CROP_MIN) * 0.45})`;
        const mb = mutBreakdown(calcMuts(s)), v = cropValue(sp, s.size, calcMuts(s), s.friends);
        price.innerHTML = `<i>🪙</i><b>${fmtCoins(v)}</b>`; price.title = `${fmtShort(v)} coins`;
        const w = cropWeight(sp, s.size); weight.textContent = w ? `${(Math.round(w * 1000) / 1000).toString()} kg at ${s.size}% size` : `${s.size}% size`;
        sizeLbl.textContent = `${s.size}%`;
        brk.innerHTML = `<span>${fmtCoins(c.p)} base</span><span>×${sizeMult(sp, s.size).toFixed(2)} size</span><span>×${mb.color} colour</span><span>×${mb.wt} sky</span><span>×${friendMult(s.friends).toFixed(1)} friends</span>`;
        const top = Math.round(c.p * sizeMult(sp, CROP_MAX) * 50 * 16 * friendMult(s.friends));
        jack.innerHTML = `<span>Best possible, Rainbow + Thundercharged + Amberbound at full size</span><b>🪙 ${fmtShort(top)}</b>`;
      }
      hero.append(stage, h("div", "kx-hero-r")); hero.lastChild.append(name, price, weight);
      sizeIn.oninput = () => { s.size = Number(sizeIn.value); writeJson(CALC_KEY, calcSaved); refresh(); };
      const group = (title, labels, field) => {
        const g = h("div", "kx-mgroup", `<span>${title}</span>`), row = h("div", "kx-mrow");
        const chips = labels.map((l) => mutChip(l, s[field] === l, () => { s[field] = l; for (const [x, cb] of chips2) cb.dataset.on = String(x === l); writeJson(CALC_KEY, calcSaved); refresh(); }));
        const chips2 = labels.map((l, i) => [l, chips[i]]); chips.forEach((c2) => row.append(c2)); g.append(row); return g;
      };
      const friends = h("div", "kx-mgroup", `<span>Friends in the room</span>`);
      friends.append(segmented([1, 2, 3, 4, 5, 6].map((n) => ({ label: `${n}${n > 1 ? ` · +${(n - 1) * 10}%` : ""}`, value: n })), s.friends, (v) => { s.friends = v; writeJson(CALC_KEY, calcSaved); refresh(); }, "kx-seg-wrap"));
      const quick = h("div", "kx-quick"); for (const [t, v] of [["Min", CROP_MIN], ["Max", CROP_MAX]]) { const b = h("button", "", t); b.type = "button"; b.onclick = () => { s.size = v; sizeIn.value = v; writeJson(CALC_KEY, calcSaved); refresh(); }; quick.append(b); }
      sizeRow.append(quick);
      stall.append(hero, brk, sizeRow, group("Colour", CALC_COLOR, "color"), group("Weather", CALC_WEATHER, "weather"), group("Time of day", CALC_LIGHT, "light"), friends, jack);
      refresh();
    }
    draw(); win.setSub("What a crop sells for");
    return null;
  }

  // ---------- Pet Deck: active pets, native teams, collection, ability log ----------
  const ABIL_STATS = {"ProduceScaleBoost":{"n":"Crop Size Boost I","tr":"continuous","p":0.3,"bp":{"sizeIncrease":4}},"ProduceScaleBoostII":{"n":"Crop Size Boost II","tr":"continuous","p":0.4,"bp":{"sizeIncrease":7}},"ProduceScaleBoostIII":{"n":"Crop Size Boost III","tr":"continuous","p":0.5,"bp":{"sizeIncrease":9}},"SnowyCropSizeBoost":{"n":"Snow Crop Size Boost","tr":"continuous","p":0.8,"bp":{"sizeIncrease":8,"requiredWeather":"Frost"}},"DoubleHarvest":{"n":"Double Harvest","tr":"harvest","p":5},"DoubleHatch":{"n":"Double Hatch","tr":"hatchEgg","p":3},"ProduceEater":{"n":"Crop Eater","tr":"continuous","p":60,"bp":{"cropSellPriceIncreasePercentage":150}},"SellBoostI":{"n":"Sell Boost I","tr":"sellAllCrops","p":10,"bp":{"cropSellPriceIncreasePercentage":20}},"SellBoostII":{"n":"Sell Boost II","tr":"sellAllCrops","p":12,"bp":{"cropSellPriceIncreasePercentage":30}},"SellBoostIII":{"n":"Sell Boost III","tr":"sellAllCrops","p":14,"bp":{"cropSellPriceIncreasePercentage":40}},"SellBoostIV":{"n":"Sell Boost IV","tr":"sellAllCrops","p":16,"bp":{"cropSellPriceIncreasePercentage":50}},"ProduceRefund":{"n":"Crop Refund","tr":"sellAllCrops","p":20},"PlantGrowthBoost":{"n":"Plant Growth Boost I","tr":"continuous","p":24,"bp":{"plantGrowthReductionMinutes":3}},"PlantGrowthBoostII":{"n":"Plant Growth Boost II","tr":"continuous","p":27,"bp":{"plantGrowthReductionMinutes":5}},"PlantGrowthBoostIII":{"n":"Plant Growth Boost III","tr":"continuous","p":30,"bp":{"plantGrowthReductionMinutes":7}},"SnowyPlantGrowthBoost":{"n":"Snow Plant Growth Boost","tr":"continuous","p":40,"bp":{"plantGrowthReductionMinutes":6,"requiredWeather":"Frost"}},"DawnPlantGrowthBoost":{"n":"Dawn Plant Growth Boost","tr":"continuous","p":60,"bp":{"plantGrowthReductionMinutes":6,"requiredWeather":"Dawn"}},"AmberPlantGrowthBoost":{"n":"Amber Plant Growth Boost","tr":"continuous","p":80,"bp":{"plantGrowthReductionMinutes":6,"requiredWeather":"AmberMoon"}},"ProduceMutationBoost":{"n":"Weather Mutation Boost I","tr":"continuous","bp":{"mutationChanceIncreasePercentage":15}},"ProduceMutationBoostII":{"n":"Weather Mutation Boost II","tr":"continuous","bp":{"mutationChanceIncreasePercentage":20}},"ProduceMutationBoostIII":{"n":"Weather Mutation Boost III","tr":"continuous","bp":{"mutationChanceIncreasePercentage":25}},"SnowyCropMutationBoost":{"n":"Snow Boost","tr":"continuous","bp":{"mutationChanceIncreasePercentage":32,"requiredWeather":"Frost"}},"DawnBoost":{"n":"Dawn Boost","tr":"continuous","bp":{"mutationChanceIncreasePercentage":36,"requiredWeather":"Dawn"}},"AmberMoonBoost":{"n":"Amber Moon Boost","tr":"continuous","bp":{"mutationChanceIncreasePercentage":40,"requiredWeather":"AmberMoon"}},"PetMutationBoost":{"n":"Pet Mutation Boost I","tr":"hatchEgg","bp":{"mutationChanceIncreasePercentage":7}},"PetMutationBoostII":{"n":"Pet Mutation Boost II","tr":"hatchEgg","bp":{"mutationChanceIncreasePercentage":10}},"PetMutationBoostIII":{"n":"Pet Mutation Boost III","tr":"hatchEgg","bp":{"mutationChanceIncreasePercentage":13}},"GoldGranter":{"n":"Gold Granter","tr":"continuous","p":0.72,"bp":{"grantedMutations":["Gold"]}},"RainbowGranter":{"n":"Rainbow Granter","tr":"continuous","p":0.72,"bp":{"grantedMutations":["Rainbow"]}},"RainDance":{"n":"Rain Dance","tr":"continuous","p":10,"bp":{"grantedMutations":["Wet"]}},"EggGrowthBoost":{"n":"Egg Growth Boost I","tr":"continuous","p":21,"bp":{"eggGrowthTimeReductionMinutes":7}},"EggGrowthBoostII_NEW":{"n":"Egg Growth Boost II","tr":"continuous","p":24,"bp":{"eggGrowthTimeReductionMinutes":9}},"EggGrowthBoostII":{"n":"Egg Growth Boost III","tr":"continuous","p":27,"bp":{"eggGrowthTimeReductionMinutes":11}},"SnowyEggGrowthBoost":{"n":"Snowy Egg Growth Boost","tr":"continuous","p":35,"bp":{"eggGrowthTimeReductionMinutes":10,"requiredWeather":"Frost"}},"PetAgeBoost":{"n":"Hatch XP Boost I","tr":"hatchEgg","p":50,"bp":{"bonusXp":8000}},"PetAgeBoostII":{"n":"Hatch XP Boost II","tr":"hatchEgg","p":60,"bp":{"bonusXp":12000}},"PetAgeBoostIII":{"n":"Hatch XP Boost III","tr":"hatchEgg","p":70,"bp":{"bonusXp":16000}},"PetHatchSizeBoost":{"n":"Max Strength Boost I","tr":"hatchEgg","p":12,"bp":{"maxStrengthIncreasePercentage":2.4}},"PetHatchSizeBoostII":{"n":"Max Strength Boost II","tr":"hatchEgg","p":14,"bp":{"maxStrengthIncreasePercentage":3.5}},"PetHatchSizeBoostIII":{"n":"Max Strength Boost III","tr":"hatchEgg","p":16,"bp":{"maxStrengthIncreasePercentage":4.6}},"PetXpBoost":{"n":"XP Boost I","tr":"continuous","p":30,"bp":{"bonusXp":300}},"PetXpBoostII":{"n":"XP Boost II","tr":"continuous","p":35,"bp":{"bonusXp":400}},"PetXpBoostIII":{"n":"XP Boost III","tr":"continuous","p":40,"bp":{"bonusXp":500}},"SnowyPetXpBoost":{"n":"Snow XP Boost","tr":"continuous","p":50,"bp":{"bonusXp":450,"requiredWeather":"Frost"}},"HungerRestore":{"n":"Hunger Restore I","tr":"continuous","p":12,"bp":{"hungerRestorePercentage":30}},"HungerRestoreII":{"n":"Hunger Restore II","tr":"continuous","p":14,"bp":{"hungerRestorePercentage":35}},"HungerRestoreIII":{"n":"Hunger Restore III","tr":"continuous","p":16,"bp":{"hungerRestorePercentage":40}},"SnowyHungerRestore":{"n":"Snowy Hunger Restore","tr":"continuous","p":20,"bp":{"hungerRestorePercentage":38,"requiredWeather":"Frost"}},"HungerBoost":{"n":"Hunger Boost I","tr":"continuous","bp":{"hungerDepletionRateDecreasePercentage":12}},"HungerBoostII":{"n":"Hunger Boost II","tr":"continuous","bp":{"hungerDepletionRateDecreasePercentage":16}},"HungerBoostIII":{"n":"Hunger Boost III","tr":"continuous","bp":{"hungerDepletionRateDecreasePercentage":20}},"SnowyHungerBoost":{"n":"Snowy Hunger Boost","tr":"continuous","bp":{"hungerDepletionRateDecreasePercentage":30,"requiredWeather":"Frost"}},"PetRefund":{"n":"Pet Refund I","tr":"sellPet","p":5},"PetRefundII":{"n":"Pet Refund II","tr":"sellPet","p":7},"Copycat":{"n":"Copycat","tr":"continuous","p":1},"CoinFinderI":{"n":"Coin Finder I","tr":"continuous","p":35,"bp":{"baseMaxCoinsFindable":120000}},"CoinFinderII":{"n":"Coin Finder II","tr":"continuous","p":13,"bp":{"baseMaxCoinsFindable":1200000}},"CoinFinderIII":{"n":"Coin Finder III","tr":"continuous","p":6,"bp":{"baseMaxCoinsFindable":10000000}},"SnowyCoinFinder":{"n":"Snowy Coin Finder","tr":"continuous","p":15,"bp":{"baseMaxCoinsFindable":5000000,"requiredWeather":"Frost"}},"SeedFinderI":{"n":"Seed Finder I","tr":"continuous","p":40},"SeedFinderII":{"n":"Seed Finder II","tr":"continuous","p":20},"SeedFinderIII":{"n":"Seed Finder III","tr":"continuous","p":10},"SeedFinderIV":{"n":"Seed Finder IV","tr":"continuous","p":0.01},"MoonKisser":{"n":"Moon Kisser","tr":"continuous"},"DawnKisser":{"n":"Dawn Kisser","tr":"continuous"},"SnowGranter":{"n":"Snow Granter","tr":"continuous","p":8,"bp":{"grantedMutations":["Chilled"]}},"FrostGranter":{"n":"Frost Granter","tr":"continuous","p":6,"bp":{"grantedMutations":["Frozen"]}},"DawnlitGranter":{"n":"Dawnlit Granter","tr":"continuous","p":4,"bp":{"grantedMutations":["Dawnlit"]}},"AmberlitGranter":{"n":"Amberlit Granter","tr":"continuous","p":2,"bp":{"grantedMutations":["Ambershine"]}}};   // chance, trigger and numbers per ability (the live feed overrides these)
  const abilityName = (id) => KD.abil[id]?.n || pretty(id);
  function abilityTone(id) {
    if (/Gold|Rainbow/.test(id)) return "#ffd166"; if (/Granter|RainDance/.test(id)) return "#f59ac8"; if (/Coin|Sell/.test(id)) return "#f2c94c"; if (/Hunger/.test(id)) return "#fb923c";
    if (/Xp|Age|HatchSize/.test(id)) return "#b794f6"; if (/Egg/.test(id)) return "#7dd3fc"; if (/Growth/.test(id)) return "#a3e635"; if (/Scale/.test(id)) return "#4ade80"; if (/Seed|Refund|Double/.test(id)) return "#5eead4"; if (/Kisser|Dawn|Amber/.test(id)) return "#fca5a5"; return "#a7b8ae";
  }
  const abilityChips = (list) => (list || []).map((a) => `<span class="kx-ab" style="--t:${abilityTone(a)}" title="${esc(KD.abil[a]?.d || "")}">${esc(abilityName(a))}</span>`).join("");
  const mutBadges = (list) => (list || []).map((m) => `<span class="kx-mb" data-m="${esc(m)}">${esc(KD.mut[m]?.n || pretty(m))}</span>`).join("");
  const petUrls = (p) => SPR.pet(p.species, p.mutations);
  const sameIds = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  function hungerLeft(p) { const mins = (KD.pets[p.species]?.hd || 60) * (p.hungerPct / 100); return mins >= 90 ? `${Math.round(mins / 60 * 10) / 10}h` : `${Math.max(0, Math.round(mins))}m`; }
  function petCard(p, o = {}) {
    const info = KD.pets[p.species], card = h("div", `kx-pc${o.small ? " sm" : ""}`); card.style.setProperty("--rc", rarityColour(info?.r));
    const frame = h("div", "kx-pc-f"); frame.append(spr(petUrls(p), o.small ? 54 : 72, EMOJI.pet));
    const sr = p.maxStrength ? Math.round((p.strength / p.maxStrength) * 100) : 0;
    const title = `${esc(p.name || info?.n || p.species)}${p.name ? `<small>${esc(info?.n || p.species)}</small>` : ""}`;
    const meta = h("div", "kx-pc-m", `<div class="kx-pc-t">${title}</div><div class="kx-str"><span style="width:${sr}%"></span><b>${p.strength}<i>/${p.maxStrength}</i></b></div>`);
    card.append(frame, meta);
    if (!o.small) {
      const hungry = p.hungerPct < 25;
      meta.insertAdjacentHTML("beforeend", `<div class="kx-bars"><label>Hunger<div class="kx-bar" data-w="${hungry ? 1 : 0}"><i style="width:${p.hungerPct}%"></i></div><em>${Math.round(p.hungerPct)}% · about ${hungerLeft(p)}</em></label><label>Growth<div class="kx-bar xp"><i style="width:${Math.min(100, (p.xp / p.matureXp) * 100)}%"></i></div><em>${Math.min(100, Math.round((p.xp / p.matureXp) * 100))}%</em></label></div><div class="kx-abs">${abilityChips(p.abilities)}${mutBadges(p.mutations)}</div><div class="kx-pc-v">Sells for 🪙 ${fmtShort(p.value)}</div>`);
    } else card.title = `${p.name || info?.n || p.species} · ${p.where}`;
    return card;
  }
  function teamMembers(team, byId) { return (Array.isArray(team?.members) ? team.members : []).map((m) => String(m?.petId || "")).filter(Boolean).map((id) => byId.get(id) || { id, missing: true }); }
  function petsActive(body, win) {
    const box = h("div", "kx-pcs"); body.append(box); win.setSub("The pets working in your garden");
    async function update() {
      const me = await readMine(); const sig = JSON.stringify((me?.active || []).map((p) => [p.id, Math.round(p.hungerPct), p.strength, Math.round(p.xp / 60)])); if (sig === box.dataset.sig) return; box.dataset.sig = sig;
      box.replaceChildren(); if (!me) { box.append(empty("🌿", "Waiting for the game", "Your pets appear once the garden has loaded.")); return; }
      if (!me.active.length) { box.append(empty("🐾", "No pets out", "Place a pet in your garden and it shows up here.")); return; }
      const total = me.active.reduce((a, p) => a + p.strength, 0); win.setSub(`${me.active.length} out · ${total} strength together`);
      for (const p of me.active) box.append(petCard(p));
    }
    update(); return { update };
  }
  function petsTeams(body, win) {
    const saveRow = h("div", "kx-saverow"), nameIn = h("input", "kx-search"); nameIn.maxLength = 16; nameIn.placeholder = "Name this lineup"; nameIn.setAttribute("aria-label", "Team name");
    const saveBtn = h("button", "kx-btn", "Save pets that are out"); saveBtn.type = "button"; saveRow.append(nameIn, saveBtn);
    const list = h("div", "kx-teams"); body.append(saveRow, list); win.setSub("Teams are stored by the game, so they follow you");
    let me = null;
    saveBtn.onclick = () => {
      const ids = (me?.active || []).map((p) => p.id).filter(Boolean).slice(0, 3); const name = nameIn.value.trim() || `Team ${(me?.teams?.length || 0) + 1}`;
      if (!ids.length) { toast("Nothing to save", "Put a pet out first.", { emoji: "🐾" }); return; }
      if (!sendGame({ type: "SavePetTeam", teamId: randomId(), isCreate: true, name, petIds: ids })) { toast("Could not reach the game", "Reload the page and try again.", { emoji: "⚠️", kind: "warn" }); return; }
      nameIn.value = ""; toast("Team saved", name, { emoji: "💾" });
    };
    async function update() {
      me = await readMine(); if (!me) return;
      const byId = new Map(me.pets.map((p) => [p.id, p])), active = me.active.map((p) => p.id);
      const sig = JSON.stringify([me.teams.map((t) => [t.id, t.name, (t.members || []).map((m) => m.petId)]), active]); if (sig === list.dataset.sig) return; list.dataset.sig = sig; list.replaceChildren();
      saveBtn.disabled = !active.length;
      if (!me.teams.length) { list.append(empty("📋", "No teams yet", "Save the pets that are out and swap back to them in one click.")); return; }
      for (const t of me.teams) {
        const members = teamMembers(t, byId), ids = members.map((m) => m.id), isOn = sameIds(ids, active) && ids.length > 0;
        const row = h("div", "kx-team"); row.dataset.on = String(isOn);
        const faces = h("div", "kx-faces"); for (const m of members) faces.append(m.missing ? h("span", "kx-face-x", "?") : spr(petUrls(m), 44, EMOJI.pet, "kx-face"));
        const total = members.reduce((a, m) => a + (m.strength || 0), 0);
        const info = h("div", "kx-team-i", `<b>${esc(t.name || "Team")}</b><span>${members.length} pet${members.length === 1 ? "" : "s"} · ${total} strength${isOn ? " · out now" : ""}</span>`);
        const use = h("button", "kx-btn", isOn ? "Out now" : "Send out"); use.type = "button"; use.disabled = isOn;
        use.onclick = () => { if (sendGame({ type: "ApplyPetTeam", teamId: t.id })) toast("Switching team", t.name || "Team", { emoji: "🔄" }); else toast("Could not reach the game", "Reload the page and try again.", { emoji: "⚠️", kind: "warn" }); };
        const del = h("button", "kx-btn ghost", "Delete"); del.type = "button"; let armed = false;
        del.onclick = () => { if (!armed) { armed = true; del.textContent = "Sure?"; setTimeout(() => { armed = false; del.textContent = "Delete"; }, 2500); return; } sendGame({ type: "DeletePetTeam", teamId: t.id }); };
        row.append(faces, info, use, del); list.append(row);
      }
    }
    update(); return { update };
  }
  function petsCollection(body, win) {
    const bar = h("div", "kx-filters"), search = h("input", "kx-search"); search.type = "search"; search.placeholder = "Find a pet"; search.setAttribute("aria-label", "Find a pet");
    let sort = "strength", where = "all";
    const sortSeg = segmented([{ label: "Strongest", value: "strength" }, { label: "Worth most", value: "value" }, { label: "Hungriest", value: "hunger" }], sort, (v) => { sort = v; paint(); });
    const whereSeg = segmented([{ label: "All", value: "all" }, { label: "Out", value: "Active" }, { label: "Backpack", value: "Backpack" }, { label: "Hutch", value: "Hutch" }], where, (v) => { where = v; paint(); });
    bar.append(search, sortSeg, whereSeg); const grid = h("div", "kx-grid"); body.append(bar, grid); let all = [];
    function paint() {
      const t = search.value.trim().toLowerCase(); const rows = all.filter((p) => (where === "all" || p.where === where) && (!t || `${p.name} ${KD.pets[p.species]?.n || p.species}`.toLowerCase().includes(t)));
      rows.sort((a, b) => (sort === "value" ? b.value - a.value : sort === "hunger" ? a.hungerPct - b.hungerPct : b.strength - a.strength || b.value - a.value));
      grid.replaceChildren(); win.setSub(`${rows.length} of ${all.length} pets`);
      if (!rows.length) { grid.append(empty("🔍", "No pets match", "Try another filter.")); return; }
      for (const p of rows) { const c = petCard(p, { small: true }); c.append(h("div", "kx-pc-w", esc(p.where))); grid.append(c); }
    }
    search.oninput = paint;
    async function update() { const me = await readMine(); if (!me) return; const sig = JSON.stringify(me.pets.map((p) => [p.id, p.strength, p.where, Math.round(p.hungerPct / 5)])); if (sig === grid.dataset.sig) return; grid.dataset.sig = sig; all = me.pets; paint(); }
    update(); return { update };
  }
  function petsLog(body, win) {
    const chips = h("div", "kx-logchips"), list = h("div", "kx-log"); body.append(chips, list); win.setSub("Recent ability activity the game remembers");
    async function update() {
      const me = await readMine(); const logs = (Array.isArray(me?.data?.activityLogs) ? me.data.activityLogs : []).filter((e) => KD.abil[e?.action] && e?.parameters?.pet);
      const sig = logs.length + ":" + (logs[logs.length - 1]?.timestamp || 0); if (sig === list.dataset.sig) return; list.dataset.sig = sig; list.replaceChildren(); chips.replaceChildren();
      if (!logs.length) { list.append(empty("📜", "Nothing logged yet", "Abilities show up here as your pets use them.")); return; }
      const counts = new Map(); for (const e of logs) counts.set(e.action, (counts.get(e.action) || 0) + 1);
      for (const [a, n] of [...counts].sort((x, y) => y[1] - x[1]).slice(0, 8)) chips.insertAdjacentHTML("beforeend", `<span class="kx-ab" style="--t:${abilityTone(a)}">${esc(abilityName(a))} <b>${n}</b></span>`);
      for (const e of logs.slice(-80).reverse()) {
        const pet = normPet(e.parameters.pet, ""), prm = e.parameters, row = h("div", "kx-logrow");
        let text = KD.abil[e.action]?.d || ""; const gs = prm.growSlot?.species; if (gs) text = `Crop: ${KD.crops[gs]?.n || pretty(gs)}`; else if (prm.coinsFound != null) text = `Found ${fmtCoins(prm.coinsFound)} coins`; else if (prm.bonusCoins != null) text = `+${fmtCoins(prm.bonusCoins)} coins`;
        row.append(pet ? spr(petUrls(pet), 34, EMOJI.pet) : h("span"), h("div", "", `<b>${esc(abilityName(e.action))}</b><span>${esc(pet?.name || KD.pets[pet?.species]?.n || "")} · ${esc(text)}</span>`), h("time", "", new Date(Number(e.timestamp)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))); list.append(row);
      }
    }
    update(); return { update };
  }

  // ---------- Suggested teams: the best three pets you own for a goal ----------
  const TEAM_GOALS = [
    { id: "size", name: "Bigger crops", emoji: "📏", abil: ["ProduceScaleBoostIII", "ProduceScaleBoostII", "ProduceScaleBoost"] },
    { id: "growth", name: "Faster plants", emoji: "🌱", abil: ["PlantGrowthBoostIII", "PlantGrowthBoostII", "PlantGrowthBoost"] },
    { id: "egg", name: "Faster eggs", emoji: "🥚", abil: ["EggGrowthBoostII", "EggGrowthBoostII_NEW", "EggGrowthBoost"] },
    { id: "xp", name: "Pet XP", emoji: "⭐", abil: ["PetXpBoostIII", "PetXpBoostII", "PetXpBoost", "PetAgeBoostIII", "PetAgeBoostII", "PetAgeBoost"] },
    { id: "hatch", name: "Stronger hatches", emoji: "💪", abil: ["PetHatchSizeBoostIII", "PetHatchSizeBoostII", "PetHatchSizeBoost"] },
    { id: "coins", name: "More coins", emoji: "🪙", abil: ["CoinFinderIII", "CoinFinderII", "CoinFinderI", "SellBoostIV", "SellBoostIII", "SellBoostII", "SellBoostI"] },
    { id: "gold", name: "Gold and Rainbow", emoji: "🌈", abil: ["RainbowGranter", "GoldGranter"], wants: true },
    { id: "wx", name: "Weather mutations", emoji: "🌦️", abil: ["RainDance", "FrostGranter", "SnowGranter", "DawnlitGranter", "AmberlitGranter", "ProduceMutationBoostIII", "ProduceMutationBoostII", "ProduceMutationBoost"] },
    { id: "seed", name: "Seeds and doubles", emoji: "🌾", abil: ["SeedFinderIV", "SeedFinderIII", "SeedFinderII", "SeedFinderI", "DoubleHarvest", "DoubleHatch"] },
    { id: "dawn", name: "Dawn boost", emoji: "🌅", abil: ["DawnlitGranter", "DawnBoost", "DawnKisser"] },
    { id: "amber", name: "Amber boost", emoji: "🌙", abil: ["AmberlitGranter", "AmberMoonBoost", "MoonKisser"] },
    { id: "snow", name: "Snow boost", emoji: "❄️", abil: ["SnowyCropSizeBoost", "SnowyCropMutationBoost", "FrostGranter", "SnowGranter", "SnowyPlantGrowthBoost", "SnowyEggGrowthBoost", "SnowyPetXpBoost", "SnowyCoinFinder"] },
    { id: "rain", name: "Rain Dance", emoji: "🌧️", abil: ["RainDance"] },
    { id: "sell", name: "Crop sell price", emoji: "💰", abil: ["SellBoostIV", "SellBoostIII", "SellBoostII", "SellBoostI", "ProduceRefund"] },
    { id: "finder", name: "Coin finders", emoji: "🪙", abil: ["CoinFinderIII", "CoinFinderII", "CoinFinderI", "SnowyCoinFinder"] },
    { id: "dharvest", name: "Double harvest", emoji: "🧺", abil: ["DoubleHarvest"] },
    { id: "dhatch", name: "Double hatch", emoji: "🐣", abil: ["DoubleHatch"] },
    { id: "hatchxp", name: "Hatch XP", emoji: "🍼", abil: ["PetAgeBoostIII", "PetAgeBoostII", "PetAgeBoost"] },
    { id: "petmut", name: "Pet mutations", emoji: "🧬", abil: ["PetMutationBoostIII", "PetMutationBoostII", "PetMutationBoost"] },
    { id: "seedf", name: "Seed finders", emoji: "🌰", abil: ["SeedFinderIV", "SeedFinderIII", "SeedFinderII", "SeedFinderI"] },
    { id: "hunger", name: "Never hungry", emoji: "🍖", abil: ["HungerRestoreIII", "HungerRestoreII", "HungerRestore", "HungerBoostIII", "HungerBoostII", "HungerBoost", "SnowyHungerRestore", "SnowyHungerBoost"] },
    { id: "skygrow", name: "Dawn/Amber grow", emoji: "🌄", abil: ["DawnPlantGrowthBoost", "AmberPlantGrowthBoost"] },
    { id: "refund", name: "Pet refunds", emoji: "♻️", abil: ["PetRefundII", "PetRefund", "Copycat"] }
  ];
  const SUSTAIN = ["HungerRestoreIII", "HungerRestoreII", "HungerRestore", "SnowyHungerRestore", "HungerBoostIII", "HungerBoostII", "HungerBoost", "SnowyHungerBoost"];
  function goalScore(pet, goal) {
    let best = 0; for (const a of pet.abilities) { const i = goal.abil.indexOf(a); if (i >= 0) best = Math.max(best, (goal.abil.length - i) * 10 + 5); }
    if (!best) return 0; return best * (0.5 + pet.strength / Math.max(1, pet.maxStrength || 100) * 0.5) + pet.strength / 10;
  }
  function suggestTeam(pets, goal) {
    const unwanted = (p) => !goal.wants && p.abilities.some((a) => /GoldGranter|RainbowGranter/.test(a));
    const ranked = pets.map((p) => ({ p, sc: goalScore(p, goal) })).filter((x) => x.sc > 0 && !unwanted(x.p)).sort((a, b) => b.sc - a.sc);
    if (!ranked.length) return null;
    const team = []; const species = new Set();
    for (const x of ranked) { if (team.length >= 3) break; team.push(x.p); species.add(x.p.id); }
    const sustainScore = (p) => p.abilities.some((a) => SUSTAIN.includes(a)) ? 1 : 0;
    if (!team.some(sustainScore)) { const feeder = pets.filter((p) => sustainScore(p) && !species.has(p.id) && !unwanted(p)).sort((a, b) => b.strength - a.strength)[0]; if (feeder) { if (team.length >= 3) team[team.length - 1] = feeder; else team.push(feeder); } }
    for (const p of pets.slice().sort((a, b) => b.strength - a.strength)) { if (team.length >= 3) break; if (!team.some((t) => t.id === p.id) && !unwanted(p)) team.push(p); }
    return team.slice(0, 3);
  }
  // ---------- Team Builder: the best three pets you own for a goal, with the numbers behind each team ----------
  // Same maths as Arie's Team Builder (chance per minute, what one proc gives, how long the team lasts without feeding),
  // laid out as a different card: goal badge, pets with strength bars, one stat panel you can flip through, and a footer with the buttons.
  const STAT_SCALED = new Set(["scaleIncreasePercentage", "cropSellPriceIncreasePercentage", "mutationChanceIncreasePercentage", "hungerRestorePercentage", "hungerRefundPercentage", "hungerDepletionRateDecreasePercentage", "plantGrowthReductionMinutes", "eggGrowthTimeReductionMinutes", "baseMaxCoinsFindable", "bonusXp", "maxStrengthIncreasePercentage", "plantAbilityChanceBoostPercentage"]);
  const STAT_LABEL = { sizeIncrease: ["Crop size", ""], scaleIncreasePercentage: ["Crop size", "%"], cropSellPriceIncreasePercentage: ["Sell price", "%"], mutationChanceIncreasePercentage: ["Mutation chance", "%"], hungerRestorePercentage: ["Hunger restore", "%"], hungerRefundPercentage: ["Hunger refund", "%"], hungerDepletionRateDecreasePercentage: ["Hunger drain", "%"], plantGrowthReductionMinutes: ["Plant growth", "min"], eggGrowthTimeReductionMinutes: ["Egg growth", "min"], baseMaxCoinsFindable: ["Coins (max)", ""], bonusXp: ["Bonus XP", ""], maxStrengthIncreasePercentage: ["Max STR", "%"], plantAbilityChanceBoostPercentage: ["Plant ability", "%"] };
  const TRIG_UNIT = { continuous: "/min", harvest: "/harvest", sellAllCrops: "/sale", sellPet: "/pet sold", hatchEgg: "/hatch", playerActivated: "/use", weather: "/weather" };
  const TIER_RX = /\s*(?:_NEW)?(?:IV|I{1,3})$/, ID_TIER_RX = /(?:_NEW)?(?:IV|I{1,3})$/;
  const stripTier = (t) => String(t).replace(TIER_RX, "").trim() || String(t);
  function abilInfo(id) { const k = KD.abil[id] || {}, s = ABIL_STATS[id] || {}; return { n: k.n || s.n || pretty(id), tr: k.tr ?? s.tr ?? null, p: k.p ?? s.p ?? null, bp: k.bp ?? s.bp ?? {} }; }
  function abilityAt(id, ratio) {
    const a = abilInfo(id); if (a.tr == null && a.p == null && !Object.keys(a.bp).length) return null;
    const r = ratio > 0 ? ratio : 0, params = {};
    for (const [k, v] of Object.entries(a.bp)) { if (typeof v !== "number" || !Number.isFinite(v) || k === "cooldownSeconds") continue; params[k] = STAT_SCALED.has(k) ? v * r : v; }
    return { id, name: a.n, tr: a.tr, prob: a.p == null ? null : Math.min(100, a.p * r), params, weather: typeof a.bp.requiredWeather === "string" && a.bp.requiredWeather ? a.bp.requiredWeather : null };
  }
  function effKey(s) {
    const bp = abilInfo(s.id).bp; if (Array.isArray(bp.grantedMutations) && bp.grantedMutations.length) return `mutation:${bp.grantedMutations.slice().sort().join(",")}`;
    const keys = Object.keys(s.params).sort(); return keys.length ? `param:${keys.join("+")}@${s.tr ?? "?"}` : `id:${s.id.replace(ID_TIER_RX, "")}`;
  }
  const combineProb = (list) => (list.length ? (1 - list.reduce((miss, p) => miss * (1 - p / 100), 1)) * 100 : null);
  const restoreRate = (pct) => { const pm = pct / 100; if (pm <= 0) return 0; if (pm >= 1) return 60; return (1 - Math.pow(1 - pm, 1 / 60)) * 60; };
  function teamAutonomy(pets) {
    let drain = 0; const restores = [];
    for (const p of pets) for (const id of p.abilities) {
      const s = abilityAt(id, p.strength / 100); if (!s || s.weather) continue;
      for (const k of ["hungerRefundPercentage", "hungerDepletionRateDecreasePercentage"]) if (typeof s.params[k] === "number") drain += s.params[k];
      const amt = s.params.hungerRestorePercentage; if (typeof amt === "number" && s.prob != null) restores.push({ amt, per: restoreRate(s.prob) });
    }
    const remaining = Math.max(0, 1 - drain / 100); if (remaining <= 0) return { status: "sustained" };
    let worst = null;
    for (const p of pets) {
      const info = KD.pets[p.species], maxH = info?.hc, dep = info?.hd; if (!(maxH > 0 && dep > 0)) return { status: "unknown" };
      const drainPM = (maxH / dep) * remaining; let restPM = 0;
      for (const r of restores) { const cap = Math.floor((maxH * r.amt) / 100); restPM += (r.per / pets.length) * (cap > 0 ? (cap + 1) / 2 : 0); }
      const net = restPM - drainPM; if (net >= 0) continue; const mins = maxH / -net; if (worst === null || mins < worst) worst = mins;
    }
    return worst === null ? { status: "sustained" } : { status: "runs-out", mins: worst };
  }
  function teamStats(pets) {
    const groups = new Map();
    for (const p of pets) for (const id of p.abilities) {
      const s = abilityAt(id, p.strength / 100); if (!s) continue; const m = abilityAt(id, p.maxStrength / 100), key = effKey(s);
      let g = groups.get(key); if (!g) { g = { key, label: stripTier(abilInfo(id).n), tr: s.tr, who: [], weathers: [] }; groups.set(key, g); }
      g.who.push({ prob: s.prob, max: m?.prob ?? null, params: s.params }); if (s.weather && !g.weathers.includes(s.weather)) g.weathers.push(s.weather);
    }
    const list = [...groups.values()].map((g) => { g.prob = combineProb(g.who.map((w) => w.prob).filter((x) => x != null)); g.maxProb = combineProb(g.who.map((w) => w.max).filter((x) => x != null)); return g; });
    return { groups: list, feed: teamAutonomy(pets) };
  }
  const fmtPct = (v) => (v >= 10 ? `${v.toFixed(1)}%` : v >= 1 ? `${v.toFixed(2)}%` : `${v.toFixed(3)}%`);
  const fmtAmt = (v, unit) => { const t = v.toLocaleString("en-US", { minimumFractionDigits: Math.abs(v) >= 10 ? 0 : 1, maximumFractionDigits: Math.abs(v) >= 10 ? 0 : 1 }); return unit ? (unit === "%" ? `${t}%` : `${t} ${unit}`) : t; };
  const fmtLasts = (mins) => { const t = Math.max(0, Math.round(mins)), hh = Math.floor(t / 60), mm = t % 60; return hh > 0 ? `${hh}h${String(mm).padStart(2, "0")}` : `${mm}m`; };
  const primaryKey = (g) => { for (const w of g.who) for (const k of Object.keys(w.params)) if (STAT_LABEL[k]) return k; return null; };
  function statPanel(g, nav) {
    const box = h("div", "kt-stat"), key = primaryKey(g), weather = g.weathers.length ? ` · ${g.weathers.join("/")}` : "";
    const head = h("div", "kt-stat-h"); head.append(h("span", "kt-stat-n", esc(`${key ? STAT_LABEL[key][0] : g.label}${weather}`)));
    if (weather) head.title = "Only fires while this weather is active.";
    if (nav) { const n = h("span", "kt-nav"); const arrow = (glyph, d, label) => { const b = h("button", "", glyph); b.type = "button"; b.title = label; b.setAttribute("aria-label", label); b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); nav.step(d); }; return b; }; n.append(arrow("‹", -1, "Previous effect"), h("em", "", `${nav.i + 1}/${nav.n}`), arrow("›", 1, "Next effect")); head.append(n); }
    box.append(head);
    const val = h("div", "kt-stat-v");
    if (g.prob == null) { const on = h("span", "kt-on", "always on"); on.title = "This ability has no proc chance: it applies continuously."; val.append(on); box.append(val); }
    else {
      const top = g.maxProb ?? g.prob, ratio = top > 0 ? Math.min(1, g.prob / top) : 1, tone = ratio >= 0.9 ? "#86efac" : ratio >= 0.75 ? "#fcd34d" : "#fca5a5";
      const big = h("b", "kt-big", fmtPct(g.prob)); big.style.color = tone; val.append(big, h("span", "kt-unit", TRIG_UNIT[g.tr] || "/roll"));
      if (ratio < 0.995) val.append(h("span", "kt-max", `max ${fmtPct(top)}`));
      val.title = `Chance that at least one of ${g.who.length} pet(s) procs. It is 1 minus the chance every pet misses, not a sum.`;
      const bar = h("div", "kt-bar"), fill = h("i"); fill.style.width = `${Math.max(2, ratio * 100)}%`; fill.style.background = tone; bar.append(fill); box.append(val, bar);
    }
    if (key) {
      const vals = g.who.map((w) => w.params[key]).filter((v) => typeof v === "number" && v !== 0);
      if (vals.length) { const lo = fmtAmt(Math.min(...vals), STAT_LABEL[key][1]), hi = fmtAmt(Math.max(...vals), STAT_LABEL[key][1]); box.append(h("div", "kt-proc", `<span>per proc</span><b>${esc(lo === hi ? hi : `${lo} – ${hi}`)}</b>`)); }
    }
    return box;
  }
  function statCarousel(groups) {
    const host = h("div", "kt-car"); if (!groups.length) return host; let i = 0;
    const paint = () => host.replaceChildren(statPanel(groups[i], groups.length > 1 ? { i, n: groups.length, step: (d) => { i = (i + d + groups.length) % groups.length; paint(); } } : null)); paint(); return host;
  }
  function feedRow(feed) {
    const row = h("div", "kt-feed"); let text = "unknown", tone = "#9fc0ae";
    if (feed.status === "sustained") { text = "indefinitely"; tone = "#86efac"; } else if (feed.status === "runs-out") { text = `~${fmtLasts(feed.mins)}`; tone = feed.mins < 60 ? "#fcd34d" : "#86efac"; }
    row.title = "Starting from full. Restore figures are averages, so a bad run of luck can still empty a pet.";
    row.append(h("span", "", "Lasts without feeding")); const v = h("b", "", text); v.style.color = tone; row.append(v); return row;
  }
  function builderCard(team, goal, isOn, act) {
    const card = h("article", "kt-card"); card.dataset.on = String(isOn);
    const covered = [...new Set(team.flatMap((p) => p.abilities.filter((a) => goal.abil.includes(a))))], tones = covered.map(abilityTone);
    const strip = h("i", "kt-strip"); strip.style.background = tones.length > 1 ? `linear-gradient(180deg,${tones.join(",")})` : tones[0] || "var(--ac)";
    const afk = covered.length > 0 && covered.every((a) => { const s = abilityAt(a, 1); return s && s.tr === "continuous" && !s.weather; });
    const head = h("div", "kt-head", `<span class="kt-emoji">${goal.emoji}</span><div class="kt-title"><b>${esc(goal.name)}</b><small>${esc(covered.map((a) => abilInfo(a).n).join(", ") || "Your strongest pets")}</small></div>`);
    if (afk) { const p = h("span", "kt-afk", "AFK"); p.title = "Every ability this team is built on works while you are away."; head.append(p); }
    const pets = h("div", "kt-pets");
    for (const p of team) {
      const row = h("div", "kt-pet"), full = p.maxStrength > 0 && p.strength >= p.maxStrength, pct = p.maxStrength ? Math.round((p.strength / p.maxStrength) * 100) : 0;
      const info = h("div", "kt-pet-i", `<b>${esc(p.name || KD.pets[p.species]?.n || p.species)}</b>`), dots = h("span", "kt-dots");
      for (const a of p.abilities) { const d = h("i"); d.style.background = abilityTone(a); d.title = abilInfo(a).n; dots.append(d); }
      info.append(dots);
      const str = h("div", "kt-str"); str.dataset.max = String(full); str.title = "Strength (current/max)"; str.append(h("b", "", `${p.strength}/${p.maxStrength}`)); const bar = h("span"); bar.style.width = `${pct}%`; str.append(bar);
      row.append(spr(petUrls(p), 34, EMOJI.pet, "kt-face"), info, str); pets.append(row);
    }
    const stats = teamStats(team), focusKeys = new Set(covered.map((a) => { const s = abilityAt(a, 1); return s ? effKey(s) : null; }).filter(Boolean));
    const focus = stats.groups.filter((g) => focusKeys.has(g.key)), panel = statCarousel(focus.length ? focus : stats.groups);
    const foot = h("div", "kt-foot"), go = h("button", "kx-btn", isOn ? "Out now" : "Send out"); go.type = "button"; go.disabled = isOn; go.onclick = () => act(team, goal, true);
    const sv = h("button", "kx-btn ghost", "Save"); sv.type = "button"; sv.title = "Save as a team in the Teams tab"; sv.onclick = () => act(team, goal, false); foot.append(go, sv);
    card.append(strip, head, pets, panel, feedRow(stats.feed), foot); return card;
  }
  function petsSuggest(body, win) {
    const bar = h("div", "kt-bar-top"), note = h("span", "kx-muted", "Built from every pet you own, best first. Send a team out or save it for later."), refresh = h("button", "kx-btn ghost", "Refresh"); refresh.type = "button"; bar.append(note, refresh);
    const list = h("div", "kt-grid"); body.append(bar, list); win.setSub("Best three pets for what you want to do");
    let me = null;
    const give = (team, goal, sendOut) => {
      const ids = team.map((p) => p.id), name = goal.name.slice(0, 16), existing = (me?.teams || []).find((t) => t.name === name), id = existing?.id || randomId();
      if (!sendGame({ type: "SavePetTeam", teamId: id, isCreate: !existing, name, petIds: ids })) { toast("Could not reach the game", "Reload the page and try again.", { emoji: "⚠️", kind: "warn" }); return; }
      if (!sendOut) { toast("Team saved", name, { emoji: "💾" }); return; }
      setTimeout(() => { sendGame({ type: "ApplyPetTeam", teamId: id }); toast("Switching team", name, { emoji: "🔄" }); }, 900);
    };
    async function update(force) {
      me = await readMine(); if (!me) return;
      const sig = JSON.stringify([me.pets.map((p) => [p.id, p.strength, p.abilities.join()]), me.active.map((p) => p.id), liveLoaded]); if (!force && sig === list.dataset.sig) return; list.dataset.sig = sig; list.replaceChildren();
      if (!me.pets.length) { list.append(empty("🐾", "No pets yet", "Hatch a few and suggestions appear here.")); return; }
      let shown = 0;
      for (const goal of TEAM_GOALS) {
        const team = suggestTeam(me.pets, goal); if (!team) continue; shown++;
        try { list.append(builderCard(team, goal, sameIds(team.map((p) => p.id), me.active.map((p) => p.id)), give)); } catch (error) { console.warn("[King's Mod] team builder", error); shown--; }
      }
      if (!shown) list.append(empty("🔍", "No matches yet", "None of your pets have abilities for these goals."));
    }
    refresh.onclick = () => { win.setSub("Looking at your pets…"); update(true).then(() => win.setSub("Best three pets for what you want to do")); };
    update(); return { update: () => update(false) };
  }

  createWin({ id: "pets", title: "Pet Deck", icon: "deck", accent: ["#f4978a", "#f7c59f"], w: 600, h: 600, every: 1500, tabs: [{ id: "active", label: "Out now", render: petsActive }, { id: "teams", label: "Teams", render: petsTeams }, { id: "best", label: "Team Builder", render: petsSuggest }, { id: "all", label: "Collection", render: petsCollection }, { id: "log", label: "Ability log", render: petsLog }] });

  // ---------- Room: same layout and behaviour as Arie's Room menu ----------
  // Players on the left. On the right: a hero card (avatar, Visit garden, inventory and garden value), "Look inside"
  // buttons that open the GAME'S OWN Inventory / Journal / Stats / Activity log windows showing that player's data,
  // and a "More" card. The game windows are fed by lending the game the player's data only while that window is open.
  const arr = (v) => (Array.isArray(v) ? v : []);
  function roomPlayers(state) {
    const direct = state?.fullState?.data?.players ?? state?.data?.players ?? state?.players; let players = Array.isArray(direct) ? direct : [];
    if (!players.length && state && typeof state === "object") { const seen = new Set(), stack = [state]; while (stack.length && !players.length) { const cur = stack.pop(); if (!cur || typeof cur !== "object" || seen.has(cur)) continue; seen.add(cur); for (const k of Object.keys(cur)) { const v = cur[k]; if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object") && v.some((p) => "id" in p && "name" in p) && /player/i.test(k)) { players = v; break; } if (v && typeof v === "object") stack.push(v); } } }
    return players;
  }
  function roomSlots(state) {
    const raw = state?.child?.data?.userSlots ?? state?.fullState?.child?.data?.userSlots ?? state?.data?.userSlots;
    if (Array.isArray(raw)) return raw; if (raw && typeof raw === "object") return Object.entries(raw).sort((a, b) => (Number(a[0]) - Number(b[0])) || a[0].localeCompare(b[0])).map(([, v]) => v); return [];
  }
  const slotOwner = (slot) => { const r = slot?.userId ?? slot?.playerId ?? slot?.id; return r != null ? String(r) : ""; };
  async function roomList() {
    const state = await readRoomState(); if (!state) return { players: [], slots: [], state: null, cols: 81 };
    const players = roomPlayers(state), slots = roomSlots(state), byId = new Map(players.map((p) => [String(p.id), p])), ordered = [], seen = new Set();
    for (const s of slots) { const id = slotOwner(s); const p = byId.get(id); if (p && !seen.has(id)) { ordered.push({ ...p, slot: s }); seen.add(id); } }
    for (const p of players) if (!seen.has(String(p.id))) ordered.push({ ...p, slot: null });
    const map = await atomValue("mapAtom"), spawns = arr(map?.spawnTiles).filter(Number.isFinite).sort((a, b) => a - b);
    ordered.forEach((p, i) => { p.tile = spawns[i] ?? null; }); return { players: ordered, slots, state, cols: Number(map?.cols) > 0 ? Number(map.cols) : 81 };
  }
  const peopleNow = async (fallback) => { const n = Math.floor(Number(await atomValue("numPlayersAtom"))); return Number.isFinite(n) && n > 0 ? clamp(n, 1, 6) : clamp(fallback || 1, 1, 6); };
  function gardenWorth(slot, people) { let sum = 0; for (const t of Object.values(slot?.data?.garden?.tileObjects || {})) { if (t?.objectType !== "plant") continue; for (const s of arr(t.slots)) { const sz = readCropSize({ ...s, species: s?.species || t.species }); if (sz != null) sum += cropValue(s?.species || t.species, sz, s?.mutations, people); } } return sum; }
  function invWorth(slot, people) { let sum = 0; for (const it of arr(slot?.data?.inventory?.items)) { if (it?.itemType !== "Produce") continue; const sz = readCropSize(it); if (sz != null) sum += cropValue(it.species, sz, it.mutations, people); } return sum; }
  function fmtPrice(n) {
    if (!Number.isFinite(n)) return "—"; const a = Math.abs(n);
    for (const [v, s] of [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]]) if (a >= v) return `${(n / v).toFixed(2).replace(/\.?0+$/, "")}${s}`;
    return String(Math.round(n));
  }
  function avatar(p, big) {
    const a = h("span", `kx-av${big ? " big" : ""}`); if (p.discordAvatarUrl) a.style.backgroundImage = `url(${p.discordAvatarUrl})`; else a.textContent = (p.name || "?").charAt(0).toUpperCase();
    a.append(h("i", p.isConnected ? "on" : "")); a.title = p.isConnected ? "Online" : "Offline"; return a;
  }
  function visitGarden(p, cols) {
    if (p.tile == null) { toast("Teleport", "No garden position for this player.", { emoji: "📍", kind: "warn" }); return; }
    const x = p.tile % cols, y = Math.floor(p.tile / cols);
    (async () => {
      try { const s = await getStore(), a = findAtom("positionAtom"); if (s && a) await s.set(a, { x, y }); } catch {}
      const sent = sendGame({ type: "Teleport", position: { x, y } });
      if (sent) toast("Teleport", `Teleported to ${p.name || "their"} garden`, { emoji: "🚪" }); else toast("Teleport", "Could not reach the game. Reload the page and try again.", { emoji: "⚠️", kind: "warn" });
    })();
  }

  // ----- the game's own windows (the same trick Arie's mod uses) -----
  const FAKE = new Map();
  const modalName = (v) => (v && typeof v === "object" && "modal" in v ? (v.modal ?? null) : typeof v === "string" ? v : null);
  const modalAtom = () => findAtom("activeModalStateAtom") || findAtom("activeModalAtom");
  const atomsNamed = (label) => { const out = [], cache = PW.jotaiAtomCache?.cache; if (!cache?.values) return out; for (const a of cache.values()) if (a?.debugLabel === label || a?.label === label) out.push(a); return out; };
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  async function modalNow() { const s = await getStore(), a = modalAtom(); return s && a ? modalName(await readAtom(s, a)) : null; }
  async function setModal(next) {
    const s = await getStore(), a = modalAtom(); if (!s || !a) throw new Error("The game's windows are not ready yet.");
    const raw = await readAtom(s, a); if (modalName(raw) === next) return;
    const stateShape = raw && typeof raw === "object" && "modal" in raw;
    await s.set(a, stateShape ? { modal: next, openId: (Number.isFinite(raw.openId) ? raw.openId : 0) + 1 } : next);
  }
  async function setInventoryFlag(on) { const s = await getStore(), a = findAtom("inventoryModalIsActiveAtom"); if (s && a) { try { await s.set(a, on); } catch {} } }
  // Wraps the game's reader for one data atom. While "on" and the matching window is open it returns the lent data;
  // the moment that window closes it hands back the player's real data.
  function fakeFor(key, label, merge, windowOk) {
    let st = FAKE.get(key); if (st) return st;
    const atoms = atomsNamed(label); if (!atoms.length) return null;
    st = { on: false, payload: null, atoms: [] }; const gate = modalAtom();
    for (const a of atoms) {
      const orig = a.read; if (typeof orig !== "function") continue;
      a.read = function (get, ...rest) {
        let open = true; try { if (gate) open = windowOk(modalName(get(gate))); } catch {}
        const real = orig.call(this, get, ...rest);
        if (!st.on || st.payload == null || !open) return real;
        return real && typeof real.then === "function" ? real.then((r) => merge(r, st.payload)) : merge(real, st.payload);
      };
      st.atoms.push(a);
    }
    if (!st.atoms.length) return null; FAKE.set(key, st); return st;
  }
  const FAKE_SPECS = [
    ["data", "myDataAtom", (real, p) => ({ ...(real && typeof real === "object" ? real : {}), ...(p && typeof p === "object" ? p : {}) }), (m) => m === "inventory" || m === "journal" || m === "activityLog"],
    ["inv", "myInventoryAtom", (_real, fake) => fake, (m) => m === "inventory"]
  ];
  function installFakes() { return FAKE_SPECS.map(([k, l, m, w]) => fakeFor(k, l, m, w)); }
  function fakesOff() { for (const st of FAKE.values()) { st.on = false; st.payload = null; } }
  async function showInGame(kind, payload) {
    const [dataFake, invFake] = installFakes(); if (!dataFake) throw new Error("This game version does not expose its data yet.");
    const field = { inventory: "inventory", journal: "journal", stats: "stats", log: "activityLogs" }[kind];
    if (invFake) { invFake.on = kind === "inventory"; invFake.payload = kind === "inventory" ? payload : null; }
    dataFake.payload = { [field]: payload }; dataFake.on = true;
    const s = await getStore(); for (const a of [...dataFake.atoms, ...(invFake?.atoms || [])]) { try { s.get(a); } catch {} }
    const target = kind === "inventory" ? "inventory" : kind === "journal" ? "journal" : "activityLog";
    if (target === "activityLog") { const t = findAtom("activityLogTabAtom"); if (t) { try { await s.set(t, kind === "stats" ? "stats" : "logs"); } catch {} } }
    const cur = await modalNow(); if (cur && cur !== target) { await setModal(null); await setInventoryFlag(false); await nextFrame(); }
    await setModal(target); await setInventoryFlag(target === "inventory");
    return target;
  }
  async function waitModalClosed(id, ms = 120000) { const t0 = performance.now(); while (performance.now() - t0 < ms) { if ((await modalNow()) !== id) return true; await new Promise((r) => setTimeout(r, 120)); } return false; }
  const journalPayload = (slot) => {
    const j = slot?.data?.journal ?? slot?.journal; if (!j || typeof j !== "object") return null; const out = {};
    if (j.produce && typeof j.produce === "object") out.produce = Object.fromEntries(Object.entries(j.produce).map(([k, v]) => [String(k), { variantsLogged: arr(v?.variantsLogged) }]));
    if (j.pets && typeof j.pets === "object") out.pets = Object.fromEntries(Object.entries(j.pets).map(([k, v]) => [String(k), { variantsLogged: arr(v?.variantsLogged), abilitiesLogged: arr(v?.abilitiesLogged) }]));
    const any = (o, f) => !!o && Object.values(o).some(f);
    return any(out.produce, (s) => s.variantsLogged.length) || any(out.pets, (s) => s.variantsLogged.length || s.abilitiesLogged.length) ? out : null;
  };
  const INSPECT = {
    inventory: { title: "Inventory", noun: "inventory", get: (slot) => { const inv = slot?.data?.inventory; if (!inv || typeof inv !== "object") return { err: "No inventory object found for this player." }; const items = arr(inv.items); if (!items.length) return { err: "Inventory is empty for this player.", info: true }; return { payload: { items, favoritedItemIds: arr(inv.favoritedItemIds) } }; } },
    journal: { title: "Journal", noun: "journal", get: (slot) => { const j = journalPayload(slot); return j ? { payload: j } : { err: "No journal data for this player." }; } },
    stats: { title: "Stats", noun: "stats", get: (slot) => { const st = slot?.data?.stats ?? slot?.stats; return st && typeof st === "object" ? { payload: st } : { err: "No stats found for this player." }; } },
    log: { title: "Activity log", noun: "activity log", get: (slot) => { const l = slot?.data?.activityLogs ?? slot?.activityLogs; return Array.isArray(l) && l.length ? { payload: l } : { err: "No activity logs for this player.", info: true }; } }
  };
  async function inspectPlayer(win, playerId, kind) {
    const spec = INSPECT[kind]; let who = "", fresh = null;
    try { const list = await roomList(); fresh = list.players.find((x) => String(x.id) === String(playerId)) || null; who = fresh?.name || ""; } catch {}
    if (!fresh) { toast(spec.title, "This player is not in the room any more.", { emoji: "👥", kind: "warn" }); return; }
    const got = spec.get(fresh.slot); if (got.err) { toast(spec.title, got.err, { emoji: got.info ? "ℹ️" : "⚠️", kind: got.info ? "info" : "warn" }); return; }
    const root = win.root; root.style.display = "none";
    try {
      const target = await showInGame(kind, got.payload);
      if (who) toast(spec.title, `${who}'s ${spec.noun} displayed.`, { emoji: "🔎", ms: 2800 });
      if ((await modalNow()) === target) await waitModalClosed(target);
    } catch (error) { console.warn("[King's Mod] room", error); toast(spec.title, String(error?.message || "Could not open it."), { emoji: "⚠️", kind: "warn" }); }
    finally { fakesOff(); if (win.isOpen()) root.style.display = "flex"; }
  }
  async function saveGarden(playerId) {
    let p = null; try { p = (await roomList()).players.find((x) => String(x.id) === String(playerId)) || null; } catch {}
    const name = p?.name || playerId, fn = PW.qwsEditorSaveGardenForPlayer || window.qwsEditorSaveGardenForPlayer;
    if (typeof fn === "function") { try { const saved = await fn(playerId, `${name}'s garden`); if (saved) toast("Save garden", `Saved "${saved.name}".`, { emoji: "💾" }); else toast("Save garden", "Save failed (no garden state).", { emoji: "⚠️", kind: "warn" }); } catch (error) { toast("Save garden", String(error?.message || "Save failed."), { emoji: "⚠️", kind: "warn" }); } return; }
    const garden = p?.slot?.data?.garden; if (!garden) { toast("Save garden", "No garden data for this player.", { emoji: "⚠️", kind: "warn" }); return; }
    try {
      const blob = new Blob([JSON.stringify({ player: name, savedAt: new Date().toISOString(), garden }, null, 1)], { type: "application/json" }), url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = `${String(name).replace(/[^\w-]+/g, "_")}-garden.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast("Save garden", `Downloaded ${name}'s garden.`, { emoji: "💾" });
    } catch (error) { toast("Save garden", String(error?.message || "Save failed."), { emoji: "⚠️", kind: "warn" }); }
  }
  const RIC = {
    teleport: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    garden: '<polygon points="12 3 20 15 4 15"/><polygon points="12 9 21 21 3 21"/><rect x="10" y="21" width="4" height="3" rx="1"/>',
    inventory: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/>',
    journal: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    stats: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    log: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13"/><polyline points="7 3 7 8 15 8"/>',
    follow: '<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>'
  };
  const ricon = (name) => { const s = h("span", "kr-ic"); s.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${RIC[name] || ""}</svg>`; return s; };
  function rbtn(label, icon, onClick, o = {}) {
    const b = h("button", `kx-btn kr-btn${o.primary ? " primary" : ""}${o.off ? " off" : ""}`); b.type = "button"; if (icon) b.append(ricon(icon)); b.append(document.createTextNode(label));
    if (o.tip) b.title = o.tip; let busy = false;
    b.onclick = async () => { if (busy) return; busy = true; b.disabled = true; try { await onClick(); } catch (error) { console.warn("[King's Mod] room", error); } finally { busy = false; b.disabled = false; } }; return b;
  }
  function rcard(title, sub) { const c = h("section", "kr-card"); if (title) c.append(h("div", "kr-card-h", `<h4>${esc(title)}</h4>${sub ? `<span>${esc(sub)}</span>` : ""}`)); return c; }
  function rrow(title, sub, controls) { const r = h("div", "kr-row"), t = h("div", "kr-row-t", `<b>${esc(title)}</b><span>${esc(sub)}</span>`), c = h("div", "kr-row-c"); c.append(...[].concat(controls)); r.append(t, c); return r; }
  const NO_POSITION = "Temporarily unavailable: the game no longer exposes player positions.";
  function renderRoom(body, win) {
    const wrap = h("div", "kr-split"), side = h("div", "kr-side"), main = h("div", "kr-main"); wrap.append(side, main); body.append(wrap);
    try { installFakes(); } catch {}   // set up early so the game has already read through them by the time a window is opened
    let data = { players: [], cols: 81 }, picked = null, lastSig = "", showSeq = 0;
    function showPlayer() {
      const p = data.players.find((x) => String(x.id) === picked), seq = ++showSeq; main.replaceChildren();
      if (!p) { main.append(empty("👥", data.players.length ? "No player selected" : "Nobody here yet", data.players.length ? "Pick someone in the list." : "Players show up here as they join the room.")); return; }
      try {
        const hero = rcard(), top = h("div", "kr-hero-top"), who = h("div", "kr-who");
        who.append(h("div", "kr-name", esc(p.name || p.id)), h("span", `kr-pill${p.isConnected ? " ok" : ""}`, p.isConnected ? "Online" : "Offline"));
        top.append(avatar(p, true), who, rbtn("Visit garden", "garden", () => visitGarden(p, data.cols), { primary: true }));
        const tile = (label) => { const t = h("div"), amount = h("b"); amount.textContent = "…"; t.append(h("span", "", esc(label)), amount); return { t, amount }; };
        const invTile = tile("Inventory value"), gardTile = tile("Garden value"), vals = h("div", "kx-vals"); vals.append(invTile.t, gardTile.t);
        hero.append(top, vals);
        (async () => {
          try {
            let n = clamp(data.players.length || 1, 1, 6); try { n = await peopleNow(n); } catch {}
            if (seq !== showSeq) return; const put = (t, fn) => { let text = "—"; try { text = fmtPrice(Math.round(fn())); } catch {} t.amount.textContent = text; };
            put(invTile, () => invWorth(p.slot, n)); put(gardTile, () => gardenWorth(p.slot, n));
          } catch (error) { console.warn("[King's Mod] room", error); }
        })();
        const look = rcard("Look inside", "Opens in the game's own window."), grid = h("div", "kr-inspect");
        for (const [label, icon, kind] of [["Inventory", "inventory", "inventory"], ["Journal", "journal", "journal"], ["Stats", "stats", "stats"], ["Activity log", "log", "log"]]) grid.append(rbtn(label, icon, () => inspectPlayer(win, p.id, kind)));
        look.append(grid);
        const more = rcard("More"), hasEditor = typeof (PW.qwsEditorSaveGardenForPlayer || window.qwsEditorSaveGardenForPlayer) === "function";
        const travel = [rbtn("To player", "teleport", () => toast("Unavailable", NO_POSITION, { emoji: "ℹ️" }), { off: true, tip: NO_POSITION }), rbtn("Follow", "follow", () => toast("Unavailable", NO_POSITION, { emoji: "ℹ️" }), { off: true, tip: NO_POSITION })];
        more.append(rrow("Save garden", hasEditor ? "Keeps a copy in the Editor." : "Downloads a copy as a file.", rbtn("Save", "save", () => saveGarden(p.id))), rrow("Go to player", "Paused while the game hides where players are.", travel));
        main.append(hero, look, more);
      } catch (error) { console.error("[King's Mod] room", error); main.replaceChildren(empty("⚠️", "Could not open this player", String(error?.message || error))); }
    }
    function drawSide() {
      side.replaceChildren(); side.append(h("div", "kr-side-h", `<span>Players</span><em class="kr-count">${data.players.length}</em>`));
      const list = h("div", "kr-list"); side.append(list);
      if (!data.players.length) { list.append(h("div", "kx-muted", "No one yet.")); return; }
      for (const p of data.players) { const b = h("button", "kx-gb"); b.type = "button"; b.dataset.on = String(String(p.id) === picked); b.title = p.name || String(p.id); b.append(avatar(p), h("span", "", `<b>${esc(p.name || p.id)}</b><small>${p.isConnected ? "Online" : "Offline"}</small>`)); b.onclick = () => { picked = String(p.id); drawSide(); showPlayer(); }; list.append(b); }
    }
    async function update() {
      try { data = await roomList(); } catch (error) { console.warn("[King's Mod] room", error); return; }
      const sig = data.players.map((p) => `${p.id}|${p.name}|${p.isConnected ? 1 : 0}`).join(";"); win.setSub(`${data.players.length} player${data.players.length === 1 ? "" : "s"} in this room`);
      if (sig === lastSig && main.childElementCount) return; lastSig = sig;
      if (!picked || !data.players.some((p) => String(p.id) === picked)) picked = data.players[0] ? String(data.players[0].id) : null; drawSide(); showPlayer();
    }
    update(); return { update };
  }
  createWin({ id: "room", title: "Room", icon: "room", accent: ["#7cc4f0", "#a8e6cf"], w: 620, h: 600, every: 3000, tabs: [{ id: "guests", label: "Players", render: renderRoom }] });

  // ---------- Alerts: shop restocks, weather and hungry pets ----------
    const AL = Object.assign({ enabled: true, sound: "chime", volume: 0.6, toasts: true, repeat: false, every: 20, follow: {}, weather: {}, hunger: { on: true, pct: 25, muted: {} } }, readJson(ALERT_KEY) || {});
  AL.hunger = Object.assign({ on: true, pct: 25, muted: {} }, AL.hunger || {});
  const saveAL = () => writeJson(ALERT_KEY, AL);
  saveAL();
  const SOUNDS = { chime: "Chime", bell: "Bell", harp: "Harp", pulse: "Pulse", off: "Silent" };
  const WEATHER_ALERTS = [{ id: "Rain", name: "Rain", emoji: "🌧️", mut: "Wet" }, { id: "Frost", name: "Snow", emoji: "❄️", mut: "Frozen" }, { id: "Thunderstorm", name: "Thunderstorm", emoji: "⛈️", mut: "Thunderstruck" }, { id: "Dawn", name: "Dawn", emoji: "🌅", mut: "Dawnlit" }, { id: "AmberMoon", name: "Amber Moon", emoji: "🌙", mut: "Amberlit" }];
  let audioCtx = null;
  document.addEventListener("pointerdown", () => { try { if (!audioCtx) audioCtx = new (PW.AudioContext || PW.webkitAudioContext || window.AudioContext)(); audioCtx.state === "suspended" && audioCtx.resume(); } catch {} }, true);
  function playSound(kind = AL.sound) {
    if (kind === "off" || !audioCtx) return; const vol = clamp(AL.volume, 0, 1) * 0.35, t0 = audioCtx.currentTime;
    const tone = (f, at, dur, type = "sine", g = 1) => { const o = audioCtx.createOscillator(), gn = audioCtx.createGain(); o.type = type; o.frequency.value = f; gn.gain.setValueAtTime(0.0001, t0 + at); gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * g), t0 + at + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur); o.connect(gn).connect(audioCtx.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.05); };
    if (kind === "chime") { tone(880, 0, 0.5); tone(1320, 0.14, 0.7); }
    else if (kind === "bell") { tone(660, 0, 1.2, "triangle"); tone(1320, 0, 0.8, "sine", 0.4); tone(1980, 0, 0.5, "sine", 0.2); }
    else if (kind === "harp") [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.6, "triangle"));
    else { for (let i = 0; i < 3; i++) tone(740, i * 0.16, 0.1, "square", 0.5); }
  }
  const alertLog = []; const live = new Map();   // live: alert id -> { last }
  function fire(id, title, detail, o = {}) {
    alertLog.unshift({ at: Date.now(), title, detail, emoji: o.emoji }); alertLog.length = Math.min(alertLog.length, 30);
    if (AL.toasts) toast(title, detail, { urls: o.urls, emoji: o.emoji, kind: "alert", ms: 9000 }); playSound();
  }
  function shopItems(game, me) {
    const out = new Map(), shops = game?.shops; if (!shops || typeof shops !== "object") return out;
    const kinds = { Seed: ["species", "Seed"], Egg: ["eggId", "Egg"], Tool: ["toolId", "Tool"], Decor: ["decorId", "Decor"] };
    for (const [shopKey, shop] of Object.entries(shops)) {
      if (!shop || !Array.isArray(shop.inventory)) continue; const sp = me?.shopPurchases?.[shopKey], valid = sp && (!("restockId" in sp) || sp.restockId === shop.restockId);
      for (const it of shop.inventory) { const k = kinds[it?.itemType]; if (!k || it[k[0]] == null) continue; const id = `${k[1]}:${it[k[0]]}`, left = Math.max(0, Number(it.initialStock) - (Number(valid ? sp.purchases?.[it[k[0]]] : 0) || 0)); out.set(id, { left: (out.get(id)?.left || 0) + left, restock: shop.restockId || "" }); }
    }
    return out;
  }
  function shopMeta(id) {
    const [type, key] = id.split(":");
    if (type === "Seed") { const c = KD.crops[key]; return { name: c?.sn || pretty(key), r: c?.r, urls: SPR.seed(key), emoji: EMOJI.seed }; }
    if (type === "Egg") { const c = KD.eggs[key]; return { name: c?.n || pretty(key), r: c?.r, urls: SPR.egg(key), emoji: EMOJI.egg }; }
    if (type === "Tool") { const c = KD.tools[key]; return { name: c?.n || pretty(key), r: c?.r, urls: SPR.tool(key), emoji: EMOJI.tool }; }
    const c = KD.decor[key]; return { name: c?.n || pretty(key), r: c?.r, urls: SPR.decor(key), emoji: EMOJI.decor };
  }
  const AS = { armed: 0, prevShop: new Set(), prevWeather: undefined, stock: new Map(), now: new Set(), weather: "", pets: [], busy: false };
  async function alertTick() {
    AL.enabled = readJson(ALERT_KEY)?.enabled !== false;
    if (AL.enabled === false || AS.busy) return; AS.busy = true;
    try {
      const st = await readRoomState(), game = st?.child?.data || roomGame, me = await atomValue("myDataAtom"); if (!game) return; const now = Date.now();
      const items = shopItems(game, me); AS.stock = items; const listed = new Set(); for (const [id, v] of items) if (AL.follow[id] && v.left > 0) listed.add(id);
      AS.armed++; const ready = AS.armed >= 3 && items.size > 0;
      if (ready) {
        const fresh = [...listed].filter((id) => !AS.prevShop.has(id) || (AS.restockSeen && AS.restockSeen.get(id) !== items.get(id).restock));
        if (fresh.length) { const m = shopMeta(fresh[0]); fire(`shop:${fresh[0]}`, fresh.length === 1 ? `${m.name} is in stock` : `${fresh.length} watched items are in stock`, fresh.length === 1 ? `${items.get(fresh[0]).left} available now` : fresh.map((id) => shopMeta(id).name).slice(0, 4).join(", "), { urls: m.urls, emoji: m.emoji }); for (const id of fresh) live.set(`shop:${id}`, { last: now }); }
        else if (AL.repeat) for (const id of listed) { const l = live.get(`shop:${id}`) || { last: now }; live.set(`shop:${id}`, l); if (now - l.last >= AL.every * 1000) { l.last = now; playSound(); } }
        for (const key of [...live.keys()]) if (key.startsWith("shop:") && !listed.has(key.slice(5))) live.delete(key);
      }
      AS.prevShop = listed; AS.restockSeen = new Map([...items].map(([id, v]) => [id, v.restock])); AS.now = listed;
      const wx = typeof game.weather === "string" ? game.weather : ""; AS.weather = wx;
      if (AS.prevWeather !== undefined && wx !== AS.prevWeather && wx && AL.weather[wx]) { const w = WEATHER_ALERTS.find((x) => x.id === wx); fire(`weather:${wx}`, `${w?.name || wx} has started`, "Time to line up your pets.", { urls: SPR.mut(w?.mut || "Wet"), emoji: w?.emoji }); }
      AS.prevWeather = wx;
      if (AL.hunger.on) {
        const mine = await readMine(); AS.pets = mine?.active || [];
        for (const p of AS.pets) { const key = `pet:${p.id}`, low = p.hungerPct < AL.hunger.pct && !AL.hunger.muted[p.id]; const l = live.get(key);
          if (low && !l) { live.set(key, { last: now }); fire(key, `${p.name || KD.pets[p.species]?.n || p.species} is getting hungry`, `${Math.round(p.hungerPct)}% left, about ${hungerLeft(p)}`, { urls: petUrls(p), emoji: EMOJI.pet }); }
          else if (low && AL.repeat && now - l.last >= AL.every * 1000) { l.last = now; playSound(); }
          else if (!low && l) live.delete(key); }
      }
    } catch (error) { console.warn("[King's Mod] alerts", error); } finally { AS.busy = false; }
  }
  let alertTimer = null;
  const startAlerts = () => { if (!alertTimer) alertTimer = setInterval(alertTick, 1500); };

  function toggleRow(label, hint, on, onChange) {
    const row = h("label", "kx-trow", `<span><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ""}</span>`); const i = h("input"); i.type = "checkbox"; i.checked = !!on; i.onchange = () => onChange(i.checked); row.append(i); return row;
  }
  function alertsShops(body, win) {
    const bar = h("div", "kx-filters"), search = h("input", "kx-search"); search.type = "search"; search.placeholder = "Find an item to watch"; search.setAttribute("aria-label", "Find an item");
    let kind = "Seed"; const seg = segmented([{ label: "Seeds", value: "Seed" }, { label: "Eggs", value: "Egg" }, { label: "Tools", value: "Tool" }, { label: "Decor", value: "Decor" }], kind, (v) => { kind = v; paint(); });
    const grid = h("div", "kx-watch"); bar.append(search, seg); body.append(bar, grid);
    const catalogs = { Seed: Object.keys(KD.crops), Egg: Object.keys(KD.eggs), Tool: Object.keys(KD.tools), Decor: Object.keys(KD.decor) };
    function paint() {
      const t = search.value.trim().toLowerCase(); grid.replaceChildren(); let n = 0;
      for (const key of catalogs[kind]) {
        const id = `${kind}:${key}`, m = shopMeta(id); if (t && !m.name.toLowerCase().includes(t)) continue; n++;
        const b = h("button", "kx-wt"); b.type = "button"; b.dataset.id = id; b.dataset.on = String(!!AL.follow[id]); b.style.setProperty("--rc", rarityColour(m.r));
        b.append(spr(m.urls, 40, m.emoji), h("b", "", esc(m.name)), h("i", "kx-wt-bell", "🔔"), h("em", "kx-wt-st", ""));
        b.onclick = () => { AL.follow[id] = !AL.follow[id]; if (!AL.follow[id]) delete AL.follow[id]; b.dataset.on = String(!!AL.follow[id]); saveAL(); };
        grid.append(b);
      }
      if (!n) grid.append(empty("🔍", "Nothing matches", "Try another name."));
      update();
    }
    function update() { let followed = Object.keys(AL.follow).length; for (const b of grid.querySelectorAll(".kx-wt")) { const v = AS.stock.get(b.dataset.id); b.dataset.stock = String(!!(v && v.left > 0)); b.querySelector(".kx-wt-st").textContent = v && v.left > 0 ? `${v.left} in shop` : ""; } win.setSub(`${followed} item${followed === 1 ? "" : "s"} watched`); }
    search.oninput = paint; paint(); return { update };
  }
  function alertsWeather(body, win) {
    const wrap = h("div", "kx-wx"); body.append(wrap); win.setSub("Hear about it the moment it starts");
    for (const w of WEATHER_ALERTS) {
      const b = h("button", "kx-wxt"); b.type = "button"; b.dataset.id = w.id; b.dataset.on = String(!!AL.weather[w.id]); b.append(spr(SPR.mut(w.mut), 44, w.emoji), h("b", "", esc(w.name)), h("em", "", "Watching"), h("small", "", "")); b.onclick = () => { AL.weather[w.id] = !AL.weather[w.id]; b.dataset.on = String(!!AL.weather[w.id]); saveAL(); }; wrap.append(b);
    }
    function update() { for (const b of wrap.children) { const here = AS.weather === b.dataset.id; b.dataset.now = String(here); b.querySelector("small").textContent = here ? "Happening now" : ""; } }
    update(); return { update };
  }
  function alertsPets(body, win) {
    const top = h("div", "kx-setcard"); const list = h("div", "kx-hl"); body.append(top, list); win.setSub("A nudge before your pets run empty");
    top.append(toggleRow("Warn me when a pet is hungry", "Checks the pets that are out", AL.hunger.on, (v) => { AL.hunger.on = v; saveAL(); }));
    const rng = h("div", "kx-trow"), r = h("input", "kx-range"), val = h("b"); r.type = "range"; r.min = 5; r.max = 90; r.step = 5; r.value = AL.hunger.pct; val.textContent = `${AL.hunger.pct}%`;
    r.oninput = () => { AL.hunger.pct = Number(r.value); val.textContent = `${r.value}%`; saveAL(); }; rng.append(h("span", "", "<b>Warn below</b>"), r, val); top.append(rng);
    function update() {
      list.replaceChildren(); if (!AS.pets.length) { list.append(empty("🐾", "No pets out", "Hunger shows here once pets are in your garden.")); return; }
      for (const p of AS.pets) { const row = h("label", "kx-hrow"); const cb = h("input"); cb.type = "checkbox"; cb.checked = !AL.hunger.muted[p.id]; cb.onchange = () => { if (cb.checked) delete AL.hunger.muted[p.id]; else AL.hunger.muted[p.id] = true; saveAL(); };
        row.append(spr(petUrls(p), 38, EMOJI.pet), h("div", "", `<b>${esc(p.name || KD.pets[p.species]?.n || p.species)}</b><div class="kx-bar" data-w="${p.hungerPct < AL.hunger.pct ? 1 : 0}"><i style="width:${p.hungerPct}%"></i></div>`), h("em", "", `${Math.round(p.hungerPct)}%`), cb); list.append(row); }
    }
    update(); return { update };
  }
  function alertsSound(body, win) {
    win.setSub("How alerts reach you"); const card = h("div", "kx-setcard");
    card.append(toggleRow("Alerts on", "Master switch, also the light on the dock button", AL.enabled !== false, (v) => { AL.enabled = v; saveAL(); }), toggleRow("Pop-up messages", "Small cards at the top of the screen", AL.toasts, (v) => { AL.toasts = v; saveAL(); }), toggleRow("Keep reminding me", "Repeat the sound while an alert is still true", AL.repeat, (v) => { AL.repeat = v; saveAL(); }));
    const snd = h("div", "kx-trow", `<span><b>Sound</b></span>`); snd.append(segmented(Object.entries(SOUNDS).map(([value, label]) => ({ value, label })), AL.sound, (v) => { AL.sound = v; saveAL(); playSound(v); }, "kx-seg-wrap"));
    const vol = h("div", "kx-trow"), vr = h("input", "kx-range"), vv = h("b"); vr.type = "range"; vr.min = 0; vr.max = 100; vr.value = Math.round(AL.volume * 100); vv.textContent = `${vr.value}%`; vr.oninput = () => { AL.volume = Number(vr.value) / 100; vv.textContent = `${vr.value}%`; saveAL(); }; vr.onchange = () => playSound(); vol.append(h("span", "", "<b>Volume</b>"), vr, vv);
    const rep = h("div", "kx-trow"), ri = h("input", "kx-range"), rv = h("b"); ri.type = "range"; ri.min = 5; ri.max = 120; ri.step = 5; ri.value = AL.every; rv.textContent = `${AL.every}s`; ri.oninput = () => { AL.every = Number(ri.value); rv.textContent = `${ri.value}s`; saveAL(); }; rep.append(h("span", "", "<b>Remind every</b>"), ri, rv);
    const test = h("button", "kx-btn", "Send a test alert"); test.type = "button"; test.onclick = () => fire("test", "This is a test alert", "Sound and pop-up look like this.", { emoji: "🔔" });
    card.append(snd, vol, rep, test); body.append(card);
    const hist = h("div", "kx-hist"); body.append(hist);
    function update() { hist.replaceChildren(h("h4", "", "Recent alerts")); if (!alertLog.length) { hist.append(h("p", "kx-muted", "Nothing has gone off yet.")); return; } for (const a of alertLog.slice(0, 8)) hist.append(h("div", "kx-hrow2", `<span>${a.emoji || "🔔"}</span><b>${esc(a.title)}</b><time>${new Date(a.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>`)); }
    update(); return { update };
  }
  createWin({ id: "calc", title: "Crop Calculator", icon: "calc", accent: ["#f0c35a", "#f6e3a1"], w: 640, h: 600, tabs: [{ id: "c", label: "Crops", render: renderCalc }] });
  createWin({ id: "alerts", title: "Alerts", icon: "bell", accent: ["#f6a04a", "#ffd59a"], w: 560, h: 580, every: 1000, tabs: [{ id: "shops", label: "Shop", render: alertsShops }, { id: "weather", label: "Weather", render: alertsWeather }, { id: "pets", label: "Pets", render: alertsPets }, { id: "sound", label: "Sound", render: alertsSound }] });

  const CSS2 = `
.kx-win{--ac:#f0c35a;--ac2:#f6e3a1;position:fixed;z-index:2147483630;display:none;flex-direction:column;min-width:300px;min-height:220px;overflow:hidden;border-radius:20px 20px 16px 16px;color:#e9f2ec;font:600 12.5px "Trebuchet MS",system-ui,sans-serif;background:radial-gradient(130% 40% at 15% 0%,color-mix(in srgb,var(--ac) 16%,transparent),transparent 70%),linear-gradient(170deg,#112619,#08140d);border:1px solid color-mix(in srgb,var(--ac) 38%,transparent);box-shadow:0 20px 56px rgba(0,0,0,.65)}
.kx-win *{box-sizing:border-box}
.kx-top{flex:none;display:flex;align-items:center;gap:10px;padding:10px 12px 8px;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
.kx-mark{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:11px 11px 11px 4px;color:#10200f;background:linear-gradient(145deg,var(--ac),var(--ac2))}
.kx-mark svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.kx-ttl{flex:1;min-width:0}.kx-ttl h2{margin:0;font:700 18px Georgia,"Palatino Linotype",serif;color:var(--ac2);letter-spacing:.01em;white-space:nowrap}
.kx-sub{margin-top:1px;font-size:11px;color:#8db5a0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kx-tools{display:flex;gap:5px}.kx-x{flex:none;width:28px;height:28px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#d9e8de;font-size:16px;cursor:pointer}.kx-x:hover{color:var(--ac2);border-color:var(--ac)}
.kx-tabs{flex:none;display:flex;gap:2px;padding:0 12px;border-bottom:1px solid rgba(255,255,255,.09);overflow-x:auto;scrollbar-width:none}
.kx-tab{flex:none;padding:7px 13px 8px;margin-bottom:-1px;border:1px solid transparent;border-bottom:0;border-radius:10px 10px 0 0;background:none;color:#97b3a3;font:700 12.5px "Trebuchet MS",system-ui,sans-serif;cursor:pointer}
.kx-tab:hover{color:#fff}.kx-tab[data-on="true"]{color:var(--ac2);background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12);box-shadow:inset 0 2px 0 var(--ac)}
.kx-body{flex:1;min-height:0;overflow:auto;padding:12px;scrollbar-width:thin;scrollbar-color:#2f6a49 transparent;container-type:inline-size}
.kx-rh{position:absolute;top:56px;right:0;bottom:22px;width:7px;cursor:ew-resize;touch-action:none}.kx-rh.b{top:auto;left:0;right:22px;bottom:0;width:auto;height:7px;cursor:ns-resize}
.kx-rg{position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 50%,var(--ac) 50% 58%,transparent 58% 70%,var(--ac) 70% 78%,transparent 78%);opacity:.8}
.kx-spr{flex:none;display:inline-grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);place-items:center;width:var(--z);height:var(--z);overflow:hidden;font-size:calc(var(--z) * .68);line-height:1}.kx-spr img{width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;image-rendering:auto;display:block}
.kx-empty{display:grid;justify-items:center;gap:4px;padding:34px 12px;text-align:center;color:#8db5a0}.kx-empty-e{font-size:32px}.kx-empty b{color:#e9f2ec;font-size:13.5px}
.kx-search{width:100%;padding:8px 11px;border-radius:11px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.28);color:#fff;font:600 12.5px "Trebuchet MS",system-ui,sans-serif;outline:none}.kx-search:focus{border-color:var(--ac)}
.kx-btn{padding:7px 13px;border-radius:10px;border:1px solid var(--ac);background:linear-gradient(145deg,color-mix(in srgb,var(--ac) 30%,transparent),color-mix(in srgb,var(--ac) 12%,transparent));color:var(--ac2);font:700 12px "Trebuchet MS",system-ui,sans-serif;cursor:pointer;white-space:nowrap}.kx-btn:hover:not(:disabled){filter:brightness(1.25)}.kx-btn:disabled{opacity:.45;cursor:default}.kx-btn.ghost{border-color:rgba(255,255,255,.16);background:none;color:#a9bdb1}
.kx-seg{display:flex;gap:3px;padding:3px;border-radius:12px;background:rgba(0,0,0,.3)}.kx-seg button{flex:1;padding:5px 9px;border:0;border-radius:9px;background:none;color:#a5beb0;font:700 11.5px "Trebuchet MS",system-ui,sans-serif;cursor:pointer;white-space:nowrap}.kx-seg button[data-on="true"]{background:var(--ac);color:#11200f}.kx-seg-wrap{flex-wrap:wrap}
.kx-range{width:100%;accent-color:var(--ac)}
.kx-bar{height:7px;border-radius:9px;background:rgba(0,0,0,.4);overflow:hidden}.kx-bar i{display:block;height:100%;border-radius:9px;background:linear-gradient(90deg,#f59e0b,#fde047)}.kx-bar.xp i{background:linear-gradient(90deg,#8b5cf6,#d8b4fe)}.kx-bar[data-w="1"] i{background:linear-gradient(90deg,#ef4444,#fb923c)}
.kx-calc{display:grid;grid-template-columns:minmax(150px,210px) 1fr;gap:12px;align-items:start}
@container (max-width:470px){.kx-calc{grid-template-columns:1fr}.kx-packets{max-height:170px}}
.kx-shelf{display:grid;gap:8px;position:sticky;top:0}.kx-packets{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px;max-height:min(62vh,430px);overflow:auto;padding:2px;scrollbar-width:thin}
.kx-packet{display:grid;justify-items:center;gap:3px;padding:7px 4px 6px;border:1px solid rgba(255,255,255,.1);border-top:3px solid var(--rc);border-radius:4px 4px 12px 12px;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02));color:#dce9e0;cursor:pointer;clip-path:polygon(0 8px,18% 0,36% 8px,54% 0,72% 8px,100% 0,100% 100%,0 100%)}
.kx-packet:hover{background:rgba(255,255,255,.12)}.kx-packet[data-on="true"]{outline:2px solid var(--ac);outline-offset:-2px;background:color-mix(in srgb,var(--ac) 18%,transparent)}.kx-packet-n{font-size:10.5px;text-align:center;line-height:1.15;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kx-stall{display:grid;gap:11px;min-width:0}.kx-hero{display:flex;align-items:center;gap:14px;padding:12px;border-radius:18px;background:radial-gradient(90% 120% at 0% 50%,color-mix(in srgb,var(--rc) 22%,transparent),transparent),rgba(0,0,0,.22);border:1px solid color-mix(in srgb,var(--rc) 40%,transparent)}
.kx-stage{flex:none;display:grid;place-items:center;width:116px;height:116px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.12),transparent 70%)}.kx-crop{transform-origin:center;transition:transform .15s ease}
.kx-hero-r{min-width:0;display:grid;gap:3px}.kx-hero-n h3{margin:0;font:700 20px Georgia,serif;color:#fff}.kx-hero-n span{font-size:11px;color:#9fc0ae}
.kx-price{display:flex;align-items:center;gap:7px;font:700 30px Georgia,serif;color:var(--ac2);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.kx-price i{font-style:normal;font-size:24px}.kx-weight{font-size:11.5px;color:#9fc0ae}
.kx-break{display:flex;flex-wrap:wrap;gap:5px}.kx-break span{padding:3px 9px;border-radius:99px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);font-size:11px;color:#cfe0d5;font-variant-numeric:tabular-nums}
.kx-sizerow{display:flex;align-items:center;gap:10px;color:#b9d0c1}.kx-size-v{min-width:42px;text-align:right;color:var(--ac2)}.kx-quick{display:flex;gap:4px}.kx-quick button{padding:3px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:none;color:#cfe0d5;font:700 11px "Trebuchet MS",system-ui,sans-serif;cursor:pointer}
.kx-mgroup{display:grid;gap:5px}.kx-mgroup>span{font-size:11.5px;color:#9fc0ae}.kx-mrow{display:flex;flex-wrap:wrap;gap:5px}
.kx-mchip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 6px;border-radius:99px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#d4e4d9;font:700 11.5px "Trebuchet MS",system-ui,sans-serif;cursor:pointer}.kx-mchip small{margin-left:4px;color:var(--ac);font-size:10.5px}.kx-mchip[data-on="true"]{border-color:var(--ac);background:color-mix(in srgb,var(--ac) 20%,transparent);color:#fff}.kx-mchip-none{display:grid;place-items:center;width:20px;color:#7f9a8b}
.kx-jack{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 12px;border-radius:14px;border:1px dashed color-mix(in srgb,var(--ac) 55%,transparent);color:#b9d0c1;font-size:11.5px}.kx-jack b{color:var(--ac2);font:700 16px Georgia,serif;white-space:nowrap}
.kx-pcs,.kx-teams,.kx-log{display:grid;gap:10px}
.kx-pc{display:flex;gap:12px;padding:11px;border-radius:16px;background:linear-gradient(135deg,rgba(255,255,255,.07),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.1);border-left:4px solid var(--rc)}
.kx-pc-f{flex:none;display:grid;place-items:center;width:88px;height:96px;border-radius:14px 14px 30px 14px;background:radial-gradient(circle at 50% 35%,color-mix(in srgb,var(--rc) 35%,transparent),rgba(0,0,0,.3))}
.kx-pc-m{flex:1;min-width:0;display:grid;gap:6px;align-content:start}.kx-pc-t{font:700 15px Georgia,serif;color:#fff}.kx-pc-t small{margin-left:7px;font:600 11px "Trebuchet MS",sans-serif;color:#9fc0ae}
.kx-str{position:relative;height:18px;border-radius:9px;background:rgba(0,0,0,.4);overflow:hidden}.kx-str span{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,color-mix(in srgb,var(--rc) 70%,#000),var(--rc))}.kx-str b{position:relative;display:block;padding:0 9px;line-height:18px;font-size:11px;color:#fff;text-shadow:0 1px 2px #000}.kx-str i{font-style:normal;opacity:.7}
.kx-bars{display:grid;grid-template-columns:1fr 1fr;gap:8px}@container (max-width:430px){.kx-bars{grid-template-columns:1fr}}.kx-bars label{display:grid;gap:2px;font-size:10.5px;color:#9fc0ae}.kx-bars em{font-style:normal;color:#cfe0d5}
.kx-abs{display:flex;flex-wrap:wrap;gap:4px}.kx-ab{padding:2px 8px;border-radius:99px;font-size:10.5px;color:#10200f;background:var(--t);font-weight:700}.kx-ab b{margin-left:3px}.kx-mb{padding:2px 8px;border-radius:99px;font-size:10.5px;color:#10200f;font-weight:700;background:linear-gradient(90deg,#fde047,#f0abfc)}.kx-pc-v{font-size:11.5px;color:var(--ac2)}
.kx-pc.sm{flex-direction:column;align-items:center;text-align:center;gap:6px;padding:9px 7px;border-left-width:1px;border-top:3px solid var(--rc);position:relative}.kx-pc.sm .kx-pc-f{width:68px;height:68px}.kx-pc.sm .kx-pc-t{font-size:12px}.kx-pc.sm .kx-pc-t small{display:block;margin:0}.kx-pc.sm .kx-pc-m{width:100%}.kx-pc-w{font-size:10px;color:#8db5a0}
.kx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}.kx-filters{display:grid;gap:7px;margin-bottom:10px}
.kx-saverow{display:flex;gap:8px;margin-bottom:10px}.kx-team{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04)}.kx-team[data-on="true"]{border-color:var(--ac);background:color-mix(in srgb,var(--ac) 14%,transparent)}
.kx-faces{display:flex;gap:-6px}.kx-face{border-radius:50%;background:rgba(0,0,0,.35);padding:3px;margin-right:-10px;border:2px solid #0e2116}.kx-face-x{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,.35);color:#7f9a8b;margin-right:-10px}
.kx-team-i{flex:1;min-width:0;margin-left:14px;display:grid;gap:2px}.kx-team-i b{font:700 14px Georgia,serif;color:#fff}.kx-team-i span{font-size:11px;color:#9fc0ae}
.kx-logchips{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px}.kx-logrow{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:12px;background:rgba(255,255,255,.04)}.kx-logrow>div{flex:1;min-width:0;display:grid}.kx-logrow span{font-size:11px;color:#9fc0ae;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kx-logrow time{font-size:10.5px;color:#7f9a8b}
.kx-roomb{display:grid;grid-template-columns:minmax(120px,170px) 1fr;gap:12px;align-items:start}@container (max-width:470px){.kx-roomb{grid-template-columns:1fr}.kx-guests{flex-direction:row!important;overflow-x:auto}}
.kx-guests{display:flex;flex-direction:column;gap:5px}.kx-gb{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#dce9e0;text-align:left;cursor:pointer;min-width:0;flex:none}.kx-gb[data-on="true"]{border-color:var(--ac);background:color-mix(in srgb,var(--ac) 16%,transparent)}.kx-gb span{display:grid;min-width:0}.kx-gb b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px}.kx-gb small{color:#8db5a0}
.kx-av{position:relative;flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#254a35 center/cover;font:700 14px Georgia,serif;color:#e8f6ec}.kx-av.big{width:56px;height:56px;font-size:22px}.kx-av i{position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;border-radius:50%;background:#52605a;border:2px solid #0e2116}.kx-av i.on{background:#4ade80}
.kx-guest{display:grid;gap:10px;min-width:0}.kx-ghead{display:flex;align-items:center;gap:12px}.kx-gname{flex:1;min-width:0}.kx-gname h3{margin:0;font:700 19px Georgia,serif;color:#fff;overflow:hidden;text-overflow:ellipsis}.kx-gname span{font-size:11px;color:#9fc0ae}
.kx-vals{display:grid;grid-template-columns:1fr 1fr;gap:8px}.kx-vals div{display:grid;gap:2px;padding:9px 12px;border-radius:14px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08)}.kx-vals span{font-size:11px;color:#9fc0ae}.kx-vals b{font:700 18px Georgia,serif;color:var(--ac2)}
.kx-it{display:grid;justify-items:center;gap:2px;padding:8px 4px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);text-align:center}.kx-it b{font-size:10.5px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kx-it span{font-size:10.5px;color:#9fc0ae}
.kx-jr h4,.kx-hist h4{margin:12px 0 6px;font:700 14px Georgia,serif;color:var(--ac2)}.kx-stats{display:grid;gap:4px}.kx-stats div{display:flex;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:10px;background:rgba(255,255,255,.04)}.kx-stats span{color:#b9d0c1}.kx-stats b{color:var(--ac2);font-variant-numeric:tabular-nums}
.kx-watch{display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:8px}.kx-wt{position:relative;display:grid;justify-items:center;gap:3px;padding:10px 6px 8px;border-radius:14px;border:1px solid rgba(255,255,255,.1);border-bottom:3px solid var(--rc);background:rgba(255,255,255,.04);color:#dce9e0;cursor:pointer}.kx-wt b{font-size:10.5px;text-align:center;line-height:1.15}.kx-wt-bell{position:absolute;top:5px;right:6px;font-style:normal;font-size:13px;filter:grayscale(1);opacity:.35}.kx-wt[data-on="true"]{background:color-mix(in srgb,var(--ac) 18%,transparent);border-color:var(--ac)}.kx-wt[data-on="true"] .kx-wt-bell{filter:none;opacity:1}.kx-wt-st{font-style:normal;font-size:10px;color:#4ade80;min-height:12px}
.kx-wx{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.kx-wxt{display:grid;justify-items:center;gap:3px;padding:14px 8px;border-radius:18px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#e4efe8;cursor:pointer}.kx-wxt b{font:700 14px Georgia,serif}.kx-wxt em{font-style:normal;font-size:11px;color:#7f9a8b}.kx-wxt[data-on="true"]{border-color:var(--ac);background:color-mix(in srgb,var(--ac) 16%,transparent)}.kx-wxt[data-on="true"] em{color:var(--ac2)}.kx-wxt small{min-height:13px;color:#4ade80;font-size:11px}.kx-wxt[data-now="true"]{box-shadow:0 0 0 2px #4ade80 inset}
.kx-setcard{display:grid;gap:4px;padding:10px 12px;border-radius:16px;background:rgba(0,0,0,.24);border:1px solid rgba(255,255,255,.08);margin-bottom:10px}.kx-trow{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:34px;cursor:pointer}.kx-trow>span{display:grid;flex:0 0 auto}.kx-trow small{color:#8db5a0;font-weight:600}.kx-trow input[type=checkbox]{width:18px;height:18px;accent-color:var(--ac)}.kx-trow .kx-range{flex:1}.kx-trow>b{min-width:40px;text-align:right;color:var(--ac2)}.kx-setcard .kx-btn{justify-self:start;margin-top:6px}
.kx-hrow{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:12px;background:rgba(255,255,255,.04);margin-bottom:6px}.kx-hrow>div{flex:1;display:grid;gap:4px}.kx-hrow em{font-style:normal;color:#cfe0d5;min-width:36px;text-align:right}.kx-hrow input{accent-color:var(--ac)}
.kx-hrow2{display:flex;align-items:center;gap:8px;padding:5px 2px;border-bottom:1px solid rgba(255,255,255,.06)}.kx-hrow2 b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kx-hrow2 time{color:#7f9a8b;font-size:10.5px}.kx-muted{color:#7f9a8b;margin:0}
.kx-toasts{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;display:grid;gap:7px;width:min(360px,calc(100vw - 20px));pointer-events:none}
.kx-toast{pointer-events:auto;display:flex;align-items:center;gap:10px;padding:9px 10px 9px 12px;border-radius:16px;border:1px solid rgba(240,195,90,.5);background:linear-gradient(135deg,rgba(28,38,30,.98),rgba(14,24,17,.98));box-shadow:0 12px 30px rgba(0,0,0,.55);color:#eef6f0;font:600 12px "Trebuchet MS",system-ui,sans-serif;animation:kx-in .22s ease-out}.kx-toast[data-out]{opacity:0;transform:translateY(-8px);transition:.18s}.kx-toast[data-kind="warn"]{border-color:#f87171}
.kx-toast-ic{flex:none;display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:rgba(255,255,255,.07);font-size:20px}.kx-toast-tx{flex:1;min-width:0;display:grid;gap:1px}.kx-toast-tx b{font:700 13px Georgia,serif;color:#fde68a}.kx-toast-tx span{color:#a9c4b4}.kx-toast-x{border:0;background:none;color:#a9c4b4;font-size:17px;cursor:pointer}
@keyframes kx-in{from{opacity:0;transform:translateY(-10px)}}
@media (prefers-reduced-motion:reduce){.kx-toast,.kx-crop{animation:none;transition:none}}
.kr-split{display:grid;grid-template-columns:minmax(130px,176px) minmax(0,1fr);gap:12px;align-items:start}
@container (max-width:470px){.kr-split{grid-template-columns:minmax(0,1fr)}.kr-list{flex-direction:row!important;overflow-x:auto;padding-bottom:4px}.kr-list .kx-gb{max-width:150px}}
.kr-side{display:grid;gap:8px;align-content:start;min-width:0}.kr-side-h{display:flex;align-items:center;justify-content:space-between;padding:0 4px;font:800 10.5px "Trebuchet MS",system-ui,sans-serif;letter-spacing:.09em;text-transform:uppercase;color:#9fc0ae}
.kr-count{font-style:normal;padding:1px 8px;border-radius:99px;background:rgba(255,255,255,.1);color:#e8f6ec;letter-spacing:0}
.kr-list{display:flex;flex-direction:column;gap:5px}.kr-main{display:grid;gap:12px;min-width:0}
.kr-card{display:grid;gap:11px;padding:13px 14px;border-radius:18px;background:rgba(0,0,0,.24);border:1px solid rgba(255,255,255,.1)}
.kr-card-h{display:grid;gap:2px}.kr-card-h h4{margin:0;font:700 15px Georgia,serif;color:#fff}.kr-card-h span{font-size:11.5px;color:#9fc0ae}
.kr-hero-top{display:flex;flex-wrap:wrap;align-items:center;gap:12px}.kr-who{flex:1 1 110px;min-width:0;display:grid;justify-items:start;gap:5px}
.kr-name{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 19px Georgia,serif;color:#fff}
.kr-pill{padding:2px 10px;border-radius:99px;background:rgba(255,255,255,.1);color:#cfe0d5;font-size:10.5px;font-weight:800}.kr-pill.ok{background:rgba(74,222,128,.16);border:1px solid rgba(74,222,128,.4);color:#86efac}
.kr-inspect{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
.kr-btn{display:inline-flex;align-items:center;gap:7px;justify-content:flex-start}.kr-ic{display:inline-flex}.kr-ic svg{display:block}
.kx-btn.kr-btn.primary{background:var(--ac);color:#10200f;border-color:var(--ac)}.kx-btn.kr-btn.off{opacity:.5;cursor:not-allowed}
.kr-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.04)}
.kr-row-t{flex:1 1 150px;min-width:0;display:grid;gap:2px}.kr-row-t b{font-size:12.5px;color:#fff}.kr-row-t span{font-size:11px;color:#9fc0ae}.kr-row-c{display:flex;gap:6px;margin-left:auto}
.kt-bar-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.kt-bar-top .kx-muted{flex:1;min-width:0}
.kt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(236px,1fr));gap:12px;align-items:start}.kt-grid>.kx-empty{grid-column:1/-1}
.kt-card{position:relative;overflow:hidden;display:grid;gap:10px;padding:13px 13px 12px 18px;border-radius:18px;border:1px solid rgba(255,255,255,.1);background:radial-gradient(120% 70% at 0% 0%,rgba(255,255,255,.07),transparent 60%),rgba(0,0,0,.24);transition:transform .14s ease,border-color .14s ease}
.kt-card:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.22)}.kt-card[data-on="true"]{border-color:var(--ac);box-shadow:0 0 0 1px var(--ac) inset}
.kt-strip{position:absolute;left:0;top:0;bottom:0;width:6px}
.kt-head{display:flex;align-items:center;gap:9px;min-width:0}.kt-emoji{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:12px;background:rgba(255,255,255,.08);font-size:19px}
.kt-title{flex:1;min-width:0;display:grid;gap:1px}.kt-title b{font:700 14.5px Georgia,serif;color:#fff}.kt-title small{font-size:10.5px;color:#9fc0ae;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kt-afk{flex:none;padding:2px 8px;border-radius:99px;background:rgba(252,211,77,.16);border:1px solid rgba(252,211,77,.45);color:#fcd34d;font-size:10px;font-weight:800;letter-spacing:.04em}
.kt-pets{display:grid;gap:6px}.kt-pet{display:flex;align-items:center;gap:9px;min-width:0;padding:5px 7px;border-radius:12px;background:rgba(255,255,255,.04)}
.kt-face{border-radius:50%;background:rgba(0,0,0,.3)}.kt-pet-i{flex:1;min-width:0;display:grid;gap:3px}.kt-pet-i b{font-size:12px;color:#eef6f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kt-dots{display:flex;flex-wrap:wrap;gap:3px}.kt-dots i{width:9px;height:9px;border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,.45) inset,0 0 0 1px rgba(255,255,255,.12)}
.kt-str{position:relative;flex:none;min-width:58px;height:19px;border-radius:99px;background:rgba(0,0,0,.4);overflow:hidden;text-align:center}.kt-str span{position:absolute;inset:0 auto 0 0;background:rgba(251,146,60,.38)}.kt-str[data-max="true"] span{background:rgba(74,222,128,.4)}
.kt-str b{position:relative;display:block;padding:0 7px;line-height:19px;font-size:10.5px;color:#fff;font-variant-numeric:tabular-nums}
.kt-stat{display:grid;gap:5px;padding:10px 11px;border-radius:14px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.07)}
.kt-stat-h{display:flex;align-items:center;justify-content:space-between;gap:6px}.kt-stat-n{font:800 10px "Trebuchet MS",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#9fc0ae}
.kt-nav{display:inline-flex;align-items:center;gap:4px;color:#9fc0ae;font-size:10.5px}.kt-nav em{font-style:normal;min-width:26px;text-align:center}.kt-nav button{width:18px;height:18px;border:0;border-radius:6px;background:rgba(255,255,255,.08);color:#dce9e0;cursor:pointer;line-height:1;padding:0}.kt-nav button:hover{background:rgba(255,255,255,.18)}
.kt-stat-v{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px}.kt-big{font:700 21px Georgia,serif;font-variant-numeric:tabular-nums}.kt-unit{font-size:11px;color:#9fc0ae}.kt-max{margin-left:auto;font-size:10.5px;color:#9fc0ae}.kt-on{font:700 15px Georgia,serif;color:#86efac}
.kt-bar{height:6px;border-radius:9px;background:rgba(0,0,0,.45);overflow:hidden}.kt-bar i{display:block;height:100%;border-radius:9px}
.kt-proc{display:flex;justify-content:space-between;gap:8px;padding-top:5px;border-top:1px dashed rgba(255,255,255,.1);font-size:11px;color:#9fc0ae}.kt-proc b{color:#fde68a;font-variant-numeric:tabular-nums}
.kt-feed{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 11px;border-radius:12px;background:rgba(255,255,255,.04);font-size:11px;color:#b9d0c1}.kt-feed b{font-size:12px}
.kt-foot{display:flex;gap:7px}.kt-foot .kx-btn:first-child{flex:1}
#${DOCK_ID} .gd-btn[data-win-on="true"]{border-color:rgba(253,224,71,.7);background:rgba(253,224,71,.16);color:#fde047}`;

  // ---------- dock ----------
  let dock = null, grid = null, pop = null, miniLamps = null; const lamps = [];
  // ---------- update check ----------
  let latestVersion = "", updateState = "checking";
  const verParts = (v) => String(v).split(".").map((n) => parseInt(n, 10) || 0);
  function isNewer(a, b) { const x = verParts(a), y = verParts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; }
  function renderVer() {
    const b = dock?.querySelector("[data-ver]"); if (!b) return; const up = updateState === "available";
    b.dataset.update = String(up); b.textContent = up ? `New v${latestVersion} ↑` : VERSION;
    b.title = up ? "New version available — click to update" : updateState === "failed" ? "Couldn't check for updates — click to retry" : "Up to date — click to check again";
  }
  async function checkUpdate() {
    updateState = "checking";
    try {
      const res = await fetch(`${UPDATE_URL}?t=${Date.now()}`, { cache: "no-store" }); const m = (await res.text()).match(/^\/\/\s*@version\s+([\d.]+)/m);
      if (!res.ok || !m) throw new Error("no version"); latestVersion = m[1]; updateState = isNewer(latestVersion, VERSION_NUM) ? "available" : "current";
    } catch { updateState = "failed"; }
    renderVer();
  }
  function fireShortcut(code) { const key = code.slice(3).toLowerCase(); for (const type of ["keydown", "keyup"]) document.dispatchEvent(new KeyboardEvent(type, { key, code, altKey: true, bubbles: true, cancelable: true })); }
  function refreshActive() {
    if (!grid) return; const a = grid.querySelector('[data-id="almanac"]'), w = grid.querySelector('[data-id="weather"]');
    for (const it of ITEMS) if (it.win) { const b = grid.querySelector(`[data-id="${it.id}"]`); if (b) b.dataset.active = String(!!WINS[it.win]?.isOpen()); }
    if (a) a.dataset.active = String(almanac?.style.display === "block"); if (w) w.dataset.active = String(cfg.weather);
  }
  function buildButtons() {
    grid.innerHTML = ""; miniLamps.innerHTML = ""; lamps.length = 0;
    for (const item of ITEMS) {
      if (cfg.hidden[item.id]) continue;
      const button = document.createElement("button"); button.type = "button"; button.className = "gd-btn"; button.dataset.id = item.id;
      button.title = item.title + (item.lamp ? "\nRight-click: turn on / off" : ""); button.setAttribute("aria-label", item.label);
      button.innerHTML = `<span class="gd-icon">${iconSvg(item.icon)}</span><span class="gd-label">${esc(item.label)}</span>`;
      button.onclick = () => { if (item.win) WINS[item.win]?.toggle(); else if (item.overview) toggleAlmanac(); else if (item.weather) { cfg.weather = !cfg.weather; saveCfg(); applyCfg(); } else fireShortcut(item.code); };
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
    head.innerHTML = `<span class="gd-live"></span><span class="gd-title">${esc(TITLE)}</span><button class="gd-ver" type="button" data-ver></button><span class="gd-lamps"></span><button class="gd-hb" type="button" data-gear title="Customize menu" aria-label="Customize menu">${iconSvg("sliders")}</button><button class="gd-hb" type="button" data-min title="Minimize / expand" aria-label="Minimize or expand">${iconSvg("chevron")}</button>`;
    head.querySelector("[data-ver]").addEventListener("click", () => { if (updateState === "available") window.open(UPDATE_URL, "_blank", "noopener"); else void checkUpdate(); });
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
        if (weatherEl) { weatherEl.style.left = ""; placeWeather(); } if (almanac?.style.display === "block") placeSheet(defaultRect()); for (const w of Object.values(WINS)) w.reset(); placePop();
      } else if (t.hasAttribute("data-reset-all")) { Object.assign(cfg, DEFAULTS, { hidden: {} }); saveCfg(); buildButtons(); applyCfg(); }
    });
    document.addEventListener("pointerdown", (event) => { if (pop.dataset.open === "true" && !dock.contains(event.target)) pop.dataset.open = "false"; }, true);
    document.body.append(dock); renderVer(); void checkUpdate(); setInterval(checkUpdate, 30 * 60 * 1000); applyCfg(); keepOnScreen(dock); window.addEventListener("resize", () => keepOnScreen(dock));
    setInterval(() => { for (const [key, dot] of lamps) dot.dataset.on = String(lampOn(key)); const t = dock.querySelector(".gd-title"); if (_fnv(TITLE) !== 1311861492 || (t && t.textContent !== TITLE)) { if (t) t.textContent = atob("S2luZydzIE1vZA=="); } }, 1500);
  }
  function install() {
    installDock(); mountWins(); startAlerts(); void loadLiveData();
    if (!hookRoom()) { const t = setInterval(() => { if (hookRoom()) clearInterval(t); }, 1000); }
    document.addEventListener("keydown", (event) => {
      const target = event.target; if (target?.isContentEditable || /^(input|textarea|select)$/i.test(target?.tagName || "")) return;
      if (event.repeat || !event.altKey || event.ctrlKey || event.shiftKey || event.metaKey || !/^Key[OCDRN]$/.test(event.code)) return;
      event.preventDefault(); event.stopPropagation(); if (event.code === "KeyO") toggleAlmanac(); else WINS[{ KeyC: "calc", KeyD: "pets", KeyR: "room", KeyN: "alerts" }[event.code]]?.toggle();
    }, true);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") { const open = Object.values(WINS).filter((w) => w.isOpen()).sort((a, b) => Number(b.root.style.zIndex) - Number(a.root.style.zIndex))[0]; if (open) open.closeWin(); else if (almanac?.style.display === "block") closeAlmanac(); } }, true);
  }
  // =====================================================================================================
  //  Misc, ported from Arie's mod: Display (crop price, garden view), Movement (ghost mode), Inventory
  //  (keep a slot free, auto-store), Seed / Decor deleters and Auto reconnect.
  //  This block is self-contained: it only uses helpers defined above and does not change any existing code.
  // =====================================================================================================
  const MISC_KEY = "mg-king-misc-v1", MISC_STYLE_ID = "mg-king-misc-style", PRICE_ID = "mg-king-crop-price", PRICE_POS_KEY = "mg-king-crop-price-pos-v1";
  const MISC = Object.assign({ cropPrice: true, ghost: false, ghostDelay: 50, keepSlot: false, autoSilo: false, autoDecor: false, autoTool: false, collapsed: {} }, readJson(MISC_KEY) || {});
  MISC.cropPrice = MISC.cropPrice !== false;
  for (const k of ["ghost", "keepSlot", "autoSilo", "autoDecor", "autoTool"]) MISC[k] = MISC[k] === true;
  MISC.ghostDelay = clamp(Math.floor(Number(MISC.ghostDelay)) || 50, 10, 1000);
  if (!MISC.collapsed || typeof MISC.collapsed !== "object") MISC.collapsed = {};
  const saveMisc = () => writeJson(MISC_KEY, MISC);
  const miscStr = (v) => (typeof v === "string" ? v.trim() : "");
  const miscQty = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

  // Waits for a game atom by its label, then follows it: `cb` gets the value now and again on every change.
  async function followAtom(label, cb, keepGoing = () => true) {
    let s = null;
    for (let i = 0; i < 60 && keepGoing(); i++) { s = await getStore(); if (s) break; await sleep(1000); }
    if (!s || !keepGoing()) return null;
    let atom = null;
    for (let i = 0; i < 1200 && keepGoing(); i++) { atom = findAtom(label); if (atom) break; await sleep(500); }
    if (!atom || !keepGoing()) return null;
    const push = async () => { try { const v = await readAtom(s, atom); if (keepGoing()) cb(v); } catch {} };
    let off = null; try { off = s.sub(atom, push); } catch {}
    await push();
    return () => { try { off?.(); } catch {} };
  }

  // ---------- Movement: ghost mode (walk through anything, one tile per step) ----------
  const GHOST = (() => {
    const UP = ["z", "w", "arrowup"], DOWN = ["s", "arrowdown"], LEFT = ["q", "a", "arrowleft"], RIGHT = ["d", "arrowright"];
    const KEYS = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT]), held = new Set();
    let raf = null, last = 0, budget = 0, stepping = false, posAtom = null;
    const keyOf = (e) => String(e.key || "").toLowerCase();
    const typing = (e) => { const t = e.target; return !!t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName || "")); };
    // Alt / Ctrl / Meta combos and typing in a text box are left alone, so King's shortcuts and chat keep working.
    const onDown = (e) => { const k = keyOf(e); if (!KEYS.has(k) || e.altKey || e.ctrlKey || e.metaKey || typing(e)) return; e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) held.add(k); };
    const onUp = (e) => { const k = keyOf(e); if (!KEYS.has(k) || !held.has(k)) return; e.preventDefault(); e.stopImmediatePropagation(); held.delete(k); };
    const clearHeld = () => held.clear(), onVis = () => { if (document.hidden) held.clear(); };
    const any = (keys) => keys.some((k) => held.has(k));
    async function step(dx, dy) {
      const s = await getStore(); if (!s) return;
      posAtom = posAtom || findAtom("positionAtom"); if (!posAtom) return;
      let cur = null; try { cur = await readAtom(s, posAtom); } catch {}
      if (!cur || !Number.isFinite(Number(cur.x)) || !Number.isFinite(Number(cur.y))) return;   // never guess a position
      const x = Math.round(Number(cur.x)) + dx, y = Math.round(Number(cur.y)) + dy;
      try { await s.set(posAtom, { x, y }); } catch {}
      sendGame({ type: "PlayerPosition", position: { x, y } });
    }
    function frame(ts) {
      if (!last) last = ts; budget += ts - last; last = ts;
      const dx = (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0), dy = (any(DOWN) ? 1 : 0) - (any(UP) ? 1 : 0), delay = MISC.ghostDelay;
      if ((dx || dy) && budget >= delay && !stepping) { budget -= delay; stepping = true; step(dx, dy).finally(() => { stepping = false; }); }
      budget = Math.min(budget, delay * 4); raf = requestAnimationFrame(frame);
    }
    return {
      start() { if (raf !== null) return; last = 0; budget = 0; stepping = false; window.addEventListener("keydown", onDown, true); window.addEventListener("keyup", onUp, true); window.addEventListener("blur", clearHeld); document.addEventListener("visibilitychange", onVis); raf = requestAnimationFrame(frame); },
      stop() { if (raf !== null) { cancelAnimationFrame(raf); raf = null; } held.clear(); window.removeEventListener("keydown", onDown, true); window.removeEventListener("keyup", onUp, true); window.removeEventListener("blur", clearHeld); document.removeEventListener("visibilitychange", onVis); }
    };
  })();
  function setGhost(on) { MISC.ghost = !!on; saveMisc(); if (on) GHOST.start(); else GHOST.stop(); }

  // ---------- Inventory: keep one slot free ----------
  const invItemsOf = (raw) => (Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.inventory) ? raw.inventory : Array.isArray(raw?.inventory?.items) ? raw.inventory.items : []);
  const INV = { count: 0, owned: { seed: new Set(), decor: new Set(), egg: new Set(), tool: new Set() } }, INV_BLOCK_AT = 99;
  function refreshInv(raw) {
    const items = invItemsOf(raw); INV.count = items.length; for (const set of Object.values(INV.owned)) set.clear();
    for (const entry of items) {
      if (!entry || typeof entry !== "object") continue;
      const src = entry.item && typeof entry.item === "object" ? entry.item : entry, type = String(src.itemType ?? src.data?.itemType ?? "").toLowerCase();
      if (type === "seed" && src.species) INV.owned.seed.add(String(src.species));
      if (type === "decor" && src.decorId) INV.owned.decor.add(String(src.decorId));
      if (type === "egg" && src.eggId) INV.owned.egg.add(String(src.eggId));
      if (type === "tool" && src.toolId) INV.owned.tool.add(String(src.toolId));
    }
  }
  const invFull = () => MISC.keepSlot && INV.count >= INV_BLOCK_AT;
  function purchaseTarget(cmd) {
    const item = cmd?.item ?? {};
    switch (cmd?.shop) {
      case "seed": return { kind: "seed", id: item.species ?? cmd?.species ?? cmd?.id };
      case "egg": return { kind: "egg", id: item.eggId ?? cmd?.eggId ?? cmd?.id };
      case "tool": return { kind: "tool", id: item.toolId ?? cmd?.toolId ?? cmd?.id };
      case "decor": return { kind: "decor", id: item.decorId ?? cmd?.decorId ?? cmd?.id };
      default: return null;
    }
  }
  // Refuses anything that would need a new slot once the bag is at 99 of 100 (buying more of an item you already hold is fine).
  function invBlocks(cmd) {
    if (!invFull()) return false;
    if (cmd.type === "HarvestCrop" || cmd.type === "PickupObject" || cmd.type === "HatchEgg") return true;
    if (cmd.type === "PurchaseShopItem") { const t = purchaseTarget(cmd); if (!t) return false; const key = t.id == null ? "" : String(t.id); return !(key && INV.owned[t.kind].has(key)); }
    return false;
  }
  function installMiscSendGuard() {
    try {
      const proto = PW.WebSocket?.prototype; if (!proto || proto.__kxMiscGuard) return;
      const prev = proto.send;
      proto.send = function (data, ...rest) {
        try {
          if (MISC.keepSlot && typeof data === "string" && data.indexOf('"QuinoaCommand"') !== -1) {
            const parsed = JSON.parse(data), cmd = parsed?.type === "QuinoaCommand" ? parsed.command : null;
            if (cmd && typeof cmd === "object" && !(typeof parsed.requestId === "string" && WS.own.has(parsed.requestId)) && invBlocks(cmd)) { console.log(`[King's Mod] ${cmd.type} blocked: keeping one inventory slot free`); return; }
          }
        } catch {}
        return prev.call(this, data, ...rest);
      };
      proto.__kxMiscGuard = true;
    } catch (error) { console.warn("[King's Mod] misc send guard failed", error); }
  }

  // ---------- Inventory: auto-store (new items go straight to a silo / shed / shack that already holds that kind) ----------
  function makeAutoStore(flag, o) {
    let on = MISC[flag], stored = new Set(), invQty = new Map(), offs = [], gen = 0, busy = false, starting = false, timer = null;
    const queue = new Set(), pending = new Set(), removedAt = new Map();
    const qtyMap = (raw) => { const m = new Map(); for (const it of Array.isArray(raw) ? raw : []) { const k = o.keyOf(it), q = miscQty(it?.quantity); if (k && q > 0) m.set(k, (m.get(k) || 0) + q); } return m; };
    async function flush() {
      if (busy || !on) return; busy = true;
      try {
        while (queue.size && on) {
          const batch = [...queue]; queue.clear();
          for (const key of batch) { if (!on) return; if (!stored.has(key)) continue; sendGame({ type: "MoveItem", from: "inventory", to: o.storageId, itemId: key }); await sleep(40); }
        }
      } finally { busy = false; }
    }
    function later(keys) {
      for (const k of keys) if (k) pending.add(k);
      if (!pending.size || timer != null) return;
      timer = setTimeout(() => {
        timer = null; const now = Date.now(), list = [...pending]; pending.clear();
        for (const [k, t] of removedAt) if (now - t > 8000) removedAt.delete(k);
        const fresh = list.filter((k) => !(removedAt.has(k) && now - removedAt.get(k) <= 2000));   // just taken out of storage on purpose: leave it
        if (fresh.length) { for (const k of fresh) queue.add(k); void flush(); }
      }, 800);
    }
    async function start() {
      if (offs.length || starting) return; starting = true;
      const g = ++gen, live = () => on && gen === g;
      try {
        const offStore = await followAtom(o.storageLabel, (raw) => { const prev = stored; stored = new Set(qtyMap(raw).keys()); for (const k of prev) if (!stored.has(k)) removedAt.set(k, Date.now()); }, live);
        if (!live()) { offStore?.(); return; }
        let first = true;
        const offInv = await followAtom(o.invLabel, (raw) => {
          if (!Array.isArray(raw)) return;   // not loaded yet
          const next = qtyMap(raw);
          if (first) { first = false; invQty = next; const both = [...next.keys()].filter((k) => stored.has(k)); if (both.length) { for (const k of both) queue.add(k); void flush(); } return; }
          const up = []; for (const [k, q] of next) if (q > (invQty.get(k) || 0)) up.push(k);
          invQty = next; if (up.length) later(up);
        }, live);
        if (!live()) { offStore?.(); offInv?.(); return; }
        offs.push(offStore, offInv);
      } finally { starting = false; }
    }
    function stop() {
      gen++; for (const f of offs.splice(0)) { try { f?.(); } catch {} }
      queue.clear(); pending.clear(); removedAt.clear(); stored = new Set(); invQty = new Map(); busy = false;
      if (timer != null) { clearTimeout(timer); timer = null; }
    }
    return { isOn: () => on, set(v) { on = !!v; MISC[flag] = on; saveMisc(); if (on) void start(); else stop(); }, boot() { if (on) void start(); } };
  }
  const AUTO_STORE = {
    silo: makeAutoStore("autoSilo", { storageId: "SeedSilo", storageLabel: "mySeedSiloItemsAtom", invLabel: "mySeedInventoryAtom", keyOf: (it) => miscStr(it?.species) }),
    decor: makeAutoStore("autoDecor", { storageId: "DecorShed", storageLabel: "myDecorShedItemsAtom", invLabel: "myDecorInventoryAtom", keyOf: (it) => miscStr(it?.decorId) }),
    tool: makeAutoStore("autoTool", { storageId: "ToolShack", storageLabel: "myToolShackItemsAtom", invLabel: "myToolInventoryAtom", keyOf: (it) => (it && typeof it === "object" && "remainingActiveSeconds" in it ? "" : miscStr(it?.toolId)) })
  };

  // ---------- Seed + Decor deleters ----------
  const miscTally = (items, key) => { const m = new Map(); for (const it of Array.isArray(items) ? items : []) { const id = miscStr(it?.[key]), q = miscQty(it?.quantity); if (id && q > 0) m.set(id, (m.get(id) || 0) + q); } return m; };
  async function loadEntries(invLabel, stoLabel, key, label) {
    const [inv, sto] = await Promise.all([atomValue(invLabel), atomValue(stoLabel)]), a = miscTally(inv, key), b = miscTally(sto, key), out = [];
    for (const id of new Set([...a.keys(), ...b.keys()])) { const invQty = a.get(id) || 0, storeQty = b.get(id) || 0; if (invQty + storeQty > 0) out.push({ id, label: label(id), invQty, storeQty, total: invQty + storeQty }); }
    return out.sort((x, y) => x.label.localeCompare(y.label));
  }
  const seedEntries = () => loadEntries("mySeedInventoryAtom", "mySeedSiloItemsAtom", "species", (id) => KD.crops[id]?.sn || `${cropName(id)} Seed`);
  const decorEntries = () => loadEntries("myDecorInventoryAtom", "myDecorShedItemsAtom", "decorId", (id) => KD.decor[id]?.n || pretty(id));
  const invCountNow = async () => invItemsOf(await atomValue("myInventoryAtom")).length;
  async function firstEmptyGardenSlot() {
    const garden = (await atomValue("myDataAtom"))?.garden; if (!garden) return null;
    const free = (objs, i) => objs?.[String(i)] == null;
    for (let i = 0; i < 200; i++) if (free(garden.tileObjects, i)) return { tileType: "Dirt", index: i };
    for (let i = 0; i < 76; i++) if (free(garden.boardwalkTileObjects, i)) return { tileType: "Boardwalk", index: i };
    return null;
  }
  const mustSend = (payload) => { if (!sendGame(payload)) throw new Error("Not connected to the game."); };
  const delToast = (title, msg, kind) => toast(title, msg, { kind: kind === "error" ? "warn" : "info", emoji: kind === "success" ? "✅" : kind === "error" ? "⚠️" : "🗑️" });
  function makeDeleter(kind) {
    const selection = new Map(), listeners = new Set(); let running = false, paused = false, cancelled = false, waiter = null;
    const emit = (e) => { for (const f of [...listeners]) { try { f(e); } catch {} } };
    const gate = async () => { while (paused && !cancelled) { await new Promise((r) => { waiter = r; }); waiter = null; } if (cancelled) throw new Error("cancelled"); };
    const limit = () => (MISC.keepSlot ? INV_BLOCK_AT : 100);
    const plan = (entry, want) => { const w = Math.max(0, Math.min(Math.floor(want || 0), entry.total)), fromInventory = Math.min(w, entry.invQty), fromStorage = w - fromInventory; return { fromInventory, fromStorage, newEntry: fromStorage > 0 && entry.invQty <= 0 }; };
    const roomFor = async (p) => (p.fromStorage <= 0 || !p.newEntry ? true : (await invCountNow()) < limit());
    async function run(delayMs) {
      if (running) { delToast(kind.title, "Deletion already in progress.", "info"); return; }
      if (!selection.size) { delToast(kind.title, `No ${kind.unit} selected.`, "info"); return; }
      const byId = new Map((await kind.load()).map((e) => [e.id, e])), tasks = [];
      for (const picked of selection.values()) { const entry = byId.get(picked.id); if (!entry) continue; const qty = Math.min(Math.max(0, Math.floor(picked.qty)), entry.total); if (qty > 0) tasks.push({ entry, qty }); }
      const total = tasks.reduce((sum, t) => sum + t.qty, 0);
      if (total <= 0) { delToast(kind.title, "Nothing left to delete.", "info"); return; }
      const firstDraw = tasks.map((t) => plan(t.entry, t.qty)).find((p) => p.fromStorage > 0);
      if (firstDraw && !(await roomFor(firstDraw))) { delToast(kind.title, "Your inventory is full. Free one slot and try again.", "error"); return; }
      running = true; paused = false; cancelled = false; let done = 0;
      try {
        delToast(kind.title, `Deleting ${fmtInt(total)} ${kind.unit} across ${tasks.length} categories...`, "info");
        for (const task of tasks) {
          await gate(); const p = plan(task.entry, task.qty);
          if (p.fromStorage > 0) {
            if (!(await roomFor(p))) { delToast(kind.title, `Stopped at ${task.entry.label}, your inventory filled up.`, "error"); break; }
            mustSend({ type: "MoveItem", from: kind.storageId, to: "inventory", itemId: task.entry.id, quantity: p.fromStorage }); await sleep(180);
          }
          for (let i = 0; i < task.qty; i++) {
            await gate(); await kind.deleteOne(task.entry.id, delayMs); done++;
            emit({ type: "progress", done, total, label: task.entry.label });
            if (delayMs > 0 && i < task.qty - 1) await sleep(delayMs);
          }
        }
        selection.clear();
        delToast(kind.title, done > 0 ? `Deleted ${fmtInt(done)} ${kind.unit} (${tasks.length} categories).` : `No ${kind.unit} were deleted.`, done > 0 ? "success" : "info");
      } catch (error) {
        delToast(kind.title, error?.message === "cancelled" ? `Cancelled after ${fmtInt(done)} ${kind.unit}.` : error?.message || "Deletion failed.", "error");
      } finally { running = false; paused = false; cancelled = false; waiter = null; emit({ type: "finished" }); }
    }
    return {
      on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
      getSelection: () => [...selection.values()],
      setSelection(entries) { selection.clear(); for (const e of entries) if (e && e.id && e.qty > 0) selection.set(e.id, { ...e }); },
      clearSelection: () => selection.clear(), run, isRunning: () => running, isPaused: () => paused,
      pause() { if (!running || paused) return; paused = true; emit({ type: "paused" }); },
      resume() { if (!running || !paused) return; paused = false; waiter?.(); emit({ type: "resumed" }); },
      cancel() { if (!running) return; cancelled = true; paused = false; waiter?.(); }
    };
  }
  const DELETERS = {
    seed: makeDeleter({ title: "Seed deleter", unit: "seeds", storageId: "SeedSilo", load: seedEntries, deleteOne: async (species) => mustSend({ type: "Wish", itemId: species }) }),
    decor: makeDeleter({
      title: "Decor deleter", unit: "decor", storageId: "DecorShed", load: decorEntries,
      async deleteOne(decorId, delayMs) {
        const slot = await firstEmptyGardenSlot(); if (!slot) throw new Error("No empty garden tile to delete decor on.");
        mustSend({ type: "PlaceDecor", tileType: slot.tileType, localTileIndex: slot.index, decorId, rotation: 0 });
        if (delayMs > 0) await sleep(delayMs);
        mustSend({ type: "RemoveGardenObject", slot: slot.index, slotType: slot.tileType });
      }
    })
  };

  // ---------- Display: crop price ----------
  // Arie's mod draws this inside the game's own plant card. King's Mod has no access to the game canvas, so the price
  // shows in a small badge you can drag anywhere, while a plant is selected.
  const PRICE = { obj: null, slotId: null, players: 1, el: null };
  function priceValue() {
    const plant = PRICE.obj; if (!plant || plant.objectType !== "plant" || !Array.isArray(plant.slots)) return null;
    const one = (s) => { const species = s?.species || plant.species, size = readCropSize({ ...s, species }); return size == null ? 0 : cropValue(species, size, s?.mutations, PRICE.players); };
    const slots = plant.slots.filter(Boolean).sort((a, b) => (a.slotId || 0) - (b.slotId || 0)); if (!slots.length) return null;
    const wanted = Number.isFinite(PRICE.slotId) ? PRICE.slotId : null;
    const slot = wanted == null ? slots[0] : slots.find((s) => s.slotId === wanted) || slots.find((s) => (s.slotId || 0) >= wanted) || slots[0];
    const single = slot ? one(slot) : 0, total = single > 0 ? single : slots.reduce((sum, s) => sum + one(s), 0);
    return total > 0 ? total : null;
  }
  function priceEl() {
    if (PRICE.el?.isConnected) return PRICE.el; if (!document.body) return null;
    const el = h("div", "km-price", `<span aria-hidden="true">🪙</span><b></b>`); el.id = PRICE_ID; el.title = "Crop value — drag to move"; el.style.display = "none";
    makeMovable(el, el, PRICE_POS_KEY); applySavedPos(el, PRICE_POS_KEY); document.body.append(el); return (PRICE.el = el);
  }
  function priceSync() {
    const value = MISC.cropPrice ? priceValue() : null;
    if (value == null) { if (PRICE.el) PRICE.el.style.display = "none"; return; }
    const el = priceEl(); if (!el) return; el.querySelector("b").textContent = fmtCoins(value); el.style.display = "flex";
  }
  function startPrice() {
    void followAtom("myCurrentGardenObjectAtom", (v) => { PRICE.obj = v && typeof v === "object" ? v : null; priceSync(); });
    void followAtom("numPlayersAtom", (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) PRICE.players = n; priceSync(); });
    void (async () => {   // the selected-slot atom has had a few names across game versions
      for (let i = 0; i < 120; i++) {
        const label = ["selectedCropSlotIdAtom", "myCurrentGrowSlotIdAtom", "mySelectedSlotIdAtom"].find((l) => findAtom(l));
        if (label) { await followAtom(label, (v) => { PRICE.slotId = Number.isFinite(Number(v)) && v !== null ? Number(v) : null; priceSync(); }); return; }
        await sleep(1000);
      }
    })();
  }

  // ---------- Misc window ----------
  const MISC_ICON = '<path d="M5 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4H5z"/>';
  const GVIEW_ICON = '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>';
  Object.assign(ICONS, { misc: MISC_ICON, gview: GVIEW_ICON });
  ITEMS.push({ id: "misc", win: "misc", icon: "misc", label: "Misc", title: "Misc — Alt + M" });

  const miscBtn = (label, onClick, cls) => { const b = h("button", `kx-btn${cls ? ` ${cls}` : ""}`, esc(label)); b.type = "button"; b.onclick = onClick; return b; };
  function miscCard(id, title, desc) {
    const root = h("section", "kx-setcard km-card"), head = h("div", "km-head", `<span><b>${esc(title)}</b>${desc ? `<small>${esc(desc)}</small>` : ""}</span><i aria-hidden="true">▾</i>`), body = h("div", "km-cbody");
    head.setAttribute("role", "button"); head.tabIndex = 0;
    const apply = () => { root.dataset.collapsed = String(MISC.collapsed[id] === true); head.setAttribute("aria-expanded", String(MISC.collapsed[id] !== true)); };
    const flip = () => { if (MISC.collapsed[id]) delete MISC.collapsed[id]; else MISC.collapsed[id] = true; saveMisc(); apply(); };
    head.onclick = flip; head.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } };
    apply(); root.append(head, body); return { root, body };
  }
  function miscRow(label, hint, control) { const row = h("div", "km-row", `<span><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ""}</span>`); if (control) row.append(control); return row; }
  function miscSwitch(label, hint, on, onChange, icon) {
    const row = toggleRow(label, hint, on, onChange);
    if (icon) { const wrap = h("div", "km-ic"); wrap.append(spr(icon.urls, 24, icon.emoji), row.firstElementChild); row.prepend(wrap); }
    return row;
  }
  const miscDisposers = [];
  function renderMisc(body, win) {
    for (const f of miscDisposers.splice(0)) { try { f(); } catch {} }
    win.root.querySelectorAll(".km-ov").forEach((n) => n.remove());
    ensureMiscStyles(); win.setSub("Display, movement, inventory and bulk deleters"); body.classList.add("km-misc");
    body.append(displayCard(), movementCard(), inventoryCard(), deleterCard(win, DEL_SEED), deleterCard(win, DEL_DECOR), reconnectCard());
    return null;
  }
  function displayCard() {
    const c = miscCard("display", "Display", "What the mod adds to the game's screens.");
    c.body.append(
      miscSwitch("Crop price", "A crop's sell price, shown while a plant is selected.", MISC.cropPrice, (v) => { MISC.cropPrice = v; saveMisc(); priceSync(); }),
      miscRow("Garden view", "Your whole garden as a flat grid, nothing hidden.", miscBtn("Open", () => WINS.gview?.openWin()))
    );
    return c.root;
  }
  function movementCard() {
    const c = miscCard("player", "Movement"), num = h("input", "kx-search km-num");
    num.type = "number"; num.min = "10"; num.max = "1000"; num.step = "5"; num.value = String(MISC.ghostDelay); num.setAttribute("aria-label", "Step delay in milliseconds");
    num.onchange = () => { const v = clamp(Math.floor(Number(num.value) || 50), 10, 1000); num.value = String(v); MISC.ghostDelay = v; saveMisc(); };
    c.body.append(miscSwitch("Ghost mode", "Walk through anything in your way.", MISC.ghost, setGhost), miscRow("Step delay", "Milliseconds per step. Lower is faster.", num));
    return c.root;
  }
  function inventoryCard() {
    const c = miscCard("inventory", "Inventory", "Keep room free, and put away what already has a place.");
    c.body.append(
      miscSwitch("Keep one slot free", "At 99 of 100, refuses anything that needs a new slot.", MISC.keepSlot, (v) => { MISC.keepSlot = v; saveMisc(); }, { urls: [spriteUrl("ui", "InventoryBag")], emoji: "🎒" }),
      h("div", "km-sub", "Auto-store new items in"),
      miscSwitch("Seed Silo", "Seeds of a species it already holds.", AUTO_STORE.silo.isOn(), (v) => AUTO_STORE.silo.set(v), { urls: SPR.decor("SeedSilo"), emoji: "🌾" }),
      miscSwitch("Decor Shed", "Decor it already holds.", AUTO_STORE.decor.isOn(), (v) => AUTO_STORE.decor.set(v), { urls: SPR.decor("DecorShed"), emoji: "🪴" }),
      miscSwitch("Tool Shack", "Tools it already holds.", AUTO_STORE.tool.isOn(), (v) => AUTO_STORE.tool.set(v), { urls: SPR.decor("ToolShack"), emoji: "🧰" })
    );
    return c.root;
  }
  function reconnectCard() {
    const c = miscCard("autoReco", "Auto reconnect", "Log back in when this account opens in another session."), on = h("input"), range = h("input", "kx-range");
    on.type = "checkbox"; on.disabled = true; range.type = "range"; range.min = "0"; range.max = "300"; range.step = "30"; range.value = "30"; range.disabled = true;
    const toggle = h("label", "kx-trow", `<span><b>Enabled</b></span>`); toggle.append(on);
    const delay = h("div", "kx-trow", `<span><b>Delay</b><small>Wait before reconnecting.</small></span>`); delay.append(range);
    c.body.append(h("div", "km-note", "Turned off for now, at the game developers' request. It should come back later."), toggle, delay);
    return c.root;
  }

  const miscDur = (ms) => { if (ms < 1000) return `${ms} ms`; const s = ms / 1000; if (s < 10) return `${s.toFixed(1)} s`; if (s < 90) return `${Math.round(s)} s`; const m = Math.floor(s / 60), r = Math.round(s % 60); return r === 0 ? `${m} min` : `${m} min ${r} s`; };
  const miscClock = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const miscCounted = (n, noun) => `${fmtInt(n)} ${n === 1 ? noun.one : noun.many}`;
  const DEL_SEED = { id: "seedDeleter", ctl: DELETERS.seed, title: "Seed deleter", desc: "Delete seeds in bulk, from your inventory and Seed Silo.", emoji: "🌱", icon: [spriteUrl("ui", "SeedIcon")], urls: (id) => SPR.seed(id), unit: { one: "seed", many: "seeds" }, group: { one: "species", many: "species" }, selectLabel: "Choose seeds", storageLabel: "Seed Silo", storageNoun: "silo", pickTitle: "Select seeds", estDelay: 35, runDelay: 35 };
  const DEL_DECOR = { id: "decorDeleter", ctl: DELETERS.decor, title: "Decor deleter", desc: "Delete decor in bulk, from your inventory and Decor Shed.", emoji: "🪴", icon: [spriteUrl("ui", "DecorIcon")], urls: (id) => SPR.decor(id), unit: { one: "item", many: "items" }, group: { one: "kind", many: "kinds" }, selectLabel: "Choose decor", storageLabel: "Decor Shed", storageNoun: "shed", pickTitle: "Select decor", estDelay: 70, runDelay: 35 };   // decor costs about two round trips each, so the estimate doubles the delay
  DEL_SEED.load = seedEntries; DEL_DECOR.load = decorEntries;

  function openPicker(win, d) {
    return new Promise((resolve) => {
      win.root.querySelectorAll(".km-ov").forEach((n) => n.remove());
      const ov = h("div", "km-ov"), card = h("div", "km-pk"), top = h("div", "km-pk-top", `<b>${esc(d.pickTitle)}</b>`), x = h("button", "km-pk-x", "×");
      x.type = "button"; x.setAttribute("aria-label", "Close"); top.append(x);
      const search = h("input", "kx-search"); search.type = "search"; search.placeholder = `Search ${d.unit.many}…`; search.setAttribute("aria-label", `Search ${d.unit.many}`);
      const ctl = h("div", "km-pk-ctl"), list = h("div", "km-pk-list"), foot = h("div", "km-pk-foot"), sum = h("span", "km-pk-sum");
      const all = miscBtn("All", () => setAll((e) => e.total), "ghost"), none = miscBtn("None", () => setAll(() => 0), "ghost");
      const cancel = miscBtn("Cancel", () => close(), "ghost"), confirm = miscBtn("Confirm selection", () => {
        const out = new Map(); for (const [id, q] of picked) if (q > 0) out.set(id, q);
        d.ctl.setSelection([...out].map(([id, qty]) => { const e = entries.find((c) => c.id === id); return { id, qty, label: e?.label ?? id, fromStorage: Math.max(0, qty - (e?.invQty ?? 0)) }; }));
        close();
      });
      ctl.append(search, all, none); foot.append(sum, cancel, confirm); card.append(top, ctl, list, foot); ov.append(card); win.root.append(ov);
      const picked = new Map(d.ctl.getSelection().map((e) => [e.id, e.qty])); let entries = [], filter = "", open = true;
      function close() { if (!open) return; open = false; ov.remove(); resolve(); }
      x.onclick = close; ov.addEventListener("pointerdown", (e) => { if (e.target === ov) close(); });
      const visible = () => (filter ? entries.filter((e) => e.label.toLowerCase().includes(filter) || e.id.toLowerCase().includes(filter)) : entries);
      function setAll(qtyFor) { for (const e of visible()) { const q = qtyFor(e); if (q > 0) picked.set(e.id, q); else picked.delete(e.id); } paint(); }
      function summary() {
        let groups = 0, units = 0, fromStorage = 0;
        for (const e of entries) { const q = picked.get(e.id) || 0; if (q <= 0) continue; groups++; units += q; fromStorage += Math.max(0, q - e.invQty); }
        sum.textContent = groups === 0 ? "Nothing selected." : `${groups} selected · ${fmtInt(units)} ${d.unit.many}${fromStorage > 0 ? ` · ${fmtInt(fromStorage)} from the ${d.storageNoun}` : ""}`; confirm.disabled = groups === 0;
      }
      function row(e) {
        const q = picked.get(e.id) || 0, r = h("div", "km-pk-row"); r.dataset.on = String(q > 0);
        r.onclick = () => { if ((picked.get(e.id) || 0) > 0) picked.delete(e.id); else picked.set(e.id, e.total); paint(); };
        const amt = h("input", "kx-search km-pk-amt"); amt.type = "number"; amt.min = "0"; amt.max = String(e.total); amt.step = "1"; amt.value = String(q); amt.onclick = (ev) => ev.stopPropagation();
        amt.onchange = (ev) => { ev.stopPropagation(); const n = Math.max(0, Math.min(e.total, Math.floor(Number(amt.value) || 0))); if (n > 0) picked.set(e.id, n); else picked.delete(e.id); paint(); };
        r.append(spr(d.urls(e.id), 28, d.emoji), h("span", "km-pk-n", `<b>${esc(e.label)}</b><small>${e.storeQty > 0 ? `${fmtInt(e.total)} · ${fmtInt(e.invQty)} held, ${fmtInt(e.storeQty)} in ${esc(d.storageNoun)}` : `${fmtInt(e.total)} held`}</small>`), amt); return r;
      }
      function paint() {
        if (!open) return; list.replaceChildren(); const rows = visible();
        if (!rows.length) list.append(h("p", "kx-muted", entries.length ? "No match." : `You have no ${d.unit.many} to delete, in your inventory or your ${d.storageNoun}.`)); else for (const e of rows) list.append(row(e));
        summary();
      }
      search.oninput = () => { filter = search.value.trim().toLowerCase(); paint(); };
      list.append(h("p", "kx-muted", "Reading inventory…")); summary();
      d.load().then((loaded) => {
        if (!open) return; entries = loaded;
        for (const [id, q] of [...picked]) { const e = entries.find((c) => c.id === id); if (!e) picked.delete(id); else picked.set(id, Math.min(q, e.total)); }
        paint();
      }).catch(() => { if (!open) return; entries = []; paint(); sum.textContent = "Could not read the inventory."; });
      search.focus();
    });
  }
  function deleterCard(win, d) {
    const c = miscCard(d.id, d.title, d.desc), ctl = d.ctl, progress = { target: "-", done: 0, total: 0 };
    const empty = h("div", "km-empty"); empty.append(spr(d.icon, 30, d.emoji), h("span", "", `<b>Nothing picked yet</b><small>Choose from your inventory and your ${esc(d.storageLabel)}.</small>`));
    const tVal = h("b"), tGrp = h("span"), tSto = h("em"), totals = h("div", "km-tot"), chips = h("div", "km-chips"), est = h("small", "km-est"), selWrap = h("div", "km-sel");
    totals.append(tVal, tGrp, tSto); selWrap.append(totals, chips, est);
    const pTarget = h("b"), pCount = h("span"), pLine = h("div", "km-pline"), bar = h("div", "kx-bar"), barI = h("i"), progWrap = h("div", "km-prog");
    bar.append(barI); pLine.append(pTarget, pCount); progWrap.append(pLine, bar);
    const bSelect = miscBtn(d.selectLabel, () => runSelect()), bClear = miscBtn("Clear", () => { ctl.clearSelection(); summary(); }, "ghost"), bDelete = miscBtn("Start deleting", () => runDelete(), "km-danger");
    const bPause = miscBtn("Pause", () => { ctl.pause(); controls(); }), bPlay = miscBtn("Resume", () => { ctl.resume(); controls(); }), bStop = miscBtn("Stop", () => { ctl.cancel(); controls(); }, "km-danger");
    const actions = h("div", "km-act"); actions.append(bSelect, bClear, h("span", "km-grow"), bDelete, bPause, bPlay, bStop);
    c.body.append(empty, selWrap, progWrap, actions);
    let finishAt = null, timer = null; const estMs = (n) => n * (d.estDelay + 10), stopTimer = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
    function read() { const selection = ctl.getSelection(); let qty = 0, fromStorage = 0; for (const s of selection) { qty += Math.max(0, Math.floor(s.qty || 0)); fromStorage += Math.max(0, Math.floor(s.fromStorage || 0)); } return { selection, groups: selection.length, qty, fromStorage }; }
    function visibility() {
      const running = ctl.isRunning(), paused = ctl.isPaused(), r = read(), has = r.qty > 0;
      empty.hidden = running || r.groups > 0; selWrap.hidden = running || r.groups === 0; progWrap.hidden = !running;
      bSelect.hidden = running; bClear.hidden = running || r.groups === 0; bDelete.hidden = running || !has; bPause.hidden = !running || paused; bPlay.hidden = !running || !paused; bStop.hidden = !running;
    }
    function summary() {
      const r = read(), running = ctl.isRunning(), has = r.groups > 0 && r.qty > 0;
      tVal.textContent = miscCounted(r.qty, d.unit); tGrp.textContent = miscCounted(r.groups, d.group); tSto.textContent = `${fmtInt(r.fromStorage)} from the ${d.storageLabel}`; tSto.hidden = r.fromStorage <= 0;
      chips.replaceChildren(); const sorted = [...r.selection].sort((a, b) => b.qty - a.qty);
      for (const s of sorted.slice(0, 4)) { const chip = h("span", "km-chip"); chip.title = s.label || s.id; chip.append(spr(d.urls(s.id), 20, d.emoji), h("span", "km-chip-n", esc(s.label || s.id)), h("b", "", fmtInt(s.qty))); chips.append(chip); }
      if (sorted.length > 4) chips.append(h("span", "km-chip km-chip-more", `+${sorted.length - 4} more`));
      const ms = estMs(r.qty), at = running ? finishAt : ms > 0 ? Date.now() + ms : null;
      est.textContent = r.qty <= 0 ? "" : at ? `About ${miscDur(ms)}, done around ${miscClock(at)}` : `About ${miscDur(ms)}`;
      bSelect.classList.toggle("ghost", has); bDelete.disabled = !has || running; bClear.disabled = !has || running; bSelect.disabled = running; visibility();
      stopTimer(); if (!running && r.qty > 0) timer = setTimeout(summary, 1000);
    }
    function controls() {
      const running = ctl.isRunning(), paused = ctl.isPaused(); visibility();
      if (running) { barI.style.width = `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`; bar.dataset.w = paused ? "1" : "0"; pTarget.textContent = paused ? `Paused, ${progress.target || "-"}` : progress.target || "-"; pCount.textContent = `${fmtInt(progress.done)} / ${fmtInt(progress.total)}`; }
      bPause.disabled = !running || paused; bPlay.disabled = !running || !paused; bStop.disabled = !running;
    }
    async function runSelect() { await openPicker(win, d); summary(); controls(); }
    async function runDelete() { const ms = estMs(read().qty); finishAt = ms > 0 ? Date.now() + ms : null; stopTimer(); const pending = ctl.run(d.runDelay); controls(); summary(); await pending; finishAt = null; controls(); summary(); }
    const off = ctl.on((e) => {
      if (e.type === "progress") { progress.target = e.label || "-"; progress.done = e.done; progress.total = e.total; controls(); }
      else if (e.type === "finished") { progress.target = "-"; progress.done = 0; progress.total = 0; controls(); summary(); }
      else if (e.type === "paused" || e.type === "resumed") controls();
    });
    miscDisposers.push(off, stopTimer); summary(); controls(); return c.root;
  }

  // ---------- Garden view window (opened from Misc > Display) ----------
  function renderGardenView(body, win) {
    const COLS = 20, ROWS = 10, TOTAL = COLS * ROWS;
    ensureMiscStyles(); win.setSub("Every tile gets the same space, so nothing hides behind a taller plant"); body.classList.add("km-gv");
    const search = h("input", "kx-search"); search.type = "search"; search.placeholder = "Find a plant…"; search.setAttribute("aria-label", "Find a plant");
    const summary = h("span", "km-gv-sum"), bar = h("div", "km-gv-bar"), grid = h("div", "km-gv-grid"), hint = h("p", "kx-muted", "Hover a tile for its name.");
    bar.append(search, summary); grid.style.gridTemplateColumns = `repeat(${COLS / 2}, 1fr) 12px repeat(${COLS / 2}, 1fr)`; grid.style.gridTemplateRows = `repeat(${ROWS}, 1fr)`; grid.style.aspectRatio = `${COLS + 0.6} / ${ROWS}`;
    const cells = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if (c === COLS / 2) grid.append(h("div")); const el = h("div", "km-gv-cell"); cells[r * COLS + c] = { el, shown: null, content: null }; grid.append(el); }
    body.append(bar, grid, hint);
    function contentOf(raw) {
      if (!raw || typeof raw !== "object") return null; const type = String(raw.objectType ?? "");
      if (type === "plant" && typeof raw.species === "string") return { kind: "plant", id: raw.species, name: cropName(raw.species) };
      if (type === "egg") { const id = String(raw.eggId ?? raw.id ?? ""); return id ? { kind: "egg", id, name: KD.eggs[id]?.n || pretty(id) } : null; }
      if (type === "decor" && typeof raw.decorId === "string") return { kind: "decor", id: raw.decorId, name: KD.decor[raw.decorId]?.n || pretty(raw.decorId) };
      return null;
    }
    const iconOf = (c) => (c.kind === "plant" ? spr(SPR.crop(c.id), 30, EMOJI.crop) : c.kind === "egg" ? spr(SPR.egg(c.id), 30, EMOJI.egg) : spr(SPR.decor(c.id), 30, EMOJI.decor));
    function filterNow() {
      const q = search.value.trim().toLowerCase(); let hits = 0, filled = 0;
      for (const cell of cells) {
        if (cell.content) filled++; const hit = !!q && !!cell.content && (cell.content.name.toLowerCase().includes(q) || cell.content.id.toLowerCase().includes(q));
        if (hit) hits++; cell.el.classList.toggle("is-hit", hit); cell.el.classList.toggle("is-dimmed", !!q && !hit);
      }
      summary.textContent = q ? `${hits} match${hits === 1 ? "" : "es"}` : `${filled} / ${TOTAL} tiles used`;
    }
    let busy = false;
    async function update() {
      if (busy) return; busy = true;
      try {
        const objs = (await atomValue("myDataAtom"))?.garden?.tileObjects, tiles = objs && typeof objs === "object" ? objs : {};
        for (let i = 0; i < TOTAL; i++) {
          const cell = cells[i], content = contentOf(tiles[String(i)]), key = content ? `${content.kind}:${content.id}` : "free";
          cell.content = content; if (key === cell.shown) continue; cell.shown = key; cell.el.replaceChildren();
          cell.el.classList.toggle("is-free", !content); cell.el.classList.toggle("is-used", !!content);
          if (!content) { cell.el.title = "Empty"; continue; }
          cell.el.title = content.kind === "plant" ? content.name : `${content.name} (${content.kind})`; cell.el.append(iconOf(content));
        }
        filterNow();
      } finally { busy = false; }
    }
    search.addEventListener("input", filterNow); void update(); return { update };
  }
  createWin({ id: "misc", title: "Misc", icon: "misc", accent: ["#b79af5", "#e0d2ff"], w: 540, h: 620, tabs: [{ id: "misc", label: "Misc", render: renderMisc }] });
  createWin({ id: "gview", title: "Garden view", icon: "gview", accent: ["#7dd3a0", "#c8f3d6"], w: 760, h: 560, every: 1500, tabs: [{ id: "garden", label: "Garden", render: renderGardenView }] });

  const MISC_CSS = `
.km-misc{display:grid;align-content:start;gap:0}
.km-card .kx-btn{margin-top:0}
.km-head{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;user-select:none;padding:2px 0}
.km-head>span{display:grid;gap:1px;min-width:0}.km-head b{font:700 14px Georgia,"Palatino Linotype",serif;color:var(--ac2)}.km-head small{color:#8db5a0;font-weight:600}
.km-head i{flex:none;font-style:normal;color:#8db5a0;transition:transform .15s ease}.km-card[data-collapsed="true"] .km-head i{transform:rotate(-90deg)}
.km-cbody{display:grid;gap:4px;padding-top:6px}.km-card[data-collapsed="true"] .km-cbody{display:none}
.km-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;min-height:34px}
.km-row>span{display:grid;flex:1 1 150px}.km-row small{color:#8db5a0;font-weight:600}
.km-ic{display:flex;align-items:center;gap:9px;min-width:0}.km-ic>span{display:grid}.km-ic small{color:#8db5a0;font-weight:600}
.km-sub{margin:6px 2px 0;font-size:11.5px;font-weight:800;color:#8db5a0}
.kx-search.km-num{width:78px;flex:none;padding:6px 8px;text-align:right}
.km-note{padding:8px 11px;border-radius:11px;background:rgba(245,158,11,.14);color:#f7d58b;font-size:11.5px;line-height:1.45}
.km-empty{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:12px;border:1px dashed rgba(255,255,255,.16);color:#8db5a0}.km-empty>span:last-child{display:grid}.km-empty b{color:#e9f2ec}
.km-sel{display:grid;gap:7px}.km-tot{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px}.km-tot b{font-size:15px;color:var(--ac2)}.km-tot span{color:#a9c4b4}
.km-tot em{font-style:normal;font-size:10.5px;padding:2px 8px;border-radius:99px;background:rgba(245,158,11,.18);color:#f7d58b}
.km-chips{display:flex;flex-wrap:wrap;gap:6px}.km-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px 3px 5px;border-radius:99px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05)}
.km-chip-n{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.km-chip b{color:var(--ac2)}.km-chip-more{padding:3px 10px;color:#a9c4b4}
.km-est{color:#8db5a0}
.km-prog{display:grid;gap:6px}.km-pline{display:flex;justify-content:space-between;gap:8px}.km-pline b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.km-pline span{color:#a9c4b4;font-variant-numeric:tabular-nums}
.km-act{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:2px}.km-grow{flex:1}
.kx-btn.km-danger{border-color:#f87171;background:linear-gradient(145deg,rgba(248,113,113,.28),rgba(248,113,113,.1));color:#fecaca}
.km-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:12px;overflow:hidden;background:rgba(3,10,6,.68)}
.km-pk{display:flex;flex-direction:column;gap:8px;width:min(460px,100%);max-height:100%;min-height:0;padding:12px;border-radius:16px;background:linear-gradient(170deg,#163120,#0a1a11);border:1px solid color-mix(in srgb,var(--ac) 42%,transparent);box-shadow:0 18px 44px rgba(0,0,0,.6)}
.km-pk-top,.km-pk-ctl,.km-pk-foot{flex:none}.km-pk-top{display:flex;align-items:center;justify-content:space-between}.km-pk-top b{font:700 15px Georgia,serif;color:var(--ac2)}
.km-pk-x{width:26px;height:26px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#d9e8de;font-size:16px;cursor:pointer}.km-pk-x:hover{color:var(--ac2);border-color:var(--ac)}
.km-pk-ctl{display:flex;gap:6px}.km-pk-ctl .kx-search{flex:1;min-width:0}
.km-pk-list{flex:1 1 auto;min-height:0;overflow:auto;display:grid;gap:4px;align-content:start;scrollbar-width:thin;scrollbar-color:#2f6a49 transparent}
.km-pk-row{display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);cursor:pointer}
.km-pk-row[data-on="true"]{border-color:var(--ac);background:color-mix(in srgb,var(--ac) 16%,transparent)}
.km-pk-n{flex:1;min-width:0;display:grid}.km-pk-n b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.km-pk-n small{color:#8db5a0;font-weight:600}
.kx-search.km-pk-amt{width:72px;flex:none;padding:5px 7px;text-align:right}
.km-pk-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.km-pk-sum{flex:1 1 140px;color:#a9c4b4}
.km-gv{display:grid;align-content:start;gap:10px}.km-gv-bar{display:flex;align-items:center;gap:10px}.km-gv-bar .kx-search{flex:1}.km-gv-sum{color:#8db5a0;white-space:nowrap}
.km-gv-grid{display:grid;gap:2px;width:100%;padding:6px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.28)}
.km-gv-cell{display:flex;align-items:center;justify-content:center;min-width:0;min-height:0;overflow:hidden;border-radius:4px;border:1px solid transparent;transition:opacity .09s ease,background .09s ease}
.km-gv-cell.is-free{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08)}.km-gv-cell.is-used{background:color-mix(in srgb,var(--ac) 14%,transparent);border-color:color-mix(in srgb,var(--ac) 38%,transparent)}
.km-gv-cell.is-hit{border-color:var(--ac2)}.km-gv-cell.is-dimmed{opacity:.25}.km-gv-cell>*{pointer-events:none;max-width:100%;max-height:100%}
.km-price{position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:2147483640;display:none;align-items:center;gap:7px;padding:5px 13px 5px 10px;border-radius:99px;border:1px solid rgba(240,195,90,.55);background:linear-gradient(135deg,rgba(28,38,30,.96),rgba(14,24,17,.96));box-shadow:0 8px 22px rgba(0,0,0,.5);color:#fef3c7;font:700 14px "Trebuchet MS",system-ui,sans-serif;font-variant-numeric:tabular-nums;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
.km-price span{font-size:15px}`;
  function ensureMiscStyles() { if (document.getElementById(MISC_STYLE_ID)) return; const style = document.createElement("style"); style.id = MISC_STYLE_ID; style.textContent = MISC_CSS; (document.head || document.documentElement).append(style); }

  function miscBoot() {
    ensureMiscStyles(); void followAtom("myInventoryAtom", refreshInv); startPrice();
    for (const store of Object.values(AUTO_STORE)) store.boot();
  }
  installMiscSendGuard(); if (MISC.ghost) GHOST.start();
  if (document.body) miscBoot(); else document.addEventListener("DOMContentLoaded", miscBoot, { once: true });
  document.addEventListener("keydown", (event) => {   // Alt + M, like the other windows
    const target = event.target; if (target?.isContentEditable || /^(input|textarea|select)$/i.test(target?.tagName || "")) return;
    if (event.repeat || !event.altKey || event.ctrlKey || event.shiftKey || event.metaKey || event.code !== "KeyM") return;
    event.preventDefault(); event.stopPropagation(); WINS.misc?.toggle();
  }, true);

  if (document.body) install(); else document.addEventListener("DOMContentLoaded", install, { once: true });
})();
