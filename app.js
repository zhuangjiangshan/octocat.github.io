const STORAGE_KEYS = {
  apiKey: "creative-word-assistant-deepseek-api-key-v1",
  model: "creative-word-assistant-deepseek-model-v1",
  history: "creative-word-assistant-history-v2",
};

const LEGACY_MODEL_KEY = "creative-word-assistant-model-v1";
const LEGACY_HISTORY_KEY = "creative-word-assistant-history-v1";
const MAX_HISTORY = 14;
const MIN_LOADING_MS = 520;
const TERM_TARGET = 8;
const BASE_GRID_SIZE = 44;
const MIN_ZOOM = 0.28;
const MAX_ZOOM = 2.4;
const SVG_MIN = -50000;
const SVG_SIZE = 100000;
const PAN_INERTIA_MIN_SPEED = 0.075;
const PAN_INERTIA_FRICTION = 0.88;
const PAN_INERTIA_MAX_VELOCITY = 1.6;
const PAN_SAMPLE_WINDOW_MS = 140;
const PAN_INERTIA_MAX_HOLD_MS = 280;
const PAN_CLICK_MOVE_TOLERANCE = 5;

const app = document.querySelector("#app");
const canvas = document.querySelector("#canvas");
const canvasWorld = document.querySelector("#canvasWorld");
const promptForm = document.querySelector("#promptForm");
const promptInput = document.querySelector("#promptInput");
const submitBtn = document.querySelector("#submitBtn");
const wordLayer = document.querySelector("#wordLayer");
const linkLayer = document.querySelector("#linkLayer");
const modeBadge = document.querySelector("#modeBadge");
const loadingChip = document.querySelector("#loadingChip");
const toast = document.querySelector("#toast");
const selectionPanel = document.querySelector("#selectionPanel");
const selectedList = document.querySelector("#selectedList");
const clearSelectionBtn = document.querySelector("#clearSelectionBtn");
const ideaBtn = document.querySelector("#ideaBtn");
const ideaList = document.querySelector("#ideaList");
const settingsBtn = document.querySelector("#settingsBtn");
const settingsDrawer = document.querySelector("#settingsDrawer");
const apiKeyInput = document.querySelector("#apiKeyInput");
const modelInput = document.querySelector("#modelInput");
const saveSettingsBtn = document.querySelector("#saveSettingsBtn");
const settingsStatus = document.querySelector("#settingsStatus");
const historyBtn = document.querySelector("#historyBtn");
const historyDrawer = document.querySelector("#historyDrawer");
const historyList = document.querySelector("#historyList");
const clearHistoryBtn = document.querySelector("#clearHistoryBtn");
const zoomOutBtn = document.querySelector("#zoomOutBtn");
const zoomInBtn = document.querySelector("#zoomInBtn");
const fitViewBtn = document.querySelector("#fitViewBtn");
const homeViewBtn = document.querySelector("#homeViewBtn");
const newCanvasBtn = document.querySelector("#newCanvasBtn");
const zoomStatus = document.querySelector("#zoomStatus");
const selectionRect = document.querySelector("#selectionRect");
const nodeMenu = document.querySelector("#nodeMenu");
const menuSelectBtn = document.querySelector("#menuSelectBtn");
const menuDeleteBtn = document.querySelector("#menuDeleteBtn");
const menuSelectionSummary = document.querySelector("#menuSelectionSummary");
const menuIdeaBtn = document.querySelector("#menuIdeaBtn");
const menuIdeaList = document.querySelector("#menuIdeaList");

const state = {
  apiKey: localStorage.getItem(STORAGE_KEYS.apiKey) || "",
  model: localStorage.getItem(STORAGE_KEYS.model) || "deepseek-v4-flash",
  history: loadHistory(),
  viewport: {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    zoom: 1,
  },
  nodes: [],
  links: [],
  selectedIds: new Set(),
  activeId: "",
  rootSeed: "",
  sessionId: "",
  ideas: [],
  isBusy: false,
  loadingNodeId: "",
  jumpNodeId: "",
  refiningIdeaIndex: -1,
  pointer: null,
  menuNodeId: "",
  suppressNextClickId: "",
  toastTimer: 0,
  longPressTimer: 0,
  persistTimer: 0,
  inertiaFrame: 0,
  isSpacePanning: false,
};

if (!localStorage.getItem(STORAGE_KEYS.model) && localStorage.getItem(LEGACY_MODEL_KEY)) {
  const legacyModel = localStorage.getItem(LEGACY_MODEL_KEY) || "";
  state.model = legacyModel.startsWith("deepseek") ? legacyModel : "deepseek-v4-flash";
}

apiKeyInput.value = state.apiKey;
modelInput.value = state.model;

promptForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const phrase = normalizePhrase(promptInput.value);
  if (!phrase) {
    showToast("先输入一个词");
    return;
  }

  promptInput.value = "";
  await submitPhrase(phrase);
});

canvas.addEventListener("pointerdown", beginCanvasPan);
canvas.addEventListener("mousedown", beginCanvasPan);
canvas.addEventListener("auxclick", (event) => {
  if (event.button === 1) event.preventDefault();
});
canvas.addEventListener("wheel", handleCanvasWheel, { passive: false });
window.addEventListener("pointermove", handlePointerMove);
window.addEventListener("pointerup", endPointerAction);
window.addEventListener("pointercancel", endPointerAction);
window.addEventListener("mousemove", handlePointerMove);
window.addEventListener("mouseup", endPointerAction);
window.addEventListener("click", (event) => {
  if (!event.target.closest(".node-menu")) hideNodeMenu();
});
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("blur", resetInteractionModes);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) resetInteractionModes();
});
window.addEventListener("contextmenu", (event) => {
  if (!event.target.closest(".word-node")) hideNodeMenu();
});
window.addEventListener("resize", () => {
  if (state.nodes.length === 0) {
    centerEmptyViewport();
  } else {
    applyViewport();
  }
});

zoomOutBtn.addEventListener("click", () => zoomAtViewportCenter(0.86));
zoomInBtn.addEventListener("click", () => zoomAtViewportCenter(1.16));
fitViewBtn.addEventListener("click", () => {
  stopPanInertia();
  if (state.nodes.length === 0) {
    centerEmptyViewport();
  } else {
    fitViewToNodes();
  }
  persistSnapshot();
});
homeViewBtn.addEventListener("click", goHomeView);
newCanvasBtn.addEventListener("click", createBlankCanvas);

settingsBtn.addEventListener("click", () => toggleDrawer(settingsDrawer));
historyBtn.addEventListener("click", () => toggleDrawer(historyDrawer));

menuSelectBtn.addEventListener("click", () => {
  if (!state.menuNodeId) return;
  toggleSelected(state.menuNodeId);
  hideNodeMenu();
});

menuDeleteBtn.addEventListener("click", () => {
  if (!state.menuNodeId) return;
  deleteNodeBranch(state.menuNodeId);
  hideNodeMenu();
});

menuIdeaBtn.addEventListener("click", async () => {
  await generateIdeas();
  renderNodeMenuContent();
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => {
    const drawer = document.querySelector(`#${button.dataset.close}`);
    if (drawer) drawer.hidden = true;
  });
});

saveSettingsBtn.addEventListener("click", () => {
  state.apiKey = apiKeyInput.value.trim();
  state.model = modelInput.value.trim() || "deepseek-v4-flash";
  localStorage.setItem(STORAGE_KEYS.apiKey, state.apiKey);
  localStorage.setItem(STORAGE_KEYS.model, state.model);
  settingsStatus.textContent = state.apiKey ? "已保存，后续会优先调用 DeepSeek" : "已保存，当前使用本地模式";
  render();
});

clearSelectionBtn.addEventListener("click", () => {
  state.selectedIds.clear();
  state.ideas = [];
  render();
  persistSnapshot();
});

ideaBtn.addEventListener("click", async () => {
  await generateIdeas();
});

clearHistoryBtn.addEventListener("click", () => {
  state.history = [];
  localStorage.removeItem(STORAGE_KEYS.history);
  localStorage.removeItem(LEGACY_HISTORY_KEY);
  renderHistory();
});

applyViewport();
render();

async function submitPhrase(phrase) {
  if (state.isBusy) {
    showToast("正在生成中");
    return;
  }

  const activeNode = getActiveNode();
  if (state.nodes.length > 0 && activeNode) {
    const manualNode = createNode({
      zh: phrase,
      en: "custom seed",
      x: activeNode.x,
      y: activeNode.y,
      level: activeNode.level + 1,
      parentId: activeNode.id,
      seed: phrase,
    });
    const position = findOpenPosition(activeNode, 1, 0);
    manualNode.x = position.x;
    manualNode.y = position.y;
    state.nodes.push(manualNode);
    state.links.push({ from: activeNode.id, to: manualNode.id });
    state.activeId = manualNode.id;
    state.jumpNodeId = manualNode.id;
    render();
    await expandNode(manualNode.id, { source: "input" });
    return;
  }

  await startMap(phrase);
}

async function startMap(phrase) {
  const rootPoint = screenToWorld(window.innerWidth / 2, window.innerHeight * 0.46);
  const root = createNode({
    zh: phrase,
    en: "source phrase",
    x: rootPoint.x,
    y: rootPoint.y,
    level: 0,
    parentId: "",
    seed: phrase,
  });

  state.nodes = [root];
  state.links = [];
  state.selectedIds = new Set();
  state.activeId = root.id;
  state.rootSeed = phrase;
  state.sessionId = makeId("history");
  state.ideas = [];
  state.jumpNodeId = root.id;
  render();

  await expandNode(root.id, { source: "root" });
}

async function expandNode(nodeId, options = {}) {
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node || state.isBusy) return;

  state.isBusy = true;
  state.loadingNodeId = nodeId;
  state.activeId = nodeId;
  loadingChip.textContent = `正在扩散：${node.zh}`;
  loadingChip.hidden = false;
  render();

  const start = Date.now();
  try {
    const existingTerms = new Set(state.nodes.map((item) => item.zh));
    const terms = await generateTerms(node, existingTerms, options);
    await waitForMinimum(start);
    addTermNodes(node, terms);
    state.jumpNodeId = "";
    persistSnapshot();
  } catch (error) {
    console.warn(error);
    showToast("生成失败，已切换本地词库");
    const fallbackTerms = makeFallbackTerms(node.zh, new Set(state.nodes.map((item) => item.zh)));
    await waitForMinimum(start);
    addTermNodes(node, fallbackTerms);
    persistSnapshot();
  } finally {
    state.isBusy = false;
    state.loadingNodeId = "";
    loadingChip.hidden = true;
    render();
  }
}

function addTermNodes(parent, terms) {
  const normalized = normalizeTerms(terms, parent.zh, new Set(state.nodes.map((item) => item.zh)));
  normalized.forEach((term, index) => {
    const position = findOpenPosition(parent, normalized.length, index);
    const child = createNode({
      zh: term.zh,
      en: term.en,
      x: position.x,
      y: position.y,
      level: parent.level + 1,
      parentId: parent.id,
      seed: term.zh,
    });
    state.nodes.push(child);
    state.links.push({ from: parent.id, to: child.id });
  });
}

async function generateTerms(node, existingTerms, options) {
  if (!state.apiKey) {
    return makeFallbackTerms(node.zh, existingTerms);
  }

  try {
    const prompt = [
      "你是一个中文创意发散软件的词语联想引擎。",
      `当前词语：${node.zh}`,
      `当前英文提示：${node.en || ""}`,
      `已有词语：${Array.from(existingTerms).slice(-40).join("、")}`,
      options.source === "input"
        ? "这是用户手动接到当前词语上的新输入，请围绕它和父级语义一起扩散。"
        : "请继续做网状联想扩散。",
      "生成 8 个相关词语，中文为主，短、灵动、有网感，避免重复已有词语。",
      "每个词语必须带英文翻译。英文保持 1 到 4 个英文词。",
      "只返回 JSON，格式为：{\"terms\":[{\"zh\":\"中文词\",\"en\":\"English\"}]}",
    ].join("\n");

    const payload = await requestDeepSeekJson(prompt);
    return Array.isArray(payload.terms) ? payload.terms : [];
  } catch (error) {
    console.warn(error);
    showToast("DeepSeek 暂不可用，已使用本地模式");
    return makeFallbackTerms(node.zh, existingTerms);
  }
}

async function generateIdeas() {
  if (state.isBusy) {
    showToast("正在生成中");
    return;
  }

  const selectedNodes = getSelectedNodes();
  if (selectedNodes.length === 0) {
    showToast("先右键选择词语");
    return;
  }

  if (!state.apiKey) {
    state.ideas = [];
    renderSelection();
    showToast("请先在 API 设置里保存 DeepSeek API Key");
    return;
  }

  state.isBusy = true;
  ideaBtn.disabled = true;
  ideaBtn.textContent = "生成中";
  renderSelection();

  const start = Date.now();
  try {
    const ideas = await requestDeepSeekIdeas(selectedNodes);
    await waitForMinimum(start);
    const normalizedIdeas = normalizeIdeas(ideas, selectedNodes);
    if (normalizedIdeas.length === 0) {
      throw new Error("AI 没有返回有效创意方案");
    }
    state.ideas = normalizedIdeas;
    persistSnapshot();
  } catch (error) {
    console.warn(error);
    showToast(`DeepSeek 请求失败：${error.message || "请检查 API Key 和网络"}`);
    await waitForMinimum(start);
    state.ideas = [];
  } finally {
    state.isBusy = false;
    ideaBtn.disabled = false;
    ideaBtn.textContent = "生成创意方案";
    render();
  }
}

async function requestDeepSeekIdeas(selectedNodes) {
  const words = selectedNodes.map((node) => `${node.zh} (${node.en})`).join("、");
  const prompt = [
    "你是一个中文创意概念生成器。",
    `初始主题：${state.rootSeed || "未命名主题"}`,
    `用户选择的词语：${words}`,
    "请基于这些词语生成 4 个简单、清楚、有画面感的创意概念。",
    "第一版只需要概念方向，不要写成长篇方案；每个 description 用自然完整的一两句话说明核心想法即可。",
    "不要限制字数，但不要故意写很长；重点是表达完整、好理解、方便继续细化。",
    "只返回 JSON，格式为：{\"ideas\":[{\"title\":\"标题\",\"description\":\"概念说明\",\"keywords\":[\"词1\",\"词2\"]}]}",
  ].join("\n");

  const payload = await requestDeepSeekJson(prompt);
  return Array.isArray(payload.ideas) ? payload.ideas : [];
}

async function requestDeepSeekIdeaDetail(idea, selectedNodes) {
  const words = selectedNodes.map((node) => `${node.zh} (${node.en})`).join("、");
  const prompt = [
    "你是一个中文创意方案细化器。",
    `初始主题：${state.rootSeed || "未命名主题"}`,
    `用户选择的词语：${words}`,
    `待细化标题：${idea.title}`,
    `待细化概念：${idea.description}`,
    "请把这个概念明显扩展成一个更具体的创意方案，不要只是换一种说法。",
    "description 必须包含三个部分：画面/场景、用户动作或内容机制、最后产生的结果或价值。",
    "写 3 到 5 句自然中文，可以使用分号，但必须比原概念更长、更具体、更可执行。",
    "保持标题短；如果原标题不够准确，可以换一个更有辨识度的标题。",
    "只返回 JSON，格式为：{\"idea\":{\"title\":\"标题\",\"description\":\"细化说明\",\"keywords\":[\"词1\",\"词2\"]}}",
  ].join("\n");

  const payload = await requestDeepSeekJson(prompt);
  return payload.idea || payload.ideas?.[0] || {};
}

async function requestDeepSeekIdeaDetail(idea, selectedNodes) {
  const words = selectedNodes.map((node) => `${node.zh} (${node.en})`).join("、");
  const prompt = [
    "你是一位资深 IP 设计师、品牌创意总监和世界观设定师，不是普通文案扩写工具。",
    `初始主题：${state.rootSeed || "未命名主题"}`,
    `用户选择的词语：${words}`,
    `待细化标题：${idea.title}`,
    `待细化概念：${idea.description}`,
    "请从 IP 设计师的角度进行充分思维发散，不要限制字数，不要只是把原句变长。你需要把它发展成一个可继续做视觉设计、角色设计、品牌故事和商业化延展的创意方向。",
    "description 请尽量包含：核心 IP 概念、角色或主体设定、性格气质、视觉符号、颜色与材质联想、典型场景、故事世界观、互动体验、衍生品或传播玩法、用户能感受到的情绪价值。",
    "请写得具体、有画面、有设计判断。可以像一段完整的 IP 概念 brief，允许使用分号和短段落式表达，但不要输出 Markdown，不要编号列表，不要空泛套话。",
    "标题可以重命名为更有 IP 辨识度、更像项目提案标题的中文短标题。",
    "只返回 JSON，格式为：{\"idea\":{\"title\":\"标题\",\"description\":\"细化说明\",\"keywords\":[\"词1\",\"词2\"]}}",
  ].join("\n");

  const payload = await requestDeepSeekJson(prompt);
  return payload.idea || payload.ideas?.[0] || {};
}

async function requestDeepSeekJson(prompt) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.apiKey}`,
    },
    body: JSON.stringify({
      model: state.model || "deepseek-v4-flash",
      messages: [
        {
          role: "system",
          content: "你只输出严格 JSON，不要输出 Markdown、解释或代码块。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.9,
      top_p: 0.92,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "DeepSeek 请求失败";
    throw new Error(message);
  }

  const text = data?.choices?.[0]?.message?.content || "";
  return parseJsonText(text);
}

function render() {
  app.classList.toggle("has-map", state.nodes.length > 0);
  submitBtn.disabled = state.isBusy;
  modeBadge.textContent = state.apiKey ? "DeepSeek" : "本地模式";
  renderLinks();
  renderNodes();
  renderSelection();
  renderHistory();
  applyViewport();
}

function renderNodes() {
  wordLayer.innerHTML = state.nodes
    .map((node) => {
      const classes = [
        "word-node",
        node.level === 0 ? "is-root" : "",
        node.id === state.activeId ? "is-active" : "",
        state.selectedIds.has(node.id) ? "is-picked" : "",
        node.id === state.loadingNodeId ? "is-loading" : "",
        node.id === state.jumpNodeId ? "is-jumping" : "",
      ]
        .filter(Boolean)
        .join(" ");

      return `
        <button
          class="${classes}"
          type="button"
          data-node-id="${escapeHtml(node.id)}"
          style="${getNodeScreenStyle(node)}"
          aria-label="${escapeHtml(node.zh)}"
        >
          <span class="word-cn">${escapeHtml(node.zh)}</span>
          <span class="word-en">${escapeHtml(node.en)}</span>
        </button>
      `;
    })
    .join("");

  wordLayer.querySelectorAll(".word-node").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (state.suppressNextClickId === element.dataset.nodeId) {
        state.suppressNextClickId = "";
        return;
      }
      if (event.detail >= 2) {
        handleNodeClick(element.dataset.nodeId);
        return;
      }
      selectSingleNode(element.dataset.nodeId);
    });

    element.addEventListener("dblclick", (event) => {
      event.preventDefault();
      handleNodeClick(element.dataset.nodeId);
    });

    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showNodeMenu(element.dataset.nodeId, event.clientX, event.clientY);
    });

    element.addEventListener("pointerdown", (event) => {
      beginNodeDrag(event, element.dataset.nodeId, element);
    });
    element.addEventListener("mousedown", (event) => {
      beginNodeDrag(event, element.dataset.nodeId, element);
    });
  });

  refreshNodeTextRendering();
}

function getNodeScreenStyle(node) {
  const position = worldToScreen(node.x, node.y);
  return `--screen-x:${round(position.x)}px; --screen-y:${round(position.y)}px;`;
}

function refreshNodeTextRendering() {
  requestAnimationFrame(() => {
    wordLayer.querySelectorAll(".word-cn, .word-en").forEach((element) => {
      element.style.webkitFontSmoothing = "antialiased";
      element.style.transform = "translateZ(0)";
    });
    void wordLayer.offsetHeight;
  });
}

function renderLinks() {
  linkLayer.setAttribute("viewBox", `${SVG_MIN} ${SVG_MIN} ${SVG_SIZE} ${SVG_SIZE}`);
  linkLayer.setAttribute("preserveAspectRatio", "none");
  const nodeMap = new Map(state.nodes.map((node) => [node.id, node]));
  const linkMarkup = state.links
    .map((link) => {
      const from = nodeMap.get(link.from);
      const to = nodeMap.get(link.to);
      if (!from || !to) return "";
      const selected = state.selectedIds.has(from.id) || state.selectedIds.has(to.id);
      return `<line class="word-link ${selected ? "is-selected" : ""}" x1="${round(from.x)}" y1="${round(from.y)}" x2="${round(to.x)}" y2="${round(to.y)}" />`;
    })
    .join("");

  const loadingMarkup = state.loadingNodeId ? renderLoadingLines(nodeMap.get(state.loadingNodeId)) : "";
  linkLayer.innerHTML = linkMarkup + loadingMarkup;
}

function renderLoadingLines(node) {
  if (!node) return "";
  const lines = [];
  for (let index = 0; index < 4; index += 1) {
    const angle = (Math.PI * 2 * index) / 4 + Math.PI / 5;
    const length = 105 + index * 22;
    const x2 = node.x + Math.cos(angle) * length;
    const y2 = node.y + Math.sin(angle) * length;
    lines.push(
      `<line class="word-link is-loading" x1="${round(node.x)}" y1="${round(node.y)}" x2="${round(x2)}" y2="${round(y2)}" />`
    );
  }
  return lines.join("");
}

function renderSelection() {
  const selectedNodes = getSelectedNodes();
  selectionPanel.hidden = true;

  if (selectedNodes.length === 0) {
    selectedList.innerHTML = `<p class="empty-text">暂无选择</p>`;
    ideaBtn.disabled = true;
  } else {
    selectedList.innerHTML = selectedNodes
      .map((node) => `<span>${escapeHtml(node.zh)}</span>`)
      .join("");
    ideaBtn.disabled = state.isBusy;
  }

  ideaList.innerHTML = state.ideas
    .map(
      (idea, index) => `
        <article class="idea-card ${idea.refined ? "is-refined" : ""}">
          <div class="idea-card-head">
            <strong>${escapeHtml(idea.title)}</strong>
            ${idea.refined ? `<span>已细化</span>` : ""}
          </div>
          <p>${escapeHtml(idea.description)}</p>
          <div class="idea-tags">
            ${idea.keywords.map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("")}
          </div>
          <button class="idea-detail-button" type="button" data-idea-index="${index}" ${state.isBusy ? "disabled" : ""}>
            ${state.refiningIdeaIndex === index ? "细化中..." : "深入细化"}
          </button>
        </article>
      `
    )
    .join("");
  bindIdeaDetailButtons(ideaList);

  renderNodeMenuContent();
}

function bindIdeaDetailButtons(container) {
  container.querySelectorAll("[data-idea-index]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await refineIdea(Number(button.dataset.ideaIndex));
    });
  });
}

async function refineIdea(index) {
  const idea = state.ideas[index];
  if (!idea) return;
  if (state.isBusy) {
    showToast("正在生成中");
    return;
  }
  if (!state.apiKey) {
    showToast("请先在 API 设置里保存 DeepSeek API Key");
    return;
  }

  state.isBusy = true;
  state.refiningIdeaIndex = index;
  render();

  const start = Date.now();
  try {
    const refined = await requestDeepSeekIdeaDetail(idea, getSelectedNodes());
    await waitForMinimum(start);
    const normalized = normalizeIdeas([refined], getSelectedNodes())[0];
    if (!normalized) throw new Error("AI 没有返回有效细化内容");
    state.ideas[index] = { ...normalized, refined: true };
    persistSnapshot();
    showToast("已细化当前创意");
  } catch (error) {
    console.warn(error);
    showToast(`细化失败：${error.message || "请稍后再试"}`);
  } finally {
    state.isBusy = false;
    state.refiningIdeaIndex = -1;
    render();
  }
}

function renderHistory() {
  if (state.history.length === 0) {
    historyList.innerHTML = `<p class="empty-text">暂无历史</p>`;
    clearHistoryBtn.disabled = true;
    return;
  }

  clearHistoryBtn.disabled = false;
  historyList.innerHTML = state.history
    .map(
      (entry) => `
        <article class="history-item">
          <div class="history-meta">
            <span>${escapeHtml(formatTime(entry.time))}</span>
            <span>${entry.nodes?.length || 0} 个词</span>
          </div>
          <strong>${escapeHtml(entry.rootSeed || "未命名")}</strong>
          <p>${escapeHtml(summarizeEntry(entry))}</p>
          <button type="button" data-history-id="${escapeHtml(entry.id)}">恢复</button>
        </article>
      `
    )
    .join("");

  historyList.querySelectorAll("[data-history-id]").forEach((button) => {
    button.addEventListener("click", () => {
      restoreHistory(button.dataset.historyId);
    });
  });
}

async function handleNodeClick(nodeId) {
  if (state.loadingNodeId === nodeId) return;
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  if (state.isBusy) {
    showToast("稍等一下");
    return;
  }

  state.activeId = nodeId;
  state.jumpNodeId = nodeId;
  render();
  window.setTimeout(() => {
    if (state.jumpNodeId === nodeId) {
      state.jumpNodeId = "";
      renderNodes();
    }
  }, 560);
  await expandNode(nodeId, { source: "click" });
}

function activateNode(nodeId) {
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  state.activeId = nodeId;
  renderNodes();
  renderLinks();
}

function selectSingleNode(nodeId) {
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  state.activeId = nodeId;
  state.selectedIds = new Set([nodeId]);
  state.ideas = [];
  render();
  persistSnapshot();
}

function markSingleNodePicked(nodeId, element) {
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  const isAlreadySinglePicked = state.selectedIds.size === 1 && state.selectedIds.has(nodeId);
  state.activeId = nodeId;
  state.selectedIds = new Set([nodeId]);
  state.ideas = [];

  wordLayer.querySelectorAll(".word-node").forEach((nodeElement) => {
    const isCurrent = nodeElement.dataset.nodeId === nodeId;
    nodeElement.classList.toggle("is-picked", isCurrent);
    nodeElement.classList.toggle("is-active", isCurrent);
  });
  element?.classList.add("is-picked", "is-active");
  renderLinks();
  renderSelection();
  if (!isAlreadySinglePicked) queuePersistSnapshot();
}

function beginCanvasPan(event) {
  if (event.type === "mousedown" && state.pointer) return;
  if (event.button !== 0 && event.button !== 1) return;
  if (event.button === 1) event.preventDefault();
  stopPanInertia();
  if (
    event.target.closest(".canvas-controls, .toolbar, .prompt-composer, .selection-panel, .drawer, .node-menu")
  ) {
    return;
  }
  const shouldPan = event.button === 1 || (event.button === 0 && state.isSpacePanning);
  if (event.button === 0 && !shouldPan && event.target.closest(".word-node")) {
    return;
  }

  const pointerId = event.pointerId ?? "mouse";
  if (shouldPan) {
    beginPanPointer(event, canvas);
    return;
  }

  canvas.classList.add("is-selecting");
  state.pointer = {
    type: "select",
    pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    currentClientX: event.clientX,
    currentClientY: event.clientY,
  };
  updateSelectionRect(state.pointer);
}

function beginPanPointer(event, captureElement, options = {}) {
  event.preventDefault();
  const now = performance.now();
  const pointerId = event.pointerId ?? "mouse";
  if (event.pointerId != null) captureElement?.setPointerCapture?.(event.pointerId);
  canvas.classList.add("is-panning");
  app.classList.add("is-panning");
  state.pointer = {
    type: "pan",
    pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startPanX: state.viewport.x,
    startPanY: state.viewport.y,
    lastClientX: event.clientX,
    lastClientY: event.clientY,
    lastTime: now,
    startTime: now,
    velocityX: 0,
    velocityY: 0,
    moved: false,
    panSamples: [{ x: event.clientX, y: event.clientY, time: now }],
  };
}

function beginNodeDrag(event, nodeId, element) {
  if (event.type === "mousedown" && state.pointer) return;
  if (event.button === 1) {
    event.stopPropagation();
    beginPanPointer(event, element);
    state.suppressNextClickId = "";
    return;
  }

  if (event.button === 0 && state.isSpacePanning) {
    event.stopPropagation();
    beginPanPointer(event, element);
    return;
  }

  if (event.button !== 0) return;
  event.stopPropagation();

  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node) return;

  if (!(state.selectedIds.has(nodeId) && state.selectedIds.size > 1)) {
    markSingleNodePicked(nodeId, element);
  }

  if (event.pointerId != null) element.setPointerCapture?.(event.pointerId);
  state.pointer = {
    type: "node",
    pointerId: event.pointerId ?? "mouse",
    nodeId,
    element,
    moved: false,
    longPressHandled: false,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: node.x,
    startY: node.y,
    startPositions: getDragStartPositions(nodeId),
  };

  if (event.pointerType !== "mouse") {
    window.clearTimeout(state.longPressTimer);
    state.longPressTimer = window.setTimeout(() => {
      if (state.pointer?.nodeId === nodeId && !state.pointer.moved) {
        state.pointer.longPressHandled = true;
        state.suppressNextClickId = nodeId;
        toggleSelected(nodeId);
      }
    }, 560);
  }
}

function showNodeMenu(nodeId, clientX, clientY) {
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node) return;

  state.menuNodeId = nodeId;
  renderNodeMenuContent();
  nodeMenu.hidden = false;

  const width = nodeMenu.offsetWidth || 260;
  const height = nodeMenu.offsetHeight || 260;
  const x = clamp(clientX, 8, window.innerWidth - width - 8);
  const y = clamp(clientY, 8, window.innerHeight - height - 8);
  nodeMenu.style.left = `${x}px`;
  nodeMenu.style.top = `${y}px`;
}

function renderNodeMenuContent() {
  if (!menuSelectionSummary) return;
  const node = state.nodes.find((item) => item.id === state.menuNodeId);
  const selectedNodes = getSelectedNodes();

  if (node) {
    menuSelectBtn.textContent = state.selectedIds.has(node.id) ? "取消选择" : "选择词语";
    menuDeleteBtn.disabled = node.level === 0;
    menuDeleteBtn.textContent = node.level === 0 ? "初始词不可删" : "删除联想";
  }

  menuSelectionSummary.innerHTML =
    selectedNodes.length === 0
      ? "未选择灵感"
      : `已选择 ${selectedNodes.length} 个：${selectedNodes
          .map((item) => `<span>${escapeHtml(item.zh)}</span>`)
          .join("")}`;

  menuIdeaBtn.disabled = selectedNodes.length === 0 || state.isBusy;
  menuIdeaBtn.textContent = state.isBusy ? "生成中" : "生成创意方案";
  menuIdeaList.innerHTML = state.ideas
    .map(
      (idea, index) => `
        <article class="menu-idea-card ${idea.refined ? "is-refined" : ""}">
          <div class="idea-card-head">
            <strong>${escapeHtml(idea.title)}</strong>
            ${idea.refined ? `<span>已细化</span>` : ""}
          </div>
          <p>${escapeHtml(idea.description)}</p>
          <button class="idea-detail-button" type="button" data-idea-index="${index}" ${state.isBusy ? "disabled" : ""}>
            ${state.refiningIdeaIndex === index ? "细化中..." : "深入细化"}
          </button>
        </article>
      `
    )
    .join("");
  bindIdeaDetailButtons(menuIdeaList);
}

function hideNodeMenu() {
  state.menuNodeId = "";
  nodeMenu.hidden = true;
}

function deleteNodeBranch(nodeId) {
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  if (node.level === 0) {
    showToast("初始词不能删除");
    return;
  }

  const idsToDelete = collectBranchIds(nodeId);
  state.nodes = state.nodes.filter((item) => !idsToDelete.has(item.id));
  state.links = state.links.filter((link) => !idsToDelete.has(link.from) && !idsToDelete.has(link.to));
  idsToDelete.forEach((id) => state.selectedIds.delete(id));
  state.ideas = [];
  if (idsToDelete.has(state.activeId)) {
    state.activeId = state.nodes[0]?.id || "";
  }
  state.loadingNodeId = "";
  state.jumpNodeId = "";
  showToast(`已删除：${node.zh}`);
  render();
  persistSnapshot();
}

function collectBranchIds(nodeId) {
  const ids = new Set([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    state.links.forEach((link) => {
      if (ids.has(link.from) && !ids.has(link.to)) {
        ids.add(link.to);
        changed = true;
      }
    });
  }
  return ids;
}

function selectBranch(nodeId) {
  const ids = collectBranchIds(nodeId);
  state.selectedIds = ids;
  state.activeId = nodeId;
  state.ideas = [];
  showToast("已选中分支");
  render();
  persistSnapshot();
}

function getDragStartPositions(nodeId) {
  const dragIds = state.selectedIds.has(nodeId) ? Array.from(state.selectedIds) : [nodeId];
  return dragIds
    .map((id) => {
      const node = state.nodes.find((item) => item.id === id);
      return node ? { id, x: node.x, y: node.y } : null;
    })
    .filter(Boolean);
}

function updateSelectionRect(pointer) {
  const left = Math.min(pointer.startClientX, pointer.currentClientX);
  const top = Math.min(pointer.startClientY, pointer.currentClientY);
  const width = Math.abs(pointer.currentClientX - pointer.startClientX);
  const height = Math.abs(pointer.currentClientY - pointer.startClientY);
  selectionRect.hidden = width < 3 && height < 3;
  selectionRect.style.left = `${left}px`;
  selectionRect.style.top = `${top}px`;
  selectionRect.style.width = `${width}px`;
  selectionRect.style.height = `${height}px`;
}

function applyBoxSelection(pointer) {
  const left = Math.min(pointer.startClientX, pointer.currentClientX);
  const right = Math.max(pointer.startClientX, pointer.currentClientX);
  const top = Math.min(pointer.startClientY, pointer.currentClientY);
  const bottom = Math.max(pointer.startClientY, pointer.currentClientY);
  if (right - left < 6 || bottom - top < 6) {
    clearSelection();
    return;
  }

  const selectedIds = new Set();
  wordLayer.querySelectorAll(".word-node").forEach((element) => {
    const rect = element.getBoundingClientRect();
    const intersects = rect.left <= right && rect.right >= left && rect.top <= bottom && rect.bottom >= top;
    if (intersects) selectedIds.add(element.dataset.nodeId);
  });

  state.selectedIds = selectedIds;
  state.ideas = [];
  if (selectedIds.size > 0) {
    state.activeId = Array.from(selectedIds)[0];
    showToast(`已框选 ${selectedIds.size} 个灵感`);
  } else {
    showToast("没有框选到灵感");
  }
  render();
}

function clearSelection() {
  if (state.selectedIds.size === 0 && state.ideas.length === 0) return;
  state.selectedIds.clear();
  state.ideas = [];
  render();
  persistSnapshot();
}

function goHomeView() {
  stopPanInertia();
  if (state.nodes.length === 0) {
    centerEmptyViewport();
  } else {
    fitViewToNodes();
  }
  hideNodeMenu();
  persistSnapshot();
}

function createBlankCanvas() {
  stopPanInertia();
  state.nodes = [];
  state.links = [];
  state.selectedIds = new Set();
  state.activeId = "";
  state.rootSeed = "";
  state.sessionId = makeId("history");
  state.ideas = [];
  state.loadingNodeId = "";
  state.jumpNodeId = "";
  state.menuNodeId = "";
  state.suppressNextClickId = "";
  hideNodeMenu();
  centerEmptyViewport();
  render();
  showToast("已新建空白画布");
}

function handlePointerMove(event) {
  const pointer = state.pointer;
  const pointerId = event.pointerId ?? "mouse";
  if (!pointer || pointer.pointerId !== pointerId) return;

  if (pointer.type === "pan") {
    const now = performance.now();
    const elapsed = Math.max(1, now - pointer.lastTime);
    const totalDx = event.clientX - pointer.startClientX;
    const totalDy = event.clientY - pointer.startClientY;
    if (!pointer.moved && Math.hypot(totalDx, totalDy) > PAN_CLICK_MOVE_TOLERANCE) {
      pointer.moved = true;
    }
    pointer.velocityX = clamp(
      (event.clientX - pointer.lastClientX) / elapsed,
      -PAN_INERTIA_MAX_VELOCITY,
      PAN_INERTIA_MAX_VELOCITY
    );
    pointer.velocityY = clamp(
      (event.clientY - pointer.lastClientY) / elapsed,
      -PAN_INERTIA_MAX_VELOCITY,
      PAN_INERTIA_MAX_VELOCITY
    );
    pointer.lastClientX = event.clientX;
    pointer.lastClientY = event.clientY;
    pointer.lastTime = now;
    recordPanSample(pointer, event.clientX, event.clientY, now);
    state.viewport.x = pointer.startPanX + event.clientX - pointer.startClientX;
    state.viewport.y = pointer.startPanY + event.clientY - pointer.startClientY;
    applyViewport();
    return;
  }

  if (pointer.type === "select") {
    pointer.currentClientX = event.clientX;
    pointer.currentClientY = event.clientY;
    updateSelectionRect(pointer);
    return;
  }

  if (pointer.type !== "node") return;

  const dx = event.clientX - pointer.startClientX;
  const dy = event.clientY - pointer.startClientY;
  if (!pointer.moved && Math.hypot(dx, dy) > 4) {
    pointer.moved = true;
    window.clearTimeout(state.longPressTimer);
    pointer.element.classList.add("is-dragging");
  }

  if (!pointer.moved) return;

  const worldDx = dx / state.viewport.zoom;
  const worldDy = dy / state.viewport.zoom;
  pointer.startPositions.forEach((position) => {
    const movingNode = state.nodes.find((item) => item.id === position.id);
    if (!movingNode) return;
    movingNode.x = round(position.x + worldDx);
    movingNode.y = round(position.y + worldDy);
    const movingElement = wordLayer.querySelector(`[data-node-id="${cssEscape(position.id)}"]`);
    const screenPosition = worldToScreen(movingNode.x, movingNode.y);
    movingElement?.style.setProperty("--screen-x", `${round(screenPosition.x)}px`);
    movingElement?.style.setProperty("--screen-y", `${round(screenPosition.y)}px`);
  });
  state.activeId = pointer.nodeId;
  renderLinks();
}

function endPointerAction(event) {
  const pointer = state.pointer;
  const pointerId = event.pointerId ?? "mouse";
  if (!pointer || pointer.pointerId !== pointerId) return;

  window.clearTimeout(state.longPressTimer);
  if (pointer.type === "pan") {
    canvas.classList.remove("is-panning");
    app.classList.remove("is-panning");
    const heldMs = performance.now() - pointer.startTime;
    if (heldMs <= PAN_INERTIA_MAX_HOLD_MS) {
      const velocity = getPanReleaseVelocity(pointer);
      startPanInertia(velocity.x, velocity.y);
    }
    state.pointer = null;
    queuePersistSnapshot();
    return;
  }

  if (pointer.type === "select") {
    canvas.classList.remove("is-selecting");
    selectionRect.hidden = true;
    applyBoxSelection(pointer);
    state.pointer = null;
    persistSnapshot();
    return;
  }

  if (pointer.type === "node") {
    pointer.element?.classList.remove("is-dragging");
    if (pointer.moved || pointer.longPressHandled) {
      state.suppressNextClickId = pointer.nodeId;
      queuePersistSnapshot();
      render();
    }
    state.pointer = null;
  }
}

function recordPanSample(pointer, x, y, time) {
  pointer.panSamples.push({ x, y, time });
  const cutoff = time - PAN_SAMPLE_WINDOW_MS;
  while (pointer.panSamples.length > 2 && pointer.panSamples[0].time < cutoff) {
    pointer.panSamples.shift();
  }
}

function getPanReleaseVelocity(pointer) {
  const samples = pointer.panSamples || [];
  if (samples.length < 2) {
    return { x: pointer.velocityX || 0, y: pointer.velocityY || 0 };
  }

  const last = samples[samples.length - 1];
  const first = samples[0];
  const elapsed = Math.max(1, last.time - first.time);
  return {
    x: clamp((last.x - first.x) / elapsed, -PAN_INERTIA_MAX_VELOCITY, PAN_INERTIA_MAX_VELOCITY),
    y: clamp((last.y - first.y) / elapsed, -PAN_INERTIA_MAX_VELOCITY, PAN_INERTIA_MAX_VELOCITY),
  };
}

function handleCanvasWheel(event) {
  if (event.target.closest(".toolbar, .prompt-composer, .selection-panel, .drawer, .canvas-controls")) {
    return;
  }
  event.preventDefault();
  stopPanInertia();
  const factor = event.deltaY < 0 ? 1.08 : 0.92;
  zoomAt(event.clientX, event.clientY, factor);
}

function startPanInertia(velocityX, velocityY) {
  stopPanInertia();
  let vx = velocityX;
  let vy = velocityY;
  let previousTime = performance.now();

  if (Math.hypot(vx, vy) < PAN_INERTIA_MIN_SPEED) return;

  const step = (now) => {
    const elapsed = Math.min(34, now - previousTime);
    previousTime = now;
    vx *= PAN_INERTIA_FRICTION;
    vy *= PAN_INERTIA_FRICTION;
    state.viewport.x += vx * elapsed;
    state.viewport.y += vy * elapsed;
    applyViewport();

    if (Math.hypot(vx, vy) < PAN_INERTIA_MIN_SPEED) {
      state.inertiaFrame = 0;
      queuePersistSnapshot();
      return;
    }

    state.inertiaFrame = requestAnimationFrame(step);
  };

  state.inertiaFrame = requestAnimationFrame(step);
}

function stopPanInertia() {
  if (!state.inertiaFrame) return;
  cancelAnimationFrame(state.inertiaFrame);
  state.inertiaFrame = 0;
}

function handleKeyDown(event) {
  if (event.code === "Space" && !isEditableTarget(event.target)) {
    event.preventDefault();
    state.isSpacePanning = true;
    app.classList.add("is-space-panning");
    return;
  }

  if (event.key.toLowerCase() === "a" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
    selectActiveBranch();
    return;
  }

  if (event.key !== "Delete" && event.key !== "Backspace") return;
  if (isEditableTarget(event.target)) return;
  if (state.selectedIds.size === 0) return;
  if (state.isBusy) {
    showToast("正在生成中");
    return;
  }

  event.preventDefault();
  deleteSelectedNodes();
}

function handleKeyUp(event) {
  if (event.code !== "Space") return;
  resetSpacePanning();
}

function resetSpacePanning() {
  state.isSpacePanning = false;
  app.classList.remove("is-space-panning");
}

function resetInteractionModes() {
  resetSpacePanning();
  canvas.classList.remove("is-panning", "is-selecting");
  app.classList.remove("is-panning");
  selectionRect.hidden = true;
  state.pointer = null;
  window.clearTimeout(state.longPressTimer);
}

function selectActiveBranch() {
  const selectedIds = Array.from(state.selectedIds);
  const nodeId = selectedIds.includes(state.activeId) ? state.activeId : selectedIds[0] || state.activeId;
  if (!nodeId) {
    showToast("先选中一个标签");
    return;
  }
  selectBranch(nodeId);
}

function deleteSelectedNodes() {
  const selectedIds = Array.from(state.selectedIds);
  const idsToDelete = new Set();

  selectedIds.forEach((id) => {
    const node = state.nodes.find((item) => item.id === id);
    if (!node || node.level === 0) return;
    collectBranchIds(id).forEach((branchId) => idsToDelete.add(branchId));
  });

  if (idsToDelete.size === 0) {
    showToast("初始词不能删除");
    return;
  }

  state.nodes = state.nodes.filter((item) => !idsToDelete.has(item.id));
  state.links = state.links.filter((link) => !idsToDelete.has(link.from) && !idsToDelete.has(link.to));
  state.selectedIds.clear();
  state.ideas = [];
  if (idsToDelete.has(state.activeId)) {
    state.activeId = state.nodes[0]?.id || "";
  }
  state.loadingNodeId = "";
  state.jumpNodeId = "";
  hideNodeMenu();
  showToast(`已删除 ${idsToDelete.size} 个联想`);
  render();
  persistSnapshot();
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function zoomAtViewportCenter(factor) {
  zoomAt(window.innerWidth / 2, window.innerHeight / 2, factor);
}

function zoomAt(clientX, clientY, factor) {
  stopPanInertia();
  const before = screenToWorld(clientX, clientY);
  state.viewport.zoom = clamp(state.viewport.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  state.viewport.x = clientX - before.x * state.viewport.zoom;
  state.viewport.y = clientY - before.y * state.viewport.zoom;
  applyViewport();
  queuePersistSnapshot();
}

function applyViewport() {
  const zoom = state.viewport.zoom;
  const gridSize = Math.max(8, BASE_GRID_SIZE * zoom);
  applyNodeScaleVars(zoom);
  canvas.style.setProperty("--pan-x", `${state.viewport.x}px`);
  canvas.style.setProperty("--pan-y", `${state.viewport.y}px`);
  canvas.style.setProperty("--zoom", String(zoom));
  canvas.style.setProperty("--grid-size", `${gridSize}px`);
  canvas.style.setProperty("--grid-x", `${positiveMod(state.viewport.x, gridSize)}px`);
  canvas.style.setProperty("--grid-y", `${positiveMod(state.viewport.y, gridSize)}px`);
  zoomStatus.textContent = `${Math.round(zoom * 100)}%`;
  syncNodeScreenPositions();
}

function applyNodeScaleVars() {
  canvas.style.setProperty("--node-width", "152px");
  canvas.style.setProperty("--node-min-height", "74px");
  canvas.style.setProperty("--node-padding", "12px 18px 14px");
  canvas.style.setProperty("--node-cn-size", "24px");
  canvas.style.setProperty("--node-en-size", "13px");
  canvas.style.setProperty("--node-picked-width", "184px");
  canvas.style.setProperty("--node-picked-min-height", "86px");
  canvas.style.setProperty("--node-picked-padding", "12px 18px 14px");
  canvas.style.setProperty("--node-picked-cn-size", "24px");
  canvas.style.setProperty("--node-picked-en-size", "13px");
}

function syncNodeScreenPositions() {
  wordLayer.querySelectorAll(".word-node").forEach((element) => {
    const node = state.nodes.find((item) => item.id === element.dataset.nodeId);
    if (!node) return;
    const position = worldToScreen(node.x, node.y);
    element.style.setProperty("--screen-x", `${round(position.x)}px`);
    element.style.setProperty("--screen-y", `${round(position.y)}px`);
  });
}

function worldToScreen(x, y) {
  return {
    x: state.viewport.x + x * state.viewport.zoom,
    y: state.viewport.y + y * state.viewport.zoom,
  };
}

function centerEmptyViewport() {
  state.viewport = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    zoom: 1,
  };
  applyViewport();
}

function fitViewToNodes() {
  if (state.nodes.length === 0) {
    centerEmptyViewport();
    return;
  }

  const bounds = getNodeBounds();
  const padding = 420;
  const availableWidth = window.innerWidth;
  const availableHeight = Math.max(320, window.innerHeight - 150);
  const zoom = clamp(
    Math.min(availableWidth / (bounds.width + padding), availableHeight / (bounds.height + padding)),
    MIN_ZOOM,
    1.36
  );

  state.viewport.zoom = zoom;
  state.viewport.x = availableWidth / 2 - bounds.centerX * zoom;
  state.viewport.y = availableHeight / 2 - bounds.centerY * zoom;
  applyViewport();
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.viewport.x) / state.viewport.zoom,
    y: (clientY - rect.top - state.viewport.y) / state.viewport.zoom,
  };
}

function toggleSelected(nodeId) {
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node) return;

  state.activeId = nodeId;
  if (state.selectedIds.has(nodeId)) {
    state.selectedIds.delete(nodeId);
    showToast(`已取消：${node.zh}`);
  } else {
    state.selectedIds.add(nodeId);
    showToast(`已选择：${node.zh}`);
  }

  render();
  persistSnapshot();
}

function getActiveNode() {
  return (
    state.nodes.find((node) => node.id === state.activeId) ||
    state.nodes.find((node) => state.selectedIds.has(node.id)) ||
    state.nodes[0]
  );
}

function getSelectedNodes() {
  return state.nodes.filter((node) => state.selectedIds.has(node.id));
}

function findOpenPosition(parent, total, index) {
  const baseRadius = parent.level === 0 ? 270 : 245;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const totalOffset = total > 1 ? (total - 1) / 2 : 0;
  const angle = -Math.PI / 2 + (index - totalOffset) * goldenAngle;
  const radius = baseRadius + (index % 3) * 28;
  let x = parent.x + Math.cos(angle) * radius;
  let y = parent.y + Math.sin(angle) * radius;

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const tooClose = state.nodes.some((node) => distance(node.x, node.y, x, y) < 164);
    if (!tooClose) break;
    const nudgeAngle = angle + attempt * goldenAngle;
    const nudgeRadius = radius + 42 + attempt * 18;
    x = parent.x + Math.cos(nudgeAngle) * nudgeRadius;
    y = parent.y + Math.sin(nudgeAngle) * nudgeRadius;
  }

  return {
    x: round(x),
    y: round(y),
  };
}

function createNode({ zh, en, x, y, level, parentId, seed }) {
  return {
    id: makeId("node"),
    zh: cleanTerm(zh),
    en: cleanEnglish(en),
    x: round(x),
    y: round(y),
    level,
    parentId,
    seed,
  };
}

function persistSnapshot() {
  if (state.nodes.length === 0) return;
  if (!state.sessionId) state.sessionId = makeId("history");

  const snapshot = {
    version: 2,
    id: state.sessionId,
    time: new Date().toISOString(),
    rootSeed: state.rootSeed || state.nodes[0]?.zh || "",
    activeId: state.activeId,
    viewport: { ...state.viewport },
    nodes: state.nodes,
    links: state.links,
    selectedIds: Array.from(state.selectedIds),
    ideas: state.ideas,
  };

  state.history = [snapshot, ...state.history.filter((entry) => entry.id !== state.sessionId)].slice(
    0,
    MAX_HISTORY
  );
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(state.history));
}

function queuePersistSnapshot() {
  window.clearTimeout(state.persistTimer);
  state.persistTimer = window.setTimeout(() => {
    persistSnapshot();
  }, 180);
}

function restoreHistory(id) {
  const entry = state.history.find((item) => item.id === id);
  if (!entry) return;
  state.sessionId = entry.id;
  state.rootSeed = entry.rootSeed || "";
  state.nodes = upgradeNodeCoordinates(entry);
  state.links = Array.isArray(entry.links) ? entry.links : [];
  state.selectedIds = new Set(entry.selectedIds || []);
  state.activeId = entry.activeId || state.nodes[0]?.id || "";
  state.ideas = Array.isArray(entry.ideas) ? entry.ideas : [];
  state.viewport = entry.viewport ? { ...entry.viewport } : state.viewport;
  historyDrawer.hidden = true;
  render();
  if (!entry.viewport) fitViewToNodes();
}

function upgradeNodeCoordinates(entry) {
  const nodes = Array.isArray(entry.nodes) ? entry.nodes : [];
  if (entry.version === 2) return nodes.map((node) => ({ ...node }));

  const maybePercent = nodes.every(
    (node) =>
      Number.isFinite(node.x) &&
      Number.isFinite(node.y) &&
      node.x >= 0 &&
      node.x <= 100 &&
      node.y >= 0 &&
      node.y <= 100
  );

  if (!maybePercent) return nodes.map((node) => ({ ...node }));

  return nodes.map((node) => ({
    ...node,
    x: round((node.x - 50) * 22),
    y: round((node.y - 48) * 18),
  }));
}

function toggleDrawer(drawer) {
  const willOpen = drawer.hidden;
  settingsDrawer.hidden = true;
  historyDrawer.hidden = true;
  drawer.hidden = !willOpen;
}

function makeFallbackTerms(seed, existingTerms = new Set()) {
  const core = normalizePhrase(seed).slice(0, 5) || "灵感";
  const bank = [
    { zh: `${core}切片`, en: "idea slice" },
    { zh: `${core}盲盒`, en: "mystery box" },
    { zh: `${core}回声`, en: "echo loop" },
    { zh: `${core}钩子`, en: "hook point" },
    { zh: `${core}剧场`, en: "mini theatre" },
    { zh: `${core}闪念`, en: "spark thought" },
    { zh: `${core}滤镜`, en: "mood filter" },
    { zh: `${core}地图`, en: "idea map" },
    { zh: "情绪颗粒", en: "emotion grain" },
    { zh: "反差开关", en: "contrast switch" },
    { zh: "微场景", en: "micro scene" },
    { zh: "记忆贴纸", en: "memory sticker" },
    { zh: "社交暗号", en: "social signal" },
    { zh: "氛围按钮", en: "vibe button" },
    { zh: "灵感弹幕", en: "idea barrage" },
    { zh: "叙事拼图", en: "story puzzle" },
  ];

  const offset = Math.abs(hashCode(seed)) % bank.length;
  return Array.from({ length: bank.length }, (_, index) => bank[(index + offset) % bank.length])
    .filter((term) => !existingTerms.has(term.zh) && term.zh !== seed)
    .slice(0, TERM_TARGET);
}

function makeFallbackIdeas(selectedNodes) {
  const words = selectedNodes.map((node) => node.zh);
  const first = words[0] || "灵感";
  const second = words[1] || "情绪";
  const third = words[2] || "场景";
  const fourth = words[3] || "故事";

  return [
    {
      title: `${first}快闪局`,
      description: `把${first}做成一次轻互动入口，用${second}制造记忆点，再让用户生成自己的${third}。`,
      keywords: words.slice(0, 4),
    },
    {
      title: `${second}收藏馆`,
      description: `围绕${second}建立一组可分享的视觉卡片，用户每次选择都会解锁新的${fourth}线索。`,
      keywords: words.slice(0, 4),
    },
    {
      title: `${third}共创器`,
      description: `将${third}拆成多个可点击模块，组合${first}和${second}后输出短视频脚本或海报概念。`,
      keywords: words.slice(0, 4),
    },
    {
      title: `${fourth}盲盒企划`,
      description: `用${fourth}作为主线，把选择过的词语变成随机任务，形成可持续更新的创意栏目。`,
      keywords: words.slice(0, 4),
    },
  ];
}

function normalizeTerms(terms, seed, existingTerms) {
  const result = [];
  const seen = new Set(existingTerms);
  for (const item of terms) {
    const zh = cleanTerm(item?.zh || item?.word || item?.cn || "");
    const en = cleanEnglish(item?.en || item?.english || item?.translation || "");
    if (!zh || zh === seed || seen.has(zh)) continue;
    seen.add(zh);
    result.push({ zh, en: en || "creative term" });
    if (result.length >= TERM_TARGET) break;
  }

  if (result.length < 7) {
    makeFallbackTerms(seed, seen).forEach((term) => {
      if (result.length < TERM_TARGET && !seen.has(term.zh)) {
        seen.add(term.zh);
        result.push(term);
      }
    });
  }

  return result.slice(0, TERM_TARGET);
}

function normalizeIdeas(ideas, selectedNodes) {
  const normalized = ideas
    .map((idea, index) => ({
      title: cleanTerm(idea?.title || `创意方案 ${index + 1}`),
      description: cleanIdeaDescription(idea?.description || idea?.desc || ""),
      keywords: Array.isArray(idea?.keywords)
        ? idea.keywords.map(cleanTerm).filter(Boolean).slice(0, 5)
        : selectedNodes.map((node) => node.zh).slice(0, 5),
    }))
    .filter((idea) => idea.title && idea.description);

  return normalized.slice(0, 4);
}

function cleanIdeaDescription(value) {
  return normalizePhrase(value).replace(/[。；;,.，]+$/g, "");
}

function polishIdeaDescription(value) {
  let text = cleanTerm(value);
  if (!text) return "";
  if (/[。！？!?]$/.test(text)) return text;

  const commaIndex = Math.max(
    text.lastIndexOf("，"),
    text.lastIndexOf(","),
    text.lastIndexOf("、"),
    text.lastIndexOf("；"),
    text.lastIndexOf(";"),
    text.lastIndexOf("："),
    text.lastIndexOf(":")
  );
  if (commaIndex > 0) {
    const tail = text.slice(commaIndex + 1).trim();
    if (tail.length <= 8 || /^(一|一个|一杯|一场|一种|一段|最后|然后|突然)/.test(tail)) {
      text = text.slice(0, commaIndex).trim();
    }
  }

  return text ? `${text}。` : "";
}

function parseJsonText(text) {
  const cleaned = String(text)
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) throw new Error("无法解析 JSON");
    return JSON.parse(cleaned.slice(first, last + 1));
  }
}

function loadHistory() {
  try {
    const current = localStorage.getItem(STORAGE_KEYS.history);
    const legacy = localStorage.getItem(LEGACY_HISTORY_KEY);
    const parsed = JSON.parse(current || legacy || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function summarizeEntry(entry) {
  const nodes = Array.isArray(entry.nodes) ? entry.nodes : [];
  return nodes
    .slice(0, 8)
    .map((node) => node.zh)
    .join("、");
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 1800);
}

function getNodeBounds() {
  const xs = state.nodes.map((node) => node.x);
  const ys = state.nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function normalizePhrase(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanTerm(value) {
  return normalizePhrase(value).replace(/[。；;,.，]+$/g, "").slice(0, 18);
}

function cleanEnglish(value) {
  const text = normalizePhrase(value)
    .replace(/[。；;，]+$/g, "")
    .replace(/\s+/g, " ");
  return text.slice(0, 34) || "creative term";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function hashCode(text) {
  return Array.from(String(text)).reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0);
}

function positiveMod(value, size) {
  return ((value % size) + size) % size;
}

function waitForMinimum(start) {
  const elapsed = Date.now() - start;
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, MIN_LOADING_MS - elapsed)));
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
