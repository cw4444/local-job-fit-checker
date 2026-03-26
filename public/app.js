const form = document.getElementById("analysis-form");
const statusText = document.getElementById("statusText");
const emptyState = document.getElementById("emptyState");
const results = document.getElementById("results");
const matchPercentage = document.getElementById("matchPercentage");
const likelihood = document.getElementById("likelihood");
const verdictLabel = document.getElementById("verdictLabel");
const verdictReason = document.getElementById("verdictReason");
const overview = document.getElementById("overview");
const bluntAssessment = document.getElementById("bluntAssessment");
const matchedSkills = document.getElementById("matchedSkills");
const missingSkills = document.getElementById("missingSkills");
const essentialRequirements = document.getElementById("essentialRequirements");
const skillBreakdown = document.getElementById("skillBreakdown");
const requirements = document.getElementById("requirements");
const concerns = document.getElementById("concerns");
const confidenceNote = document.getElementById("confidenceNote");
const cvPreview = document.getElementById("cvPreview");
const rewriteOutput = document.getElementById("rewriteOutput");
const rewritePromptPreview = document.getElementById("rewritePromptPreview");
const alternateRewritePromptPreview = document.getElementById("alternateRewritePromptPreview");
const relevantExperience = document.getElementById("relevantExperience");
const lessRelevantExperience = document.getElementById("lessRelevantExperience");
const keywordStrategy = document.getElementById("keywordStrategy");
const vibeAnalysis = document.getElementById("vibeAnalysis");
const coverLetterPromptPreview = document.getElementById("coverLetterPromptPreview");
const coverLetterOutput = document.getElementById("coverLetterOutput");

const cvFileInput = document.getElementById("cvFile");
const cvTextInput = document.getElementById("cvText");
const jobTextInput = document.getElementById("jobText");
const focusAreasInput = document.getElementById("focusAreas");
const apiKeyInput = document.getElementById("apiKey");

const clearBtn = document.getElementById("clearBtn");
const copyPromptBtn = document.getElementById("copyPromptBtn");
const copyAltPromptBtn = document.getElementById("copyAltPromptBtn");
const openChatGptBtn = document.getElementById("openChatGptBtn");
const rewriteBtn = document.getElementById("rewriteBtn");
const copyCoverLetterPromptBtn = document.getElementById("copyCoverLetterPromptBtn");
const openCoverLetterChatGptBtn = document.getElementById("openCoverLetterChatGptBtn");
const coverLetterBtn = document.getElementById("coverLetterBtn");

let latestPrompt = "";
let latestAlternatePrompt = "";
let latestCvText = "";
let latestCoverLetterPrompt = "";

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function createTag(text, variant) {
  const tag = document.createElement("span");
  tag.className = `tag ${variant}`;
  tag.textContent = text;
  return tag;
}

function renderTagList(container, items, variant, emptyMessage) {
  container.innerHTML = "";

  if (!items.length) {
    const fallback = document.createElement("p");
    fallback.textContent = emptyMessage;
    fallback.className = "helper-copy";
    container.appendChild(fallback);
    return;
  }

  for (const item of items) {
    container.appendChild(createTag(item, variant));
  }
}

function renderList(container, items, emptyMessage) {
  container.innerHTML = "";
  const values = items.length ? items : [emptyMessage];

  for (const item of values) {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  }
}

function renderEssentialRequirements(items) {
  essentialRequirements.innerHTML = "";

  if (!items.length) {
    const fallback = document.createElement("p");
    fallback.className = "helper-copy";
    fallback.textContent = "No explicit must-have requirements were confidently detected in the advert.";
    essentialRequirements.appendChild(fallback);
    return;
  }

  for (const item of items) {
    const card = document.createElement("div");
    card.className = `requirement-pill requirement-pill--${item.strength}`;

    const title = document.createElement("strong");
    title.textContent =
      item.strength === "strong"
        ? "Strong evidence"
        : item.strength === "partial"
          ? "Some evidence"
          : "Little or no evidence";

    const body = document.createElement("p");
    const termText = item.matchedTerms.length ? ` Matched terms: ${item.matchedTerms.join(", ")}.` : "";
    body.textContent = `${item.requirement}${termText}`;

    card.appendChild(title);
    card.appendChild(body);
    essentialRequirements.appendChild(card);
  }
}

function renderSkillBreakdown(items) {
  skillBreakdown.innerHTML = "";

  if (!items.length) {
    const fallback = document.createElement("p");
    fallback.className = "helper-copy";
    fallback.textContent = "No structured skill breakdown was generated from the advert.";
    skillBreakdown.appendChild(fallback);
    return;
  }

  for (const item of items) {
    const card = document.createElement("div");
    const variant =
      item.status === "exact" ? "strong" : item.status === "adjacent" ? "partial" : "none";
    card.className = `requirement-pill requirement-pill--${variant}`;

    const title = document.createElement("strong");
    const criticality = item.likelyNonCritical ? "Likely wishlist" : item.type === "preferred" ? "Preferred" : "Required";
    title.textContent = `${item.skill} -> ${item.status} match (${criticality})`;

    const body = document.createElement("p");
    body.textContent = item.explanation;

    card.appendChild(title);
    card.appendChild(body);
    skillBreakdown.appendChild(card);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  rewriteOutput.classList.add("hidden");
  rewriteOutput.textContent = "";
  coverLetterOutput.classList.add("hidden");
  coverLetterOutput.textContent = "";
  setStatus("Analysing the role against your CV...");

  const formData = new FormData();
  if (cvFileInput.files[0]) {
    formData.append("cvFile", cvFileInput.files[0]);
  }

  formData.append("cvText", cvTextInput.value);
  formData.append("jobText", jobTextInput.value);
  formData.append("focusAreas", focusAreasInput.value);

  try {
    const response = await fetch("/api/analyse", {
      method: "POST",
      body: formData
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Analysis failed.");
    }

    latestPrompt = data.rewritePrompt;
    latestAlternatePrompt = data.alternateRewritePrompt || "";
    latestCoverLetterPrompt = data.coverLetterPrompt || "";
    latestCvText = data.extractedCvText || "";

    emptyState.classList.add("hidden");
    results.classList.remove("hidden");

    matchPercentage.textContent = `${data.analysis.matchPercentage}%`;
    likelihood.textContent = data.analysis.likelihood;
    verdictLabel.textContent = data.analysis.verdict?.label || "";
    verdictReason.textContent = data.analysis.verdict?.reason || "";
    overview.textContent = data.analysis.overview;
    bluntAssessment.textContent = data.analysis.bluntAssessment;
    confidenceNote.textContent = data.analysis.confidenceNote;
    cvPreview.textContent = data.extractedCvPreview || "No CV preview available.";
    rewritePromptPreview.textContent = latestPrompt || "No rewrite prompt available.";
    alternateRewritePromptPreview.textContent = latestAlternatePrompt || "No alternate rewrite prompt available.";
    coverLetterPromptPreview.textContent = latestCoverLetterPrompt || "No cover letter prompt available.";

    renderTagList(
      matchedSkills,
      data.analysis.matchedSkills,
      "tag--match",
      "No clear skill matches were found from the current keyword set."
    );
    renderTagList(
      missingSkills,
      data.analysis.missingSkills,
      "tag--gap",
      "No obvious gaps were detected from the tracked skill list."
    );
    renderList(
      requirements,
      data.analysis.requirements,
      "No strong requirement statements were detected in the pasted advert."
    );
    renderList(
      concerns,
      data.analysis.concerns,
      "No major concerns stood out from the heuristic scan."
    );
    renderEssentialRequirements(data.analysis.essentialRequirements || []);
    renderSkillBreakdown(data.analysis.skillBreakdown || []);
    renderList(
      relevantExperience,
      data.analysis.relevantExperience,
      "Nothing strongly role-relevant stood out yet. Tailoring may need a heavier rewrite."
    );
    renderList(
      lessRelevantExperience,
      data.analysis.lessRelevantExperience,
      "No obvious filler or weak lines were flagged from the extracted CV text."
    );
    renderList(
      keywordStrategy,
      (data.analysis.keywordStrategy || []).map((item) => `${item.keyword}: ${item.usageTip}`),
      "No keyword strategy was generated."
    );
    renderList(
      vibeAnalysis,
      data.analysis.vibeAnalysis?.notes || [],
      "No vibe analysis notes were generated."
    );

    setStatus("Analysis ready. Review the score, gaps, and rewrite options.");
  } catch (error) {
    emptyState.classList.remove("hidden");
    results.classList.add("hidden");
    setStatus(error.message || "Something went wrong during analysis.", true);
  }
});

copyPromptBtn.addEventListener("click", async () => {
  if (!latestPrompt) {
    setStatus("Run an analysis first so there is a rewrite prompt to copy.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(latestPrompt);
    setStatus("Rewrite prompt copied. You can paste it straight into ChatGPT.");
  } catch {
    setStatus("Copy failed. Your browser may not allow clipboard access here.", true);
  }
});

copyAltPromptBtn.addEventListener("click", async () => {
  if (!latestAlternatePrompt) {
    setStatus("Run an analysis first so there is an editor prompt to copy.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(latestAlternatePrompt);
    setStatus("Alternate editor prompt copied. You can paste it straight into ChatGPT.");
  } catch {
    setStatus("Copy failed. Your browser may not allow clipboard access here.", true);
  }
});

openChatGptBtn.addEventListener("click", () => {
  if (!latestPrompt) {
    setStatus("Run an analysis first so I can prepare the rewrite prompt.", true);
    return;
  }

  navigator.clipboard
    .writeText(latestPrompt)
    .then(() => {
      window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
      setStatus("Rewrite prompt copied and ChatGPT opened. Paste it into the chat box.");
    })
    .catch(() => {
      window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
      setStatus("ChatGPT opened. Clipboard access was blocked, so copy the prompt from the panel.", true);
    });
});

rewriteBtn.addEventListener("click", async () => {
  const cvSource = cvTextInput.value.trim() || latestCvText.trim();
  const jobSource = jobTextInput.value.trim();

  if (!cvSource || !jobSource) {
    setStatus("Add a CV and a job description before requesting a rewrite.", true);
    return;
  }

  rewriteBtn.disabled = true;
  setStatus("Generating tailored CV rewrite...");

  try {
    const response = await fetch("/api/rewrite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        cvText: cvSource,
        jobText: jobSource,
        apiKey: apiKeyInput.value.trim(),
        focusAreas: focusAreasInput.value.trim()
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Rewrite failed.");
    }

    rewriteOutput.textContent = data.rewritten;
    rewriteOutput.classList.remove("hidden");
    setStatus("CV rewrite generated.");
  } catch (error) {
    setStatus(error.message || "Something went wrong during the rewrite.", true);
  } finally {
    rewriteBtn.disabled = false;
  }
});

copyCoverLetterPromptBtn.addEventListener("click", async () => {
  if (!latestCoverLetterPrompt) {
    setStatus("Run an analysis first so there is a cover letter prompt to copy.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(latestCoverLetterPrompt);
    setStatus("Cover letter prompt copied. You can paste it straight into ChatGPT.");
  } catch {
    setStatus("Copy failed. Your browser may not allow clipboard access here.", true);
  }
});

openCoverLetterChatGptBtn.addEventListener("click", () => {
  if (!latestCoverLetterPrompt) {
    setStatus("Run an analysis first so I can prepare the cover letter prompt.", true);
    return;
  }

  navigator.clipboard
    .writeText(latestCoverLetterPrompt)
    .then(() => {
      window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
      setStatus("Cover letter prompt copied and ChatGPT opened. Paste it into the chat box.");
    })
    .catch(() => {
      window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
      setStatus("ChatGPT opened. Clipboard access was blocked, so copy the prompt from the panel.", true);
    });
});

coverLetterBtn.addEventListener("click", async () => {
  const cvSource = cvTextInput.value.trim() || latestCvText.trim();
  const jobSource = jobTextInput.value.trim();

  if (!cvSource || !jobSource) {
    setStatus("Add a CV and a job description before requesting a cover letter.", true);
    return;
  }

  coverLetterBtn.disabled = true;
  setStatus("Generating tailored cover letter...");

  try {
    const response = await fetch("/api/cover-letter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        cvText: cvSource,
        jobText: jobSource,
        apiKey: apiKeyInput.value.trim(),
        focusAreas: focusAreasInput.value.trim()
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Cover letter generation failed.");
    }

    coverLetterOutput.textContent = data.coverLetter;
    coverLetterOutput.classList.remove("hidden");
    setStatus("Cover letter generated.");
  } catch (error) {
    setStatus(error.message || "Something went wrong during cover letter generation.", true);
  } finally {
    coverLetterBtn.disabled = false;
  }
});

clearBtn.addEventListener("click", () => {
  form.reset();
  latestPrompt = "";
  latestAlternatePrompt = "";
  latestCvText = "";
  latestCoverLetterPrompt = "";
  rewriteOutput.textContent = "";
  rewriteOutput.classList.add("hidden");
  coverLetterOutput.textContent = "";
  coverLetterOutput.classList.add("hidden");
  rewritePromptPreview.textContent = "";
  alternateRewritePromptPreview.textContent = "";
  coverLetterPromptPreview.textContent = "";
  results.classList.add("hidden");
  emptyState.classList.remove("hidden");
  setStatus("Run an analysis to see the match score, strengths, gaps, and rewrite options.");
});
