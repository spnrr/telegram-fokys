"use strict";

const telegram = window.Telegram?.WebApp;
const content = document.querySelector("#content");
const pageTitle = document.querySelector("#pageTitle");
const pageSubtitle = document.querySelector("#pageSubtitle");
const eyebrow = document.querySelector("#eyebrow");
const backButton = document.querySelector("#backButton");
const MINI_APP_DARK_COLOR = "#0b0d0f";
const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink", "purple"];

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
  activeSelection: null,
  activeHighlight: null,
  selectionToolbar: null,
  copyNotice: null,
  copyNoticeTimer: null,
};

function setHeader(label, title, subtitle) {
  eyebrow.textContent = label;
  pageTitle.textContent = title;
  pageSubtitle.textContent = subtitle;
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

function getElementFromNode(node) {
  if (!node) {
    return null;
  }
  return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
}

function getLessonElementFromTarget(target) {
  return getElementFromNode(target)?.closest?.(".lesson") || null;
}

function isSelectionInsideLesson() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return false;
  }
  const range = selection.getRangeAt(0);
  return Boolean(getLessonElementFromTarget(range.commonAncestorContainer));
}

function showCopyNotice(message = "Копирование отключено") {
  if (!state.copyNotice) {
    state.copyNotice = document.createElement("div");
    state.copyNotice.className = "copy-notice";
    state.copyNotice.setAttribute("role", "status");
    state.copyNotice.setAttribute("aria-live", "polite");
    document.body.append(state.copyNotice);
  }

  state.copyNotice.textContent = message;
  state.copyNotice.hidden = false;
  state.copyNotice.classList.add("is-visible");

  window.clearTimeout(state.copyNoticeTimer);
  state.copyNoticeTimer = window.setTimeout(() => {
    state.copyNotice?.classList.remove("is-visible");
    state.copyNoticeTimer = window.setTimeout(() => {
      if (state.copyNotice) {
        state.copyNotice.hidden = true;
      }
    }, 180);
  }, 1600);
}

function blockProtectedLessonEvent(event) {
  if (getLessonElementFromTarget(event.target) || isSelectionInsideLesson()) {
    event.preventDefault();
    showCopyNotice();
    return true;
  }
  return false;
}

function handleProtectedKeydown(event) {
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && (key === "c" || key === "x")) {
    blockProtectedLessonEvent(event);
  }
}

function getHighlightStorageKey(lessonId) {
  return `lesson_highlights_${lessonId}`;
}

function makeHighlightId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `highlight_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function readLessonHighlights(lessonId = state.currentLessonId) {
  if (lessonId === null || lessonId === undefined) {
    return [];
  }

  try {
    const raw = localStorage.getItem(getHighlightStorageKey(lessonId));
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item) => item && HIGHLIGHT_COLORS.includes(item.color))
      .map((item) => ({
        id: String(item.id || makeHighlightId()),
        blockId: String(item.blockId),
        startOffset: Number(item.startOffset),
        endOffset: Number(item.endOffset),
        color: item.color,
      }))
      .filter(
        (item) =>
          Number.isInteger(item.startOffset) &&
          Number.isInteger(item.endOffset) &&
          item.startOffset >= 0 &&
          item.endOffset > item.startOffset
      );
  } catch {
    return [];
  }
}

function writeLessonHighlights(highlights, lessonId = state.currentLessonId) {
  if (lessonId === null || lessonId === undefined) {
    return;
  }
  try {
    localStorage.setItem(getHighlightStorageKey(lessonId), JSON.stringify(highlights));
  } catch {
    showCopyNotice("Не удалось сохранить выделение");
  }
}

function getBlockHighlights(blockId, textLength) {
  const blockHighlights = readLessonHighlights()
    .filter((highlight) => highlight.blockId === String(blockId))
    .filter((highlight) => highlight.endOffset <= textLength)
    .sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset);

  const cleanHighlights = [];
  let lastEnd = 0;
  blockHighlights.forEach((highlight) => {
    if (highlight.startOffset >= lastEnd) {
      cleanHighlights.push(highlight);
      lastEnd = highlight.endOffset;
    }
  });
  return cleanHighlights;
}

function getBlockStorageId(block, index = 0) {
  if (block.id !== null && block.id !== undefined) {
    return String(block.id);
  }
  return `legacy-${index}`;
}

function getTextNodeOffset(root, targetNode, targetOffset) {
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node === targetNode) {
      return offset + targetOffset;
    }
    offset += node.textContent.length;
    node = walker.nextNode();
  }
  return null;
}

function getParagraphRanges(text) {
  const ranges = [];
  const separatorPattern = /\n{2,}/g;
  let start = 0;
  let match = separatorPattern.exec(text);

  while (match) {
    if (match.index > start) {
      ranges.push({ start, end: match.index });
    }
    start = separatorPattern.lastIndex;
    match = separatorPattern.exec(text);
  }

  if (start < text.length) {
    ranges.push({ start, end: text.length });
  }

  return ranges.length > 0 ? ranges : [{ start: 0, end: 0 }];
}

function appendHighlightedText(parent, text, start, end, highlights) {
  let cursor = start;
  const relevantHighlights = highlights.filter(
    (highlight) => highlight.startOffset < end && highlight.endOffset > start
  );

  relevantHighlights.forEach((highlight) => {
    const highlightStart = Math.max(highlight.startOffset, start);
    const highlightEnd = Math.min(highlight.endOffset, end);

    if (cursor < highlightStart) {
      parent.append(document.createTextNode(text.slice(cursor, highlightStart)));
    }

    const span = document.createElement("span");
    span.className = `highlight highlight-${highlight.color}`;
    span.dataset.highlightId = highlight.id;
    span.dataset.blockId = highlight.blockId;
    span.textContent = text.slice(highlightStart, highlightEnd);
    parent.append(span);
    cursor = highlightEnd;
  });

  if (cursor < end) {
    parent.append(document.createTextNode(text.slice(cursor, end)));
  }
}

function renderTextBlockContent(blockElement, block) {
  const text = String(block.content || "");
  const highlights = getBlockHighlights(block.highlightBlockId || getBlockStorageId(block), text.length);
  blockElement.replaceChildren();

  getParagraphRanges(text).forEach((range) => {
    const paragraph = document.createElement("p");
    appendHighlightedText(paragraph, text, range.start, range.end, highlights);
    blockElement.append(paragraph);
  });
}

function rerenderLessonTextBlocks() {
  document.querySelectorAll(".lesson-text-block").forEach((blockElement) => {
    const block = state.currentBlocks.find((item) => item.highlightBlockId === blockElement.dataset.blockId);
    if (block) {
      renderTextBlockContent(blockElement, block);
    }
  });
}

function selectionTouchesBlockedElement(selection) {
  if (!selection || selection.rangeCount === 0) {
    return true;
  }
  const range = selection.getRangeAt(0);
  const element = getElementFromNode(range.commonAncestorContainer);
  return Boolean(element?.closest?.("button, a, iframe, img, .lesson-navigation, .selection-toolbar"));
}

function getSelectedLessonTextRange() {
  const selection = window.getSelection();
  if (
    !selection ||
    selection.rangeCount === 0 ||
    selection.isCollapsed ||
    !selection.toString().trim() ||
    selectionTouchesBlockedElement(selection)
  ) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const startBlock = getElementFromNode(range.startContainer)?.closest?.(".lesson-text-block");
  const endBlock = getElementFromNode(range.endContainer)?.closest?.(".lesson-text-block");

  if (!startBlock || !endBlock || startBlock !== endBlock) {
    return null;
  }

  const startOffset = getTextNodeOffset(startBlock, range.startContainer, range.startOffset);
  const endOffset = getTextNodeOffset(startBlock, range.endContainer, range.endOffset);
  if (startOffset === null || endOffset === null || endOffset <= startOffset) {
    return null;
  }

  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    return null;
  }

  return {
    lessonId: state.currentLessonId,
    blockId: startBlock.dataset.blockId,
    startOffset,
    endOffset,
    rect,
  };
}

function hideSelectionToolbar() {
  state.activeSelection = null;
  state.activeHighlight = null;
  if (state.selectionToolbar) {
    state.selectionToolbar.hidden = true;
  }
}

function positionToolbar(rect) {
  const toolbar = ensureSelectionToolbar();
  toolbar.hidden = false;
  const margin = 10;
  const toolbarRect = toolbar.getBoundingClientRect();
  const left = Math.min(
    Math.max(margin, rect.left + rect.width / 2 - toolbarRect.width / 2),
    window.innerWidth - toolbarRect.width - margin
  );
  const top = rect.top > toolbarRect.height + margin * 2
    ? rect.top - toolbarRect.height - margin
    : rect.bottom + margin;

  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${Math.min(Math.max(margin, top), window.innerHeight - toolbarRect.height - margin)}px`;
}

function setToolbarMode(mode) {
  const toolbar = ensureSelectionToolbar();
  toolbar.dataset.mode = mode;
  toolbar.querySelector(".selection-toolbar-remove").hidden = mode !== "highlight";
}

function ensureSelectionToolbar() {
  if (state.selectionToolbar) {
    return state.selectionToolbar;
  }

  const toolbar = document.createElement("div");
  toolbar.className = "selection-toolbar";
  toolbar.hidden = true;
  toolbar.addEventListener("mousedown", (event) => event.preventDefault());
  toolbar.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });

  HIGHLIGHT_COLORS.forEach((color) => {
    const button = document.createElement("button");
    button.className = `selection-color selection-color-${color}`;
    button.type = "button";
    button.dataset.color = color;
    button.setAttribute("aria-label", `Выделить цветом: ${color}`);
    button.addEventListener("click", () => applyHighlightColor(color));
    toolbar.append(button);
  });

  const removeButton = document.createElement("button");
  removeButton.className = "selection-toolbar-remove";
  removeButton.type = "button";
  removeButton.textContent = "×";
  removeButton.title = "Убрать выделение";
  removeButton.setAttribute("aria-label", "Убрать выделение");
  removeButton.hidden = true;
  removeButton.addEventListener("click", removeActiveHighlight);
  toolbar.append(removeButton);

  document.body.append(toolbar);
  state.selectionToolbar = toolbar;
  return toolbar;
}

function showToolbarForCurrentSelection() {
  const selectedRange = getSelectedLessonTextRange();
  if (!selectedRange) {
    if (!state.activeHighlight) {
      hideSelectionToolbar();
    }
    return;
  }

  state.activeSelection = selectedRange;
  state.activeHighlight = null;
  setToolbarMode("selection");
  positionToolbar(selectedRange.rect);
}

function applyHighlightColor(color) {
  if (!HIGHLIGHT_COLORS.includes(color)) {
    return;
  }

  const highlights = readLessonHighlights();
  if (state.activeHighlight) {
    const updated = highlights.map((highlight) =>
      highlight.id === state.activeHighlight.id ? { ...highlight, color } : highlight
    );
    writeLessonHighlights(updated);
  } else if (state.activeSelection) {
    const nextHighlight = {
      id: makeHighlightId(),
      blockId: String(state.activeSelection.blockId),
      startOffset: state.activeSelection.startOffset,
      endOffset: state.activeSelection.endOffset,
      color,
    };
    const withoutOverlaps = highlights.filter(
      (highlight) =>
        highlight.blockId !== nextHighlight.blockId ||
        highlight.endOffset <= nextHighlight.startOffset ||
        highlight.startOffset >= nextHighlight.endOffset
    );
    writeLessonHighlights([...withoutOverlaps, nextHighlight]);
  }

  window.getSelection()?.removeAllRanges();
  hideSelectionToolbar();
  rerenderLessonTextBlocks();
}

function showToolbarForHighlight(highlightElement) {
  const highlights = readLessonHighlights();
  const highlight = highlights.find((item) => item.id === highlightElement.dataset.highlightId);
  if (!highlight) {
    return;
  }

  state.activeSelection = null;
  state.activeHighlight = highlight;
  window.getSelection()?.removeAllRanges();
  setToolbarMode("highlight");
  positionToolbar(highlightElement.getBoundingClientRect());
}

function removeActiveHighlight() {
  if (!state.activeHighlight) {
    return;
  }
  const updated = readLessonHighlights().filter((highlight) => highlight.id !== state.activeHighlight.id);
  writeLessonHighlights(updated);
  hideSelectionToolbar();
  rerenderLessonTextBlocks();
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

function renderModuleSteps(resetLessonState = true) {
  if (resetLessonState) {
    state.currentModuleId = null;
    state.currentLessonId = null;
    state.currentBlocks = [];
  }
  hideSelectionToolbar();
  content.className = "content course-steps";
  content.replaceChildren();
  setHeader("protocol", "Ступени курса", "Раскройте модуль и выберите урок.");

  if (state.modules.length === 0) {
    showMessage(
      "Курс пока пуст",
      "Добавьте первый модуль и урок через админ-панель, затем обновите эту страницу."
    );
    syncBackButtons();
    return;
  }

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
  blockElement.className = "lesson-block lesson-block-text lesson-text-block";
  blockElement.dataset.blockId = block.highlightBlockId || getBlockStorageId(block);
  blockElement.dataset.lessonId = String(state.currentLessonId);
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
  hideSelectionToolbar();
  content.className = "content";
  content.replaceChildren();
  setHeader(module?.title || "Урок", "Загрузка урока…", "Подождите несколько секунд.");

  try {
    await loadLessons(moduleId);
    const [lesson, blocks] = await Promise.all([
      fetchJson(`/api/lessons/${lessonId}`),
      fetchJson(`/api/lessons/${lessonId}/blocks`),
    ]);
    state.currentBlocks = blocks.map((block, index) => ({
      ...block,
      highlightBlockId: getBlockStorageId(block, index),
    }));
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

document.addEventListener("copy", blockProtectedLessonEvent);
document.addEventListener("cut", blockProtectedLessonEvent);
document.addEventListener("contextmenu", blockProtectedLessonEvent);
document.addEventListener("dragstart", blockProtectedLessonEvent);
document.addEventListener("keydown", handleProtectedKeydown);

document.addEventListener("selectionchange", () => {
  window.setTimeout(showToolbarForCurrentSelection, 0);
});
document.addEventListener("mouseup", showToolbarForCurrentSelection);
document.addEventListener("keyup", showToolbarForCurrentSelection);
document.addEventListener("touchend", () => {
  window.setTimeout(showToolbarForCurrentSelection, 240);
});
document.addEventListener("scroll", hideSelectionToolbar, true);
document.addEventListener("click", (event) => {
  if (event.target.closest?.(".selection-toolbar")) {
    return;
  }

  const highlight = event.target.closest?.(".highlight");
  if (highlight?.closest?.(".lesson-text-block")) {
    event.preventDefault();
    showToolbarForHighlight(highlight);
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    hideSelectionToolbar();
  }
});

renderModules();
