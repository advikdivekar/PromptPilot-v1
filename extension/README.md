# PromptPilot

**AI-powered prompt engineering layer for IDE coding agents.**

PromptPilot sits between you and your AI coding agent — taking rough, casual instructions and transforming them into precise, well-structured prompts that get the right result on the first try.

## Features

- **Intelligent prompt rewriting** — transforms vague instructions into detailed, actionable prompts
- **Smart prompt classification** — automatically detects coding tasks, project creation, and general questions and applies the right strategy for each
- **Codebase context awareness** — reads your project structure and relevant files automatically
- **Semantic code search (RAG)** — finds the most relevant code chunks for your prompt
- **File attachments** — upload images, PDFs, and Word documents for richer context
- **Persistent session memory** — remembers previous work on each file across sessions
- **Browser integration** — sends prompts directly to Claude, ChatGPT, Gemini, and Perplexity
- **Works everywhere** — VS Code, Cursor, Windsurf, and all VS Code-based IDEs

## Requirements

- Python 3.10 or higher must be installed on your machine
- A free Gemini API key from [aistudio.google.com](https://aistudio.google.com)

## Setup

1. Clone the full repository from [GitHub](https://github.com/ishandhole/PromptPilot)
2. Follow the setup instructions in the repository README
3. Open the extension folder in your IDE and press F5 to run
4. Enter your Gemini API key when prompted in the sidebar

## How to Get a Gemini API Key

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with your Google account
3. Click **Get API key** then **Create API key**
4. Copy the key and paste it into PromptPilot's setup screen

## Usage

1. Click the PromptPilot icon in the activity bar
2. Type your rough prompt — anything from "fix the auth bug" to "make a production-grade ML project with a PRD document"
3. Optionally attach images, PDFs, or Word docs for additional context
4. Click **Engineer Prompt**
5. Review the refined prompt, then send it to your AI agent

## More Information

Full documentation and source code at [github.com/ishandhole/PromptPilot](https://github.com/ishandhole/PromptPilot)