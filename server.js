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
  const bluntAssessment = essentialMisses.length
    ? `There ${essentialMisses.length === 1 ? "is 1 essential requirement" : `are ${essentialMisses.length} essential requirements`} where the CV shows little or no evidence.`
    : essentialPartials.length
      ? `Some essential requirements are only partially evidenced, so this may still need careful tailoring.`
      : "The CV appears to cover the core essential requirements reasonably well.";

  return {
    matchPercentage,
    likelihood,
    matchedSkills,
    missingSkills,
    essentialRequirements: essentialRequirementScores,
    essentialHits,
    essentialPartials,
    essentialMisses,
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
    "Call out what is likely irrelevant waffle or weak/generic phrasing and suggest tighter replacements.",
    "Highlight which existing achievements are actually useful for this role and should be foregrounded.",
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

    return res.json({
      analysis,
      rewritePrompt,
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
