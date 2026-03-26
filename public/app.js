const form = document.getElementById("analysis-form");
const statusText = document.getElementById("statusText");
const emptyState = document.getElementById("emptyState");
const results = document.getElementById("results");
const matchPercentage = document.getElementById("matchPercentage");
const likelihood = document.getElementById("likelihood");
const overview = document.getElementById("overview");
const bluntAssessment = document.getElementById("bluntAssessment");
const matchedSkills = document.getElementById("matchedSkills");
const missingSkills = document.getElementById("missingSkills");
const essentialRequirements = document.getElementById("essentialRequirements");
const requirements = document.getElementById("requirements");
const concerns = document.getElementById("concerns");
const confidenceNote = document.getElementById("confidenceNote");
const cvPreview = document.getElementById("cvPreview");
const rewriteOutput = document.getElementById("rewriteOutput");
const relevantExperience = document.getElementById("relevantExperience");
const lessRelevantExperience = document.getElementById("lessRelevantExperience");

const cvFileInput = document.getElementById("cvFile");
const cvTextInput = document.getElementById("cvText");
const jobTextInput = document.getElementById("jobText");
const focusAreasInput = document.getElementById("focusAreas");
const apiKeyInput = document.getElementById("apiKey");

const clearBtn = document.getElementById("clearBtn");
const copyPromptBtn = document.getElementById("copyPromptBtn");
const openChatGptBtn = document.getElementById("openChatGptBtn");
const rewriteBtn = document.getElementById("rewriteBtn");

let latestPrompt = "";
let latestCvText = "";

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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  rewriteOutput.classList.add("hidden");
  rewriteOutput.textContent = "";
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
    latestCvText = data.extractedCvText || "";

    emptyState.classList.add("hidden");
    results.classList.remove("hidden");

    matchPercentage.textContent = `${data.analysis.matchPercentage}%`;
    likelihood.textContent = data.analysis.likelihood;
    overview.textContent = data.analysis.overview;
    bluntAssessment.textContent = data.analysis.bluntAssessment;
    confidenceNote.textContent = data.analysis.confidenceNote;
    cvPreview.textContent = data.extractedCvPreview || "No CV preview available.";

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

openChatGptBtn.addEventListener("click", () => {
  if (!latestPrompt) {
    setStatus("Run an analysis first so I can prepare the rewrite prompt.", true);
    return;
  }

  window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
  setStatus("ChatGPT opened in a new tab. Paste the copied prompt there.");
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

clearBtn.addEventListener("click", () => {
  form.reset();
  latestPrompt = "";
  latestCvText = "";
  rewriteOutput.textContent = "";
  rewriteOutput.classList.add("hidden");
  results.classList.add("hidden");
  emptyState.classList.remove("hidden");
  setStatus("Run an analysis to see the match score, strengths, gaps, and rewrite options.");
});
