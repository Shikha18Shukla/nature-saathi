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
const EVIDENCE_TYPES = ["photo", "reflection", "optional"];
const THEME_SLUGS = {
  leaves: "leaves", flowers: "flowers", birds: "birds", insects: "insects", trees: "trees",
  soil: "soil", rocks: "rocks", sounds: "sounds", colors: "colors", textures: "textures",
  "animal signs": "animal-signs", "mixed nature": "mixed-nature",
};
let runState = null;
let revealObserver = null;
const photoMemory = new Map(); // missionId -> { file, objectUrl } — never persisted

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
  clearAllPhotos();
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
  document.querySelector("#run-evidence").textContent = mission.evidence_type === "photo" ? "Photo required" : mission.evidence_type === "reflection" ? "Reflection required" : "Optional";
  const mark = document.querySelector("#mark-complete");
  const evidenceSubmitted = runState.evidence?.[mission.id]?.submitted || false;
  const canComplete = !done && (evidenceSubmitted || mission.evidence_type === "optional");
  mark.disabled = !canComplete;
  if (done) {
    mark.textContent = "Mission complete ✓";
  } else if (mission.evidence_type === "photo" && !evidenceSubmitted) {
    mark.textContent = "Submit photo to complete";
  } else if (mission.evidence_type === "reflection" && !evidenceSubmitted) {
    mark.textContent = "Submit reflection to complete";
  } else {
    mark.textContent = "Mark Complete";
  }
  document.querySelector("#next-mission").disabled = !done;
  document.querySelector("#run-title").textContent = expedition.title;
  document.querySelector("#run-reminder").textContent = done
    ? "Take your time outside. When you are ready, return for the next mission."
    : "Read this mission, put your phone away while you explore, then come back to submit evidence.";
  renderEvidenceArea(mission);
  missionResults.hidden = true;
  completionView.hidden = true;
  discoveryView.hidden = true;
  runView.hidden = false;
}

function updateCompleteButton(mission) {
  const mark = document.querySelector("#mark-complete");
  const done = runState.completedIds.includes(mission.id);
  const evidenceSubmitted = runState.evidence?.[mission.id]?.submitted || false;
  const canComplete = !done && (evidenceSubmitted || mission.evidence_type === "optional");
  mark.disabled = !canComplete;
  if (done) {
    mark.textContent = "Mission complete ✓";
  } else if (mission.evidence_type === "photo" && !evidenceSubmitted) {
    mark.textContent = "Submit photo to complete";
  } else if (mission.evidence_type === "reflection" && !evidenceSubmitted) {
    mark.textContent = "Submit reflection to complete";
  } else {
    mark.textContent = "Mark Complete";
  }
}

function renderEvidenceArea(mission) {
  const area = document.querySelector("#evidence-area");
  const photoSection = document.querySelector("#evidence-photo");
  const reflectionSection = document.querySelector("#evidence-reflection");
  const instruction = document.querySelector("#evidence-instruction");
  const evidenceSubmitted = runState.evidence?.[mission.id]?.submitted || false;
  const savedPhoto = photoMemory.get(mission.id);
  if (mission.evidence_type === "photo") {
    instruction.textContent = "This mission needs a photo. Take or choose a picture of what you noticed.";
    photoSection.hidden = false;
    reflectionSection.hidden = true;
    document.querySelector("#evidence-status").textContent = evidenceSubmitted ? "Photo evidence submitted ✓" : "";
    document.querySelector("#photo-preview").hidden = !savedPhoto;
    document.querySelector("#photo-preview-img").src = savedPhoto?.objectUrl || "";
    document.querySelector("#submit-photo").disabled = !savedPhoto || evidenceSubmitted;
  } else if (mission.evidence_type === "reflection") {
    instruction.textContent = "This mission needs a short reflection. Write what you noticed.";
    photoSection.hidden = true;
    reflectionSection.hidden = false;
    const savedReflection = runState.evidence?.[mission.id]?.reflectionText || "";
    document.querySelector("#reflection-input").value = savedReflection;
    document.querySelector("#reflection-status").textContent = evidenceSubmitted ? "Reflection saved ✓" : "";
    document.querySelector("#submit-reflection").disabled = evidenceSubmitted;
  } else {
    instruction.textContent = "No evidence required for this mission.";
    photoSection.hidden = true;
    reflectionSection.hidden = true;
  }
}

function handlePhotoSelect(file) {
  if (!runState || runState.phase !== "active") return;
  const mission = runState.expedition.missions[runState.currentIndex];
  if (!file || runState.evidence?.[mission.id]?.submitted) return;
  clearPhotoForMission(mission.id);
  const objectUrl = URL.createObjectURL(file);
  photoMemory.set(mission.id, { file, objectUrl });
  const preview = document.querySelector("#photo-preview");
  const previewImg = document.querySelector("#photo-preview-img");
  previewImg.src = objectUrl;
  preview.hidden = false;
  document.querySelector("#submit-photo").disabled = false;
  document.querySelector("#evidence-status").textContent = "Photo ready. Submit it as evidence.";
}

function clearPhotoForMission(missionId) {
  const saved = photoMemory.get(missionId);
  if (saved) {
    URL.revokeObjectURL(saved.objectUrl);
    photoMemory.delete(missionId);
  }
}

function clearAllPhotos() {
  photoMemory.forEach((saved) => URL.revokeObjectURL(saved.objectUrl));
  photoMemory.clear();
}

async function triggerVisionAnalysis(missionId, file) {
  const visionResult = document.querySelector("#vision-result");
  const visionContent = document.querySelector("#vision-content");
  visionResult.hidden = false;
  visionContent.textContent = "Analyzing photo with local AI…";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  try {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/vision/analyze", { method: "POST", body: formData, signal: controller.signal });
    const data = await response.json();
    if (data.status === "unavailable") {
      visionContent.textContent = "Local vision analysis is not available. Your photo evidence was saved.";
    } else if (data.status === "ok" && data.analysis) {
      const parts = [];
      if (data.analysis.description) parts.push(`What I see: ${data.analysis.description}`);
      if (data.analysis.possible_identification) parts.push(`Possible ID: ${data.analysis.possible_identification}`);
      if (data.analysis.observation) parts.push(`Observation: ${data.analysis.observation}`);
      if (data.analysis.uncertainty) parts.push(`Uncertainty: ${data.analysis.uncertainty}`);
      visionContent.textContent = parts.join(" ");
    } else {
      visionContent.textContent = "Vision analysis could not be completed. Your photo evidence was saved.";
    }
  } catch (error) {
    visionContent.textContent = "Vision analysis could not be completed. Your photo evidence was saved.";
  } finally {
    clearTimeout(timeoutId);
  }
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
    // On refresh, clear photo evidence for missions not yet completed (photos are never persisted)
    if (runState.evidence) {
      for (const missionId of Object.keys(runState.evidence)) {
        const mission = runState.expedition.missions.find((m) => m.id === Number(missionId));
        if (mission && runState.evidence[missionId].type === "photo" && !runState.completedIds.includes(mission.id)) {
          delete runState.evidence[missionId];
        }
      }
    }
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    const response = await fetch("/api/missions/generate", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(requestBody), signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "We could not make that expedition. Please try again.");
    displayExpedition(data);
  } catch (error) {
    formStatus.dataset.error = "true";
    formStatus.textContent = error.name === "AbortError" ? "The local nature guide took too long. Please try again." : (error.message || "Something went wrong. Please try again.");
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
  const mission = runState.expedition.missions[runState.currentIndex];
  const evidenceSubmitted = runState.evidence?.[mission.id]?.submitted || false;
  if (mission.evidence_type === "photo" && !evidenceSubmitted) return;
  if (mission.evidence_type === "reflection" && !evidenceSubmitted) return;
  const id = mission.id;
  if (!runState.completedIds.includes(id)) runState.completedIds.push(id);
  clearPhotoForMission(id);
  const runCard = document.querySelector(".run-card");
  runCard.dataset.justCompleted = "true";
  setTimeout(() => { delete runCard.dataset.justCompleted; }, 900);
  saveState();
  renderRun();
});

// Evidence: photo selection
document.querySelector("#photo-input")?.addEventListener("change", (event) => handlePhotoSelect(event.target.files[0]));
document.querySelector("#photo-capture")?.addEventListener("change", (event) => handlePhotoSelect(event.target.files[0]));
document.querySelector("#replace-photo")?.addEventListener("click", () => {
  const mission = runState?.expedition.missions[runState.currentIndex];
  if (!mission) return;
  clearPhotoForMission(mission.id);
  document.querySelector("#photo-input").value = "";
  document.querySelector("#photo-capture").value = "";
  renderEvidenceArea(mission);
});

// Evidence: photo submission
document.querySelector("#submit-photo")?.addEventListener("click", async () => {
  if (!runState || runState.phase !== "active") return;
  const mission = runState.expedition.missions[runState.currentIndex];
  const savedPhoto = photoMemory.get(mission.id);
  if (!savedPhoto || runState.evidence?.[mission.id]?.submitted) return;
  const submitBtn = document.querySelector("#submit-photo");
  const status = document.querySelector("#evidence-status");
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";
  status.textContent = "Sending your photo for validation…";
  status.dataset.error = "false";
  try {
    const formData = new FormData();
    formData.append("file", savedPhoto.file);
    const response = await fetch("/api/evidence/photo", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Could not submit photo. Please try again.");
    if (!runState.evidence) runState.evidence = {};
    runState.evidence[mission.id] = { type: "photo", submitted: true };
    saveState();
    status.textContent = "Photo evidence submitted ✓";
    status.dataset.error = "false";
    submitBtn.textContent = "Submitted ✓";
    renderEvidenceArea(mission);
    updateCompleteButton(mission);
    // Trigger optional vision analysis (non-blocking)
    triggerVisionAnalysis(mission.id, savedPhoto.file);
  } catch (error) {
    status.textContent = error.message || "Something went wrong. Please try again.";
    status.dataset.error = "true";
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Photo Evidence";
  }
});

// Evidence: reflection submission
document.querySelector("#submit-reflection")?.addEventListener("click", async () => {
  if (!runState || runState.phase !== "active") return;
  const mission = runState.expedition.missions[runState.currentIndex];
  if (runState.evidence?.[mission.id]?.submitted) return;
  const text = document.querySelector("#reflection-input").value;
  const submitBtn = document.querySelector("#submit-reflection");
  const status = document.querySelector("#reflection-status");
  submitBtn.disabled = true;
  status.textContent = "Saving your reflection…";
  status.dataset.error = "false";
  try {
    const response = await fetch("/api/evidence/reflection", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Could not save reflection. Please try again.");
    if (!runState.evidence) runState.evidence = {};
    runState.evidence[mission.id] = { type: "reflection", submitted: true, reflectionText: text };
    saveState();
    status.textContent = "Reflection saved ✓";
    status.dataset.error = "false";
    submitBtn.disabled = true;
    renderEvidenceArea(mission);
  } catch (error) {
    status.textContent = error.message || "Something went wrong. Please try again.";
    status.dataset.error = "true";
    submitBtn.disabled = false;
  }
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

window.addEventListener("beforeunload", () => { clearAllPhotos(); });

restoreState();
const initialInterest = document.querySelector('input[name="interest"]:checked');
applyTheme(runState?.expedition.theme || initialInterest?.value || "Mixed Nature");
setupScrollReveals();
