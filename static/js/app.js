"use strict";

const missionForm = document.querySelector("#mission-form");
const generateButton = document.querySelector("#generate-button");
const formStatus = document.querySelector("#form-status");
const builderHeading = document.querySelector(".builder-heading");
const missionResults = document.querySelector("#mission-results");
const missionList = document.querySelector("#mission-list");
const resultsTitle = document.querySelector("#results-title");
const resultsMeta = document.querySelector("#results-meta");
const resultsIntro = document.querySelector("#results-intro");
const resultsSafety = document.querySelector("#results-safety");
const runView = document.querySelector("#expedition-run");
const completionView = document.querySelector("#expedition-completion");
const discoveryView = document.querySelector("#discovery-review");
const STORAGE_KEY = "natureSaathi.expedition.v1";
const DURATIONS = [15, 30, 45, 60];
const DIFFICULTIES = ["Beginner", "Explorer", "Naturalist"];
const EVIDENCE_TYPES = ["observation", "photo", "count", "sound"];
const THEME_SLUGS = {
  leaves: "leaves", flowers: "flowers", birds: "birds", insects: "insects", trees: "trees",
  soil: "soil", rocks: "rocks", sounds: "sounds", colors: "colors", textures: "textures",
  "animal signs": "animal-signs", "mixed nature": "mixed-nature",
};
let runState = null;
let revealObserver = null;

function applyTheme(theme) {
  const slug = THEME_SLUGS[String(theme || "").trim().toLowerCase()] || "mixed-nature";
  document.documentElement.dataset.natureTheme = slug;
  document.querySelectorAll("[data-theme-scene]").forEach((scene) => {
    scene.dataset.theme = slug;
    const motif = scene.querySelector("use");
    if (motif) motif.setAttribute("href", `#motif-${slug}`);
  });
  document.querySelectorAll("#expedition-builder, #mission-results, #expedition-run, #expedition-completion").forEach((section) => {
    section.dataset.theme = slug;
  });
  const label = document.querySelector("#guide-theme-label");
  if (label) label.textContent = String(theme || "Mixed Nature").toUpperCase();
}

function scrollToView(element) {
  if (!element) return;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

function revealTargets(nodes) {
  const items = Array.from(nodes || []);
  if (!items.length) return;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -4% 0px" });
  }
  items.forEach((item) => revealObserver.observe(item));
}

function setupScrollReveals() {
  document.documentElement.classList.add("motion-ready");
  revealTargets(document.querySelectorAll("[data-reveal], [data-reveal-section], .steps-grid, .fieldnote-card"));
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function validExpedition(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!["title", "theme", "intro", "safety_note"].every((key) => typeof value[key] === "string" && value[key].trim())) return false;
  if (!DURATIONS.includes(value.duration_minutes) || !DIFFICULTIES.includes(value.difficulty)) return false;
  if (!Array.isArray(value.missions) || value.missions.length < 3 || value.missions.length > 6) return false;
  const ids = new Set();
  return value.missions.every((mission) => {
    if (!mission || typeof mission !== "object" || !Number.isInteger(mission.id) || ids.has(mission.id)) return false;
    ids.add(mission.id);
    return ["title", "task", "observe", "learn"].every((key) => typeof mission[key] === "string" && mission[key].trim())
      && EVIDENCE_TYPES.includes(mission.evidence_type)
      && Number.isInteger(mission.difficulty) && mission.difficulty >= 1 && mission.difficulty <= 3;
  });
}

function saveState() {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(runState)); } catch (error) { /* Storage can be disabled; this run still works in memory. */ }
}

function clearState() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch (error) { /* Ignore unavailable storage. */ }
  runState = null;
}

function renderMission(mission) {
  const card = makeElement("li", "mission-card fieldnote-card");
  const top = makeElement("div", "mission-card-top");
  top.append(makeElement("span", "mission-number", `FIELD NOTE ${String(mission.id).padStart(2, "0")}`), makeElement("span", "evidence-tag", mission.evidence_type === "photo" ? "Photo · optional" : mission.evidence_type));
  card.append(top, makeElement("h3", "", mission.title), makeElement("p", "mission-task", mission.task));
  const observe = makeElement("div", "mission-detail");
  observe.append(makeElement("strong", "", "Look for"), document.createTextNode(mission.observe));
  const learn = makeElement("div", "mission-detail");
  learn.append(makeElement("strong", "", "Why it matters"), document.createTextNode(mission.learn));
  card.append(observe, learn, makeElement("span", "mission-number", `Challenge ${mission.difficulty} of 3`));
  return card;
}

function showBuilder(message = "") {
  runView.hidden = true;
  completionView.hidden = true;
  discoveryView.hidden = true;
  missionResults.hidden = true;
  missionForm.hidden = false;
  builderHeading.hidden = false;
  formStatus.textContent = message;
  if (message) formStatus.dataset.error = "true";
}

function displayExpedition(expedition) {
  if (!validExpedition(expedition)) throw new Error("The expedition data was incomplete. Please generate it again.");
  applyTheme(expedition.theme);
  runState = { expedition, phase: "review", currentIndex: 0, completedIds: [] };
  saveState();
  resultsTitle.textContent = expedition.title;
  resultsMeta.textContent = `${expedition.theme}  ·  ${expedition.duration_minutes} minutes  ·  ${expedition.difficulty}`;
  resultsIntro.textContent = expedition.intro;
  resultsSafety.textContent = expedition.safety_note;
  missionList.replaceChildren(...expedition.missions.map(renderMission));
  revealTargets(missionList.querySelectorAll(".fieldnote-card"));
  missionForm.hidden = true;
  builderHeading.hidden = true;
  formStatus.textContent = "";
  formStatus.dataset.error = "false";
  runView.hidden = true;
  completionView.hidden = true;
  discoveryView.hidden = true;
  missionResults.hidden = false;
  scrollToView(missionResults);
}

function setButtonLabel(button, label) {
  button.querySelector("span:first-child").textContent = label;
}

function renderRun() {
  const expedition = runState.expedition;
  const mission = expedition.missions[runState.currentIndex];
  const done = runState.completedIds.includes(mission.id);
  const completeCount = runState.completedIds.length;
  const progress = document.querySelector("#run-progress");
  progress.max = expedition.missions.length;
  progress.value = completeCount;
  document.querySelector("#run-progress-label").textContent = `Mission ${runState.currentIndex + 1} of ${expedition.missions.length} · ${completeCount} completed`;
  document.querySelector("#run-number").textContent = String(runState.currentIndex + 1).padStart(2, "0");
  document.querySelector("#run-total").textContent = `/ ${String(expedition.missions.length).padStart(2, "0")}`;
  document.querySelector("#run-marker").dataset.complete = String(done);
  document.querySelector("#run-mission-title").textContent = mission.title;
  document.querySelector("#run-mission-task").textContent = mission.task;
  document.querySelector("#run-mission-observe").textContent = mission.observe;
  document.querySelector("#run-mission-learn").textContent = mission.learn;
  document.querySelector("#run-evidence").textContent = mission.evidence_type === "photo" ? "Photo · optional" : mission.evidence_type;
  const mark = document.querySelector("#mark-complete");
  mark.disabled = done;
  mark.textContent = done ? "Mission complete ✓" : "Mark Complete";
  document.querySelector("#next-mission").disabled = !done;
  document.querySelector("#run-title").textContent = expedition.title;
  document.querySelector("#run-reminder").textContent = done
    ? "Take your time outside. When you are ready, return for the next mission."
    : "Read this mission, put your phone away while you explore, then come back to mark it complete.";
  missionResults.hidden = true;
  completionView.hidden = true;
  discoveryView.hidden = true;
  runView.hidden = false;
}

function renderCompletion() {
  const expedition = runState.expedition;
  document.querySelector("#completion-count").textContent = `${runState.completedIds.length} FIELD NOTES EXPLORED`;
  document.querySelector("#completion-meta").textContent = `${expedition.duration_minutes} MINUTES PLANNED  ·  ${expedition.theme.toUpperCase()}`;
  document.querySelector("#completion-fieldnotes").replaceChildren(
    ...expedition.missions.filter((mission) => runState.completedIds.includes(mission.id)).map(renderMission)
  );
  revealTargets(document.querySelectorAll("#completion-fieldnotes .fieldnote-card"));
  runView.hidden = true;
  missionResults.hidden = true;
  discoveryView.hidden = true;
  completionView.hidden = false;
}

function renderDiscoveryReview() {
  const cards = runState.expedition.missions.filter((mission) => runState.completedIds.includes(mission.id)).map(renderMission);
  document.querySelector("#discovery-list").replaceChildren(...cards);
  completionView.hidden = true;
  discoveryView.hidden = false;
  scrollToView(discoveryView)
}

function restoreState() {
  let raw;
  try { raw = sessionStorage.getItem(STORAGE_KEY); } catch (error) { return; }
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    if (!validExpedition(saved.expedition) || !["review", "active", "complete"].includes(saved.phase)
      || !Number.isInteger(saved.currentIndex) || saved.currentIndex < 0 || saved.currentIndex >= saved.expedition.missions.length
      || !Array.isArray(saved.completedIds)
      || new Set(saved.completedIds).size !== saved.completedIds.length
      || saved.completedIds.some((id) => !saved.expedition.missions.some((mission) => mission.id === id))
      || (saved.phase === "complete" && saved.completedIds.length !== saved.expedition.missions.length)) throw new Error("invalid saved expedition");
    runState = saved;
    applyTheme(saved.expedition.theme);
    if (saved.phase === "active") renderRun();
    else if (saved.phase === "complete") renderCompletion();
    else displayExpedition(saved.expedition);
  } catch (error) {
    clearState();
    showBuilder("Your saved expedition could not be restored. Please make a new one.");
  }
}

missionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(missionForm);
  const requestBody = { duration_minutes: Number(formData.get("duration_minutes")), difficulty: formData.get("difficulty"), interest: formData.get("interest") };
  generateButton.disabled = true;
  generateButton.setAttribute("aria-busy", "true");
  generateButton.querySelector("span:first-child").textContent = "Planning your walk…";
  formStatus.dataset.error = "false";
  formStatus.textContent = "Your local nature guide is thinking up a few things to notice.";
  try {
    const response = await fetch("/api/missions/generate", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(requestBody) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "We could not make that expedition. Please try again.");
    displayExpedition(data);
  } catch (error) {
    formStatus.dataset.error = "true";
    formStatus.textContent = error.message || "Something went wrong. Please try again.";
  } finally {
    generateButton.disabled = false;
    generateButton.removeAttribute("aria-busy");
    generateButton.querySelector("span:first-child").textContent = "Make my expedition";
  }
});

missionForm?.addEventListener("change", (event) => {
  if (event.target.name === "interest") applyTheme(event.target.value);
});

document.querySelector("#start-expedition")?.addEventListener("click", () => {
  if (!runState || !validExpedition(runState.expedition)) return showBuilder("This expedition is unavailable. Please make a new one.");
  runState.phase = "active";
  runState.currentIndex = 0;
  runState.completedIds = [];
  saveState();
  renderRun();
  scrollToView(runView)
});
document.querySelector("#mark-complete")?.addEventListener("click", () => {
  if (!runState || runState.phase !== "active") return;
  const id = runState.expedition.missions[runState.currentIndex].id;
  if (!runState.completedIds.includes(id)) runState.completedIds.push(id);
  const runCard = document.querySelector(".run-card");
  runCard.dataset.justCompleted = "true";
  setTimeout(() => { delete runCard.dataset.justCompleted; }, 900);
  saveState();
  renderRun();
});
document.querySelector("#next-mission")?.addEventListener("click", () => {
  if (!runState || runState.phase !== "active" || !runState.completedIds.includes(runState.expedition.missions[runState.currentIndex].id)) return;
  if (runState.completedIds.length === runState.expedition.missions.length) {
    runState.phase = "complete";
    saveState();
    renderCompletion();
  } else {
    runState.currentIndex += 1;
    saveState();
    renderRun();
  }
  scrollToView(runState.phase === "complete" ? completionView : runView)
});
document.querySelector("#review-discoveries")?.addEventListener("click", renderDiscoveryReview);
document.querySelector("#back-to-completion")?.addEventListener("click", () => { discoveryView.hidden = true; completionView.hidden = false; scrollToView(completionView) });
document.querySelector("#start-another")?.addEventListener("click", () => {
  clearState();
  missionForm.reset();
  showBuilder();
  scrollToView(document.querySelector("#expedition-builder"))
});
document.querySelector("#regenerate-expedition")?.addEventListener("click", () => missionForm.requestSubmit());
document.querySelector("#back-to-builder")?.addEventListener("click", () => { clearState(); showBuilder(); scrollToView(document.querySelector("#expedition-builder")) });

restoreState();
const initialInterest = document.querySelector('input[name="interest"]:checked');
applyTheme(runState?.expedition.theme || initialInterest?.value || "Mixed Nature");
setupScrollReveals();
