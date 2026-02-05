const KEYS = {
  tasks: "sb_tasks",
  habits: "sb_habits",
  favorites: "sb_favorites",
  settings: "sb_settings"
};

const WEEK_LABELS = ["Sat","Sun","Mon","Tue","Wed","Thu","Fri"];
const PRIORITY_SCORE = { Low: 1, Medium: 2, High: 3 };

const state = {
  tasks: [],
  habits: [],
  favorites: [],
  settings: { theme: "light" },
  resources: [],
  ui: {
    tasks: { status: "all", category: "all", sortBy: "dueDateAsc", search: "" },
    resources: { search: "", category: "all", favOnly: "all" }
  }
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function loadState() {
  state.tasks = safeParse(localStorage.getItem(KEYS.tasks), []);
  state.habits = safeParse(localStorage.getItem(KEYS.habits), []);
  state.favorites = safeParse(localStorage.getItem(KEYS.favorites), []);
  state.settings = safeParse(localStorage.getItem(KEYS.settings), { theme: "light" });

  if (!Array.isArray(state.tasks)) state.tasks = [];
  if (!Array.isArray(state.habits)) state.habits = [];
  if (!Array.isArray(state.favorites)) state.favorites = [];
  if (!state.settings || typeof state.settings !== "object") state.settings = { theme: "light" };

  ensureHabitsWeekIntegrity();
  applyTheme(state.settings.theme);
}

function saveTasks() {
  localStorage.setItem(KEYS.tasks, JSON.stringify(state.tasks));
}

function saveHabits() {
  localStorage.setItem(KEYS.habits, JSON.stringify(state.habits));
}

function saveFavorites() {
  localStorage.setItem(KEYS.favorites, JSON.stringify(state.favorites));
}

function saveSettings() {
  localStorage.setItem(KEYS.settings, JSON.stringify(state.settings));
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function todayISO() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}

function parseISO(iso) {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function daysBetween(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / ms);
}

function startOfWeekSat(date = new Date()) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const day = d.getDay();
  const diff = (day - 6 + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function weekKey(date = new Date()) {
  return startOfWeekSat(date).toISOString().slice(0,10);
}

function ensureHabitsWeekIntegrity() {
  const currentWeek = weekKey(new Date());
  let changed = false;

  for (const h of state.habits) {
    if (!h || typeof h !== "object") continue;
    if (h.weekStart !== currentWeek) {
      h.weekStart = currentWeek;
      h.progress = [false,false,false,false,false,false,false];
      if (typeof h.streak !== "number") h.streak = 0;
      changed = true;
    }
    if (!Array.isArray(h.progress) || h.progress.length !== 7) {
      h.progress = [false,false,false,false,false,false,false];
      changed = true;
    }
    if (typeof h.goal !== "number") {
      h.goal = 3;
      changed = true;
    }
    if (typeof h.streak !== "number") {
      h.streak = 0;
      changed = true;
    }
  }

  if (changed) saveHabits();
}

function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  state.settings.theme = t;
  document.body.classList.toggle("dark", t === "dark");
  saveSettings();
}

function setYear() {
  $("#year").textContent = String(new Date().getFullYear());
}

function closeMobileNav() {
  const nav = $("#primaryNav");
  const btn = $("#menuBtn");
  nav.classList.remove("open");
  btn.setAttribute("aria-expanded", "false");
}

function openMobileNav() {
  const nav = $("#primaryNav");
  const btn = $("#menuBtn");
  nav.classList.add("open");
  btn.setAttribute("aria-expanded", "true");
}

function initMenu() {
  const btn = $("#menuBtn");
  btn.addEventListener("click", () => {
    const nav = $("#primaryNav");
    const isOpen = nav.classList.contains("open");
    if (isOpen) closeMobileNav();
    else openMobileNav();
  });

  $("#primaryNav").addEventListener("click", (e) => {
    const a = e.target.closest("a.nav-link");
    if (!a) return;
    closeMobileNav();
  });

  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 860px)").matches) closeMobileNav();
  });
}

function routeFromHash() {
  const raw = (location.hash || "#dashboard").replace("#", "");
  const route = raw.split("?")[0].trim();
  const allowed = ["dashboard","tasks","habits","resources","settings"];
  return allowed.includes(route) ? route : "dashboard";
}

function setActiveNav(route) {
  $$(".nav-link").forEach(a => {
    a.classList.toggle("active", a.dataset.route === route);
  });
}

function showRoute(route) {
  const views = ["dashboard","tasks","habits","resources","settings"];
  for (const v of views) {
    const el = document.getElementById(v);
    if (!el) continue;
    el.hidden = v !== route;
  }
  setActiveNav(route);
}

function renderAll() {
  renderDashboard();
  renderTasks();
  renderHabits();
  renderResourcesUIOnly();
}

function onRouteChange() {
  const route = routeFromHash();
  showRoute(route);
  if (route === "resources" && state.resources.length === 0) {
    fetchResources();
  }
}

function initRouter() {
  window.addEventListener("hashchange", onRouteChange);
  if (!location.hash) location.hash = "#dashboard";
  onRouteChange();
}

function taskDueInDays(task, maxDays) {
  const today = parseISO(todayISO());
  const due = parseISO(task.dueDate);
  if (!today || !due) return false;
  const diff = daysBetween(today, due);
  return diff >= 0 && diff <= maxDays;
}

function computeTaskStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter(t => t.completed).length;
  const active = total - completed;
  const dueSoon = state.tasks.filter(t => !t.completed && taskDueInDays(t, 2)).length;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, active, dueSoon, pct };
}

function habitWeeklyHits(habit) {
  return habit.progress.filter(Boolean).length;
}

function habitsWeeklyCompletedCount() {
  return state.habits.filter(h => habitWeeklyHits(h) >= h.goal).length;
}

function computeHabitStreakThisWeek() {
  if (state.habits.length === 0) return 0;
  const completed = habitsWeeklyCompletedCount();
  return completed;
}

function renderDashboard() {
  const stats = computeTaskStats();
  const streak = computeHabitStreakThisWeek();

  const dashCards = $("#dashCards");
  dashCards.innerHTML = "";

  const cardData = [
    { title: "Tasks Due Soon", value: String(stats.dueSoon), icon: "bi-alarm", hint: "Due within 2 days" },
    { title: "Completed Tasks", value: String(stats.completed), icon: "bi-check2-circle", hint: `Out of ${stats.total}` },
    { title: "Habits Goal Hits", value: String(streak), icon: "bi-lightning-charge", hint: "Habits meeting weekly goal" }
  ];

  for (const c of cardData) {
    const el = document.createElement("article");
    el.className = "card";
    el.innerHTML = `
      <div class="card-body">
        <div class="task-mini" style="background:transparent;border:none;padding:0;">
          <div>
            <div class="muted">${c.title}</div>
            <div class="strong" style="font-size:1.6rem;margin-top:4px;">${c.value}</div>
            <div class="muted" style="margin-top:4px;">${c.hint}</div>
          </div>
          <div class="pill" aria-hidden="true"><i class="bi ${c.icon}"></i></div>
        </div>
      </div>
    `;
    dashCards.appendChild(el);
  }

  const dueSoonTasks = state.tasks
    .filter(t => !t.completed && taskDueInDays(t, 2))
    .sort((a,b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 7);

  $("#todayPill").textContent = String(dueSoonTasks.length);

  const todayList = $("#todayList");
  todayList.innerHTML = "";
  for (const t of dueSoonTasks) {
    const badgeClass = t.priority === "High" ? "high" : t.priority === "Low" ? "low" : "medium";
    const item = document.createElement("div");
    item.className = "task-mini";
    item.innerHTML = `
      <div>
        <div class="title">${escapeHtml(t.title)}</div>
        <div class="meta">
          <span><i class="bi bi-calendar3"></i> ${t.dueDate}</span>
          <span class="badge ${badgeClass}">${t.priority}</span>
          <span class="badge">${t.category}</span>
        </div>
      </div>
      <button class="btn" data-action="gotoTasks" type="button"><i class="bi bi-arrow-right"></i></button>
    `;
    item.querySelector("[data-action='gotoTasks']").addEventListener("click", () => {
      location.hash = "#tasks";
    });
    todayList.appendChild(item);
  }

  $("#todayEmpty").style.display = dueSoonTasks.length ? "none" : "block";

  $("#progressPill").textContent = `${stats.pct}%`;
  $("#progressBar").style.width = `${stats.pct}%`;
  $("#progressText").textContent = `${stats.completed} / ${stats.total} completed`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function getFilteredSortedTasks() {
  const { status, category, sortBy, search } = state.ui.tasks;
  const q = search.trim().toLowerCase();

  let list = state.tasks.slice();

  if (status === "active") list = list.filter(t => !t.completed);
  if (status === "completed") list = list.filter(t => t.completed);

  if (category !== "all") list = list.filter(t => t.category === category);

  if (q) {
    list = list.filter(t =>
      (t.title || "").toLowerCase().includes(q) ||
      (t.description || "").toLowerCase().includes(q)
    );
  }

  const byPriority = (a,b) => (PRIORITY_SCORE[a.priority] ?? 2) - (PRIORITY_SCORE[b.priority] ?? 2);

  if (sortBy === "dueDateAsc") list.sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  if (sortBy === "dueDateDesc") list.sort((a,b) => b.dueDate.localeCompare(a.dueDate));
  if (sortBy === "priorityAsc") list.sort((a,b) => byPriority(a,b));
  if (sortBy === "priorityDesc") list.sort((a,b) => byPriority(b,a));

  return list;
}

function renderTasks() {
  const list = getFilteredSortedTasks();
  $("#tasksCountPill").textContent = String(list.length);

  const tbody = $("#tasksTbody");
  tbody.innerHTML = "";

  for (const t of list) {
    const tr = document.createElement("tr");
    const statusDot = t.completed ? "done" : "active";
    const statusText = t.completed ? "Completed" : "Active";
    tr.dataset.id = t.id;

    tr.innerHTML = `
      <td>
        <div class="row-title">${escapeHtml(t.title)}</div>
        <div class="row-meta">${escapeHtml(t.description || "")}</div>
      </td>
      <td>${t.dueDate}</td>
      <td>${t.priority}</td>
      <td>${t.category}</td>
      <td>
        <span class="row-status"><span class="dot ${statusDot}"></span>${statusText}</span>
      </td>
      <td class="right">
        <div class="row-actions">
          <button class="btn" data-action="toggle" type="button">${t.completed ? '<i class="bi bi-arrow-counterclockwise"></i> Uncomplete' : '<i class="bi bi-check2"></i> Complete'}</button>
          <button class="btn" data-action="edit" type="button"><i class="bi bi-pencil"></i> Edit</button>
          <button class="btn btn-danger" data-action="delete" type="button"><i class="bi bi-trash3"></i> Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  $("#tasksEmpty").style.display = list.length ? "none" : "block";
}

function initTaskControls() {
  $("#statusFilter").addEventListener("change", (e) => {
    state.ui.tasks.status = e.target.value;
    renderTasks();
  });

  $("#categoryFilter").addEventListener("change", (e) => {
    state.ui.tasks.category = e.target.value;
    renderTasks();
  });

  $("#sortBy").addEventListener("change", (e) => {
    state.ui.tasks.sortBy = e.target.value;
    renderTasks();
  });

  $("#searchTasks").addEventListener("input", (e) => {
    state.ui.tasks.search = e.target.value;
    renderTasks();
  });

  $("#tasksTbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const tr = e.target.closest("tr");
    if (!tr) return;
    const id = tr.dataset.id;
    const action = btn.dataset.action;

    if (action === "toggle") toggleTaskComplete(id);
    if (action === "edit") openTaskModalForEdit(id);
    if (action === "delete") confirmDeleteTask(id);
  });

  $("#openTaskFormBtn").addEventListener("click", () => openTaskModalForCreate());

  $("#taskClose").addEventListener("click", () => $("#taskModal").close());
  $("#taskCancel").addEventListener("click", () => $("#taskModal").close());

  $("#taskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveTaskFromForm();
  });
}

function clearTaskErrors() {
  $("#taskTitleErr").textContent = "";
  $("#taskDueErr").textContent = "";
}

function validateTask(title, dueDate) {
  let ok = true;
  clearTaskErrors();

  if (!title.trim()) {
    $("#taskTitleErr").textContent = "Title is required.";
    ok = false;
  }

  if (!dueDate) {
    $("#taskDueErr").textContent = "Due date is required.";
    ok = false;
  } else {
    const d = parseISO(dueDate);
    if (!d) {
      $("#taskDueErr").textContent = "Invalid date.";
      ok = false;
    }
  }

  return ok;
}

function openTaskModalForCreate() {
  $("#taskModalTitle").textContent = "New Task";
  $("#taskSaveBtn").textContent = "Save";
  $("#taskFormNote").textContent = "Create a new task. Title and due date are required.";

  $("#taskId").value = "";
  $("#taskTitle").value = "";
  $("#taskDesc").value = "";
  $("#taskDue").value = "";
  $("#taskPriority").value = "Medium";
  $("#taskCategory").value = "Study";
  $("#taskCompleted").value = "false";

  clearTaskErrors();
  $("#taskModal").showModal();
}

function openTaskModalForEdit(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;

  $("#taskModalTitle").textContent = "Edit Task";
  $("#taskSaveBtn").textContent = "Save";
  $("#taskFormNote").textContent = "Update fields, then click Save.";

  $("#taskId").value = t.id;
  $("#taskTitle").value = t.title;
  $("#taskDesc").value = t.description || "";
  $("#taskDue").value = t.dueDate;
  $("#taskPriority").value = t.priority || "Medium";
  $("#taskCategory").value = t.category || "Study";
  $("#taskCompleted").value = t.completed ? "true" : "false";

  clearTaskErrors();
  $("#taskModal").showModal();
}

function saveTaskFromForm() {
  const id = $("#taskId").value.trim();
  const title = $("#taskTitle").value;
  const desc = $("#taskDesc").value.trim();
  const dueDate = $("#taskDue").value;
  const priority = $("#taskPriority").value;
  const category = $("#taskCategory").value;
  const completed = $("#taskCompleted").value === "true";

  if (!validateTask(title, dueDate)) return;

  if (!id) {
    const task = {
      id: uid("t"),
      title: title.trim(),
      description: desc,
      dueDate,
      priority,
      category,
      completed: false,
      createdAt: new Date().toISOString()
    };
    state.tasks.unshift(task);
  } else {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.title = title.trim();
    t.description = desc;
    t.dueDate = dueDate;
    t.priority = priority;
    t.category = category;
    t.completed = completed;
  }

  saveTasks();
  $("#taskModal").close();
  renderAll();
}

function toggleTaskComplete(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.completed = !t.completed;
  saveTasks();
  renderAll();
}

let confirmAction = null;

function openConfirm(title, msg, onOk) {
  $("#confirmTitle").textContent = title;
  $("#confirmMsg").textContent = msg;
  confirmAction = onOk;
  $("#confirmModal").showModal();
}

function closeConfirm() {
  confirmAction = null;
  $("#confirmModal").close();
}

function initConfirmModal() {
  $("#confirmClose").addEventListener("click", closeConfirm);
  $("#confirmCancel").addEventListener("click", closeConfirm);
  $("#confirmForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fn = confirmAction;
    closeConfirm();
    if (typeof fn === "function") fn();
  });
}

function confirmDeleteTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  openConfirm("Delete Task", `Delete "${t.title}"? This cannot be undone.`, () => {
    state.tasks = state.tasks.filter(x => x.id !== id);
    saveTasks();
    renderAll();
  });
}

function initQuickAdd() {
  const modal = $("#quickAddModal");
  const openBtn = $("#dashQuickAddBtn");
  const closeBtn = $("#quickAddClose");
  const cancelBtn = $("#quickAddCancel");
  const form = $("#quickAddForm");

  const titleEl = $("#qaTitle");
  const dueEl = $("#qaDue");
  const prEl = $("#qaPriority");
  const catEl = $("#qaCategory");
  const descEl = $("#qaDesc");

  const titleErr = $("#qaTitleErr");
  const dueErr = $("#qaDueErr");

  function clearErr() {
    titleErr.textContent = "";
    dueErr.textContent = "";
  }

  function validate() {
    clearErr();
    let ok = true;
    if (!titleEl.value.trim()) {
      titleErr.textContent = "Title is required.";
      ok = false;
    }
    if (!dueEl.value) {
      dueErr.textContent = "Due date is required.";
      ok = false;
    } else if (!parseISO(dueEl.value)) {
      dueErr.textContent = "Invalid date.";
      ok = false;
    }
    return ok;
  }

  function open() {
    clearErr();
    titleEl.value = "";
    dueEl.value = "";
    prEl.value = "Medium";
    catEl.value = "Study";
    descEl.value = "";
    modal.showModal();
  }

  function close() {
    modal.close();
  }

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validate()) return;

    const task = {
      id: uid("t"),
      title: titleEl.value.trim(),
      description: descEl.value.trim(),
      dueDate: dueEl.value,
      priority: prEl.value,
      category: catEl.value,
      completed: false,
      createdAt: new Date().toISOString()
    };

    state.tasks.unshift(task);
    saveTasks();
    close();
    renderAll();
  });
}

function initThemeAndReset() {
  $("#themeToggleBtn").addEventListener("click", () => {
    applyTheme(state.settings.theme === "dark" ? "light" : "dark");
  });

  $("#resetDataBtn").addEventListener("click", () => {
    openConfirm("Reset Data", "This will clear tasks, habits, favorites and settings. Continue?", () => {
      localStorage.removeItem(KEYS.tasks);
      localStorage.removeItem(KEYS.habits);
      localStorage.removeItem(KEYS.favorites);
      localStorage.removeItem(KEYS.settings);
      state.tasks = [];
      state.habits = [];
      state.favorites = [];
      state.settings = { theme: "light" };
      applyTheme("light");
      renderAll();
      state.resources = [];
      fetchResources();
    });
  });
}

function initHabits() {
  $("#openHabitModalBtn").addEventListener("click", () => openHabitModalCreate());
  $("#habitClose").addEventListener("click", () => $("#habitModal").close());
  $("#habitCancel").addEventListener("click", () => $("#habitModal").close());

  $("#habitForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveHabitFromForm();
  });

  $("#habitsList").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-habit-action]");
    if (!btn) return;
    const habitId = btn.dataset.id;
    const action = btn.dataset.habitAction;

    if (action === "edit") openHabitModalEdit(habitId);
    if (action === "delete") confirmDeleteHabit(habitId);
  });

  $("#habitsList").addEventListener("click", (e) => {
    const dayBtn = e.target.closest("button[data-day-index]");
    if (!dayBtn) return;
    const habitId = dayBtn.dataset.id;
    const idx = Number(dayBtn.dataset.dayIndex);
    toggleHabitDay(habitId, idx);
  });
}

function renderHabits() {
  ensureHabitsWeekIntegrity();
  const wk = weekKey(new Date());
  $("#weekPill").textContent = wk;

  const wrap = $("#habitsList");
  wrap.innerHTML = "";

  for (const h of state.habits) {
    const hits = habitWeeklyHits(h);
    const xgoal = `${hits}/${h.goal}`;
    const card = document.createElement("div");
    card.className = "habit-card";
    card.dataset.id = h.id;

    const days = h.progress.map((on, i) => {
      const cls = on ? "day-btn on" : "day-btn";
      return `<button class="${cls}" type="button" data-day-index="${i}" data-id="${h.id}" aria-pressed="${on ? "true" : "false"}">${WEEK_LABELS[i]}</button>`;
    }).join("");

    card.innerHTML = `
      <div class="habit-head">
        <div>
          <div class="habit-name">${escapeHtml(h.name)}</div>
          <div class="habit-goal">Weekly goal: ${h.goal} days</div>
        </div>
        <span class="pill"><i class="bi bi-calendar2-week"></i> ${wk}</span>
      </div>
      <div class="days">${days}</div>
      <div class="habit-foot">
        <div class="habit-xgoal">${xgoal}</div>
        <div class="habit-actions">
          <button class="btn" type="button" data-habit-action="edit" data-id="${h.id}"><i class="bi bi-pencil"></i> Edit</button>
          <button class="btn btn-danger" type="button" data-habit-action="delete" data-id="${h.id}"><i class="bi bi-trash3"></i> Delete</button>
        </div>
      </div>
    `;
    wrap.appendChild(card);
  }

  $("#habitsEmpty").style.display = state.habits.length ? "none" : "block";
  renderHabitsSummary();
}

function renderHabitsSummary() {
  const totalHabits = state.habits.length;
  const completedGoals = habitsWeeklyCompletedCount();
  const totalHits = state.habits.reduce((acc, h) => acc + habitWeeklyHits(h), 0);

  const summary = $("#habitsSummary");
  summary.innerHTML = "";

  const blocks = [
    { big: String(totalHabits), small: "Total habits" },
    { big: String(completedGoals), small: "Habits meeting goal" },
    { big: String(totalHits), small: "Total checked days" }
  ];

  for (const b of blocks) {
    const el = document.createElement("div");
    el.className = "summary-card";
    el.innerHTML = `<div class="big">${b.big}</div><div class="small">${b.small}</div>`;
    summary.appendChild(el);
  }
}

function clearHabitErrors() {
  $("#habitNameErr").textContent = "";
  $("#habitGoalErr").textContent = "";
}

function validateHabit(name, goal) {
  let ok = true;
  clearHabitErrors();

  if (!name.trim()) {
    $("#habitNameErr").textContent = "Habit name is required.";
    ok = false;
  }
  const g = Number(goal);
  if (!Number.isFinite(g) || g < 1 || g > 7) {
    $("#habitGoalErr").textContent = "Goal must be between 1 and 7.";
    ok = false;
  }
  return ok;
}

function openHabitModalCreate() {
  $("#habitModalTitle").textContent = "New Habit";
  $("#habitSaveBtn").textContent = "Save";
  $("#habitId").value = "";
  $("#habitName").value = "";
  $("#habitGoal").value = "3";
  clearHabitErrors();
  $("#habitModal").showModal();
}

function openHabitModalEdit(id) {
  const h = state.habits.find(x => x.id === id);
  if (!h) return;
  $("#habitModalTitle").textContent = "Edit Habit";
  $("#habitSaveBtn").textContent = "Save";
  $("#habitId").value = h.id;
  $("#habitName").value = h.name;
  $("#habitGoal").value = String(h.goal);
  clearHabitErrors();
  $("#habitModal").showModal();
}

function saveHabitFromForm() {
  const id = $("#habitId").value.trim();
  const name = $("#habitName").value;
  const goal = $("#habitGoal").value;

  if (!validateHabit(name, goal)) return;

  const g = Number(goal);

  if (!id) {
    const wk = weekKey(new Date());
    const habit = {
      id: uid("h"),
      name: name.trim(),
      goal: g,
      progress: [false,false,false,false,false,false,false],
      weekStart: wk,
      streak: 0
    };
    state.habits.unshift(habit);
  } else {
    const h = state.habits.find(x => x.id === id);
    if (!h) return;
    h.name = name.trim();
    h.goal = g;
  }

  saveHabits();
  $("#habitModal").close();
  renderAll();
}

function toggleHabitDay(id, idx) {
  const h = state.habits.find(x => x.id === id);
  if (!h) return;
  if (idx < 0 || idx > 6) return;

  const beforeHits = habitWeeklyHits(h);
  h.progress[idx] = !h.progress[idx];
  const afterHits = habitWeeklyHits(h);

  const reachedBefore = beforeHits >= h.goal;
  const reachedAfter = afterHits >= h.goal;

  if (!reachedBefore && reachedAfter) h.streak += 1;
  if (reachedBefore && !reachedAfter) h.streak = Math.max(0, h.streak - 1);

  saveHabits();
  renderAll();
}

function confirmDeleteHabit(id) {
  const h = state.habits.find(x => x.id === id);
  if (!h) return;
  openConfirm("Delete Habit", `Delete "${h.name}"? This cannot be undone.`, () => {
    state.habits = state.habits.filter(x => x.id !== id);
    saveHabits();
    renderAll();
  });
}

function initResources() {
  $("#reloadResourcesBtn").addEventListener("click", () => fetchResources());
  $("#resourceSearch").addEventListener("input", (e) => {
    state.ui.resources.search = e.target.value;
    renderResources();
  });
  $("#resourceCategory").addEventListener("change", (e) => {
    state.ui.resources.category = e.target.value;
    renderResources();
  });
  $("#resourceFavOnly").addEventListener("change", (e) => {
    state.ui.resources.favOnly = e.target.value;
    renderResources();
  });
  $("#clearResourceFiltersBtn").addEventListener("click", () => {
    state.ui.resources.search = "";
    state.ui.resources.category = "all";
    state.ui.resources.favOnly = "all";
    $("#resourceSearch").value = "";
    $("#resourceCategory").value = "all";
    $("#resourceFavOnly").value = "all";
    renderResources();
  });

  $("#resourcesGrid").addEventListener("click", (e) => {
    const fav = e.target.closest("button[data-fav-id]");
    if (!fav) return;
    const id = fav.dataset.favId;
    toggleFavorite(id);
  });
}

function showResourcesStatus(title, msg) {
  $("#resourcesStatusTitle").textContent = title;
  $("#resourcesStatusMsg").textContent = msg;
  $("#resourcesStatus").hidden = false;
}

function hideResourcesStatus() {
  $("#resourcesStatus").hidden = true;
}

function renderResourcesUIOnly() {
  fillResourceCategories();
  renderResources();
}

function fillResourceCategories() {
  const select = $("#resourceCategory");
  const current = select.value || "all";
  const cats = Array.from(new Set(state.resources.map(r => r.category))).sort((a,b) => a.localeCompare(b));

  select.innerHTML = `<option value="all">All</option>` + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  select.value = cats.includes(current) ? current : "all";
}

async function fetchResources() {
  $("#resourcesEmpty").hidden = true;
  showResourcesStatus("Loading...", "Fetching resources.json");

  try {
    const res = await fetch("./resources.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Invalid JSON format");
    state.resources = data.map(x => ({
      id: String(x.id || ""),
      title: String(x.title || ""),
      category: String(x.category || "Other"),
      link: String(x.link || ""),
      description: String(x.description || "")
    })).filter(x => x.id && x.title && x.link);

    hideResourcesStatus();
    fillResourceCategories();
    renderResources();
  } catch (err) {
    showResourcesStatus("Error", "Could not load resources.json. Run with Live Server.");
    $("#resourcesGrid").innerHTML = "";
    $("#resourcesEmpty").hidden = false;
  }
}

function getFilteredResources() {
  const q = state.ui.resources.search.trim().toLowerCase();
  const cat = state.ui.resources.category;
  const favOnly = state.ui.resources.favOnly;

  let list = state.resources.slice();

  if (cat !== "all") list = list.filter(r => r.category === cat);

  if (q) {
    list = list.filter(r =>
      r.title.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q)
    );
  }

  if (favOnly === "favorites") {
    list = list.filter(r => state.favorites.includes(r.id));
  }

  return list;
}

function renderResources() {
  const list = getFilteredResources();
  const grid = $("#resourcesGrid");
  grid.innerHTML = "";

  for (const r of list) {
    const isFav = state.favorites.includes(r.id);
    const card = document.createElement("article");
    card.className = "card resource-card";
    card.innerHTML = `
      <div class="card-body">
        <div class="resource-top">
          <div>
            <h3 class="resource-title">${escapeHtml(r.title)}</h3>
            <div class="resource-meta">
              <span class="tag">${escapeHtml(r.category)}</span>
              ${isFav ? '<span class="tag" style="border-color:rgba(245,158,11,.35);background:rgba(245,158,11,.12)"><i class="bi bi-star-fill"></i> Favorite</span>' : ''}
            </div>
          </div>
          <button class="fav-btn ${isFav ? "fav" : ""}" type="button" data-fav-id="${escapeHtml(r.id)}" aria-label="Toggle favorite">
            <i class="bi ${isFav ? "bi-star-fill" : "bi-star"}"></i>
          </button>
        </div>
        <p class="resource-desc">${escapeHtml(r.description)}</p>
        <div class="resource-meta">
          <a class="btn btn-primary" href="${escapeHtml(r.link)}" target="_blank" rel="noreferrer"><i class="bi bi-box-arrow-up-right"></i> Open</a>
        </div>
      </div>
    `;
    grid.appendChild(card);
  }

  $("#resourcesEmpty").hidden = list.length !== 0;
  if (state.resources.length > 0) hideResourcesStatus();
}

function toggleFavorite(id) {
  const idx = state.favorites.indexOf(id);
  if (idx >= 0) state.favorites.splice(idx, 1);
  else state.favorites.unshift(id);
  saveFavorites();
  renderResources();
}

function initSettings() {
  initThemeAndReset();
}

function initDashboardActions() {
  $("#todayList").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='gotoTasks']");
    if (!btn) return;
    location.hash = "#tasks";
  });
}

function initApp() {
  loadState();
  setYear();

  initMenu();
  initRouter();

  initConfirmModal();
  initTaskControls();
  initQuickAdd();
  initHabits();
  initResources();
  initSettings();
  initDashboardActions();

  renderAll();
  fetchResources();
}

//document.addEventListener("DOMContentLoaded", initApp);








