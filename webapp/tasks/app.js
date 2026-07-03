"use strict";

const tg = window.Telegram?.WebApp;
const content = document.querySelector("#content");
const pageTitle = document.querySelector("#pageTitle");
const pageSubtitle = document.querySelector("#pageSubtitle");
const eyebrow = document.querySelector("#eyebrow");
const backButton = document.querySelector("#backButton");
const tabNav = document.querySelector("#tabNav");

const BAN_OPTIONS = [
  "Скроллинг утром",
  "Игры до главной задачи",
  "YouTube без цели",
  "Телефон в кровати",
  "Откладывать главное",
  "Другое",
];
const FOCUS_OPTIONS = [25, 45, 90];
const WASTED_TIME_OPTIONS = ["0 минут", "до 30 минут", "1 час", "2+ часа"];
const BLOCKER_OPTIONS = ["Телефон", "Игры", "Усталость", "Плохой сон", "Лень", "Нет плана", "Ничего"];

const state = {
  userId: "",
  task: null,
  stats: null,
  activeTab: "protocol",
  screen: "home",
  history: [],
  timerSeconds: 25 * 60,
  timerInterval: null,
  timerRunning: false,
  selectedTodoDate: "",
  todos: [],
  todoBlocks: [],
  expandedBlockIds: new Set(),
  editingTodoId: null,
};

const morningDraft = {
  main_task: "",
  secondary_task: "",
  daily_ban: BAN_OPTIONS[0],
  focus_minutes: 25,
  promise: "",
};

const eveningDraft = {
  task_done: true,
  ban_broken: false,
  wasted_time: WASTED_TIME_OPTIONS[0],
  blocker: BLOCKER_OPTIONS[6],
  tomorrow_fix: "",
};

const todoDraft = {
  title: "",
  description: "",
  due_time: "",
  block_id: "",
};

const blockDraft = {
  title: "",
};

function configureTelegramWebApp() {
  if (!tg) {
    return;
  }

  try {
    tg.ready();
  } catch (error) {
    console.debug("Telegram WebApp ready skipped:", error);
  }
  try {
    tg.expand();
  } catch (error) {
    console.debug("Telegram WebApp expand skipped:", error);
  }
  try {
    tg.setHeaderColor("#07080b");
  } catch (error) {
    console.debug("Telegram WebApp header color skipped:", error);
  }
  try {
    tg.setBackgroundColor("#07080b");
  } catch (error) {
    console.debug("Telegram WebApp background color skipped:", error);
  }

  if (typeof tg.requestFullscreen === "function") {
    try {
      const fullscreenResult = tg.requestFullscreen();
      if (fullscreenResult && typeof fullscreenResult.catch === "function") {
        fullscreenResult.catch(() => {});
      }
    } catch (error) {
      console.debug("Telegram WebApp fullscreen skipped:", error);
    }
  }
}

function getUserId() {
  const telegramUserId = tg?.initDataUnsafe?.user?.id;
  if (telegramUserId) {
    return String(telegramUserId);
  }

  const storageKey = "protocol_day_anonymous_user_id";
  let anonymousUserId = localStorage.getItem(storageKey);
  if (!anonymousUserId) {
    anonymousUserId = `anon_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(storageKey, anonymousUserId);
  }
  return anonymousUserId;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Не удалось выполнить запрос");
  }
  return data;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days) {
  const current = new Date();
  current.setDate(current.getDate() + days);
  return current.toISOString().slice(0, 10);
}

function formatDateText(isoDate) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      weekday: "short",
    }).format(new Date(`${isoDate}T00:00:00`));
  } catch {
    return isoDate;
  }
}

function getTodoProgress() {
  const total = state.todos.length;
  const completed = state.todos.filter((todo) => Number(todo.completed) === 1).length;
  return {
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

function renderTabs() {
  const tabs = [
    ["protocol", "Протокол"],
    ["todos", "Дела"],
    ["stats", "Статистика"],
    ["rules", "Правила"],
  ];
  tabNav.replaceChildren();
  tabs.forEach(([key, label]) => {
    const button = createButton(label, "tab-button", () => {
      switchTab(key);
    });
    if (state.activeTab === key) {
      button.classList.add("is-active");
    }
    tabNav.append(button);
  });
}

function switchTab(tab) {
  state.activeTab = tab;
  state.history = [];
  clearTimer();
  if (tab === "protocol") {
    state.screen = "home";
    render();
    return;
  }
  if (tab === "todos") {
    loadTodos().catch((error) => renderError(error.message));
    return;
  }
  if (tab === "rules") {
    state.screen = "rules";
    render();
    return;
  }
  state.screen = "stats";
  render();
}

function setHeader(label, title, subtitle) {
  eyebrow.textContent = label;
  pageTitle.textContent = title;
  pageSubtitle.textContent = subtitle;
}

function setBackVisible(isVisible) {
  backButton.hidden = !isVisible;
  try {
    if (!tg?.BackButton) {
      return;
    }
    if (isVisible) {
      tg.BackButton.show();
    } else {
      tg.BackButton.hide();
    }
  } catch {
    return;
  }
}

function navigate(screen, push = true) {
  state.activeTab = "protocol";
  if (push && state.screen !== screen) {
    state.history.push(state.screen);
  }
  state.screen = screen;
  render();
}

function goBack() {
  const previous = state.history.pop();
  if (previous) {
    state.screen = previous;
    render();
    return;
  }
  navigate("home", false);
}

function clearTimer() {
  window.clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.timerRunning = false;
}

function resetTimerFromTask() {
  const minutes = Number(state.task?.focus_minutes || morningDraft.focus_minutes || 25);
  state.timerSeconds = minutes * 60;
  clearTimer();
}

function formatTimer(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function createButton(text, className, onClick) {
  const button = createElement("button", className, text);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

function createStatsGrid(stats) {
  const grid = createElement("div", "stats-grid");
  const items = [
    ["дней в протоколе", stats?.total_days ?? 0],
    ["главные задачи выполнены", stats?.tasks_done ?? 0],
    ["серия дней", stats?.current_streak ?? 0],
    ["главный слив", stats?.most_common_blocker || "Нет данных"],
  ];

  items.forEach(([label, value]) => {
    const item = createElement("div", "stat");
    item.append(createElement("strong", "", String(value)), createElement("span", "", label));
    grid.append(item);
  });
  return grid;
}

function createField(labelText, input) {
  const label = createElement("label", "");
  const labelTitle = createElement("span", "", labelText);
  label.append(labelTitle, input);
  return label;
}

function createTextInput(value, placeholder, onInput) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.placeholder = placeholder;
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

function createTextarea(value, placeholder, onInput) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.placeholder = placeholder;
  textarea.addEventListener("input", () => onInput(textarea.value));
  return textarea;
}

function createTimeInput(value, onInput) {
  const input = document.createElement("input");
  input.type = "time";
  input.value = value || "";
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

function createBlockSelect(value, onChange) {
  const select = document.createElement("select");
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Без блока";
  select.append(empty);
  state.todoBlocks.forEach((block) => {
    const option = document.createElement("option");
    option.value = String(block.id);
    option.textContent = block.title;
    select.append(option);
  });
  select.value = value ? String(value) : "";
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function createOptions(options, selected, onSelect, format = (value) => value) {
  const wrapper = createElement("div", "options");
  options.forEach((option) => {
    const button = createButton(format(option), "option-button", () => {
      onSelect(option);
      render();
    });
    if (option === selected) {
      button.classList.add("is-selected");
    }
    wrapper.append(button);
  });
  return wrapper;
}

function showStatus(container, message, isError = false) {
  let status = container.querySelector(".status");
  if (!status) {
    status = createElement("p", "status");
    container.append(status);
  }
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function loadTodos() {
  if (!state.selectedTodoDate) {
    state.selectedTodoDate = todayIso();
  }
  const data = await fetchJson(
    `/api/todos?user_id=${encodeURIComponent(state.userId)}&date=${encodeURIComponent(state.selectedTodoDate)}`
  );
  state.todos = data.todos || [];
  state.todoBlocks = data.blocks || [];
  state.activeTab = "todos";
  state.screen = "todos";
  render();
}

async function reloadTodos() {
  const data = await fetchJson(
    `/api/todos?user_id=${encodeURIComponent(state.userId)}&date=${encodeURIComponent(state.selectedTodoDate)}`
  );
  state.todos = data.todos || [];
  state.todoBlocks = data.blocks || [];
  render();
}

function resetTodoDraft() {
  state.editingTodoId = null;
  todoDraft.title = "";
  todoDraft.description = "";
  todoDraft.due_time = "";
  todoDraft.block_id = "";
}

function startEditTodo(todo) {
  state.editingTodoId = todo.id;
  todoDraft.title = todo.title || "";
  todoDraft.description = todo.description || "";
  todoDraft.due_time = todo.due_time || "";
  todoDraft.block_id = todo.block_id ? String(todo.block_id) : "";
  render();
}

async function saveTodo(container) {
  const title = todoDraft.title.trim();
  if (!title) {
    showStatus(container, "Заполни название дела.", true);
    return;
  }

  const payload = {
    user_id: state.userId,
    title,
    description: todoDraft.description,
    due_date: state.selectedTodoDate,
    due_time: todoDraft.due_time,
    block_id: todoDraft.block_id || null,
  };

  try {
    if (state.editingTodoId) {
      await fetchJson(`/api/todos/${state.editingTodoId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await fetchJson("/api/todos", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    resetTodoDraft();
    await reloadTodos();
  } catch (error) {
    showStatus(container, error.message, true);
  }
}

async function toggleTodo(todo) {
  await fetchJson(`/api/todos/${todo.id}/toggle`, {
    method: "POST",
    body: JSON.stringify({ user_id: state.userId }),
  });
  await reloadTodos();
}

async function deleteTodo(todo) {
  if (!window.confirm("Удалить дело?")) {
    return;
  }
  await fetchJson(`/api/todos/${todo.id}?user_id=${encodeURIComponent(state.userId)}`, {
    method: "DELETE",
  });
  await reloadTodos();
}

async function createBlock(container) {
  const title = blockDraft.title.trim();
  if (!title) {
    showStatus(container, "Название блока не может быть пустым.", true);
    return;
  }
  try {
    const data = await fetchJson("/api/todo-blocks", {
      method: "POST",
      body: JSON.stringify({ user_id: state.userId, title }),
    });
    blockDraft.title = "";
    state.expandedBlockIds.add(Number(data.block.id));
    await reloadTodos();
  } catch (error) {
    showStatus(container, error.message, true);
  }
}

async function renameBlock(block) {
  const title = window.prompt("Новое название блока", block.title);
  if (!title || !title.trim()) {
    return;
  }
  await fetchJson(`/api/todo-blocks/${block.id}`, {
    method: "PATCH",
    body: JSON.stringify({ user_id: state.userId, title }),
  });
  await reloadTodos();
}

async function deleteBlock(block) {
  if (!window.confirm("Удалить блок? Дела останутся без блока.")) {
    return;
  }
  await fetchJson(`/api/todo-blocks/${block.id}?user_id=${encodeURIComponent(state.userId)}`, {
    method: "DELETE",
  });
  state.expandedBlockIds.delete(Number(block.id));
  await reloadTodos();
}

function renderDatePicker() {
  const wrapper = createElement("section", "date-picker");
  const today = todayIso();
  const tomorrow = addDaysIso(1);
  const todayButton = createButton("Сегодня", "date-button", () => {
    state.selectedTodoDate = today;
    loadTodos().catch((error) => renderError(error.message));
  });
  const tomorrowButton = createButton("Завтра", "date-button", () => {
    state.selectedTodoDate = tomorrow;
    loadTodos().catch((error) => renderError(error.message));
  });
  const input = document.createElement("input");
  input.className = "date-input";
  input.type = "date";
  input.value = state.selectedTodoDate;
  input.addEventListener("change", () => {
    if (input.value) {
      state.selectedTodoDate = input.value;
      loadTodos().catch((error) => renderError(error.message));
    }
  });

  if (state.selectedTodoDate === today) {
    todayButton.classList.add("is-active");
  }
  if (state.selectedTodoDate === tomorrow) {
    tomorrowButton.classList.add("is-active");
  }

  const selected = createElement("p", "selected-date", formatDateText(state.selectedTodoDate));
  wrapper.append(todayButton, tomorrowButton, input, selected);
  return wrapper;
}

function renderTodoProgress() {
  const progress = getTodoProgress();
  const card = createElement("section", "todo-progress");
  const top = createElement("div", "todo-progress-top");
  top.append(
    createElement("strong", "", `${progress.completed}/${progress.total}`),
    createElement("span", "", "прогресс дня")
  );
  const track = createElement("div", "todo-progress-track");
  const fill = createElement("div", "todo-progress-fill");
  fill.style.width = `${progress.percent}%`;
  track.append(fill);
  card.append(top, track);
  return card;
}

function renderTodoForm() {
  const form = createElement("section", "todo-form task-card");
  form.append(
    createElement("h2", "section-title", state.editingTodoId ? "Редактировать дело" : "Новое дело"),
    createField(
      "Название дела",
      createTextInput(todoDraft.title, "Название дела", (value) => {
        todoDraft.title = value;
      })
    ),
    createField(
      "Описание",
      createTextarea(todoDraft.description, "Описание, детали или ссылка (необязательно)", (value) => {
        todoDraft.description = value;
      })
    ),
    createField(
      "Время",
      createTimeInput(todoDraft.due_time, (value) => {
        todoDraft.due_time = value;
      })
    ),
    createField(
      "Блок дел",
      createBlockSelect(todoDraft.block_id, (value) => {
        todoDraft.block_id = value;
      })
    )
  );

  const row = createElement("div", "todo-form-actions");
  row.append(createButton(state.editingTodoId ? "Сохранить" : "+", "primary-button todo-add-button", () => {
    saveTodo(form);
  }));
  if (state.editingTodoId) {
    row.append(createButton("Отмена", "secondary-button", () => {
      resetTodoDraft();
      render();
    }));
  }
  form.append(row);
  return form;
}

function renderTodoItem(todo) {
  const item = createElement("article", "todo-item");
  if (Number(todo.completed) === 1) {
    item.classList.add("is-completed");
  }

  const toggle = createButton("", "todo-check", () => {
    toggleTodo(todo).catch((error) => renderError(error.message));
  });
  toggle.setAttribute("aria-label", Number(todo.completed) === 1 ? "Вернуть дело" : "Отметить выполненным");

  const body = createElement("div", "todo-body");
  const titleRow = createElement("div", "todo-title-row");
  titleRow.append(createElement("strong", "", todo.title));
  if (todo.due_time) {
    titleRow.append(createElement("span", "todo-time", todo.due_time));
  }
  body.append(titleRow);
  if (todo.description) {
    body.append(createElement("p", "todo-description", todo.description));
  }

  const actions = createElement("div", "todo-actions");
  actions.append(
    createButton("✎", "icon-action", () => startEditTodo(todo)),
    createButton("×", "icon-action", () => {
      deleteTodo(todo).catch((error) => renderError(error.message));
    })
  );

  item.append(toggle, body, actions);
  return item;
}

function renderSoloTodos() {
  const section = createElement("section", "todo-section");
  section.append(createElement("h2", "section-title", "Одиночные дела"));
  const list = createElement("div", "todo-list");
  const soloTodos = state.todos.filter((todo) => !todo.block_id);
  if (soloTodos.length === 0) {
    list.append(createElement("p", "muted", "Одиночных дел пока нет."));
  } else {
    soloTodos.forEach((todo) => list.append(renderTodoItem(todo)));
  }
  section.append(list);
  return section;
}

function renderBlockCreator() {
  const creator = createElement("div", "block-creator");
  const input = createTextInput(blockDraft.title, "Новый блок: Работа, Учёба, Контент", (value) => {
    blockDraft.title = value;
  });
  creator.append(input, createButton("+", "primary-button block-add-button", () => createBlock(creator)));
  return creator;
}

function renderTodoBlocks() {
  const section = createElement("section", "todo-section");
  section.append(createElement("h2", "section-title", "Блоки дел"), renderBlockCreator());
  if (state.todoBlocks.length === 0) {
    section.append(createElement("p", "muted", "Блоков пока нет"));
    return section;
  }

  const blocks = createElement("div", "todo-blocks");
  state.todoBlocks.forEach((block) => {
    const blockTodos = state.todos.filter((todo) => Number(todo.block_id) === Number(block.id));
    const isExpanded = state.expandedBlockIds.has(Number(block.id));
    const card = createElement("article", "todo-block");
    const header = createElement("div", "todo-block-header");
    const toggle = createButton(isExpanded ? "−" : "+", "block-toggle", () => {
      if (isExpanded) {
        state.expandedBlockIds.delete(Number(block.id));
      } else {
        state.expandedBlockIds.add(Number(block.id));
      }
      render();
    });
    const title = createElement("button", "todo-block-title", block.title);
    title.type = "button";
    title.addEventListener("click", () => {
      if (isExpanded) {
        state.expandedBlockIds.delete(Number(block.id));
      } else {
        state.expandedBlockIds.add(Number(block.id));
      }
      render();
    });
    const actions = createElement("div", "todo-actions");
    actions.append(
      createButton("✎", "icon-action", () => renameBlock(block).catch((error) => renderError(error.message))),
      createButton("×", "icon-action", () => deleteBlock(block).catch((error) => renderError(error.message)))
    );
    header.append(toggle, title, actions);
    card.append(header);

    if (isExpanded) {
      const body = createElement("div", "todo-block-body");
      const addToBlock = createButton("Добавить дело в этот блок", "secondary-button", () => {
        todoDraft.block_id = String(block.id);
        state.editingTodoId = null;
        render();
      });
      if (blockTodos.length === 0) {
        body.append(createElement("p", "muted", "Нужно хотя бы два дела"));
      } else {
        blockTodos.forEach((todo) => body.append(renderTodoItem(todo)));
      }
      body.append(addToBlock);
      card.append(body);
    }
    blocks.append(card);
  });
  section.append(blocks);
  return section;
}

function renderTodosScreen() {
  clearTimer();
  setHeader("PROTOCOL", "Дела на сегодня", "Собери действия на выбранную дату и закрывай их по кругу.");
  setBackVisible(false);
  content.className = "content task-screen todos-screen";
  content.replaceChildren(
    renderDatePicker(),
    renderTodoProgress(),
    renderTodoForm(),
    renderSoloTodos(),
    renderTodoBlocks()
  );
}

function renderStatsTab() {
  clearTimer();
  setHeader("статистика", "Статистика", "Текущий прогресс протокола и последние дни.");
  setBackVisible(false);
  content.className = "content task-screen";
  content.replaceChildren();

  const statsPanel = createElement("section", "card task-card");
  statsPanel.append(createElement("h2", "section-title", "Протокол"), createStatsGrid(state.stats));

  const recentPanel = createElement("section", "card task-card");
  recentPanel.append(createElement("h2", "section-title", "Последние дни"), renderRecentDays(state.stats || {}));
  content.append(statsPanel, recentPanel);
}

function renderRulesTab() {
  clearTimer();
  setHeader("правила", "Правила", "Короткий свод, чтобы не спорить с собой в течение дня.");
  setBackVisible(false);
  content.className = "content task-screen rules-screen";
  content.replaceChildren();

  const rules = [
    ["01", "Главное действие закрывается первым."],
    ["02", "Запрет дня действует до вечернего разбора."],
    ["03", "Фокус-сессия начинается без подготовки и торга."],
    ["04", "Если день сломан, фиксируется одна правка на завтра."],
  ];

  const panel = createElement("section", "card task-card rules-card");
  panel.append(createElement("h2", "section-title", "Базовый протокол"));
  const list = createElement("div", "rules-list");
  rules.forEach(([number, text]) => {
    const item = createElement("article", "rule-item");
    item.append(createElement("span", "", number), createElement("strong", "", text));
    list.append(item);
  });
  panel.append(list);
  content.append(panel);
}

function renderHome() {
  clearTimer();
  setHeader("ПРОТОКОЛ ДНЯ", "Протокол Дня", "Выбери главное действие и не слей день.");
  setBackVisible(false);
  content.className = "content task-screen home-screen";
  content.replaceChildren();

  const actionCard = createElement("section", "card task-card");
  const title = createElement("h2", "section-title", "Сегодня");
  const description = createElement("p", "muted");
  let buttonText = "Начать день";
  let target = "morning";

  if (state.task?.completed) {
    description.textContent = "Протокол завершён. Можно открыть итог дня.";
    buttonText = "Итог дня";
    target = "result";
  } else if (state.task) {
    description.textContent = "Сегодняшний протокол активен.";
    buttonText = "Продолжить день";
    target = "active";
  } else {
    description.textContent = "Собери день: задача, запрет, фокус.";
  }

  actionCard.append(
    title,
    description,
    createElement("br"),
    createButton(buttonText, "primary-button task-primary-button", () => {
      if (target === "active") {
        resetTimerFromTask();
      }
      navigate(target);
    })
  );

  const statsCard = createElement("section", "card task-card stats-card");
  statsCard.append(createElement("h2", "section-title", "Статистика"), createStatsGrid(state.stats));
  content.append(actionCard, statsCard);
}

function renderMorning() {
  clearTimer();
  setHeader("утро", "Утренний протокол", "Выбери главное действие, запрет и первую фокус-сессию.");
  setBackVisible(true);
  content.className = "content task-screen";
  content.replaceChildren();

  const form = createElement("section", "field-card");
  form.append(
    createField(
      "Главная задача дня",
      createTextInput(morningDraft.main_task, "Что сегодня сделает день не слитым?", (value) => {
        morningDraft.main_task = value;
      })
    ),
    createField(
      "Вторичная задача",
      createTextInput(morningDraft.secondary_task, "Что можно сделать после главной?", (value) => {
        morningDraft.secondary_task = value;
      })
    ),
    createElement("p", "section-title", "Запрет дня"),
    createOptions(BAN_OPTIONS, morningDraft.daily_ban, (value) => {
      morningDraft.daily_ban = value;
    }),
    createElement("p", "section-title", "Фокус-сессия"),
    createOptions(FOCUS_OPTIONS, morningDraft.focus_minutes, (value) => {
      morningDraft.focus_minutes = value;
    }, (value) => `${value} минут`),
    createField(
      "Обещание себе",
      createTextInput(morningDraft.promise, "Сегодня я сдержу слово и…", (value) => {
        morningDraft.promise = value;
      })
    ),
    createButton("Запустить день", "primary-button", async () => {
      try {
        if (!morningDraft.main_task.trim()) {
          showStatus(form, "Заполни главную задачу дня.", true);
          return;
        }
        const data = await fetchJson("/api/tasks/start", {
          method: "POST",
          body: JSON.stringify({ user_id: state.userId, ...morningDraft }),
        });
        state.task = data.task;
        state.stats = data.stats;
        resetTimerFromTask();
        state.history = ["home"];
        navigate("active", false);
      } catch (error) {
        showStatus(form, error.message, true);
      }
    })
  );

  content.append(form);
}

function renderProtocolList() {
  const list = createElement("div", "protocol-list");
  const items = [
    ["Главная задача", state.task?.main_task || "Не задано"],
    ["Вторичная задача", state.task?.secondary_task || "Не задано"],
    ["Запрет дня", state.task?.daily_ban || "Не задано"],
    ["Фокус", `${state.task?.focus_minutes || 25} минут`],
    ["Обещание", state.task?.promise || "Не задано"],
  ];

  items.forEach(([label, value]) => {
    const item = createElement("div", "protocol-item");
    item.append(createElement("span", "", label), createElement("strong", "", value));
    list.append(item);
  });
  return list;
}

function renderTimer(container) {
  const timerPanel = createElement("section", "timer-panel");
  const display = createElement("div", "timer-display", formatTimer(state.timerSeconds));
  const controls = createElement("div", "timer-controls");

  const startButton = createButton(state.timerRunning ? "Пауза" : "Старт", "secondary-button", () => {
    if (state.timerRunning) {
      clearTimer();
      render();
      return;
    }
    state.timerRunning = true;
    state.timerInterval = window.setInterval(() => {
      state.timerSeconds = Math.max(0, state.timerSeconds - 1);
      const currentDisplay = document.querySelector(".timer-display");
      if (currentDisplay) {
        currentDisplay.textContent = formatTimer(state.timerSeconds);
      }
      if (state.timerSeconds === 0) {
        clearTimer();
        render();
      }
    }, 1000);
    render();
  });

  const pauseButton = createButton("Пауза", "secondary-button", () => {
    clearTimer();
    render();
  });
  const resetButton = createButton("Сброс", "secondary-button", () => {
    resetTimerFromTask();
    render();
  });

  controls.append(startButton, pauseButton, resetButton);
  timerPanel.append(display, controls);
  container.append(timerPanel);
}

function renderActive() {
  setHeader("день", "Активный день", "Держи перед глазами главное и запускай фокус.");
  setBackVisible(true);
  content.className = "content task-screen";
  content.replaceChildren();

  const card = createElement("section", "card");
  card.append(createElement("h2", "section-title", "Протокол"), renderProtocolList());
  content.append(card);

  renderTimer(content);

  const actions = createElement("section", "button-row");
  actions.append(
    createButton("Запустить фокус", "primary-button", () => {
      if (!state.timerRunning) {
        state.timerRunning = true;
        state.timerInterval = window.setInterval(() => {
          state.timerSeconds = Math.max(0, state.timerSeconds - 1);
          const currentDisplay = document.querySelector(".timer-display");
          if (currentDisplay) {
            currentDisplay.textContent = formatTimer(state.timerSeconds);
          }
          if (state.timerSeconds === 0) {
            clearTimer();
            render();
          }
        }, 1000);
        render();
      }
    }),
    createButton("Завершить день", "secondary-button", () => {
      clearTimer();
      navigate("evening");
    })
  );
  content.append(actions);
}

function renderEvening() {
  clearTimer();
  setHeader("вечер", "Вечерний разбор", "Честно отметь результат и одну правку на завтра.");
  setBackVisible(true);
  content.className = "content task-screen";
  content.replaceChildren();

  const form = createElement("section", "field-card");
  form.append(
    createElement("p", "section-title", "Главная задача выполнена?"),
    createOptions([true, false], eveningDraft.task_done, (value) => {
      eveningDraft.task_done = value;
    }, (value) => (value ? "Да" : "Нет")),
    createElement("p", "section-title", "Запрет нарушен?"),
    createOptions([false, true], eveningDraft.ban_broken, (value) => {
      eveningDraft.ban_broken = value;
    }, (value) => (value ? "Да" : "Нет")),
    createElement("p", "section-title", "Сколько времени слил?"),
    createOptions(WASTED_TIME_OPTIONS, eveningDraft.wasted_time, (value) => {
      eveningDraft.wasted_time = value;
    }),
    createElement("p", "section-title", "Что помешало?"),
    createOptions(BLOCKER_OPTIONS, eveningDraft.blocker, (value) => {
      eveningDraft.blocker = value;
    }),
    createField(
      "Что завтра исправить?",
      createTextarea(eveningDraft.tomorrow_fix, "Одна конкретная правка на завтра", (value) => {
        eveningDraft.tomorrow_fix = value;
      })
    ),
    createButton("Сохранить итог", "primary-button", async () => {
      try {
        const data = await fetchJson("/api/tasks/complete", {
          method: "POST",
          body: JSON.stringify({ user_id: state.userId, ...eveningDraft }),
        });
        state.task = data.task;
        state.stats = data.stats;
        state.history = ["home"];
        navigate("result", false);
      } catch (error) {
        showStatus(form, error.message, true);
      }
    })
  );
  content.append(form);
}

function renderRecentDays(stats) {
  const wrapper = createElement("div", "recent-days");
  const days = stats?.recent_days || [];
  if (days.length === 0) {
    wrapper.append(createElement("p", "muted", "Последних дней пока нет."));
    return wrapper;
  }

  days.forEach((day) => {
    const row = createElement("div", "recent-day");
    const result = Number(day.task_done) === 1 ? "главное выполнено" : "главное не выполнено";
    row.append(
      createElement("span", "", day.date || ""),
      createElement("strong", "", day.main_task || "Без задачи"),
      createElement("span", "", `${result}; слив: ${day.blocker || "нет данных"}`)
    );
    wrapper.append(row);
  });
  return wrapper;
}

function renderResult() {
  clearTimer();
  setHeader("итог", "Итог дня", "Статистика и последние протоколы.");
  setBackVisible(true);
  content.className = "content task-screen";
  content.replaceChildren();

  const success = Number(state.task?.task_done || 0) === 1;
  const resultPanel = createElement("section", "result-panel");
  resultPanel.append(
    createElement("h2", "section-title", success ? "День не слит." : "Главное действие не выполнено."),
    createElement(
      "p",
      "muted",
      success
        ? "Ты сделал главное действие и сдержал слово."
        : "Завтра начни с главной задачи до любых развлечений."
    )
  );

  const statsPanel = createElement("section", "card");
  const stats = state.stats || {};
  const statsGrid = createElement("div", "stats-grid");
  [
    ["всего дней", stats.total_days ?? 0],
    ["выполнено главных задач", stats.tasks_done ?? 0],
    ["текущая серия", stats.current_streak ?? 0],
    ["нарушен запрет", stats.ban_broken_count ?? 0],
  ].forEach(([label, value]) => {
    const item = createElement("div", "stat");
    item.append(createElement("strong", "", String(value)), createElement("span", "", label));
    statsGrid.append(item);
  });
  statsPanel.append(
    createElement("h2", "section-title", "Статистика"),
    statsGrid,
    createElement("p", "muted", `Самая частая причина слива: ${stats.most_common_blocker || "Нет данных"}`)
  );

  const recentPanel = createElement("section", "card");
  recentPanel.append(createElement("h2", "section-title", "Последние дни"), renderRecentDays(stats));
  content.append(resultPanel, statsPanel, recentPanel);
}

function renderLoading() {
  renderTabs();
  setHeader("ПРОТОКОЛ ДНЯ", "Протокол Дня", "Загрузка данных.");
  content.className = "content task-screen";
  content.replaceChildren(createElement("section", "card", "Загрузка…"));
}

function renderError(message) {
  renderTabs();
  setHeader("ошибка", "Не удалось загрузить", "Проверь соединение и попробуй снова.");
  setBackVisible(false);
  content.className = "content task-screen";
  content.replaceChildren(
    createElement("section", "card"),
  );
  const card = content.querySelector(".card");
  card.append(
    createElement("p", "muted", message),
    createElement("br"),
    createButton("Повторить", "primary-button", loadInitialData)
  );
}

function render() {
  renderTabs();

  if (state.activeTab === "todos") {
    renderTodosScreen();
    return;
  }
  if (state.activeTab === "stats") {
    renderStatsTab();
    return;
  }
  if (state.activeTab === "rules") {
    renderRulesTab();
    return;
  }

  if (state.screen !== "active") {
    clearTimer();
  }

  if (state.screen === "home") {
    renderHome();
  } else if (state.screen === "morning") {
    renderMorning();
  } else if (state.screen === "active") {
    renderActive();
  } else if (state.screen === "evening") {
    renderEvening();
  } else if (state.screen === "result") {
    renderResult();
  }
}

async function loadInitialData() {
  renderLoading();
  state.selectedTodoDate = todayIso();
  try {
    const data = await fetchJson(`/api/tasks/today?user_id=${encodeURIComponent(state.userId)}`);
    state.task = data.task;
    state.stats = data.stats;
    if (state.task) {
      morningDraft.main_task = state.task.main_task || "";
      morningDraft.secondary_task = state.task.secondary_task || "";
      morningDraft.daily_ban = state.task.daily_ban || BAN_OPTIONS[0];
      morningDraft.focus_minutes = Number(state.task.focus_minutes || 25);
      morningDraft.promise = state.task.promise || "";
    }
    resetTimerFromTask();
    navigate("home", false);
  } catch (error) {
    renderError(error.message);
  }
}

backButton.addEventListener("click", goBack);
try {
  tg?.BackButton?.onClick(goBack);
} catch {
  // Telegram BackButton is optional in browsers.
}

configureTelegramWebApp();
state.userId = getUserId();
loadInitialData();
