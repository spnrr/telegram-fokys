"use strict";

const telegram = window.Telegram?.WebApp;
const content = document.querySelector("#content");
const pageTitle = document.querySelector("#pageTitle");
const pageSubtitle = document.querySelector("#pageSubtitle");
const eyebrow = document.querySelector("#eyebrow");
const backButton = document.querySelector("#backButton");
const topbar = document.querySelector(".topbar");
const MINI_APP_DARK_COLOR = "#0b0d0f";

const DEFAULT_COURSE_LANDING_CONFIG = {
  brandTitle: "Протокол 0.",
  brandSubtitle: "закрытый курс",
  heroImageUrl: "assets/protocol-compass-hero.png",
  heroKicker: "КОНТРОЛЬ / ФОКУС / ДЕЙСТВИЕ",
  heroTitle: "ВЕКТОР",
  heroDescription: "Выберите направление и держите курс.",
  productImageUrl: "",
  productTitle: "Вектор",
  productDescription: "Ты уже здесь. Обратного пути нет.",
  productPrice: "Бесплатно",
  continueButtonText: "Продолжить",
  searchPlaceholder: "Поиск по названию",
  authorName: "Protocol",
};
let courseLandingConfig = { ...DEFAULT_COURSE_LANDING_CONFIG };

const LAST_LESSON_STORAGE_KEYS = {
  lessonId: "protocol_last_lesson_id",
  moduleId: "protocol_last_module_id",
  lessonTitle: "protocol_last_lesson_title",
  openedAt: "protocol_last_opened_at",
};

const stepLabels = [
  "Первая ступень",
  "Вторая ступень",
  "Третья ступень",
  "Четвёртая ступень",
  "Пятая ступень",
  "Шестая ступень",
  "Седьмая ступень",
  "Восьмая ступень",
  "Девятая ступень",
  "Десятая ступень",
];

const state = {
  modules: [],
  lessonsByModule: new Map(),
  expandedModuleIds: new Set(),
  currentModuleId: null,
  currentLessonId: null,
  currentBlocks: [],
};

function setHeader(label, title, subtitle) {
  setCourseHeaderVisible(true);
  eyebrow.textContent = label;
  pageTitle.textContent = title;
  pageSubtitle.textContent = subtitle;
}

function setCourseHeaderVisible(isVisible) {
  topbar.hidden = !isVisible;
  pageSubtitle.hidden = !isVisible;
}

function syncBackButtons() {
  const canGoBack = state.currentLessonId !== null;
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

function configureTelegramWebApp() {
  if (!telegram) {
    return;
  }

  try {
    telegram.ready();
    telegram.expand();
    telegram.setHeaderColor?.(MINI_APP_DARK_COLOR);
    telegram.setBackgroundColor?.(MINI_APP_DARK_COLOR);
    telegram.setBottomBarColor?.(MINI_APP_DARK_COLOR);
    telegram.disableVerticalSwipes?.();

    if (telegram.isVersionAtLeast?.("8.0")) {
      const fullscreenResult = telegram.requestFullscreen?.();
      if (fullscreenResult && typeof fullscreenResult.catch === "function") {
        fullscreenResult.catch(() => {});
      }
    }
  } catch (error) {
    console.debug("Telegram WebApp viewport setup skipped:", error);
  }
}

function getLastLessonProgress() {
  const lessonId = Number(localStorage.getItem(LAST_LESSON_STORAGE_KEYS.lessonId));
  const moduleId = Number(localStorage.getItem(LAST_LESSON_STORAGE_KEYS.moduleId));
  const lessonTitle = localStorage.getItem(LAST_LESSON_STORAGE_KEYS.lessonTitle) || "";
  const openedAt = localStorage.getItem(LAST_LESSON_STORAGE_KEYS.openedAt) || "";

  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return null;
  }

  return {
    lessonId,
    moduleId: Number.isInteger(moduleId) && moduleId > 0 ? moduleId : null,
    lessonTitle,
    openedAt,
  };
}

function saveLastLessonProgress(moduleId, lesson) {
  if (!lesson?.id) {
    return;
  }

  localStorage.setItem(LAST_LESSON_STORAGE_KEYS.lessonId, String(lesson.id));
  if (moduleId) {
    localStorage.setItem(LAST_LESSON_STORAGE_KEYS.moduleId, String(moduleId));
  }
  localStorage.setItem(LAST_LESSON_STORAGE_KEYS.lessonTitle, lesson.title || "Урок");
  localStorage.setItem(LAST_LESSON_STORAGE_KEYS.openedAt, new Date().toISOString());
}

function renderTextBlock(blockElement, rawText) {
  const paragraph = document.createElement("p");
  paragraph.className = "lesson-text-content";
  paragraph.textContent = rawText;
  blockElement.append(paragraph);
}

function renderTextBlockContent(blockElement, block) {
  const rawText = block.rawText ?? String(block.content || "");
  renderTextBlock(blockElement, rawText);
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

async function loadCourseLandingConfig() {
  try {
    const settings = await fetchJson("/api/course-settings");
    courseLandingConfig = { ...DEFAULT_COURSE_LANDING_CONFIG, ...settings };
    if (!courseLandingConfig.heroImageUrl) {
      courseLandingConfig.heroImageUrl = DEFAULT_COURSE_LANDING_CONFIG.heroImageUrl;
    }
  } catch (error) {
    console.debug("Course landing settings fallback used:", error);
    courseLandingConfig = { ...DEFAULT_COURSE_LANDING_CONFIG };
  }
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

function getStepLabel(index) {
  return stepLabels[index] || `${index + 1}-я ступень`;
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

function createLessonRow(moduleId, lesson, index) {
  const button = document.createElement("button");
  button.className = "step-lesson";
  button.type = "button";
  button.addEventListener("click", () => renderLesson(moduleId, lesson.id));

  const number = document.createElement("span");
  number.className = "step-lesson-number";
  number.textContent = String(index + 1).padStart(2, "0");

  const title = document.createElement("span");
  title.className = "step-lesson-title";
  title.textContent = lesson.title;

  button.append(number, title);
  return button;
}

async function fillStepLessons(moduleElement, module) {
  const lessonList = moduleElement.querySelector(".step-lessons");
  lessonList.replaceChildren();

  try {
    const lessons = await loadLessons(module.id);
    if (lessons.length === 0) {
      const empty = document.createElement("p");
      empty.className = "step-empty";
      empty.textContent = "Уроков пока нет";
      lessonList.append(empty);
      return;
    }

    lessons.forEach((lesson, index) => {
      lessonList.append(createLessonRow(module.id, lesson, index));
    });
  } catch (error) {
    const message = document.createElement("p");
    message.className = "step-empty";
    message.textContent = error.message;
    lessonList.append(message);
  }
}

function createModuleStep(module, index) {
  const isExpanded = state.expandedModuleIds.has(module.id);
  const section = document.createElement("section");
  section.className = "course-step";
  section.dataset.moduleId = String(module.id);

  const toggle = document.createElement("button");
  toggle.className = "course-step-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", String(isExpanded));

  const titleGroup = document.createElement("span");
  titleGroup.className = "course-step-title-group";

  const label = document.createElement("span");
  label.className = "course-step-label";
  label.textContent = getStepLabel(index);

  const title = document.createElement("span");
  title.className = "course-step-title";
  title.textContent = module.title;

  const arrow = document.createElement("span");
  arrow.className = "course-step-arrow";
  arrow.textContent = isExpanded ? "↑" : "↓";
  arrow.setAttribute("aria-hidden", "true");

  titleGroup.append(label, title);
  toggle.append(titleGroup, arrow);

  const lessons = document.createElement("div");
  lessons.className = "step-lessons";
  lessons.hidden = !isExpanded;

  toggle.addEventListener("click", async () => {
    if (state.expandedModuleIds.has(module.id)) {
      state.expandedModuleIds.delete(module.id);
    } else {
      state.expandedModuleIds.add(module.id);
    }
    renderModuleSteps(false);
  });

  section.append(toggle, lessons);
  if (isExpanded) {
    fillStepLessons(section, module);
  }
  return section;
}

function createLandingImage(url, className, label) {
  const wrapper = document.createElement("div");
  wrapper.className = className;

  if (url) {
    const image = document.createElement("img");
    image.src = url;
    image.alt = label;
    image.loading = "lazy";
    image.draggable = false;
    image.addEventListener("error", () => {
      wrapper.classList.add("is-placeholder");
      wrapper.replaceChildren(createLandingPlaceholder(label));
    });
    wrapper.append(image);
    return wrapper;
  }

  wrapper.classList.add("is-placeholder");
  wrapper.append(createLandingPlaceholder(label));
  return wrapper;
}

function getHeroDisplayCopy() {
  const isOldDefaultCopy =
    (
      courseLandingConfig.heroKicker === "ПРОТОКОЛ" &&
      courseLandingConfig.heroTitle === "Следуй протоколу"
    ) ||
    (
      courseLandingConfig.heroKicker === "СЛЕДУЙ ПРОТОКОЛУ" &&
      courseLandingConfig.heroTitle === "ПРОТОКОЛ"
    );

  if (isOldDefaultCopy) {
    return {
      kicker: DEFAULT_COURSE_LANDING_CONFIG.heroKicker,
      title: DEFAULT_COURSE_LANDING_CONFIG.heroTitle,
      description: courseLandingConfig.heroDescription,
    };
  }

  return {
    kicker: courseLandingConfig.heroKicker,
    title: courseLandingConfig.heroTitle,
    description: courseLandingConfig.heroDescription,
  };
}

function getCourseDisplayTitle() {
  const configuredTitle = (courseLandingConfig.productTitle || "").trim();

  // Старое сохранённое значение не должно оставаться в интерфейсе после
  // переименования курса. Любое новое название из настроек по-прежнему можно
  // использовать без изменения кода.
  if (!configuredTitle || configuredTitle === "Протокол 0.") {
    return "Вектор";
  }

  return configuredTitle;
}

function createLandingPlaceholder(label) {
  const placeholder = document.createElement("div");
  placeholder.className = "landing-image-placeholder";

  const mark = document.createElement("span");
  mark.textContent = "PROTOCOL";

  const text = document.createElement("strong");
  text.textContent = label;

  placeholder.append(mark, text);
  return placeholder;
}

async function showModulesScreen() {
  await loadModules();
  renderModuleSteps();
}

async function continueCourseFromLanding() {
  const lastLesson = getLastLessonProgress();
  if (!lastLesson?.lessonId || !lastLesson.moduleId) {
    await showModulesScreen();
    return;
  }

  if (state.modules.length === 0) {
    await loadModules();
  }

  const moduleExists = state.modules.some((module) => module.id === lastLesson.moduleId);
  if (!moduleExists) {
    await showModulesScreen();
    return;
  }

  const lessons = await loadLessons(lastLesson.moduleId);
  const lessonExists = lessons.some((lesson) => lesson.id === lastLesson.lessonId);
  if (!lessonExists) {
    await showModulesScreen();
    return;
  }

  await renderLesson(lastLesson.moduleId, lastLesson.lessonId);
}

function renderLandingScreen() {
  state.currentModuleId = null;
  state.currentLessonId = null;
  state.currentBlocks = [];
  setCourseHeaderVisible(false);
  syncBackButtons();

  const lastLesson = getLastLessonProgress();
  content.className = "content landing-screen";
  content.replaceChildren();

  const shell = document.createElement("section");
  shell.className = "landing-shell";

  const productCard = document.createElement("article");
  productCard.className = "landing-product-card";

  const productImage = createLandingImage(
    courseLandingConfig.heroImageUrl || DEFAULT_COURSE_LANDING_CONFIG.heroImageUrl,
    "landing-product-image",
    "Вектор",
  );

  const productBody = document.createElement("div");
  productBody.className = "landing-product-body";

  const productTitle = document.createElement("h3");
  productTitle.textContent = getCourseDisplayTitle();

  const productDescription = document.createElement("p");
  productDescription.textContent = courseLandingConfig.productDescription;

  const progress = document.createElement("p");
  progress.className = "landing-product-progress";
  progress.textContent = lastLesson?.lessonTitle
    ? `Продолжить: ${lastLesson.lessonTitle}`
    : "Начать курс";

  const productMeta = document.createElement("div");
  productMeta.className = "landing-product-meta";

  const continueButton = document.createElement("button");
  continueButton.className = "landing-continue-button";
  continueButton.type = "button";
  continueButton.textContent = courseLandingConfig.continueButtonText;
  continueButton.addEventListener("click", () => {
    continueCourseFromLanding().catch((error) => {
      showMessage("Не удалось продолжить", error.message, "Повторить", continueCourseFromLanding);
    });
  });

  productMeta.append(continueButton);
  productBody.append(productTitle, productDescription, progress, productMeta);
  productCard.append(productImage, productBody);

  shell.append(productCard);
  content.append(shell);
}

function renderModuleSteps(resetLessonState = true) {
  if (resetLessonState) {
    state.currentModuleId = null;
    state.currentLessonId = null;
    state.currentBlocks = [];
  }
  content.className = "content course-steps";
  content.replaceChildren();
  setCourseHeaderVisible(false);

  if (state.modules.length === 0) {
    showMessage(
      "Курс пока пуст",
      "Добавьте первый модуль и урок через админ-панель, затем обновите эту страницу."
    );
    syncBackButtons();
    return;
  }

  const menuIntro = document.createElement("section");
  menuIntro.className = "course-menu-intro";

  const closeMenu = document.createElement("button");
  closeMenu.className = "course-menu-close";
  closeMenu.type = "button";
  closeMenu.setAttribute("aria-label", "Вернуться на главный экран");
  closeMenu.textContent = "×";
  closeMenu.addEventListener("click", renderLandingScreen);

  const menuTitle = document.createElement("div");
  menuTitle.className = "course-menu-title";

  const menuName = document.createElement("strong");
  menuName.textContent = getCourseDisplayTitle();

  menuTitle.append(menuName);
  menuIntro.append(closeMenu, menuTitle);
  content.append(menuIntro);

  state.modules.forEach((module, index) => {
    content.append(createModuleStep(module, index));
  });
  syncBackButtons();
}

async function renderModules() {
  try {
    await loadModules();
    renderModuleSteps();
  } catch (error) {
    showMessage("Не удалось загрузить курс", error.message, "Повторить", renderModules);
    syncBackButtons();
  }
}

function renderParagraphs(container, text) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  paragraphs.forEach((paragraph) => {
    const paragraphElement = document.createElement("p");
    paragraphElement.textContent = paragraph;
    container.append(paragraphElement);
  });
}

function getYouTubeEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) {
      const videoId = parsed.searchParams.get("v") || parsed.pathname.split("/").pop();
      return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
    }
    if (parsed.hostname === "youtu.be") {
      const videoId = parsed.pathname.replace("/", "");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
    }
  } catch {
    return "";
  }
  return "";
}

function appendTextBlock(article, block) {
  const blockElement = document.createElement("section");
  blockElement.className = "lesson-block lesson-block-text";
  renderTextBlockContent(blockElement, block);
  article.append(blockElement);
}

function appendImageBlock(article, block) {
  const image = document.createElement("img");
  image.className = "lesson-image";
  image.src = block.content;
  image.alt = "";
  image.loading = "lazy";
  image.draggable = false;
  article.append(image);
}

function appendVideoBlock(article, block) {
  const embedUrl = getYouTubeEmbedUrl(block.content);
  if (embedUrl) {
    const frameWrap = document.createElement("div");
    frameWrap.className = "lesson-video-frame";
    const iframe = document.createElement("iframe");
    iframe.src = embedUrl;
    iframe.title = "Видео урока";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    frameWrap.append(iframe);
    article.append(frameWrap);
    return;
  }

  const link = document.createElement("a");
  link.className = "primary-button lesson-video-link";
  link.href = block.content;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Открыть видео";
  article.append(link);
}

function appendLessonBlock(article, block) {
  if (block.type === "image") {
    appendImageBlock(article, block);
    return;
  }
  if (block.type === "video") {
    appendVideoBlock(article, block);
    return;
  }
  appendTextBlock(article, block);
}

async function renderLesson(moduleId, lessonId) {
  const module = state.modules.find((item) => item.id === moduleId);
  state.currentModuleId = moduleId;
  state.currentLessonId = lessonId;
  state.currentBlocks = [];
  content.className = "content";
  content.replaceChildren();
  setHeader(module?.title || "Урок", "Загрузка урока…", "Подождите несколько секунд.");

  try {
    await loadLessons(moduleId);
    const [lesson, blocks] = await Promise.all([
      fetchJson(`/api/lessons/${lessonId}`),
      fetchJson(`/api/lessons/${lessonId}/blocks`),
    ]);
    state.currentBlocks = blocks.map((block) => ({
      ...block,
      rawText: String(block.content || ""),
    }));
    saveLastLessonProgress(moduleId, lesson);
    setHeader(lesson.module_title || module?.title || "Урок", lesson.title, "Читайте в удобном темпе.");

    const article = document.createElement("article");
    article.className = "lesson";
    if (blocks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "В уроке пока нет содержимого.";
      article.append(empty);
    } else {
      state.currentBlocks.forEach((block) => appendLessonBlock(article, block));
    }

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
    showMessage("Не удалось открыть урок", error.message, "Вернуться к ступеням", renderModules);
  }
  syncBackButtons();
}

function goBack() {
  state.currentModuleId = null;
  state.currentLessonId = null;
  state.currentBlocks = [];
  renderModuleSteps();
}

backButton.addEventListener("click", goBack);
telegram?.BackButton?.onClick(goBack);
configureTelegramWebApp();

async function renderApp() {
  try {
    await Promise.all([loadModules(), loadCourseLandingConfig()]);
    renderLandingScreen();
  } catch (error) {
    showMessage("Не удалось загрузить курс", error.message, "Повторить", renderApp);
    syncBackButtons();
  }
}

renderApp();
