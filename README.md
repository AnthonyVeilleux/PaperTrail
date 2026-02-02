# PaperTrail — Quick Overview & Setup

## Project Overview

PaperTrail is a Google Workspace / Drive add-on that extends Drive/Docs functionality with custom tools. The code lives in GitHub and runs on Google Apps Script. Each developer tests in their own personal Apps Script project, keeping production stable.

**Important:** The GitHub repository is the **source of truth** for all code changes. While individual developers work in their personal Apps Script projects for testing, all official code must be committed to this GitHub repository. Never make changes directly in the Apps Script web editor that you intend to keep—always work locally and push changes through Git.

## What is clasp?

**clasp** (Command Line Apps Script Projects) is Google's official command-line tool for managing Google Apps Script projects. It allows developers to:

- Create, edit, and manage Apps Script projects from the terminal
- Push code from local files to Apps Script
- Pull code from Apps Script to local files
- Open Apps Script projects in the web editor
- Deploy and manage versions

Think of clasp as Git for Google Apps Script—it bridges the gap between local development and the Google Apps Script cloud environment.

## Prerequisites

- Git installed on your machine
- Google account with access to Google Apps Script
- Node.js and npm (for clasp CLI tool)

## Development Environment Setup

### 1. Install Google Apps Script CLI (clasp)

```bash
npm install -g @google/clasp
```

### 2. Clone the Repository

```bash
git clone https://github.com/AnthonyVeilleux/PaperTrail.git
cd PaperTrail
```

### 3. Login to Google via clasp

```bash
clasp login
```

This will open your browser to authenticate with your Google account.

### 4. Create Your Personal Apps Script Project

You have two options for creating your Apps Script project:

#### Option A: Using clasp (Command Line)

```bash
clasp create --type standalone --title "<Your Name> - Dev Environment"
```

#### Option B: Using Google Apps Script Web Interface (GUI)

1. Go to [script.google.com](https://script.google.com)
2. Click "New Project"
3. Rename the project to `<Your Name> - Dev Environment`
4. Note the script ID from the URL (looks like: `https://script.google.com/d/YOUR_SCRIPT_ID/edit`)
5. In your terminal, clone the project locally:
   ```bash
   clasp clone YOUR_SCRIPT_ID
   ```

**Important:** Do not commit `.clasp.json` to the repository—it's private to your project and contains your personal Apps Script project ID.

### 5. Pull the Latest Code

```bash
git pull
```

### 6. Start Working on a Feature

Create a new feature branch for your changes:

```bash
git checkout -b feature/<your-feature-name>
```

### 7. Test Your Changes

Deploy your code to your personal Apps Script project:

```bash
clasp push
```

Open your Apps Script project in the browser to test:

```bash
clasp open
```

### 8. Submit Changes

When your feature is ready:

1. Commit your changes to your feature branch
2. Push the branch to GitHub
3. Submit a Pull Request for review

```bash
git add .
git commit -m "Description of your changes"
git push origin feature/<your-feature-name>
```

## Development Workflow

1. **GitHub is the source of truth** - All official code changes must go through this repository
2. **Always work on feature branches** - Never commit directly to `main`
3. **Test thoroughly** - Use your personal Apps Script project for testing only
4. **Keep .clasp.json private** - This file should never be committed to the repo
5. **Pull before starting** - Always get the latest changes before creating a new feature branch
6. **Submit PRs for review** - All code changes should go through pull request review

## Project Structure

- `Code.js` - Main Google Apps Script code
- `appsscript.json` - Apps Script manifest file
- `Documents/` - Project documentation and resources

## Getting Help

- Check the Google Apps Script documentation: https://developers.google.com/apps-script
- Review existing code and documentation in the `Documents/` folder
- Ask questions in pull request reviews

## Troubleshooting

### clasp command not found
Make sure you have Node.js installed and run `npm install -g @google/clasp`

### Authentication issues
Run `clasp logout` followed by `clasp login` to re-authenticate

### Push errors
Ensure your `.clasp.json` file exists and contains the correct script ID from your personal project
