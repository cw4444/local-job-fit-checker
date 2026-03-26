const fs = require("fs/promises");
const path = require("path");

const dotenv = require("dotenv");
const express = require("express");
const mammoth = require("mammoth");
const multer = require("multer");
const OpenAI = require("openai");
const pdfParse = require("pdf-parse");

dotenv.config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

const PORT = process.env.PORT || 3000;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const skillCatalog = {
  technical: [
    "javascript",
    "typescript",
    "node",
    "react",
    "next.js",
    "python",
    "java",
    "c#",
    "sql",
    "postgresql",
    "mysql",
    "mongodb",
    "aws",
    "azure",
    "gcp",
    "docker",
    "kubernetes",
    "terraform",
    "html",
    "css",
    "rest api",
    "graphql",
    "git",
    "ci/cd",
    "testing",
    "jest",
    "playwright",
    "selenium",
    "agile",
    "scrum"
  ],
  product: [
    "stakeholder management",
    "roadmap",
    "product strategy",
    "discovery",
    "delivery",
    "analytics",
    "experimentation",
    "a/b testing",
    "customer research",
    "ux",
    "seo",
    "content strategy",
    "campaign management"
  ],
  people: [
    "communication",
    "leadership",
    "mentoring",
    "collaboration",
    "presentation",
    "problem solving",
    "time management",
    "attention to detail"
  ]
};

const adjacentSkillMap = {
  javascript: ["js", "ecmascript", "frontend scripting"],
  typescript: ["typed javascript"],
  node: ["node.js", "nodejs", "backend javascript"],
  react: ["react.js", "reactjs"],
  "next.js": ["nextjs", "server-side react"],
  python: ["pandas", "numpy", "python scripting"],
  sql: ["postgresql", "mysql", "sql server", "queries", "database querying"],
  aws: ["amazon web services", "lambda", "ec2", "s3", "cloudformation"],
  azure: ["azure devops", "microsoft azure"],
  docker: ["containerisation", "containerization", "containers"],
  kubernetes: ["k8s"],
  terraform: ["infrastructure as code", "iac"],
  testing: ["automated testing", "qa", "quality assurance", "test automation"],
  "stakeholder management": ["stakeholder engagement", "stakeholder communication", "cross-functional collaboration"],
  roadmap: ["roadmapping", "planning cycles"],
  "product strategy": ["product vision", "strategic product planning"],
  discovery: ["product discovery", "user discovery"],
  analytics: ["data analysis", "insights", "reporting"],
  experimentation: ["a/b testing", "split testing", "test and learn"],
  ux: ["user experience", "customer journeys"],
  communication: ["presenting", "written communication", "verbal communication"],
  leadership: ["team leadership", "leading teams", "people leadership"],
  mentoring: ["coaching", "developing others"],
  collaboration: ["cross-functional working", "partnering"],
  "problem solving": ["troubleshooting", "analytical thinking"]
};

const stopWords = new Set([
  "the", "and", "for", "with", "that", "this", "you", "your", "from", "have", "will", "are",
  "our", "not", "but", "all", "can", "who", "has", "their", "they", "job", "role", "work",
  "working", "about", "into", "using", "used", "use", "over", "under", "across", "more", "than",
  "within", "must", "should", "would", "could", "there", "were", "been", "being", "where", "when",
  "what", "which", "them", "able", "such", "also", "any", "each", "one", "two", "three", "years",
  "year", "experience", "including", "ensure", "help", "team", "teams", "business", "skills"
]);

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function normaliseText(text = "") {
  return text
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/[^\w+#./ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text = "") {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function extractCvHighlights(text = "") {
  return text
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[\s\-*•]+/, "").trim())
    .filter((line) => line.length > 24);
}

function tokenise(text = "") {
  return normaliseText(text)
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-z0-9+#.]+|[^a-z0-9+#.]+$/g, ""))
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function extractKeywords(text = "", limit = 18) {
  const words = normaliseText(text)
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-z0-9+#.]+|[^a-z0-9+#.]+$/g, ""))
    .filter((word) => word.length > 2 && !stopWords.has(word));

  const counts = new Map();
  for (const word of words) {
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function extractCatalogSkills(text = "") {
  const normalized = normaliseText(text).toLowerCase();
  const matched = [];

  for (const group of Object.values(skillCatalog)) {
    for (const skill of group) {
      if (normalized.includes(skill.toLowerCase())) {
        matched.push(skill);
      }
    }
  }

  return [...new Set(matched)];
}

function sentenceContainsPreferredCue(sentence = "") {
  return /\b(preferred|nice to have|bonus|desirable|ideal|would be great|could have|helpful)\b/i.test(sentence);
}

function getAdjacentTerms(skill) {
  return adjacentSkillMap[skill.toLowerCase()] || [];
}

function detectSkillStatus(skill, cvText = "") {
  const normalizedCv = normaliseText(cvText).toLowerCase();
  const normalizedSkill = skill.toLowerCase();

  if (normalizedCv.includes(normalizedSkill)) {
    return {
      status: "exact",
      evidence: skill
    };
  }

  const adjacent = getAdjacentTerms(skill).find((term) => normalizedCv.includes(term.toLowerCase()));
  if (adjacent) {
    return {
      status: "adjacent",
      evidence: adjacent
    };
  }

  return {
    status: "missing",
    evidence: ""
  };
}

function extractRequirements(jobText = "") {
  const sentences = splitSentences(jobText);
  const priorityPatterns = [
    /\bmust\b/i,
    /\brequired\b/i,
    /\bessential\b/i,
    /\bneed\b/i,
    /\blooking for\b/i,
    /\byou have\b/i,
    /\byou will\b/i,
    /\bresponsible for\b/i
  ];

  const picked = sentences.filter((sentence) =>
    priorityPatterns.some((pattern) => pattern.test(sentence))
  );

  return picked.slice(0, 10);
}

function extractEssentialRequirements(jobText = "") {
  const sentences = splitSentences(jobText);
  return sentences
    .filter((sentence) =>
      /\b(must|required|essential|need to|non-negotiable|minimum of|proven experience|hands-on experience)\b/i.test(
        sentence
      )
    )
    .slice(0, 8);
}

function extractPreferredRequirements(jobText = "") {
  return splitSentences(jobText)
    .filter((sentence) => sentenceContainsPreferredCue(sentence))
    .slice(0, 8);
}

function extractResponsibilities(jobText = "") {
  return splitSentences(jobText)
    .filter((sentence) =>
      /\b(you will|responsible for|own|lead|manage|deliver|support|build|develop|drive|coordinate)\b/i.test(
        sentence
      )
    )
    .slice(0, 10);
}

function scoreRequirementAgainstCv(requirement, cvText) {
  const requirementTokens = [...new Set(tokenise(requirement))];
  const cvLower = normaliseText(cvText).toLowerCase();
  const exactSkillHits = extractCatalogSkills(requirement).filter((skill) => cvLower.includes(skill.toLowerCase()));
  const tokenHits = requirementTokens.filter((token) => cvLower.includes(token));
  const overlapRatio = requirementTokens.length ? tokenHits.length / requirementTokens.length : 0;

  let strength = "none";
  if (exactSkillHits.length >= 2 || overlapRatio >= 0.55) {
    strength = "strong";
  } else if (exactSkillHits.length >= 1 || overlapRatio >= 0.28) {
    strength = "partial";
  }

  return {
    requirement,
    strength,
    matchedTerms: [...new Set([...exactSkillHits, ...tokenHits])].slice(0, 6)
  };
}

function buildSkillBreakdown(jobText, cvText) {
  const sentences = splitSentences(jobText);
  const jobSkills = extractCatalogSkills(jobText);
  const overloaded = jobSkills.length >= 12;

  return jobSkills.map((skill, index) => {
    const relatedSentence = sentences.find((sentence) => sentence.toLowerCase().includes(skill.toLowerCase())) || "";
    const preferred = sentenceContainsPreferredCue(relatedSentence);
    const detection = detectSkillStatus(skill, cvText);
    const likelyNonCritical = preferred || (overloaded && index >= 8);

    let explanation = "";
    if (detection.status === "exact") {
      explanation = `The CV names ${skill} directly.`;
    } else if (detection.status === "adjacent") {
      explanation = `The CV does not name ${skill} directly, but it does mention adjacent evidence like ${detection.evidence}.`;
    } else if (likelyNonCritical) {
      explanation = `This looks more like a preference or wishlist item than a hard blocker.`;
    } else {
      explanation = `This appears important in the advert, but the CV does not show clear evidence yet.`;
    }

    return {
      skill,
      status: detection.status,
      type: preferred ? "preferred" : "required",
      likelyNonCritical,
      evidence: detection.evidence,
      explanation
    };
  });
}

function getPriorityKeywords(jobText, skillBreakdown) {
  const jobKeywords = extractKeywords(jobText, 20);
  const mustHaveSkills = skillBreakdown
    .filter((item) => item.type === "required" && !item.likelyNonCritical)
    .map((item) => item.skill);

  const combined = [...new Set([...mustHaveSkills, ...jobKeywords])].slice(0, 10);
  return combined.map((keyword) => ({
    keyword,
    usageTip: `Use ${keyword} naturally in your summary or strongest role bullets where you can back it up truthfully.`
  }));
}

function inferSeniority(text = "") {
  const normalized = normaliseText(text).toLowerCase();
  if (/\b(head|director|principal|lead|senior manager)\b/.test(normalized)) {
    return "senior";
  }
  if (/\b(senior|manager|team lead)\b/.test(normalized)) {
    return "mid-senior";
  }
  if (/\b(junior|assistant|entry level|graduate)\b/.test(normalized)) {
    return "junior";
  }
  return "mid";
}

function buildVibeAnalysis(cvText, jobText, skillBreakdown, responsibilities) {
  const jdSeniority = inferSeniority(jobText);
  const cvSeniority = inferSeniority(cvText);
  const requiredCount = skillBreakdown.filter((item) => item.type === "required" && !item.likelyNonCritical).length;
  const preferredCount = skillBreakdown.filter((item) => item.type === "preferred" || item.likelyNonCritical).length;
  const vibes = [];

  if (jdSeniority === "senior" && (cvSeniority === "mid" || cvSeniority === "junior")) {
    vibes.push("Inference: the role reads more senior than the CV currently signals, so framing and evidence level will matter.");
  } else if (jdSeniority === "junior" && (cvSeniority === "mid-senior" || cvSeniority === "senior")) {
    vibes.push("Inference: the role may be below your likely level, which could affect how attractive it is to pursue.");
  }

  if (requiredCount + preferredCount >= 14 || responsibilities.length >= 8) {
    vibes.push("Inference: this job description looks overloaded, so some asks are probably wishlist items rather than true blockers.");
  }

  if (/\b(strategy|strategic)\b/i.test(jobText) && /\b(hands-on|execute|execution|deliver day to day)\b/i.test(jobText)) {
    vibes.push("Inference: this looks like a hybrid strategic and hands-on role, which often means a broad remit in practice.");
  }

  if (!vibes.length) {
    vibes.push("Inference: the advert looks fairly standard rather than unusually overloaded or mismatched.");
  }

  return {
    jdSeniority,
    cvSeniority,
    notes: vibes
  };
}

function buildVerdict(matchPercentage, essentialMisses, essentialPartials) {
  if (essentialMisses.length >= 2 || matchPercentage < 45) {
    return {
      label: "Don't bother",
      reason: "There are multiple hard gaps against the likely core requirements, so this may not be worth the time unless the advert is clearly overstated."
    };
  }

  if (essentialMisses.length === 1 || essentialPartials.length >= 2 || matchPercentage < 72) {
    return {
      label: "Apply with tweaks",
      reason: "There is enough alignment to justify an application, but the CV probably needs targeted rewriting and stronger framing."
    };
  }

  return {
    label: "Apply",
    reason: "The CV appears to cover the role well enough that an application looks worthwhile."
  };
}

function analyseCvRelevance(cvText, jobText, matchedSkills, missingSkills) {
  const lines = extractCvHighlights(cvText);
  const jobKeywords = new Set(extractKeywords(jobText, 25));
  const matchedSkillSet = new Set(matchedSkills.map((skill) => skill.toLowerCase()));
  const missingSkillSet = new Set(missingSkills.map((skill) => skill.toLowerCase()));

  const scored = lines.map((line) => {
    const lower = line.toLowerCase();
    const keywordsHit = [...jobKeywords].filter((keyword) => lower.includes(keyword));
    const matchedHits = [...matchedSkillSet].filter((skill) => lower.includes(skill));
    const missingHits = [...missingSkillSet].filter((skill) => lower.includes(skill));
    const hasMetrics = /\b\d+[%+xkmb]?|\b(increased|reduced|delivered|grew|saved|improved|launched|led)\b/i.test(line);
    const looksGeneric = /\b(hardworking|team player|fast learner|works well under pressure|go-getter|dynamic|motivated|results-driven)\b/i.test(
      line
    );

    let score = keywordsHit.length * 2 + matchedHits.length * 3 + (hasMetrics ? 2 : 0);
    if (looksGeneric) {
      score -= 3;
    }
    if (missingHits.length) {
      score -= 1;
    }

    return {
      line,
      score,
      looksGeneric,
      keywordsHit,
      matchedHits
    };
  });

  const relevantExperience = scored
    .filter((item) => item.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.line);

  const lessRelevantExperience = scored
    .filter((item) => item.looksGeneric || item.score <= 0)
    .slice(0, 4)
    .map((item) => item.line);

  return {
    relevantExperience,
    lessRelevantExperience
  };
}

function buildSummary(cvText, jobText, matchedSkills, missingSkills) {
  const jobKeywords = extractKeywords(jobText, 10);
  const cvKeywords = extractKeywords(cvText, 10);
  const sharedKeywords = jobKeywords.filter((keyword) => cvKeywords.includes(keyword)).slice(0, 5);

  const highlights = [];
  if (matchedSkills.length) {
    highlights.push(`Strong overlap in ${matchedSkills.slice(0, 5).join(", ")}.`);
  }
  if (sharedKeywords.length) {
    highlights.push(`The CV language already mirrors the role around ${sharedKeywords.join(", ")}.`);
  }
  if (!highlights.length) {
    highlights.push("There is some overlap, but the CV will need tailoring to speak more directly to the role.");
  }

  const concerns = [];
  if (missingSkills.length) {
    concerns.push(`The biggest gaps are ${missingSkills.slice(0, 5).join(", ")}.`);
  }

  const requirementCount = extractRequirements(jobText).length;
  if (requirementCount < 3) {
    concerns.push("The pasted job description is quite light on explicit requirements, so the score has lower confidence.");
  }

  return {
    overview: highlights.join(" "),
    concerns
  };
}

function scoreMatch(cvText, jobText) {
  const cvSkills = extractCatalogSkills(cvText);
  const jobSkills = extractCatalogSkills(jobText);
  const matchedSkills = jobSkills.filter((skill) => cvSkills.includes(skill));
  const missingSkills = jobSkills.filter((skill) => !cvSkills.includes(skill));
  const essentialRequirements = extractEssentialRequirements(jobText);
  const preferredRequirements = extractPreferredRequirements(jobText);
  const responsibilities = extractResponsibilities(jobText);
  const essentialRequirementScores = essentialRequirements.map((requirement) =>
    scoreRequirementAgainstCv(requirement, cvText)
  );
  const essentialHits = essentialRequirementScores.filter((item) => item.strength === "strong");
  const essentialPartials = essentialRequirementScores.filter((item) => item.strength === "partial");
  const essentialMisses = essentialRequirementScores.filter((item) => item.strength === "none");

  const jobKeywords = extractKeywords(jobText, 40);
  const cvKeywords = new Set(extractKeywords(cvText, 60));
  const keywordHits = jobKeywords.filter((keyword) => cvKeywords.has(keyword));

  const skillsScore = jobSkills.length ? matchedSkills.length / jobSkills.length : 0.5;
  const keywordScore = jobKeywords.length ? keywordHits.length / jobKeywords.length : 0.5;
  const requirementScore = Math.min(extractRequirements(cvText).length / Math.max(extractRequirements(jobText).length || 1, 1), 1);
  const essentialScore = essentialRequirements.length
    ? ((essentialHits.length * 1) + (essentialPartials.length * 0.45)) / essentialRequirements.length
    : 0.5;

  const rawScore = (skillsScore * 0.35) + (keywordScore * 0.25) + (requirementScore * 0.1) + (essentialScore * 0.3);
  const matchPercentage = Math.round(Math.max(0.15, Math.min(rawScore, 0.95)) * 100);

  let likelihood = "Low";
  if (matchPercentage >= 75) {
    likelihood = "High";
  } else if (matchPercentage >= 55) {
    likelihood = "Moderate";
  }

  const summary = buildSummary(cvText, jobText, matchedSkills, missingSkills);
  const cvRelevance = analyseCvRelevance(cvText, jobText, matchedSkills, missingSkills);
  const skillBreakdown = buildSkillBreakdown(jobText, cvText);
  const keywordStrategy = getPriorityKeywords(jobText, skillBreakdown);
  const vibeAnalysis = buildVibeAnalysis(cvText, jobText, skillBreakdown, responsibilities);
  const verdict = buildVerdict(matchPercentage, essentialMisses, essentialPartials);
  const bluntAssessment = essentialMisses.length
    ? `There ${essentialMisses.length === 1 ? "is 1 essential requirement" : `are ${essentialMisses.length} essential requirements`} where the CV shows little or no evidence.`
    : essentialPartials.length
      ? `Some essential requirements are only partially evidenced, so this may still need careful tailoring.`
      : "The CV appears to cover the core essential requirements reasonably well.";

  return {
    matchPercentage,
    likelihood,
    verdict,
    matchedSkills,
    missingSkills,
    essentialRequirements: essentialRequirementScores,
    essentialHits,
    essentialPartials,
    essentialMisses,
    preferredRequirements,
    responsibilities,
    skillBreakdown,
    keywordStrategy,
    vibeAnalysis,
    jobSkills,
    topKeywords: keywordHits.slice(0, 12),
    requirements: extractRequirements(jobText),
    overview: summary.overview,
    concerns: summary.concerns,
    bluntAssessment,
    relevantExperience: cvRelevance.relevantExperience,
    lessRelevantExperience: cvRelevance.lessRelevantExperience,
    confidenceNote:
      "This score is heuristic, not predictive. It is best used to decide whether a role is worth tailoring your CV for, not as a guarantee of interview odds."
  };
}

function buildRewritePrompt({ cvText, jobText, focusAreas }) {
  const extraFocus = focusAreas?.trim()
    ? `\nExtra focus from the user: ${focusAreas.trim()}`
    : "";

  return [
    "Rewrite my CV so it is better targeted to this role.",
    "Keep it truthful and do not invent experience.",
    "Prioritise the must-have requirements, transferable skills, measurable impact, and ATS-friendly wording.",
    "Classify the role fit honestly and focus on real evidence rather than vague similarity.",
    "Call out what is likely irrelevant waffle or weak/generic phrasing and suggest tighter replacements.",
    "Highlight which existing achievements are actually useful for this role and should be foregrounded.",
    "Treat exact matches, adjacent matches, and missing requirements differently.",
    "If something looks like a wishlist item rather than a true blocker, say so.",
    "Do not keyword stuff. Use only the most important terms naturally.",
    "Return:",
    "1. A rewritten professional summary",
    "2. Improved bullet points for the most relevant experience",
    "3. A short list titled 'Relevant evidence to keep and emphasise'",
    "4. A short list titled 'Likely waffle / weak points to cut or rewrite'",
    "5. A short list of keywords/skills I should make sure are present",
    "6. A short note on anything I should not claim",
    extraFocus,
    "",
    "Job description:",
    jobText.trim(),
    "",
    "Current CV text:",
    cvText.trim()
  ].join("\n");
}

function buildCoverLetterPrompt({ cvText, jobText, focusAreas }) {
  const extraFocus = focusAreas?.trim()
    ? `\nExtra focus from the user: ${focusAreas.trim()}`
    : "";

  return [
    "Write a tailored cover letter for this role using my CV and the job description below.",
    "Keep it truthful and do not invent experience, tools, or achievements.",
    "Use a natural, confident tone rather than stiff corporate jargon.",
    "Focus on the strongest real evidence from my background that matches the most important requirements.",
    "If there are gaps, handle them carefully by emphasising adjacent strengths and transferable experience without pretending they are exact matches.",
    "Return:",
    "1. A polished cover letter",
    "2. A short note listing the strongest points the letter is leaning on",
    "3. A short note listing anything I should adjust manually before sending",
    extraFocus,
    "",
    "Job description:",
    jobText.trim(),
    "",
    "Current CV text:",
    cvText.trim()
  ].join("\n");
}

function buildAlternateRewritePrompt({ cvText, jobText }) {
  return [
    "You are an expert CV editor and job-fit strategist.",
    "",
    "Your task is to rewrite a CV so that it aligns strongly with a given job description, while remaining 100% truthful.",
    "",
    "---",
    "",
    "## RULES",
    "",
    "- Do NOT invent experience, tools, or skills",
    "- Do NOT fabricate metrics or achievements",
    "- Do translate existing experience into the language used in the job description",
    "- Do prioritise clarity, impact, and relevance",
    "- Do incorporate key job-description keywords naturally (no keyword stuffing)",
    "- Maintain a professional but natural tone (avoid excessive corporate jargon)",
    "",
    "---",
    "",
    "## OBJECTIVE",
    "",
    "Improve the CV so that:",
    "",
    "- It passes ATS filters",
    "- It clearly reflects alignment with the role",
    "- It highlights relevant experience more effectively",
    "- It remains authentic to the candidate",
    "",
    "---",
    "",
    "## INPUTS",
    "",
    "### CV:",
    "",
    cvText.trim(),
    "",
    "### Job Description:",
    "",
    jobText.trim(),
    "",
    "---",
    "",
    "## OUTPUT STRUCTURE",
    "",
    "### 1. Key Alignment Summary",
    "",
    "- Where the candidate strongly matches",
    "- Where alignment is weaker but can be reframed",
    "",
    "---",
    "",
    "### 2. Rewritten CV (Full or Section-Based)",
    "",
    "- Improved bullet points",
    "- Better phrasing using job-relevant language",
    "- Stronger positioning of relevant experience",
    "",
    "---",
    "",
    "### 3. Suggested Keyword Integration",
    "",
    "- List of key terms used from the job description",
    "- Where and how they were incorporated",
    "",
    "---",
    "",
    "### 4. Optional Improvements",
    "",
    "- Missing elements that could be added (if truthful)",
    "- Structural suggestions (ordering, emphasis)",
    "",
    "---",
    "",
    "Tone: Clear, confident, and human. No fluff. No exaggeration.",
    "",
    "---",
    "",
    "## Optional extra:",
    "",
    "> If parts of the job description appear unrealistic or overly broad, briefly note this in the alignment summary."
  ].join("\n");
}

function buildReviewPrompt({ cvText, jobText }) {
  return [
    "You are an honest CV reviewer and job-fit assessor.",
    "",
    "Review the CV against the job description and give practical, no-nonsense feedback.",
    "",
    "Rules:",
    "- Do not invent experience or assume missing evidence exists",
    "- Separate exact matches, adjacent matches, and missing requirements",
    "- Call out anything that looks like a wishlist requirement rather than a true blocker",
    "- Be honest about whether the candidate should apply, apply with tweaks, or probably not bother",
    "- Keep the tone direct, practical, and human",
    "",
    "Return:",
    "1. Overall verdict",
    "2. Strongest matches",
    "3. Adjacent matches that could be reframed",
    "4. Important gaps",
    "5. Likely wishlist / non-critical requirements",
    "6. What to move higher or emphasise in the CV",
    "7. What looks generic, weak, or irrelevant",
    "",
    "CV:",
    cvText.trim(),
    "",
    "Job description:",
    jobText.trim()
  ].join("\n");
}

async function extractTextFromFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === ".txt" || ext === ".md" || ext === ".rtf") {
    return file.buffer.toString("utf8");
  }

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }

  if (ext === ".pdf") {
    const result = await pdfParse(file.buffer);
    return result.text;
  }

  throw new Error("Unsupported file type. Please upload a PDF, DOCX, TXT, MD, or RTF file.");
}

async function getClientFromApiKey(apiKey) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    return null;
  }

  return new OpenAI({ apiKey: key });
}

app.post("/api/analyse", upload.single("cvFile"), async (req, res) => {
  try {
    const { jobText = "", cvText = "" } = req.body;

    if (!jobText.trim()) {
      return res.status(400).json({ error: "Add a job description before analysing." });
    }

    let finalCvText = cvText.trim();
    if (req.file) {
      finalCvText = (await extractTextFromFile(req.file)).trim();
    }

    if (!finalCvText) {
      return res.status(400).json({ error: "Upload a CV or paste CV text before analysing." });
    }

    const analysis = scoreMatch(finalCvText, jobText);
    const rewritePrompt = buildRewritePrompt({
      cvText: finalCvText,
      jobText,
      focusAreas: req.body.focusAreas || ""
    });
    const coverLetterPrompt = buildCoverLetterPrompt({
      cvText: finalCvText,
      jobText,
      focusAreas: req.body.focusAreas || ""
    });
    const alternateRewritePrompt = buildAlternateRewritePrompt({
      cvText: finalCvText,
      jobText
    });
    const reviewPrompt = buildReviewPrompt({
      cvText: finalCvText,
      jobText
    });

    return res.json({
      analysis,
      rewritePrompt,
      alternateRewritePrompt,
      reviewPrompt,
      coverLetterPrompt,
      extractedCvText: finalCvText,
      extractedCvPreview: finalCvText.slice(0, 1200)
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Something went wrong while analysing the CV."
    });
  }
});

app.post("/api/rewrite", async (req, res) => {
  try {
    const { cvText = "", jobText = "", apiKey = "", focusAreas = "" } = req.body;

    if (!cvText.trim() || !jobText.trim()) {
      return res.status(400).json({ error: "Both CV text and job description are required for rewriting." });
    }

    const client = await getClientFromApiKey(apiKey.trim());
    if (!client) {
      return res.status(400).json({
        error: "No OpenAI API key found. Add one in .env or paste one into the app to use AI rewrite."
      });
    }

    const prompt = buildRewritePrompt({ cvText, jobText, focusAreas });
    const response = await client.responses.create({
      model: OPENAI_MODEL,
      input: prompt
    });

    const rewritten = response.output_text?.trim();
    if (!rewritten) {
      return res.status(502).json({ error: "The AI response came back empty." });
    }

    return res.json({ rewritten });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Something went wrong while generating the rewrite."
    });
  }
});

app.post("/api/cover-letter", async (req, res) => {
  try {
    const { cvText = "", jobText = "", apiKey = "", focusAreas = "" } = req.body;

    if (!cvText.trim() || !jobText.trim()) {
      return res.status(400).json({ error: "Both CV text and job description are required for a cover letter." });
    }

    const client = await getClientFromApiKey(apiKey.trim());
    if (!client) {
      return res.status(400).json({
        error: "No OpenAI API key found. Add one in .env or paste one into the app to generate a cover letter."
      });
    }

    const prompt = buildCoverLetterPrompt({ cvText, jobText, focusAreas });
    const response = await client.responses.create({
      model: OPENAI_MODEL,
      input: prompt
    });

    const coverLetter = response.output_text?.trim();
    if (!coverLetter) {
      return res.status(502).json({ error: "The AI response came back empty." });
    }

    return res.json({ coverLetter });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Something went wrong while generating the cover letter."
    });
  }
});

app.get("/api/health", async (_req, res) => {
  let hasEnvFile = false;
  try {
    await fs.access(path.join(__dirname, ".env"));
    hasEnvFile = true;
  } catch {
    hasEnvFile = false;
  }

  res.json({
    ok: true,
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    envFilePresent: hasEnvFile
  });
});

app.listen(PORT, () => {
  console.log(`Job Fit Checker running on http://localhost:${PORT}`);
});
