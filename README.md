# Job Fit Checker

Local browser app for deciding whether a role is worth applying for.

## What it does

- Upload a CV as `pdf`, `docx`, `txt`, `md`, or `rtf`
- Paste a job description
- Get:
  - match percentage
  - likely strength (`Low`, `Moderate`, `High`)
  - essential requirement coverage with blunt misses
  - matching skills
  - likely missing skills
  - useful CV evidence to keep
  - likely waffle or weaker points to rewrite
  - extracted requirements
  - short context on strengths and concerns
- Copy a ChatGPT rewrite prompt
- Generate a CV rewrite directly with the OpenAI API

## Local run

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add your API key to `.env` if you want in-app CV rewrites:

   ```env
   OPENAI_API_KEY=your_key_here
   OPENAI_MODEL=gpt-4.1-mini
   ```

3. Start the app:

   ```bash
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000)

## Notes

- The match score is heuristic and based on text overlap plus a small skill catalogue.
- Nothing is stored between sessions.
- If you do not want to use the API at all, use the ChatGPT prompt flow instead.
