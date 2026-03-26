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

  const jobKeywords = extractKeywords(jobText, 40);
  const cvKeywords = new Set(extractKeywords(cvText, 60));
  const keywordHits = jobKeywords.filter((keyword) => cvKeywords.has(keyword));

  const skillsScore = jobSkills.length ? matchedSkills.length / jobSkills.length : 0.5;
  const keywordScore = jobKeywords.length ? keywordHits.length / jobKeywords.length : 0.5;
  const requirementScore = Math.min(extractRequirements(cvText).length / Math.max(extractRequirements(jobText).length || 1, 1), 1);

  const rawScore = (skillsScore * 0.5) + (keywordScore * 0.35) + (requirementScore * 0.15);
  const matchPercentage = Math.round(Math.max(0.15, Math.min(rawScore, 0.95)) * 100);

  let likelihood = "Low";
  if (matchPercentage >= 75) {
    likelihood = "High";
  } else if (matchPercentage >= 55) {
    likelihood = "Moderate";
  }

  const summary = buildSummary(cvText, jobText, matchedSkills, missingSkills);

  return {
    matchPercentage,
    likelihood,
    matchedSkills,
    missingSkills,
    jobSkills,
    topKeywords: keywordHits.slice(0, 12),
    requirements: extractRequirements(jobText),
    overview: summary.overview,
    concerns: summary.concerns,
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
    "Prioritise stronger alignment to the most important requirements, transferable skills, measurable impact, and ATS-friendly wording.",
    "Return:",
    "1. A rewritten professional summary",
    "2. Improved bullet points for the most relevant experience",
    "3. A short list of keywords/skills I should make sure are present",
    "4. A short note on anything I should not claim",
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
