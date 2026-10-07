"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class FakeElement {
  constructor(selector = "") {
    this.selector = selector; this.listeners = {}; this.children = []; this.dataset = {};
    this.hidden = false; this.disabled = false; this.value = ""; this.max = 0;
    this.textContent = ""; this.attributes = {}; this.classes = new Set();
    this.classList = { add: (value) => this.classes.add(value) };
    this.firstSpan = selector === "first span" ? null : new FakeElement("first span");
  }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  querySelector(selector) {
    if (selector === "span:first-child") return this.firstSpan;
    if (selector === "use") return this.use || null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === ".fieldnote-card") return this.children.filter((child) => child.className?.includes("fieldnote-card"));
    return [];
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  scrollIntoView() {}
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  requestSubmit() { this.requested = true; }
  reset() { this.resetCalled = true; }
}

const selectorNames = [
  "#mission-form", "#generate-button", "#form-status", ".builder-heading", "#mission-results", "#mission-list",
  "#results-title", "#results-meta", "#results-intro", "#results-safety", "#expedition-run", "#expedition-completion",
  "#discovery-review", "#start-expedition", "#regenerate-expedition", "#back-to-builder", "#run-progress",
  "#run-progress-label", "#run-mission-title", "#run-mission-task", "#run-mission-observe", "#run-mission-learn",
  "#run-evidence", "#run-number", "#run-total", "#run-marker", ".run-card", "#mark-complete", "#next-mission",
  "#run-title", "#run-reminder", "#completion-count", "#completion-meta", "#completion-fieldnotes", "#discovery-list",
  "#guide-theme-label", "#review-discoveries", "#back-to-completion", "#start-another", "#expedition-builder",
];
const themes = ["Leaves", "Flowers", "Birds", "Insects", "Trees", "Soil", "Rocks", "Sounds", "Colors", "Textures", "Animal Signs", "Mixed Nature"];
const slugs = ["leaves", "flowers", "birds", "insects", "trees", "soil", "rocks", "sounds", "colors", "textures", "animal-signs", "mixed-nature"];
const themeScenes = ["builder", "guide", "run", "complete", "idea", "rhythm"].map((name) => {
  const scene = new FakeElement(name); scene.dataset.scene = name; scene.use = new FakeElement("use"); return scene;
});
const expedition = {
  title: "A field note <script> tag", theme: "Birds", duration_minutes: 30, difficulty: "Beginner",
  intro: "A gentle walk to notice bird sounds.", safety_note: "Stay on public paths and observe wildlife from a distance.",
  missions: [1, 2, 3].map((id) => ({ id, title: `Notice ${id}`, task: "Put your phone away and look around.", observe: "Notice a pattern.", learn: "Repeated observations can reveal a pattern.", evidence_type: "observation", difficulty: 1 })),
};
const storage = new Map();

function makeHarness(responseData = expedition) {
  const elements = new Map(selectorNames.map((selector) => [selector, new FakeElement(selector)]));
  for (const selector of ["#mission-results", "#expedition-run", "#expedition-completion", "#discovery-review"]) elements.get(selector).hidden = true;
  const selectors = { ...Object.fromEntries(elements), "#start-expedition span:first-child": elements.get("#start-expedition").firstSpan };
  const documentElement = new FakeElement("html");
  const context = {
    document: {
      documentElement,
      querySelector: (selector) => selectors[selector] || null,
      querySelectorAll: (selector) => {
        if (selector === "[data-theme-scene]") return themeScenes;
        if (selector === "#expedition-builder, #mission-results, #expedition-run, #expedition-completion") return [elements.get("#expedition-builder"), elements.get("#mission-results"), elements.get("#expedition-run"), elements.get("#expedition-completion")];
        return [];
      },
      createElement: (tag) => new FakeElement(tag),
      createTextNode: (text) => ({ textContent: text }),
    },
    window: { matchMedia: () => ({ matches: false }) },
    IntersectionObserver: class { constructor(callback) { this.callback = callback; } observe(target) { this.callback([{ target, isIntersecting: true }], this); } unobserve() {} },
    setTimeout: (callback) => callback(),
    sessionStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    FormData: class { get(name) { return ({ duration_minutes: "30", difficulty: "Beginner", interest: "Birds" })[name]; } },
    fetch: async (url, options) => {
      assert.equal(url, "/api/missions/generate"); assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { duration_minutes: 30, difficulty: "Beginner", interest: "Birds" });
      return { ok: true, json: async () => responseData };
    }, console, process,
  };
  vm.runInNewContext(fs.readFileSync("static/js/app.js", "utf8"), context);
  elements.context = context;
  return elements;
}

(async () => {
  const html = fs.readFileSync("templates/index.html", "utf8");
  const css = fs.readFileSync("static/css/style.css", "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "HTML ids should be unique");
  themes.forEach((theme, index) => {
    assert.match(html, new RegExp(`value="${theme.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.ok(html.includes(`id="motif-${slugs[index]}"`), `missing vector motif for ${theme}`);
  });
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /route-desktop/);
  assert.match(css, /\.steps-grid\.is-visible/);

  storage.clear();
  let ui = makeHarness();
  for (let index = 0; index < themes.length; index += 1) {
    ui.get("#mission-form").listeners.change({ target: { name: "interest", value: themes[index] } });
    assert.equal(ui.context.document.documentElement.dataset.natureTheme, slugs[index]);
    assert.ok(themeScenes.every((scene) => scene.dataset.theme === slugs[index]));
    assert.ok(themeScenes.every((scene) => scene.use.attributes.href === `#motif-${slugs[index]}`));
  }
  await ui.get("#mission-form").listeners.submit({ preventDefault() {} });
  assert.equal(ui.get("#results-title").textContent, expedition.title);
  assert.equal(ui.get("#mission-list").children.length, 3);
  assert.equal(ui.get("#mission-results").hidden, false);
  assert.equal(ui.get("#mission-form").hidden, true);
  assert.equal(ui.context.document.documentElement.dataset.natureTheme, "birds");
  assert.equal(ui.get("#guide-theme-label").textContent, "BIRDS");
  assert.equal(ui.get("#results-title").textContent, "A field note <script> tag");

  ui.get("#start-expedition").listeners.click();
  assert.equal(ui.get("#expedition-run").hidden, false);
  assert.equal(ui.get("#run-mission-title").textContent, "Notice 1");
  assert.equal(ui.get("#run-progress").value, 0);
  assert.equal(ui.get("#next-mission").disabled, true);
  ui.get("#mark-complete").listeners.click();
  assert.equal(ui.get("#run-progress").value, 1);
  assert.equal(ui.get("#run-marker").dataset.complete, "true");
  assert.equal(ui.get("#mark-complete").disabled, true);
  assert.equal(ui.get("#next-mission").disabled, false);
  ui.get("#next-mission").listeners.click();
  assert.equal(ui.get("#run-mission-title").textContent, "Notice 2");
  assert.equal(ui.get("#run-progress").value, 1);

  ui = makeHarness();
  assert.equal(ui.get("#expedition-run").hidden, false);
  assert.equal(ui.get("#run-mission-title").textContent, "Notice 2");
  assert.equal(ui.get("#run-progress").value, 1);
  for (const id of ["#mark-complete", "#next-mission", "#mark-complete", "#next-mission"]) ui.get(id).listeners.click();
  assert.equal(ui.get("#expedition-completion").hidden, false);
  assert.equal(ui.get("#completion-count").textContent, "3 FIELD NOTES EXPLORED");
  assert.equal(ui.get("#completion-fieldnotes").children.length, 3);

  ui = makeHarness();
  assert.equal(ui.get("#expedition-completion").hidden, false);
  ui.get("#review-discoveries").listeners.click();
  assert.equal(ui.get("#discovery-review").hidden, false);
  assert.equal(ui.get("#discovery-list").children.length, 3);
  ui.get("#back-to-completion").listeners.click();
  ui.get("#start-another").listeners.click();
  assert.equal(storage.size, 0);
  assert.equal(ui.get("#mission-form").hidden, false);

  for (const bad of [{ ...expedition, missions: [] }, { ...expedition, missions: [{}] }]) {
    storage.clear(); ui = makeHarness(bad);
    await ui.get("#mission-form").listeners.submit({ preventDefault() {} });
    assert.equal(ui.get("#mission-results").hidden, true);
    assert.match(ui.get("#form-status").textContent, /incomplete/);
    assert.equal(storage.size, 0);
  }
  storage.set("natureSaathi.expedition.v1", JSON.stringify({ expedition: { missions: [] }, phase: "active", currentIndex: 0, completedIds: [] }));
  ui = makeHarness();
  assert.equal(ui.get("#expedition-run").hidden, true);
  assert.equal(ui.get("#mission-form").hidden, false);
  assert.equal(storage.size, 0);
  assert.match(ui.get("#form-status").textContent, /could not be restored/);

  console.log("Frontend theme system (12 interests), editorial screens, mission flow, and reduced-motion/overflow hooks: PASS");
})().catch((error) => { console.error(error); process.exitCode = 1; });
