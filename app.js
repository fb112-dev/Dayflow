// ---------- Storage ----------
const STORE_KEY = "myroutine.data.v1";

function loadData() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || { tasks: {}, routines: {} };
  } catch {
    return { tasks: {}, routines: {} };
  }
}
function saveData() {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}
let data = loadData();

// ---------- Presets (saved reusable tasks / routine parts) ----------
const PRESETS_KEY = "dayflow.presets.v1";
function loadPresets() {
  try {
    const p = JSON.parse(localStorage.getItem(PRESETS_KEY));
    return { tasks: p?.tasks || [], routines: p?.routines || [] };
  } catch {
    return { tasks: [], routines: [] };
  }
}
function savePresets() { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); }
let presets = loadPresets();
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ---------- Date / time helpers ----------
function isoDate(d = new Date()) {
  // Local YYYY-MM-DD (avoids UTC shift from toISOString)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function to12h(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
function minutesOf(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}
function sortedRoutine(iso) {
  return (data.routines[iso] || []).slice().sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
}
// Returns the first routine entry that overlaps [start, end), or null.
// excludeId lets an entry being edited skip comparing against itself.
function findOverlap(iso, start, end, excludeId) {
  const s = minutesOf(start), e = minutesOf(end);
  return (data.routines[iso] || []).find((r) =>
    r.id !== excludeId && s < minutesOf(r.end) && minutesOf(r.start) < e
  ) || null;
}

// ---------- Navigation ----------
const navItems = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");
navItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    navItems.forEach((b) => b.classList.remove("active"));
    views.forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.view).classList.add("active");
    if (btn.dataset.view === "home") renderHome();
    if (btn.dataset.view === "create") renderCreate();
    if (btn.dataset.view === "calendar") renderCalendar();
  });
});

// ---------- Theme ----------
const themeToggle = document.getElementById("theme-toggle");
const themeLabel = themeToggle.querySelector(".theme-label");
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeLabel.textContent = theme === "dark" ? "Light mode" : "Dark mode";
  localStorage.setItem("myroutine.theme", theme);
}
applyTheme(localStorage.getItem("myroutine.theme") || "light");
themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
});

// ---------- HOME ----------
function renderHome() {
  const today = isoDate();
  const routine = sortedRoutine(today);
  const tasks = data.tasks[today] || [];

  // Routine list
  const rEl = document.getElementById("home-routine");
  if (routine.length === 0) {
    rEl.innerHTML = `<div class="empty">(No routine today)</div>`;
  } else {
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    rEl.innerHTML = routine.map((r) => {
      const current = nowMin >= minutesOf(r.start) && nowMin < minutesOf(r.end);
      return `<div class="item ${current ? "current" : ""}">
        <span class="time">${to12h(r.start)} – ${to12h(r.end)}</span>
        <span class="name">${escapeHtml(r.name)}</span>
      </div>`;
    }).join("");
  }

  // Tasks list
  renderTaskList(document.getElementById("home-tasks"), today, tasks);

  updateNowCard();
}

function updateNowCard() {
  const today = isoDate();
  const routine = sortedRoutine(today);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  const activityEl = document.getElementById("now-activity");
  const metaEl = document.getElementById("now-meta");
  const fillEl = document.getElementById("now-bar-fill");

  const current = routine.find((r) => nowMin >= minutesOf(r.start) && nowMin < minutesOf(r.end));
  if (current) {
    const start = minutesOf(current.start), end = minutesOf(current.end);
    const left = Math.ceil(end - nowMin);
    const pct = ((nowMin - start) / (end - start)) * 100;
    activityEl.textContent = current.name;
    metaEl.textContent = `${to12h(current.start)} – ${to12h(current.end)} · ${left} min left`;
    fillEl.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  } else {
    const next = routine.find((r) => minutesOf(r.start) > nowMin);
    activityEl.textContent = "Nothing scheduled";
    metaEl.textContent = next ? `Next: ${escapeHtml(next.name)} at ${to12h(next.start)}` : "";
    fillEl.style.width = "0%";
  }
}

// ---------- Task list rendering (shared) ----------
function renderTaskList(container, iso, tasks, { checkable = true } = {}) {
  if (!tasks || tasks.length === 0) {
    container.innerHTML = `<div class="empty">No tasks yet</div>`;
    return;
  }
  container.innerHTML = tasks.map((t, i) => `
    <div class="item" data-i="${i}">
      <input type="checkbox" class="check" data-i="${i}" ${t.done ? "checked" : ""} ${checkable ? "" : "disabled"} />
      <span class="name ${t.done ? "done" : ""}">${escapeHtml(t.name)}</span>
      ${t.length ? `<span class="time">${t.length} min</span>` : ""}
      <button class="edit" data-i="${i}" title="Edit">✎</button>
      <button class="del" data-i="${i}" title="Delete">×</button>
    </div>`).join("");

  if (checkable) {
    container.querySelectorAll(".check").forEach((cb) => {
      cb.addEventListener("change", () => {
        data.tasks[iso][cb.dataset.i].done = cb.checked;
        saveData();
        refreshCurrentView();
      });
    });
  }
  container.querySelectorAll(".edit").forEach((btn) => {
    btn.addEventListener("click", () => startTaskEdit(container, iso, Number(btn.dataset.i)));
  });
  container.querySelectorAll(".del").forEach((btn) => {
    btn.addEventListener("click", () => {
      data.tasks[iso].splice(Number(btn.dataset.i), 1);
      if (data.tasks[iso].length === 0) delete data.tasks[iso];
      saveData();
      refreshCurrentView();
    });
  });
}

function startTaskEdit(container, iso, i) {
  const t = data.tasks[iso][i];
  const row = container.querySelector(`.item[data-i="${i}"]`);
  row.classList.add("editing");
  row.innerHTML = `
    <input type="text" class="edit-name" value="${escapeHtml(t.name)}" />
    <input type="number" class="edit-length" min="1" placeholder="length" value="${t.length ?? ""}" />
    <span class="unit">min</span>
    <button class="save">Save</button>
    <button class="cancel">Cancel</button>
    <span class="edit-err" hidden></span>`;
  row.querySelector(".save").addEventListener("click", () => {
    const name = row.querySelector(".edit-name").value.trim();
    if (!name) return showEditErr(row, "Enter a name.");
    const lenRaw = row.querySelector(".edit-length").value.trim();
    const length = lenRaw === "" ? null : Number(lenRaw);
    if (length !== null && (!Number.isFinite(length) || length <= 0))
      return showEditErr(row, "Length must be a positive number.");
    t.name = name;
    t.length = length;
    saveData();
    refreshCurrentView();
  });
  row.querySelector(".cancel").addEventListener("click", refreshCurrentView);
}

function renderRoutineList(container, iso, { deletable } = {}) {
  const routine = sortedRoutine(iso);
  if (routine.length === 0) {
    container.innerHTML = `<div class="empty">(No routine)</div>`;
    return;
  }
  container.innerHTML = routine.map((r) => `
    <div class="item" data-id="${r.id}">
      <span class="time">${to12h(r.start)} – ${to12h(r.end)}</span>
      <span class="name">${escapeHtml(r.name)}</span>
      <button class="edit" data-id="${r.id}" title="Edit">✎</button>
      ${deletable ? `<button class="del" data-id="${r.id}" title="Delete">×</button>` : ""}
    </div>`).join("");

  container.querySelectorAll(".edit").forEach((btn) => {
    btn.addEventListener("click", () => startRoutineEdit(container, iso, btn.dataset.id));
  });
  if (deletable) {
    container.querySelectorAll(".del").forEach((btn) => {
      btn.addEventListener("click", () => {
        data.routines[iso] = data.routines[iso].filter((x) => x.id !== btn.dataset.id);
        if (data.routines[iso].length === 0) delete data.routines[iso];
        saveData();
        refreshCurrentView();
      });
    });
  }
}

function startRoutineEdit(container, iso, id) {
  const r = (data.routines[iso] || []).find((x) => x.id === id);
  if (!r) return;
  const row = container.querySelector(`.item[data-id="${id}"]`);
  row.classList.add("editing");
  row.innerHTML = `
    <input type="text" class="edit-name" value="${escapeHtml(r.name)}" />
    <input type="time" class="edit-start" value="${r.start}" />
    <input type="time" class="edit-end" value="${r.end}" />
    <button class="save">Save</button>
    <button class="cancel">Cancel</button>
    <span class="edit-err" hidden></span>`;
  row.querySelector(".save").addEventListener("click", () => {
    const name = row.querySelector(".edit-name").value.trim();
    const start = row.querySelector(".edit-start").value;
    const end = row.querySelector(".edit-end").value;
    if (!name) return showEditErr(row, "Enter a name.");
    if (!start || !end) return showEditErr(row, "Set start and end times.");
    if (minutesOf(end) <= minutesOf(start)) return showEditErr(row, "End must be after start.");
    const clash = findOverlap(iso, start, end, r.id);
    if (clash) return showEditErr(row, `Overlaps with "${clash.name}" (${to12h(clash.start)} – ${to12h(clash.end)}).`);
    r.name = name;
    r.start = start;
    r.end = end;
    saveData();
    refreshCurrentView();
  });
  row.querySelector(".cancel").addEventListener("click", refreshCurrentView);
}

function showEditErr(row, msg) {
  const el = row.querySelector(".edit-err");
  el.textContent = msg;
  el.hidden = false;
}

// ---------- CREATE ----------
const entryType = document.getElementById("entry-type");
const entryDate = document.getElementById("entry-date");
const entryName = document.getElementById("entry-name");
const entryStart = document.getElementById("entry-start");
const entryEnd = document.getElementById("entry-end");
const entryLength = document.getElementById("entry-length");
const timeFields = document.getElementById("time-fields");
const lengthField = document.getElementById("length-field");
const createError = document.getElementById("create-error");

function updateFieldVisibility() {
  const isRoutine = entryType.value === "routine";
  timeFields.hidden = !isRoutine;
  lengthField.hidden = isRoutine;
}

function renderCreate() {
  if (!entryDate.value) entryDate.value = isoDate();
  updateFieldVisibility();
  document.getElementById("create-list-title").textContent = "Routine for this day";
  renderRoutineList(document.getElementById("create-routine"), entryDate.value, { deletable: true });
  renderTaskList(document.getElementById("create-tasks"), entryDate.value, data.tasks[entryDate.value] || []);
}

entryType.addEventListener("change", () => { updateFieldVisibility(); closePresetMenu(); });
entryDate.addEventListener("change", renderCreate);

// Preset picker
const presetBtn = document.getElementById("preset-btn");
const presetMenu = document.getElementById("preset-menu");

function renderPresetMenu() {
  const isRoutine = entryType.value === "routine";
  const list = isRoutine ? presets.routines : presets.tasks;
  if (list.length === 0) {
    presetMenu.innerHTML = `<div class="preset-empty">No ${isRoutine ? "routine" : "task"} presets yet.<br>Add some in Settings.</div>`;
    return;
  }
  presetMenu.innerHTML = list.map((p) => {
    let sub = "";
    if (isRoutine && p.start && p.end) sub = `${to12h(p.start)} – ${to12h(p.end)}`;
    else if (!isRoutine && p.length) sub = `${p.length} min`;
    return `<button type="button" data-id="${p.id}">${escapeHtml(p.name)}${sub ? `<div class="preset-sub">${sub}</div>` : ""}</button>`;
  }).join("");
  presetMenu.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => applyPreset(b.dataset.id))
  );
}

function applyPreset(id) {
  const isRoutine = entryType.value === "routine";
  const p = (isRoutine ? presets.routines : presets.tasks).find((x) => x.id === id);
  if (!p) return;
  entryName.value = p.name;
  if (isRoutine) {
    if (p.start) entryStart.value = p.start;
    if (p.end) entryEnd.value = p.end;
  } else {
    entryLength.value = p.length ?? "";
  }
  closePresetMenu();
  entryName.focus();
}

function openPresetMenu() { renderPresetMenu(); presetMenu.hidden = false; }
function closePresetMenu() { presetMenu.hidden = true; }

presetBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  presetMenu.hidden ? openPresetMenu() : closePresetMenu();
});
document.addEventListener("click", (e) => {
  if (!presetMenu.hidden && !presetMenu.contains(e.target) && e.target !== presetBtn) closePresetMenu();
});

function showError(msg) {
  createError.textContent = msg;
  createError.hidden = false;
  setTimeout(() => { createError.hidden = true; }, 3000);
}

document.getElementById("entry-add").addEventListener("click", () => {
  const iso = entryDate.value || isoDate();
  const name = entryName.value.trim();
  if (!name) return showError("Please enter a name.");

  if (entryType.value === "task") {
    const lenRaw = entryLength.value.trim();
    const length = lenRaw === "" ? null : Number(lenRaw);
    if (length !== null && (!Number.isFinite(length) || length <= 0)) return showError("Length must be a positive number of minutes.");
    (data.tasks[iso] ||= []).push({ name, done: false, length });
  } else {
    if (!entryStart.value || !entryEnd.value) return showError("Please set start and end times.");
    if (minutesOf(entryEnd.value) <= minutesOf(entryStart.value)) return showError("End time must be after start time.");
    const clash = findOverlap(iso, entryStart.value, entryEnd.value);
    if (clash) return showError(`Overlaps with "${clash.name}" (${to12h(clash.start)} – ${to12h(clash.end)}).`);
    (data.routines[iso] ||= []).push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name, start: entryStart.value, end: entryEnd.value,
    });
  }
  saveData();
  entryName.value = "";
  entryStart.value = "";
  entryEnd.value = "";
  entryLength.value = "";
  renderCreate();
});

// ---------- CALENDAR ----------
let calYear, calMonth; // month is 0-based
function initCalendar() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
}
initCalendar();

document.getElementById("cal-prev").addEventListener("click", () => {
  calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar();
});
document.getElementById("cal-next").addEventListener("click", () => {
  calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar();
});

function renderCalendar() {
  const monthName = new Date(calYear, calMonth, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  document.getElementById("cal-month").textContent = monthName;

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayIso = isoDate();
  const grid = document.getElementById("cal-grid");

  let cells = "";
  for (let i = 0; i < firstDay; i++) cells += `<div class="cal-cell empty-cell"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const hasR = (data.routines[iso] || []).length > 0;
    const hasT = (data.tasks[iso] || []).length > 0;
    cells += `<div class="cal-cell ${iso === todayIso ? "today" : ""}" data-iso="${iso}">
      <span class="num">${d}</span>
      <span class="cal-dots">
        ${hasR ? `<span class="dot r" title="Routine"></span>` : ""}
        ${hasT ? `<span class="dot t" title="Tasks"></span>` : ""}
      </span>
    </div>`;
  }
  grid.innerHTML = cells;

  grid.querySelectorAll(".cal-cell[data-iso]").forEach((cell) => {
    cell.addEventListener("click", () => showCalDetail(cell.dataset.iso));
  });
}

let calDetailIso = null;
function showCalDetail(iso) {
  calDetailIso = iso;
  renderCalDetail();
  document.getElementById("cal-detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function renderCalDetail() {
  if (!calDetailIso) return;
  const detail = document.getElementById("cal-detail");
  detail.hidden = false;
  document.getElementById("cal-detail-title").textContent = prettyDate(calDetailIso);
  renderRoutineList(document.getElementById("cal-detail-routine"), calDetailIso, { deletable: true });
  renderTaskList(document.getElementById("cal-detail-tasks"), calDetailIso, data.tasks[calDetailIso] || [], { checkable: false });
}

// ---------- Utilities ----------
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function refreshCurrentView() {
  const active = document.querySelector(".view.active").id;
  if (active === "home") renderHome();
  if (active === "create") renderCreate();
  if (active === "calendar") {
    renderCalendar();
    if (calDetailIso) renderCalDetail();
  }
}

// ---------- Live clock ----------
function tickClock() {
  const now = new Date();
  document.getElementById("clock-time").textContent = now.toLocaleTimeString(undefined, {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  document.getElementById("clock-date").textContent = now.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
  if (document.getElementById("home").classList.contains("active")) updateNowCard();
}
setInterval(tickClock, 1000);
tickClock();

// ---------- Timer ----------
const timerDisplay = document.getElementById("timer-display");
const timerMin = document.getElementById("timer-min");
const timerSec = document.getElementById("timer-sec");
const timerStartBtn = document.getElementById("timer-start");
const timerResetBtn = document.getElementById("timer-reset");

let timerRemaining = 0; // ms left
let timerEnd = 0;       // target timestamp while running
let timerRunning = false;
let timerInterval = null;

function timerConfiguredMs() {
  const m = Math.max(0, Math.min(999, Number(timerMin.value) || 0));
  const s = Math.max(0, Math.min(59, Number(timerSec.value) || 0));
  return (m * 60 + s) * 1000;
}
function fmtTimer(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function renderTimer() { timerDisplay.textContent = fmtTimer(timerRemaining); }
function updateTimerControls() {
  timerStartBtn.textContent = timerRunning ? "Pause" : "Start";
  timerMin.disabled = timerRunning;
  timerSec.disabled = timerRunning;
}
function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  updateTimerControls();
}
function tickTimer() {
  timerRemaining = timerEnd - Date.now();
  if (timerRemaining <= 0) {
    timerRemaining = 0;
    stopTimer();
    renderTimer();
    beep();
    return;
  }
  renderTimer();
}
function startTimer() {
  if (timerRemaining <= 0) timerRemaining = timerConfiguredMs();
  if (timerRemaining <= 0) return; // nothing set
  timerEnd = Date.now() + timerRemaining;
  timerRunning = true;
  timerInterval = setInterval(tickTimer, 200);
  updateTimerControls();
}
function pauseTimer() {
  timerRemaining = timerEnd - Date.now();
  stopTimer();
  renderTimer();
}
function resetTimer() {
  stopTimer();
  timerRemaining = timerConfiguredMs();
  renderTimer();
}
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    osc.start();
    osc.stop(ctx.currentTime + 0.9);
  } catch { /* audio not available */ }
}

timerStartBtn.addEventListener("click", () => { timerRunning ? pauseTimer() : startTimer(); });
timerResetBtn.addEventListener("click", resetTimer);
[timerMin, timerSec].forEach((inp) =>
  inp.addEventListener("input", () => {
    if (!timerRunning) { timerRemaining = timerConfiguredMs(); renderTimer(); }
  })
);
timerRemaining = timerConfiguredMs();
renderTimer();
updateTimerControls();

// ---------- Settings: manage presets ----------
const ptaskName = document.getElementById("ptask-name");
const ptaskLength = document.getElementById("ptask-length");
const ptaskErr = document.getElementById("ptask-err");
const ptaskList = document.getElementById("ptask-list");
const proutineName = document.getElementById("proutine-name");
const proutineStart = document.getElementById("proutine-start");
const proutineEnd = document.getElementById("proutine-end");
const proutineErr = document.getElementById("proutine-err");
const proutineList = document.getElementById("proutine-list");

function flashErr(el, msg) {
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3000);
}

function renderPresetSettings() {
  if (presets.tasks.length === 0) {
    ptaskList.innerHTML = `<div class="empty">No task presets yet</div>`;
  } else {
    ptaskList.innerHTML = presets.tasks.map((p) => `
      <div class="item">
        <span class="name">${escapeHtml(p.name)}</span>
        ${p.length ? `<span class="time">${p.length} min</span>` : ""}
        <button class="del" data-id="${p.id}" title="Delete">×</button>
      </div>`).join("");
    ptaskList.querySelectorAll(".del").forEach((b) =>
      b.addEventListener("click", () => {
        presets.tasks = presets.tasks.filter((x) => x.id !== b.dataset.id);
        savePresets();
        renderPresetSettings();
      })
    );
  }

  if (presets.routines.length === 0) {
    proutineList.innerHTML = `<div class="empty">No routine presets yet</div>`;
  } else {
    proutineList.innerHTML = presets.routines.map((p) => `
      <div class="item">
        ${p.start && p.end ? `<span class="time">${to12h(p.start)} – ${to12h(p.end)}</span>` : ""}
        <span class="name">${escapeHtml(p.name)}</span>
        <button class="del" data-id="${p.id}" title="Delete">×</button>
      </div>`).join("");
    proutineList.querySelectorAll(".del").forEach((b) =>
      b.addEventListener("click", () => {
        presets.routines = presets.routines.filter((x) => x.id !== b.dataset.id);
        savePresets();
        renderPresetSettings();
      })
    );
  }
}

document.getElementById("ptask-add").addEventListener("click", () => {
  const name = ptaskName.value.trim();
  if (!name) return flashErr(ptaskErr, "Enter a task name.");
  const lenRaw = ptaskLength.value.trim();
  const length = lenRaw === "" ? null : Number(lenRaw);
  if (length !== null && (!Number.isFinite(length) || length <= 0)) return flashErr(ptaskErr, "Length must be a positive number.");
  presets.tasks.push({ id: newId(), name, length });
  savePresets();
  ptaskName.value = "";
  ptaskLength.value = "";
  renderPresetSettings();
});

document.getElementById("proutine-add").addEventListener("click", () => {
  const name = proutineName.value.trim();
  if (!name) return flashErr(proutineErr, "Enter an activity name.");
  const start = proutineStart.value;
  const end = proutineEnd.value;
  if ((start && !end) || (!start && end)) return flashErr(proutineErr, "Set both start and end, or leave both blank.");
  if (start && end && minutesOf(end) <= minutesOf(start)) return flashErr(proutineErr, "End must be after start.");
  presets.routines.push({ id: newId(), name, start: start || null, end: end || null });
  savePresets();
  proutineName.value = "";
  proutineStart.value = "";
  proutineEnd.value = "";
  renderPresetSettings();
});

renderPresetSettings();

// ---------- Boot ----------
renderHome();
