(() => {
  "use strict";
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const counter = document.getElementById("counter");
  const hint = document.getElementById("hint");
  const areaLabel = document.getElementById("areaLabel");
  const toast = document.getElementById("toast");
  const modal = document.getElementById("modal");
  const modalIcon = document.getElementById("modalIcon");
  const modalEyebrow = document.getElementById("modalEyebrow");
  const modalTitle = document.getElementById("modalTitle");
  const modalText = document.getElementById("modalText");
  const actionBtn = document.getElementById("actionBtn");
  const mobileAction = document.getElementById("mobileAction");

  const TILE = 32;
  const COLS = 34, ROWS = 24;
  let viewW = 900, viewH = 560, scale = 1, currentTile = 32, lastTime = 0, toastTimer;
  const keys = new Set();
  const collected = new Set();
  const opened = new Set();
  let player = { x: 4.5, y: 4.5, faceX: 0, faceY: 1, walk: 0 };
  let camera = { x: 0, y: 0 };
  let world = [];
  let mobileDir = null;

  const objects = [
    { id: "sign", x: 5, y: 5, type: "sign", title: "Un letrero", icon: "▤", text: "Bienvenido a este pequeño mundo.\nNo hay prisa: explora a tu ritmo.\nHay cosas escondidas por aquí.", label: "LETRERO" },
    { id: "chest1", x: 12, y: 4, type: "chest", title: "Primer hallazgo", icon: "▣", item: "✦", text: "Encontraste una esmeralda.\nNo vale mucho en este mundo, pero cada aventura necesita un primer tesoro.", label: "COFRE" },
    { id: "flower", x: 23, y: 9, type: "flower", title: "Una flor silvestre", icon: "✿", item: "✿", text: "Una flor que creció aquí, sin que nadie la plantara.\nPuedes guardarla como recuerdo de tu visita.", label: "FLOR" },
    { id: "chest2", x: 28, y: 16, type: "chest", title: "Un mensaje escondido", icon: "▣", item: "◆", text: "¡Encontraste otro tesoro!\nA veces las cosas pequeñas terminan siendo las más importantes.", label: "COFRE" },
    { id: "house", x: 17, y: 18, type: "house", title: "La casita del final", icon: "⌂", text: "Llegaste al lugar secreto.\n\nQuería hacerte un pequeño mundo para que tuvieras algo diferente que explorar. No es enorme ni perfecto, pero lo hice pensando en ti.\n\nGracias por formar parte de mi mundo. ♡", label: "CASITA" }
  ];

  function seededRandom(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function makeWorld() {
    const rand = seededRandom(78214);
    world = Array.from({ length: ROWS }, (_, y) =>
      Array.from({ length: COLS }, (_, x) => {
        let t = "grass";
        const n = rand();
        if (n < .09) t = "grass2";
        if (n > .91) t = "dirt";
        if ((x === 0 || y === 0 || x === COLS-1 || y === ROWS-1)) t = "water";
        return t;
      })
    );
    // A winding dirt path leading from spawn to the cottage.
    for (let x = 3; x < 30; x++) {
      const y = Math.round(7 + Math.sin(x / 3.2) * 2);
      for (let dy = 0; dy <= 1; dy++) if (world[y+dy] && world[y+dy][x]) world[y+dy][x] = "path";
    }
    for (let y = 8; y < 19; y++) {
      const x = Math.round(18 + Math.sin(y / 2.7) * 2);
      for (let dx = 0; dx < 2; dx++) if (world[y][x+dx]) world[y][x+dx] = "path";
    }
    // Clear areas around important objects.
    for (const o of objects) {
      for (let yy=o.y-1; yy<=o.y+1; yy++) for (let xx=o.x-1; xx<=o.x+1; xx++) {
        if (world[yy]?.[xx] && world[yy][xx] !== "water") world[yy][xx] = "grass";
      }
    }
    // Small pond.
    for (let y=12; y<=14; y++) for (let x=5; x<=8; x++) {
      if ((x-6.5)**2/5 + (y-13)**2/2.5 < 1.2) world[y][x] = "water";
    }
    // Trees and tufts are decorative map features.
    const blocked = new Set(objects.map(o => `${o.x},${o.y}`));
    const trees = [];
    for (let i=0; i<34; i++) {
      const x = 2 + Math.floor(rand()*(COLS-4)), y = 2 + Math.floor(rand()*(ROWS-4));
      if (blocked.has(`${x},${y}`) || world[y][x] === "water" || world[y][x] === "path") continue;
      if (Math.abs(x-player.x)<3 && Math.abs(y-player.y)<3) continue;
      if (trees.some(t => Math.abs(t.x-x)<2 && Math.abs(t.y-y)<2)) continue;
      trees.push({x,y});
    }
    window._trees = trees;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(rect.width*dpr);
    canvas.height = Math.floor(rect.height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    viewW = rect.width; viewH = rect.height;
    scale = Math.max(1, Math.min(viewW/16, viewH/12));
  }
  function rect(x,y,w,h,color) { ctx.fillStyle=color; ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h)); }
  function drawTile(type, x, y, size) {
    const palettes = {
      grass: ["#75ad46","#659a3c","#83ba50"], grass2: ["#6ba342","#5f9239","#7bb04a"],
      dirt: ["#8b633e","#785132","#9a7048"], path: ["#b49a68","#9b8053","#c2aa78"],
      water: ["#4e9fd0","#3987bd","#67b6df"]
    };
    const p = palettes[type] || palettes.grass;
    rect(x,y,size,size,p[0]);
    rect(x,y+size*.72,size,size*.28,p[1]);
    rect(x+size*.18,y+size*.18,size*.18,size*.1,p[2]);
    rect(x+size*.62,y+size*.42,size*.13,size*.1,p[1]);
    if(type==="water") {
      rect(x+size*.15,y+size*.25,size*.32,size*.07,"#9bd7ee");
      rect(x+size*.56,y+size*.65,size*.25,size*.06,"#6ac0e4");
    }
    if(type==="path") {
      rect(x+size*.25,y+size*.3,size*.12,size*.09,"#d3bd8a");
      rect(x+size*.7,y+size*.56,size*.1,size*.08,"#806b47");
    }
  }
  function drawTree(px,py,s) {
    rect(px+s*.37,py+s*.48,s*.27,s*.5,"#765035");
    rect(px+s*.12,py+s*.12,s*.76,s*.58,"#315d2d");
    rect(px+s*.2,py+s*.04,s*.6,s*.5,"#3e7133");
    rect(px+s*.26,py+s*.13,s*.18,s*.15,"#548b3c");
    rect(px+s*.58,py+s*.3,s*.15,s*.12,"#2c532a");
    rect(px+s*.4,py+s*.55,s*.13,s*.08,"#89613c");
  }
  function drawFlower(px,py,s) {
    rect(px+s*.47,py+s*.45,s*.08,s*.42,"#367b32");
    rect(px+s*.28,py+s*.7,s*.2,s*.08,"#4b963d");
    rect(px+s*.35,py+s*.2,s*.3,s*.3,"#f3d75a");
    rect(px+s*.23,py+s*.28,s*.18,s*.18,"#fff0bd");
    rect(px+s*.58,py+s*.28,s*.18,s*.18,"#fff0bd");
    rect(px+s*.4,py+s*.1,s*.18,s*.18,"#fff0bd");
  }
  function drawChest(px,py,s,openState) {
    rect(px+s*.15,py+s*.42,s*.7,s*.42,"#70431f");
    rect(px+s*.15,py+s*.38,s*.7,s*.13,openState?"#a9793d":"#9a652e");
    rect(px+s*.15,py+s*.34,s*.7,s*.12,"#b77c36");
    rect(px+s*.15,py+s*.38,s*.7,s*.04,"#e0a44e");
    rect(px+s*.45,py+s*.48,s*.12,s*.16,"#e5c45c");
    rect(px+s*.18,py+s*.68,s*.64,s*.05,"#4e301a");
    if(openState) { rect(px+s*.3,py+s*.19,s*.4,s*.12,"#4f381f"); rect(px+s*.4,py+s*.2,s*.2,s*.1,"#75dbb3"); }
  }
  function drawSign(px,py,s) {
    rect(px+s*.43,py+s*.38,s*.14,s*.5,"#80562e");
    rect(px+s*.12,py+s*.2,s*.76,s*.35,"#a87a43");
    rect(px+s*.2,py+s*.27,s*.6,s*.05,"#d5ad6b");
    rect(px+s*.2,py+s*.39,s*.45,s*.04,"#76502d");
  }
  function drawHouse(px,py,s) {
    rect(px+s*.1,py+s*.42,s*.8,s*.47,"#9a6b42");
    rect(px+s*.03,py+s*.32,s*.94,s*.18,"#64432d");
    rect(px+s*.1,py+s*.24,s*.8,s*.12,"#774b31");
    rect(px+s*.23,py+s*.53,s*.2,s*.18,"#74b5d2");
    rect(px+s*.57,py+s*.53,s*.2,s*.18,"#74b5d2");
    rect(px+s*.42,py+s*.64,s*.17,s*.25,"#4d3827");
    rect(px+s*.53,py+s*.75,s*.025,s*.025,"#e9d277");
    rect(px+s*.16,py+s*.44,s*.68,s*.035,"#c0915b");
  }
  function drawPlayer(px,py,s) {
    const bob = Math.sin(player.walk)*s*.035;
    // Small blocky adventurer, original simple pixel art.
    rect(px+s*.28,py+s*.12+bob,s*.44,s*.34,"#d5a276");
    rect(px+s*.24,py+s*.08+bob,s*.52,s*.14,"#573c2d");
    rect(px+s*.27,py+s*.24+bob,s*.12,s*.06,"#24332a");
    rect(px+s*.59,py+s*.24+bob,s*.12,s*.06,"#24332a");
    rect(px+s*.34,py+s*.42+bob,s*.32,s*.29,"#397cbd");
    rect(px+s*.23,py+s*.43+bob,s*.12,s*.26,"#d5a276");
    rect(px+s*.65,py+s*.43+bob,s*.12,s*.26,"#d5a276");
    rect(px+s*.34,py+s*.7+bob,s*.13,s*.2,"#4d4c78");
    rect(px+s*.53,py+s*.7+bob,s*.13,s*.2,"#4d4c78");
    rect(px+s*.31,py+s*.88+bob,s*.18,s*.08,"#443b2c");
    rect(px+s*.51,py+s*.88+bob,s*.18,s*.08,"#443b2c");
  }
  function worldToScreen(x,y) { return {x: (x-camera.x)*currentTile, y: (y-camera.y)*currentTile}; }
  function draw() {
    ctx.clearRect(0,0,viewW,viewH);
    // Responsive zoom: tile size is scaled to fit a useful amount of map.
    const tile = Math.max(22, Math.min(36, Math.floor(Math.min(viewW/18, viewH/12))));
    currentTile = tile;
    const colsVisible = Math.ceil(viewW/tile)+2, rowsVisible = Math.ceil(viewH/tile)+2;
    camera.x = Math.max(0, Math.min(COLS-viewW/tile, player.x-viewW/tile/2));
    camera.y = Math.max(0, Math.min(ROWS-viewH/tile, player.y-viewH/tile/2));
    for(let sy=-1; sy<rowsVisible; sy++) for(let sx=-1; sx<colsVisible; sx++) {
      const wx=Math.floor(camera.x+sx), wy=Math.floor(camera.y+sy);
      if(wx<0||wy<0||wx>=COLS||wy>=ROWS) continue;
      drawTile(world[wy][wx], (wx-camera.x)*tile, (wy-camera.y)*tile, tile+1);
    }
    for(const t of (window._trees||[])) {
      const p=worldToScreen(t.x,t.y);
      if(p.x>-tile&&p.y>-tile&&p.x<viewW&&p.y<viewH) drawTree(p.x,p.y,tile);
    }
    for(const o of objects) {
      const p=worldToScreen(o.x,o.y);
      if(p.x>-tile&&p.y>-tile&&p.x<viewW&&p.y<viewH) {
        if(o.type==="chest") drawChest(p.x,p.y,tile,opened.has(o.id));
        if(o.type==="sign") drawSign(p.x,p.y,tile);
        if(o.type==="flower") drawFlower(p.x,p.y,tile);
        if(o.type==="house") drawHouse(p.x,p.y,tile);
        if(collected.has(o.id)) {
          rect(p.x+tile*.36,p.y-tile*.1,tile*.28,tile*.07,"#f5dc65");
        }
      }
    }
    const pp=worldToScreen(player.x,player.y);
    drawPlayer(pp.x,pp.y,tile);
    // subtle vignette
    const grad=ctx.createRadialGradient(viewW/2,viewH/2,viewH*.12,viewW/2,viewH/2,viewW*.7);
    grad.addColorStop(0,"rgba(0,0,0,0)");
    grad.addColorStop(1,"rgba(15,27,16,.22)");
    ctx.fillStyle=grad; ctx.fillRect(0,0,viewW,viewH);
    updateHUD();
  }
  function updateHUD() {
    const total=objects.filter(o=>o.item).length;
    const got=objects.filter(o=>o.item&&collected.has(o.id)).length;
    counter.textContent=`${got} / ${total}`;
    const near=getNearby();
    if(near) {
      hint.textContent=`[E] ${near.type==="house"?"Entrar":near.type==="chest"?"Abrir cofre":near.type==="flower"?"Recoger flor":"Leer"} · ${near.label}`;
      areaLabel.textContent=near.type==="house"?"REFUGIO":near.type==="chest"?"TESORO":near.type==="flower"?"PRADERA":"CAMINO";
    } else {
      hint.textContent="Explora el mapa. Acércate a algo para interactuar.";
      areaLabel.textContent=player.y>15?"BOSQUE SUR":player.x>23?"PRADERA ESTE":"PRADERA";
    }
  }
  function getNearby() {
    let best=null, bestD=1.6;
    for(const o of objects) {
      const d=Math.hypot(player.x-o.x,player.y-o.y);
      if(d<bestD) { best=o; bestD=d; }
    }
    return best;
  }
  function showToast(message) {
    toast.textContent=message; toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove("show"),1900);
  }
  function interact() {
    if(!modal.hidden) return;
    const o=getNearby();
    if(!o) { showToast("No hay nada cerca. ¡Sigue explorando!"); return; }
    if(o.item && collected.has(o.id)) {
      showModal("YA LO ENCONTRASTE", o.title, "Ese pequeño tesoro ya está en tu inventario. Puedes seguir explorando.", o.icon);
      return;
    }
    if(o.item) collected.add(o.id);
    if(o.type==="chest") opened.add(o.id);
    showModal(o.type==="house"?"LUGAR SECRETO":"DESCUBRIMIENTO", o.title, o.text, o.icon);
    save();
    if(o.type==="house") {
      // The house is the ending, but the world remains explorable.
      if(objects.filter(x=>x.item).every(x=>collected.has(x.id))) {
        modalText.textContent += "\n\nMisión completada: encontraste todos los tesoros. ♡";
      } else {
        modalText.textContent += "\n\nTodavía quedan tesoros por descubrir por el mapa.";
      }
    }
  }
  function showModal(eyebrow,title,text,icon) {
    modalEyebrow.textContent=eyebrow;
    modalTitle.textContent=title;
    modalText.textContent=text;
    modalIcon.textContent=icon||"▣";
    modal.hidden=false;
  }
  function closeModal() { modal.hidden=true; }
  function save() {
    try {
      localStorage.setItem("poporopo-save-v1", JSON.stringify({
        player:{x:player.x,y:player.y}, collected:[...collected], opened:[...opened]
      }));
      document.getElementById("saveStatus").textContent="Progreso guardado en este dispositivo";
    } catch(e) {
      document.getElementById("saveStatus").textContent="El navegador no permite guardar el progreso";
    }
  }
  function load() {
    try {
      const data=JSON.parse(localStorage.getItem("poporopo-save-v1")||"null");
      if(data) {
        if(data.player && Number.isFinite(data.player.x) && Number.isFinite(data.player.y)) player={...player,...data.player};
        (data.collected||[]).forEach(id=>collected.add(id));
        (data.opened||[]).forEach(id=>opened.add(id));
      }
    } catch(e) {}
  }
  function reset() {
    if(!confirm("¿Quieres reiniciar la aventura y borrar los tesoros encontrados en este dispositivo?")) return;
    localStorage.removeItem("poporopo-save-v1");
    collected.clear(); opened.clear(); player={x:4.5,y:4.5,faceX:0,faceY:1,walk:0};
    closeModal(); showToast("Mundo reiniciado"); save();
  }
  function walk(dx,dy,dt) {
    if(dx===0&&dy===0) return;
    const speed=3.6*dt;
    const nx=Math.max(1.3,Math.min(COLS-1.3,player.x+dx*speed));
    const ny=Math.max(1.3,Math.min(ROWS-1.3,player.y+dy*speed));
    const canWalk=(x,y)=>world[Math.floor(y)]?.[Math.floor(x)]!=="water";
    if(canWalk(nx,player.y)) player.x=nx;
    if(canWalk(player.x,ny)) player.y=ny;
    player.faceX=dx; player.faceY=dy; player.walk+=dt*10;
  }
  function loop(timestamp) {
    const dt=Math.min((timestamp-lastTime)/1000||0,0.04); lastTime=timestamp;
    let dx=0,dy=0;
    if(keys.has("ArrowLeft")||keys.has("a")||mobileDir==="left") dx--;
    if(keys.has("ArrowRight")||keys.has("d")||mobileDir==="right") dx++;
    if(keys.has("ArrowUp")||keys.has("w")||mobileDir==="up") dy--;
    if(keys.has("ArrowDown")||keys.has("s")||mobileDir==="down") dy++;
    if(dx&&dy) { dx*=.707; dy*=.707; }
    walk(dx,dy,dt);
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", e => {
    const k=e.key.length===1?e.key.toLowerCase():e.key;
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(k)) e.preventDefault();
    if(k==="e"||k==="Enter") { interact(); return; }
    if(k==="Escape") { closeModal(); return; }
    keys.add(k);
  });
  window.addEventListener("keyup", e => keys.delete(e.key.length===1?e.key.toLowerCase():e.key));
  window.addEventListener("blur",()=>keys.clear());
  document.querySelectorAll("[data-dir]").forEach(btn=>{
    const start=e=>{e.preventDefault();mobileDir=btn.dataset.dir;};
    const stop=e=>{e.preventDefault();if(mobileDir===btn.dataset.dir)mobileDir=null;};
    btn.addEventListener("pointerdown",start);
    btn.addEventListener("pointerup",stop);
    btn.addEventListener("pointerleave",stop);
    btn.addEventListener("pointercancel",stop);
  });
  actionBtn.addEventListener("click",interact);
  mobileAction.addEventListener("click",interact);
  document.getElementById("closeModal").addEventListener("click",closeModal);
  document.getElementById("modalContinue").addEventListener("click",closeModal);
  modal.addEventListener("click",e=>{if(e.target===modal)closeModal();});
  document.getElementById("resetBtn").addEventListener("click",reset);
  window.addEventListener("resize",resize);

  makeWorld(); load(); resize(); requestAnimationFrame(loop);
})();