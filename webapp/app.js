"use strict";

const telegram = window.Telegram?.WebApp;
const content = document.querySelector("#content");
const pageTitle = document.querySelector("#pageTitle");
const pageSubtitle = document.querySelector("#pageSubtitle");
const eyebrow = document.querySelector("#eyebrow");
const backButton = document.querySelector("#backButton");

const state = {
  modules: [],
  lessonsByModule: new Map(),
  currentModuleId: null,
  currentLessonId: null,
};

function setHeader(label, title, subtitle) {
  eyebrow.textContent = label;
  pageTitle.textContent = title;
  pageSubtitle.textContent = subtitle;
}

function syncBackButtons() {
  const canGoBack = state.currentModuleId !== null;
  backButton.hidden = !canGoBack;

  if (!telegram?.BackButton) {
    return;
  }
  if (canGoBack) {
    telegram.BackButton.show();
  } else {
    telegram.BackButton.hide();
  }
}

function showMessage(title, message, actionLabel = "", action = null) {
  content.className = "content";
  content.replaceChildren();

  const block = document.createElement("section");
  block.className = "empty-state";

  const heading = document.createElement("strong");
  heading.textContent = title;

  const text = document.createElement("p");
  text.textContent = message;

  block.append(heading, text);

  if (actionLabel && action) {
    const button = document.createElement("button");
    button.className = "secondary-button";
    button.type = "button";
    button.textContent = actionLabel;
    button.addEventListener("click", action);
    block.append(button);
  }

  content.append(block);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Ошибка запроса: ${response.status}`);
  }
  return response.json();
}

function createCard(title, description, meta, onClick) {
  const button = document.createElement("button");
  button.className = "card";
  button.type = "button";
  button.addEventListener("click", onClick);

  const titleElement = document.createElement("span");
  titleElement.className = "card-title";
  titleElement.textContent = title;

  const descriptionElement = document.createElement("span");
  descriptionElement.className = "card-description";
  descriptionElement.textContent = description;

  const metaElement = document.createElement("span");
  metaElement.className = "card-meta";
  metaElement.textContent = meta;

  const arrow = document.createElement("span");
  arrow.className = "card-arrow";
  arrow.textContent = "›";
  arrow.setAttribute("aria-hidden", "true");

  button.append(titleElement, descriptionElement, metaElement, arrow);
  return button;
}

async function loadModules() {
  state.modules = await fetchJson("/api/modules");
}

async function loadLessons(moduleId) {
  if (!state.lessonsByModule.has(moduleId)) {
    const lessons = await fetchJson(`/api/modules/${moduleId}/lessons`);
    state.lessonsByModule.set(moduleId, lessons);
  }
  return state.lessonsByModule.get(moduleId);
}

function getLessons(moduleId) {
  return state.lessonsByModule.get(moduleId) || [];
}

function getLessonPosition(moduleId, lessonId) {
  const moduleIndex = state.modules.findIndex((module) => module.id === moduleId);
  const lessons = getLessons(moduleId);
  const lessonIndex = lessons.findIndex((lesson) => lesson.id === lessonId);
  return { moduleIndex, lessonIndex };
}

async function findAdjacentLesson(direction) {
  const { moduleIndex, lessonIndex } = getLessonPosition(
    state.currentModuleId,
    state.currentLessonId
  );
  if (moduleIndex === -1 || lessonIndex === -1) {
    return null;
  }

  const currentLessons = getLessons(state.currentModuleId);
  const nextLessonIndex = lessonIndex + direction;
  if (currentLessons[nextLessonIndex]) {
    return { module: state.modules[moduleIndex], lesson: currentLessons[nextLessonIndex] };
  }

  let nextModuleIndex = moduleIndex + direction;
  while (state.modules[nextModuleIndex]) {
    const nextModule = state.modules[nextModuleIndex];
    const lessons = await loadLessons(nextModule.id);
    if (lessons.length > 0) {
      const lesson = direction > 0 ? lessons[0] : lessons[lessons.length - 1];
      return { module: nextModule, lesson };
    }
    nextModuleIndex += direction;
  }
  return null;
}

async function renderModules() {
  state.currentModuleId = null;
  state.currentLessonId = null;
  state.lessonsByModule.clear();
  content.className = "content cards-grid";
  content.replaceChildren();
  setHeader("Мини-курс", "Модули курса", "Выберите модуль, чтобы увидеть уроки.");

  try {
    await loadModules();
  } catch (error) {
    showMessage("Не удалось загрузить курс", error.message, "Повторить", renderModules);
    syncBackButtons();
    return;
  }

  if (state.modules.length === 0) {
    showMessage(
      "Курс пока пуст",
      "Добавьте первый модуль и урок через админ-панель, затем обновите эту страницу."
    );
    syncBackButtons();
    return;
  }

  state.modules.forEach((module) => {
    const count = Number(module.lessons_count || 0);
    const lessonsLabel = `${count} ${count === 1 ? "урок" : "уроков"}`;
    content.append(
      createCard(module.title, "Откройте модуль, чтобы увидеть уроки.", lessonsLabel, () =>
        renderLessons(module.id)
      )
    );
  });
  syncBackButtons();
}

async function renderLessons(moduleId) {
  const module = state.modules.find((item) => item.id === moduleId);
  if (!module) {
    await renderModules();
    return;
  }

  state.currentModuleId = moduleId;
  state.currentLessonId = null;
  content.className = "content";
  content.replaceChildren();
  setHeader("Модуль", module.title, "Выберите урок, чтобы открыть текст.");

  try {
    const lessons = await loadLessons(moduleId);
    if (lessons.length === 0) {
      showMessage("В модуле пока нет уроков", "Добавьте урок через админ-панель.");
      syncBackButtons();
      return;
    }

    lessons.forEach((lesson, index) => {
      content.append(
        createCard(lesson.title, "Открыть текст урока.", `Урок ${index + 1}`, () => {
          renderLesson(moduleId, lesson.id);
        })
      );
    });
  } catch (error) {
    showMessage("Не удалось загрузить уроки", error.message, "Повторить", () =>
      renderLessons(moduleId)
    );
  }
  syncBackButtons();
}

function renderParagraphs(container, text) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  paragraphs.forEach((paragraph) => {
    const paragraphElement = document.createElement("p");
    paragraphElement.textContent = paragraph;
    container.append(paragraphElement);
  });
}

async function renderLesson(moduleId, lessonId) {
  const module = state.modules.find((item) => item.id === moduleId);
  state.currentModuleId = moduleId;
  state.currentLessonId = lessonId;
  content.className = "content";
  content.replaceChildren();
  setHeader(module?.title || "Урок", "Загрузка урока…", "Подождите несколько секунд.");

  try {
    const lesson = await fetchJson(`/api/lessons/${lessonId}`);
    setHeader(lesson.module_title || module?.title || "Урок", lesson.title, "Читайте в удобном темпе.");

    const article = document.createElement("article");
    article.className = "lesson";
    renderParagraphs(article, lesson.content);

    const navigation = document.createElement("div");
    navigation.className = "lesson-navigation";

    const previous = await findAdjacentLesson(-1);
    const next = await findAdjacentLesson(1);

    if (previous) {
      const previousButton = document.createElement("button");
      previousButton.className = "secondary-button";
      previousButton.type = "button";
      previousButton.textContent = "← Предыдущий урок";
      previousButton.addEventListener("click", () =>
        renderLesson(previous.module.id, previous.lesson.id)
      );
      navigation.append(previousButton);
    }

    if (next) {
      const nextButton = document.createElement("button");
      nextButton.className = "primary-button";
      nextButton.type = "button";
      nextButton.textContent = "Следующий урок →";
      nextButton.addEventListener("click", () => renderLesson(next.module.id, next.lesson.id));
      navigation.append(nextButton);
    }

    content.append(article);
    if (navigation.children.length > 0) {
      content.append(navigation);
    }
  } catch (error) {
    showMessage("Не удалось открыть урок", error.message, "Вернуться к модулям", renderModules);
  }
  syncBackButtons();
}

function goBack() {
  if (state.currentLessonId !== null && state.currentModuleId !== null) {
    renderLessons(state.currentModuleId);
    return;
  }
  renderModules();
}

backButton.addEventListener("click", goBack);
telegram?.BackButton?.onClick(goBack);
telegram?.ready();
telegram?.expand();

renderModules();
