# PromptPilot 🚀

> The intelligent prompt engineering layer that sits between how you think and what AI agents need to perform.

PromptPilot is a VS Code extension that works across all major IDEs — VS Code, Cursor, Windsurf, and any editor built on the VS Code engine. It takes your rough, casual, or incomplete instructions and automatically transforms them into precise, well-structured prompts that AI coding agents can execute accurately on the first try — saving you from the endless cycle of rephrasing and iterating.

---

## The Problem

When you use AI agents inside your IDE, you often have to repeatedly rephrase your prompts to get the agent to do exactly what you want. The natural language you type is vague or incomplete, the agent produces something off, you correct it, try again, and the cycle repeats. This wastes time and breaks your flow.

## The Solution

PromptPilot intercepts your rough input and rewrites it into a properly engineered prompt before it ever reaches your AI agent. The result is that the agent gets a clear, detailed, and well-scoped instruction the first time — producing output much closer to what you actually wanted without multiple rounds of back and forth.

---

## How It Works
You type a rough prompt
↓
PromptPilot reads your project structure
↓
Semantic search finds relevant code chunks (RAG)
↓
Session memory recalls what you worked on before
↓
LLM rewrites your prompt with full context
↓
You review, edit, or reject the refined prompt
↓
One click copies it to your AI agent

Every step is driven by LLM reasoning — not hardcoded rules or keyword matching. PromptPilot understands your codebase, your intent, and your history.

---

## Features

- **Intelligent prompt rewriting** — transforms vague instructions into precise, actionable prompts
- **Codebase context awareness** — reads your project structure and relevant files automatically
- **Semantic code retrieval (RAG)** — uses vector embeddings to find the most relevant code chunks for your prompt
- **LLM driven file selection** — intelligently detects which files are relevant without hardcoded rules
- **Persistent session memory** — remembers your previous work on each file across sessions
- **Dynamic context management** — automatically fits context within model limits
- **Model fallback chain** — tries multiple models automatically if one is unavailable
- **User controlled exclusions** — `.promptignore` file lets you control what the tool can see
- **Review before sending** — see the refined prompt before it goes to your agent, with options to accept, edit, or reject

---

## Supported IDEs

- VS Code
- Cursor
- Windsurf
- Any editor built on the VS Code engine

---

## Architecture
prompt-engineer/
├── backend/                    # Python intelligence layer
│   ├── main.py                 # Core prompt rewriting engine
│   ├── indexer.py              # RAG indexer — builds vector database
│   ├── chroma_db/              # Local vector database (auto-generated)
│   ├── session.json            # Persistent session memory (auto-generated)
│   └── .promptignore           # User controlled file exclusions
└── extension/                  # VS Code extension
├── src/
│   ├── extension.ts        # Extension entry point
│   └── panel.ts            # Sidebar UI and backend communication
└── package.json

---

## Prerequisites

- Python 3.10 or higher
- Node.js 18 or higher
- A Gemini API key (free at [aistudio.google.com](https://aistudio.google.com))

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/ishandhole/PromptPilot.git
cd PromptPilot
```

### 2. Set up the Python backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install google-generativeai python-dotenv chromadb sentence-transformers
```

### 3. Add your API key

Create a `.env` file inside the `backend` folder:
GEMINI_API_KEY=your_api_key_here

Get a free API key at [aistudio.google.com](https://aistudio.google.com).

### 4. Build the index

Run this once to index your codebase:

```bash
cd backend
./venv/bin/python3 indexer.py
```

### 5. Install and build the extension

```bash
cd ../extension
npm install
npm run compile
```

### 6. Run the extension

Open the `extension` folder in VS Code or Cursor, then press `F5` (or `Fn + F5` on Mac) to launch the Extension Development Host.

---

## Usage

1. Open any project folder in your IDE
2. Click the **PromptPilot** icon in the activity bar
3. The sidebar shows your current file automatically
4. Type your rough prompt in the text area
5. Click **⚡ Engineer Prompt**
6. Review the refined prompt that appears
7. Choose one of three actions:
   - **✅ Copy & Send to Agent** — copies to clipboard, paste into any AI agent
   - **✏️ Edit Before Sending** — tweak the refined prompt before sending
   - **❌ Reject — Try Again** — start over with a new prompt

### Re-indexing

When you add new files to your project, click **🔄 Re-index Project** in the sidebar to update the vector database.

### Controlling what PromptPilot can see

Create a `.promptignore` file in your project root to exclude files and folders:
Files PromptPilot should ignore
session.json
indexer.py
chroma_db/
notes.md
secrets/

---

## Configuration

### Supported Models

PromptPilot uses a fallback chain of Gemini models. If one is unavailable or quota is exceeded, it automatically tries the next:

1. `gemini-2.0-flash`
2. `gemini-2.0-flash-lite`
3. `gemini-1.5-flash`
4. `gemini-flash-latest`

### Session Memory

PromptPilot stores your prompt history per file in `session.json`. Each file has its own independent history thread — work on `auth.py` and `login.js` is tracked separately and never mixed.

---

## Roadmap

- [ ] Auto-indexing when a project opens
- [ ] Direct integration with Cursor and Copilot chat panels
- [ ] VS Code Marketplace publication
- [ ] System-level prompt engineering layer (works across all AI websites — Claude, ChatGPT, Gemini, Perplexity)
- [ ] Clarifying question flow for complex tasks
- [ ] Custom system prompt configuration per project

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.

---

## License

MIT

---

## Author

Built by [Ishan Dhole](https://github.com/ishandhole) as a deep learning project in applied LLM engineering.