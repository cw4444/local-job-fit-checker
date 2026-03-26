# Job Fit Checker

Job Fit Checker is a small local app that helps you decide whether a job is worth applying for before you spend ages rewriting your CV.

You upload your CV, paste in a job advert, and it gives you:

- a match score
- a rough likelihood rating
- key matching skills
- missing skills
- essential requirements you clearly match, partly match, or do not really match
- useful CV content to keep and emphasise
- weaker or generic content that may be better cut or rewritten
- a one-click ChatGPT rewrite prompt
- an optional in-app AI rewrite if you add your own OpenAI API key

## Before you start

You will need:

- a computer with [Node.js](https://nodejs.org/) installed
- access to this GitHub repo:
  [https://github.com/cw4444/local-job-fit-checker](https://github.com/cw4444/local-job-fit-checker)

You do not need an OpenAI API key just to use the match checker.

You only need an API key if you want the app to generate CV rewrites inside the app itself.

If you do want that feature, you can create an API key here:
[https://platform.openai.com/settings/organization/api-keys](https://platform.openai.com/settings/organization/api-keys)

## Step 1: Get the code from GitHub

There are two easy ways to do this.

### Option A: Download it as a ZIP

1. Open the GitHub repo in your browser.
2. Click the green `Code` button.
3. Click `Download ZIP`.
4. Extract the ZIP somewhere easy to find, like your Desktop or Documents folder.

### Option B: Clone it with Git

If you already use Git, open a terminal and run:

```bash
git clone https://github.com/cw4444/local-job-fit-checker.git
```

Then move into the folder:

```bash
cd local-job-fit-checker
```

## Step 2: Open the project folder in a terminal

If you downloaded the ZIP, open the extracted folder first.

Then open a terminal in that folder.

If you are using Windows, the easiest options are usually:

- File Explorer -> open the folder -> click the address bar -> type `powershell` -> press Enter
- or open the folder in VS Code and use the built-in terminal

## Step 3: Install the app

Run this command once:

```bash
npm install
```

This downloads the packages the app needs.

## Step 4: Optional API key setup for in-app rewrites

If you only want the match checker and ChatGPT prompt buttons, you can skip this step.

If you want the app to generate CV rewrites directly inside the app:

1. Make a copy of `.env.example`
2. Rename the copy to `.env`
3. Open `.env` in a text editor
4. Paste your OpenAI API key after `OPENAI_API_KEY=`

Your `.env` file should look like this:

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1-mini
```

## Step 5: Run the app

Start the app with:

```bash
npm start
```

Then open this in your browser:

[http://localhost:3000](http://localhost:3000)

## How to use it

1. Upload your CV file, or paste your CV text.
2. Paste the job advert into the job description box.
3. Click `Analyse Job Fit`.
4. Review the score, essential matches/misses, useful CV evidence, and possible weak spots.
5. If you want rewrite help:
   use `Copy ChatGPT Prompt` and paste that into ChatGPT, or
   add an API key and click `Generate CV Rewrite`

## Supported CV file types

You can upload:

- `PDF`
- `DOCX`
- `TXT`
- `MD`
- `RTF`

## Important notes

- Nothing is stored between sessions.
- The score is a heuristic, not a guarantee of success.
- It is best used as a triage tool to decide whether a role is worth tailoring your CV for.
- If you do not want to use the API, the ChatGPT prompt option still works well.
