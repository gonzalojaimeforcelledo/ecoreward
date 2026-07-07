(function(){
  "use strict";

  var STORAGE_KEY = "ecoreward:v2";

  var WASTE_TYPES = [
    { id:"organico",   name:"Orgánicos",   emoji:"🟫", ptsPerKg:5,  color:"organico" },
    { id:"reciclable", name:"Reciclables", emoji:"🟩", ptsPerKg:12, color:"reciclable" },
    { id:"general",    name:"General",     emoji:"⬛", ptsPerKg:2,  color:"general" }
  ];

  var DAYS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  var DAY_NAMES = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

  var REWARDS = [
    { id:"yape10",   name:"Recarga Yape S/ 10",           emoji:"📱", cost:1000, cash:10 },
    { id:"yape20",   name:"Recarga Yape S/ 20",           emoji:"📱", cost:2000, cash:20 },
    { id:"vale15",   name:"Vale de descuento S/ 15",       emoji:"🧾", cost:1200, cash:15 },
    { id:"tree",     name:"Plantar un árbol en tu nombre", emoji:"🌳", cost:800,  cash:0  },
    { id:"kit",      name:"Kit de reciclaje (bolsas + guantes)", emoji:"🧤", cost:600, cash:0 }
  ];

  var STAGES = [
    { min:0,    emoji:"🌱", name:"Semilla" },
    { min:500,  emoji:"🌿", name:"Brote" },
    { min:1500, emoji:"🪴", name:"Plantón" },
    { min:3000, emoji:"🌳", name:"Árbol" },
    { min:5000, emoji:"🌲", name:"Bosque propio" }
  ];

  function defaultSchedule(){
    // day index 0=Lun ... 6=Dom
    var sched = {};
    DAYS.forEach(function(_, i){
      sched[i] = { organico: (i===0||i===2||i===5), reciclable: (i===1||i===4), general: (i===3) };
    });
    return sched;
  }

  function defaultUserState(name){
    return {
      name: name,
      points: 0,
      totalKg: 0,
      totalCashRedeemed: 0,
      schedule: defaultSchedule(),
      log: [],       // {id, typeId, kg, pts, date}
      redemptions: [] // {id, rewardId, cost, date}
    };
  }

  // Nota: este es un hash simple solo para no guardar la contraseña en texto
  // plano dentro de localStorage. No es criptográficamente seguro: todo vive
  // en el navegador del propio usuario, así que no reemplaza una autenticación
  // real de servidor.
  function hashPassword(pw){
    var h = 0;
    var str = "eco::" + pw + "::reward";
    for(var i=0;i<str.length;i++){
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return "h" + h;
  }

  function normalizeId(id){
    return (id || "").trim().toLowerCase();
  }

  function defaultRoot(){
    return { session: null, users: {} };
  }

  function loadRoot(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return defaultRoot();
      var parsed = JSON.parse(raw);
      return Object.assign(defaultRoot(), parsed);
    }catch(e){
      console.error("Error leyendo EcoReward:", e);
      return defaultRoot();
    }
  }

  function saveRoot(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
    }catch(e){
      console.error("Error guardando EcoReward:", e);
      showToast("No se pudo guardar. Revisa el espacio disponible.");
    }
  }

  // Escribe el estado en memoria de vuelta al usuario activo y persiste todo.
  function save(){
    if(currentUserKey && root.users[currentUserKey]){
      root.users[currentUserKey].data = state;
    }
    saveRoot();
  }

  var root = loadRoot();
  var currentUserKey = null;
  var state = null;
  var selectedTypeId = "reciclable";
  var qty = 1;
  var selectedDay = new Date().getDay(); // 0=Sun..6=Sat (JS)
  // convert to our Mon-first index
  selectedDay = (selectedDay + 6) % 7;

  /* ---------------- Auth: login / registro ---------------- */
  var onboardEl = document.getElementById("onboard");
  var tabLogin = document.getElementById("tabLogin");
  var tabRegister = document.getElementById("tabRegister");
  var formLogin = document.getElementById("formLogin");
  var formRegister = document.getElementById("formRegister");
  var loginError = document.getElementById("loginError");
  var registerError = document.getElementById("registerError");

  function switchAuthTab(tab){
    tabLogin.classList.toggle("active", tab === "login");
    tabRegister.classList.toggle("active", tab === "register");
    formLogin.classList.toggle("active", tab === "login");
    formRegister.classList.toggle("active", tab === "register");
    loginError.textContent = "";
    registerError.textContent = "";
  }
  tabLogin.addEventListener("click", function(){ switchAuthTab("login"); });
  tabRegister.addEventListener("click", function(){ switchAuthTab("register"); });

  function startSession(key){
    currentUserKey = key;
    state = root.users[key].data;
    root.session = key;
    saveRoot();
    onboardEl.style.display = "none";
    renderAll();
  }

  formLogin.addEventListener("submit", function(e){
    e.preventDefault();
    var id = normalizeId(document.getElementById("loginId").value);
    var pw = document.getElementById("loginPw").value;
    loginError.textContent = "";
    if(!id || !pw){ loginError.textContent = "Completa usuario y contraseña."; return; }
    var user = root.users[id];
    if(!user || user.passwordHash !== hashPassword(pw)){
      loginError.textContent = "Usuario o contraseña incorrectos.";
      return;
    }
    startSession(id);
  });

  formRegister.addEventListener("submit", function(e){
    e.preventDefault();
    var name = document.getElementById("regName").value.trim();
    var id = normalizeId(document.getElementById("regId").value);
    var pw = document.getElementById("regPw").value;
    var pw2 = document.getElementById("regPw2").value;
    registerError.textContent = "";
    if(!name || !id || !pw || !pw2){ registerError.textContent = "Completa todos los campos."; return; }
    if(pw.length < 4){ registerError.textContent = "La contraseña debe tener al menos 4 caracteres."; return; }
    if(pw !== pw2){ registerError.textContent = "Las contraseñas no coinciden."; return; }
    if(root.users[id]){ registerError.textContent = "Ese usuario o correo ya está registrado."; return; }
    root.users[id] = {
      passwordHash: hashPassword(pw),
      data: defaultUserState(name)
    };
    startSession(id);
  });

  function getRequestedTab(){
    try{
      var params = new URLSearchParams(window.location.search);
      var t = params.get("tab");
      return t === "register" ? "register" : "login";
    }catch(e){
      return "login";
    }
  }

  function showAuthScreen(){
    formLogin.reset();
    formRegister.reset();
    loginError.textContent = "";
    registerError.textContent = "";
    onboardEl.style.display = "flex";
    switchAuthTab(getRequestedTab());
  }

  /* ---------------- User menu / logout ---------------- */
  var greetingBtn = document.getElementById("greetingBtn");
  var userMenu = document.getElementById("userMenu");
  greetingBtn.addEventListener("click", function(e){
    e.stopPropagation();
    userMenu.classList.toggle("open");
  });
  document.addEventListener("click", function(e){
    if(!userMenu.contains(e.target) && e.target !== greetingBtn){
      userMenu.classList.remove("open");
    }
  });
  document.getElementById("logoutBtn").addEventListener("click", function(){
    save();
    currentUserKey = null;
    state = null;
    root.session = null;
    saveRoot();
    userMenu.classList.remove("open");
    showAuthScreen();
  });

  // Restaurar sesión si ya había un usuario logueado
  if(root.session && root.users[root.session]){
    currentUserKey = root.session;
    state = root.users[currentUserKey].data;
    onboardEl.style.display = "none";
  }else{
    showAuthScreen();
  }

  /* ---------------- Navigation ---------------- */
  var navBtns = document.querySelectorAll(".nav-btn");
  var views = document.querySelectorAll(".view");

  function goto(viewName){
    views.forEach(function(v){ v.classList.toggle("active", v.id === "view-" + viewName); });
    navBtns.forEach(function(b){ b.classList.toggle("active", b.dataset.view === viewName); });
    window.scrollTo({top:0, behavior:"smooth"});
  }
  navBtns.forEach(function(b){
    b.addEventListener("click", function(){ goto(b.dataset.view); });
  });
  document.querySelectorAll("[data-goto]").forEach(function(b){
    b.addEventListener("click", function(){ goto(b.dataset.goto); });
  });

  /* ---------------- Toast ---------------- */
  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  function showToast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove("show"); }, 2600);
  }

  /* ---------------- Render: header ---------------- */
  function renderHeader(){
    if(!state) return;
    document.getElementById("greetingText").textContent = "Hola, " + (state.name || "vecino") + " ▾";
    document.getElementById("userMenuName").textContent = state.name || "Mi cuenta";
    document.getElementById("chipPoints").textContent = state.points.toLocaleString("es-PE");
  }

  /* ---------------- Render: Inicio ---------------- */
  var RING_CIRC = 2 * Math.PI * 78;

  function getStage(points){
    var current = STAGES[0];
    var next = null;
    for(var i=0;i<STAGES.length;i++){
      if(points >= STAGES[i].min){ current = STAGES[i]; next = STAGES[i+1] || null; }
    }
    return { current: current, next: next };
  }

  function renderInicio(){
    var pts = state.points;
    var stageInfo = getStage(pts);
    document.getElementById("ringPoints").textContent = pts.toLocaleString("es-PE");
    document.getElementById("stageEmoji").textContent = stageInfo.current.emoji;
    document.getElementById("stageName").textContent = stageInfo.current.name;

    var progressRatio;
    if(stageInfo.next){
      var span = stageInfo.next.min - stageInfo.current.min;
      var into = pts - stageInfo.current.min;
      progressRatio = Math.max(0, Math.min(1, into / span));
      document.getElementById("stageNext").textContent =
        "Faltan " + (stageInfo.next.min - pts).toLocaleString("es-PE") + " pts para " + stageInfo.next.name.toLowerCase();
    } else {
      progressRatio = 1;
      document.getElementById("stageNext").textContent = "¡Nivel máximo alcanzado! 🎉";
    }
    var ring = document.getElementById("ringProgress");
    var offset = RING_CIRC * (1 - progressRatio);
    ring.setAttribute("stroke-dasharray", RING_CIRC);
    ring.style.strokeDashoffset = offset;

    // next pickup
    var todayIdx = (new Date().getDay() + 6) % 7;
    var found = null;
    for(var off=0; off<7 && !found; off++){
      var idx = (todayIdx + off) % 7;
      var day = state.schedule[idx];
      var active = WASTE_TYPES.filter(function(t){ return day[t.id]; });
      if(active.length){ found = { idx: idx, off: off, types: active }; }
    }
    var npDay = document.getElementById("npDay");
    var npDetail = document.getElementById("npDetail");
    if(found){
      var label = found.off === 0 ? "Hoy" : (found.off === 1 ? "Mañana" : DAY_NAMES[found.idx]);
      npDay.textContent = label + " · " + found.types.map(function(t){return t.name;}).join(", ");
      npDetail.textContent = "Activa notificaciones para no olvidarlo";
    } else {
      npDay.textContent = "Sin recojos activados";
      npDetail.textContent = "Activa un horario en la pestaña Horarios";
    }

    // impact
    document.getElementById("impactKg").textContent = state.totalKg.toFixed(1).replace(".0","") + " kg";
    document.getElementById("impactEntregas").textContent = state.log.length;
    document.getElementById("impactCanjes").textContent = "S/ " + state.totalCashRedeemed;
  }

  /* ---------------- Render: Horarios ---------------- */
  function renderDayStrip(){
    var strip = document.getElementById("dayStrip");
    strip.innerHTML = "";
    DAYS.forEach(function(d, i){
      var day = state.schedule[i];
      var hasPickup = WASTE_TYPES.some(function(t){ return day[t.id]; });
      var pill = document.createElement("div");
      pill.className = "day-pill" + (hasPickup ? " has-pickup" : "") + (i === selectedDay ? " active" : "");
      pill.innerHTML = '<span class="d-name">' + d + '</span><span class="d-dot"></span>';
      pill.addEventListener("click", function(){ selectedDay = i; renderDayStrip(); renderWasteRows(); });
      strip.appendChild(pill);
    });
  }

  function renderWasteRows(){
    var wrap = document.getElementById("wasteRows");
    wrap.innerHTML = "";
    var day = state.schedule[selectedDay];
    WASTE_TYPES.forEach(function(t){
      var row = document.createElement("div");
      row.className = "waste-row";
      var checked = !!day[t.id];
      row.innerHTML =
        '<div class="waste-icon ' + t.color + '">' + t.emoji + '</div>' +
        '<div><div class="waste-name">' + t.name + '</div>' +
        '<div class="waste-time">' + (checked ? "Recojo activado" : "Sin recojo este día") + '</div></div>' +
        '<label class="switch waste-toggle"><input type="checkbox" ' + (checked ? "checked" : "") + ' data-type="' + t.id + '"><span class="slider"></span></label>';
      wrap.appendChild(row);
    });
    wrap.querySelectorAll("input[type=checkbox]").forEach(function(cb){
      cb.addEventListener("change", function(){
        state.schedule[selectedDay][cb.dataset.type] = cb.checked;
        save();
        renderDayStrip();
        renderWasteRows();
        renderInicio();
      });
    });
  }

  /* ---------------- Render: Reciclar ---------------- */
  function renderTypeGrid(){
    var grid = document.getElementById("typeGrid");
    grid.innerHTML = "";
    WASTE_TYPES.forEach(function(t){
      var card = document.createElement("div");
      card.className = "type-card" + (t.id === selectedTypeId ? " selected" : "");
      card.innerHTML =
        '<span class="t-emoji">' + t.emoji + '</span>' +
        '<span class="t-name">' + t.name + '</span>' +
        '<div class="t-pts">+' + t.ptsPerKg + ' pts/kg</div>';
      card.addEventListener("click", function(){ selectedTypeId = t.id; renderTypeGrid(); });
      grid.appendChild(card);
    });
  }

  document.getElementById("qtyMinus").addEventListener("click", function(){
    qty = Math.max(1, qty - 1);
    document.getElementById("qtyValue").textContent = qty;
  });
  document.getElementById("qtyPlus").addEventListener("click", function(){
    qty = Math.min(50, qty + 1);
    document.getElementById("qtyValue").textContent = qty;
  });

  var scanOverlay = document.getElementById("scanOverlay");
  document.getElementById("scanBtn").addEventListener("click", function(){
    scanOverlay.classList.add("active");
    setTimeout(function(){
      scanOverlay.classList.remove("active");
      registerEntry();
    }, 1500);
  });

  function registerEntry(){
    var type = WASTE_TYPES.find(function(t){ return t.id === selectedTypeId; });
    var pts = Math.round(type.ptsPerKg * qty);
    state.points += pts;
    state.totalKg += qty;
    state.log.unshift({
      id: Date.now(),
      typeId: type.id,
      kg: qty,
      pts: pts,
      date: new Date().toISOString()
    });
    save();
    renderHeader();
    renderInicio();
    renderLog();
    showToast("¡Listo! Ganaste +" + pts + " puntos por " + qty + " kg de " + type.name.toLowerCase() + ".");
    qty = 1;
    document.getElementById("qtyValue").textContent = qty;
  }

  function formatDate(iso){
    var d = new Date(iso);
    return d.toLocaleDateString("es-PE", { day:"2-digit", month:"short" }) + " · " +
           d.toLocaleTimeString("es-PE", { hour:"2-digit", minute:"2-digit" });
  }

  function renderLog(){
    var list = document.getElementById("logList");
    var empty = document.getElementById("logEmpty");
    list.innerHTML = "";
    if(state.log.length === 0){ empty.style.display = "block"; return; }
    empty.style.display = "none";
    state.log.slice(0, 20).forEach(function(entry){
      var type = WASTE_TYPES.find(function(t){ return t.id === entry.typeId; }) || WASTE_TYPES[0];
      var item = document.createElement("div");
      item.className = "log-item";
      item.innerHTML =
        '<div class="log-emoji">' + type.emoji + '</div>' +
        '<div><div class="log-title">' + entry.kg + ' kg · ' + type.name + '</div>' +
        '<div class="log-date">' + formatDate(entry.date) + '</div></div>' +
        '<div class="log-pts">+' + entry.pts + '</div>';
      list.appendChild(item);
    });
  }

  /* ---------------- Render: Recompensas ---------------- */
  function renderRewards(){
    document.getElementById("bannerPoints").textContent = state.points.toLocaleString("es-PE");
    var list = document.getElementById("rewardsList");
    list.innerHTML = "";
    REWARDS.forEach(function(r){
      var can = state.points >= r.cost;
      var card = document.createElement("div");
      card.className = "card reward-card";
      card.innerHTML =
        '<div class="reward-emoji">' + r.emoji + '</div>' +
        '<div><div class="reward-name">' + r.name + '</div>' +
        '<div class="reward-cost">' + r.cost.toLocaleString("es-PE") + ' pts</div></div>' +
        '<button class="redeem-btn" ' + (can ? "" : "disabled") + '>Canjear</button>';
      card.querySelector(".redeem-btn").addEventListener("click", function(){ openRedeemConfirm(r); });
      list.appendChild(card);
    });
  }

  var confirmOverlay = document.getElementById("confirmOverlay");
  var pendingReward = null;

  function openRedeemConfirm(reward){
    if(state.points < reward.cost) return;
    pendingReward = reward;
    document.getElementById("confirmEmoji").textContent = reward.emoji;
    document.getElementById("confirmTitle").textContent = "¿Canjear " + reward.name + "?";
    document.getElementById("confirmText").textContent =
      "Se descontarán " + reward.cost.toLocaleString("es-PE") + " puntos de tu saldo. Esta acción no se puede deshacer.";
    document.getElementById("confirmBalance").textContent =
      "Saldo actual: " + state.points.toLocaleString("es-PE") + " pts → " +
      (state.points - reward.cost).toLocaleString("es-PE") + " pts";
    confirmOverlay.classList.add("active");
  }

  function closeRedeemConfirm(){
    confirmOverlay.classList.remove("active");
    pendingReward = null;
  }

  document.getElementById("confirmCancel").addEventListener("click", closeRedeemConfirm);
  confirmOverlay.addEventListener("click", function(e){
    if(e.target === confirmOverlay) closeRedeemConfirm();
  });
  document.getElementById("confirmAccept").addEventListener("click", function(){
    if(pendingReward) redeem(pendingReward);
    closeRedeemConfirm();
  });

  function redeem(reward){
    if(state.points < reward.cost) return;
    state.points -= reward.cost;
    state.totalCashRedeemed += reward.cash || 0;
    state.redemptions.unshift({
      id: Date.now(),
      rewardId: reward.id,
      cost: reward.cost,
      date: new Date().toISOString()
    });
    save();
    renderHeader();
    renderInicio();
    renderRewards();
    renderRedeemList();
    showToast("¡Canjeaste " + reward.name + "! Ya puedes ver el detalle en tu historial.");
  }

  function renderRedeemList(){
    var list = document.getElementById("redeemList");
    var empty = document.getElementById("redeemEmpty");
    list.innerHTML = "";
    if(state.redemptions.length === 0){ empty.style.display = "block"; return; }
    empty.style.display = "none";
    state.redemptions.slice(0, 20).forEach(function(entry){
      var reward = REWARDS.find(function(r){ return r.id === entry.rewardId; });
      if(!reward) return;
      var item = document.createElement("div");
      item.className = "log-item";
      item.innerHTML =
        '<div class="log-emoji">' + reward.emoji + '</div>' +
        '<div><div class="log-title">' + reward.name + '</div>' +
        '<div class="log-date">' + formatDate(entry.date) + '</div></div>' +
        '<div class="log-pts" style="color:#C1502E;">−' + entry.cost + '</div>';
      list.appendChild(item);
    });
  }

  /* ---------------- Render all ---------------- */
  function renderAll(){
    renderHeader();
    renderInicio();
    renderDayStrip();
    renderWasteRows();
    renderTypeGrid();
    renderLog();
    renderRewards();
    renderRedeemList();
  }

  if(state){ renderAll(); }

})();
