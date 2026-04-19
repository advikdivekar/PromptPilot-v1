from google import genai
from google.genai import errors
from google.genai import types
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
import chromadb
import os
import json
import re
import base64
from datetime import datetime

load_dotenv()
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    print("[!] ERROR: No GEMINI_API_KEY found.")
    print("Please set your API key in the PromptPilot extension settings.")
    exit(1)

client = genai.Client(api_key=api_key)

# Load embedding model and ChromaDB once at startup
print("Loading RAG components...")
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
chroma_client = chromadb.PersistentClient(path="./chroma_db")
try:
    collection = chroma_client.get_collection("codebase")
    RAG_AVAILABLE = True
    print("RAG index loaded successfully.")
except Exception:
    RAG_AVAILABLE = False
    print("No RAG index found. Run indexer.py first to enable semantic search.")

# Configuration — facts about models, not logic decisions
MODEL_CONTEXT_LIMITS = {
    "gemini-2.0-flash": 1_000_000,
    "gemini-2.0-flash-lite": 1_000_000,
    "gemini-1.5-flash": 1_000_000,
    "gemini-flash-latest": 1_000_000,
}

CONTEXT_WINDOW_SAFETY_FACTOR = 0.8
SESSION_FILE = "session.json"

MODELS = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-flash-latest",
]

RECOVERABLE_ERROR_CODES = ["500", "502", "503", "UNAVAILABLE", "INTERNAL"]


# ── Exclusion System ──────────────────────────────────────────────────────────

def load_excluded_files() -> set:
    excluded = {SESSION_FILE}
    if os.path.exists(".promptignore"):
        with open(".promptignore", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    excluded.add(line)
    return excluded


EXCLUDED = load_excluded_files()


def is_excluded(filepath: str) -> bool:
    basename = os.path.basename(filepath)
    if basename.startswith(".env"):
        return True
    for pattern in EXCLUDED:
        if basename == pattern or filepath.endswith(pattern):
            return True
    return False


# ── System Prompts ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """
You are an expert prompt engineer who specializes in AI coding agents.

Your job is to take a rough, casual, or vague instruction from a developer 
and rewrite it into a clear, structured, well-scoped prompt that an AI 
coding agent (like Copilot or Cursor) can execute accurately on the first try.

You will be given:
- The project structure
- Relevant config files
- The file the developer is currently working on
- Semantically relevant code chunks retrieved from the codebase
- Relevant history of previous prompts and refined outputs for this file
- Any images, documents, or files the developer has attached for context

Use all of this context to make the rewritten prompt specific and accurate 
to their actual codebase and current working session.

If images are provided, analyze them carefully and incorporate visual details 
into the refined prompt. If documents are provided, extract the key requirements 
and include them in the refined prompt.

Rules:
- Be specific about what needs to be built or changed
- Include relevant constraints (language, framework, patterns)
- Scope the task clearly — not too broad, not too narrow
- Preserve the original intent exactly
- Never ask clarifying questions — make reasonable assumptions and state them explicitly
- Output only the rewritten prompt, nothing else
"""

PROJECT_PROMPT = """
You are an expert prompt engineer specializing in project planning and technical specifications.

Your job is to take a rough project idea and transform it into a comprehensive, detailed prompt
that an AI agent can use to produce exactly what the user needs.

For project prompts:
- Identify all the deliverables mentioned or implied
- Specify technical requirements, architecture, and constraints
- Include format requirements for any documents requested (PRDs, specs, diagrams)
- Break down complex projects into clear, ordered components
- Specify tech stack, tools, and frameworks where relevant
- Include success criteria and acceptance conditions
- Make assumptions explicit and reasonable
- If images or documents are attached, extract requirements from them and incorporate them
- Output only the rewritten prompt, nothing else
"""

GENERAL_PROMPT = """
You are an expert prompt engineer.

Your job is to take a rough, casual question or request and rewrite it into a clear,
detailed prompt that will get the most accurate, useful, and comprehensive response from an AI.

For general prompts:
- Add specificity and context that improves the answer quality
- Specify the desired format, depth, and style of response
- Include relevant constraints or requirements
- Make the intent completely unambiguous
- If the question is about a technical topic, specify the level of detail needed
- If images or documents are attached, incorporate their content into the prompt
- Output only the rewritten prompt, nothing else
"""

CLASSIFICATION_PROMPT = """
You are a prompt classifier. Given a developer's instruction, classify it into one of three types:

1. "coding" — modifying, fixing, or building on existing code in a project
2. "project" — creating something new from scratch that needs planning, architecture, or documents like PRDs
3. "general" — questions, explanations, research, or tasks unrelated to a specific codebase

Return only one word: coding, project, or general.
"""

FILE_SELECTION_PROMPT = """
You are a code navigation assistant. Given a developer's instruction and a list 
of files in their project, return the files that are most likely relevant to 
completing that instruction.

Think carefully about which files would need to be read or modified to complete 
the instruction. Consider file names, likely responsibilities, and how files 
relate to each other in a typical codebase.

Rules:
- Return a JSON array of file paths and nothing else
- No explanation, no markdown, no code blocks — just the raw JSON array
- Only include files that are genuinely relevant — quality over quantity
- If no files seem relevant, return an empty array []

Example output:
["./auth.py", "./models/user.py"]
"""

MEMORY_SELECTION_PROMPT = """
You are a memory relevance assistant. Given a developer's current instruction 
and a list of previous exchanges from their working session on the same file, 
select which previous exchanges are actually relevant to the current instruction.

Think about which past prompts and outputs would provide useful context for 
understanding what the developer is trying to do right now.

Rules:
- Return a JSON array of indices (0-based) of the relevant exchanges
- No explanation, no markdown, no code blocks — just the raw JSON array
- Only include exchanges that are genuinely relevant — quality over quantity
- If no previous exchanges are relevant, return an empty array []

Example output:
[0, 2, 4]
"""


# ── Session Memory Functions ──────────────────────────────────────────────────

def load_session() -> dict:
    if not os.path.exists(SESSION_FILE):
        return {}
    try:
        with open(SESSION_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def save_session(session: dict):
    try:
        with open(SESSION_FILE, "w") as f:
            json.dump(session, f, indent=2)
    except IOError as e:
        print(f"Warning: Could not save session memory: {e}")


def get_file_history(session: dict, filepath: str) -> list:
    return session.get(filepath, [])


def append_to_history(session: dict, filepath: str, prompt: str, refined: str) -> dict:
    if filepath not in session:
        session[filepath] = []
    session[filepath].append({
        "prompt": prompt,
        "refined": refined,
        "timestamp": datetime.now().isoformat()
    })
    return session


def estimate_tokens(text: str) -> int:
    return len(text) // 4


def classify_prompt(user_input: str) -> str:
    """Classifies the prompt type to determine context strategy."""
    for model in MODELS:
        try:
            response = client.models.generate_content(
                model=model,
                config={"system_instruction": CLASSIFICATION_PROMPT},
                contents=user_input
            )
            result = response.text.strip().lower()
            if result in ["coding", "project", "general"]:
                return result
            return "coding"
        except Exception:
            continue
    return "coding"


def select_relevant_history(user_input: str, history: list) -> list:
    if not history:
        return []

    history_summary = []
    for i, exchange in enumerate(history):
        history_summary.append(
            f"[{i}] Prompt: {exchange['prompt']}\n"
            f"    Refined: {exchange['refined'][:200]}..."
            f"\n    Timestamp: {exchange['timestamp']}"
        )

    history_text = "\n\n".join(history_summary)
    query = (
        f"Current developer instruction: {user_input}\n\n"
        f"Previous exchanges:\n{history_text}"
    )

    for model in MODELS:
        try:
            response = client.models.generate_content(
                model=model,
                config={"system_instruction": MEMORY_SELECTION_PROMPT},
                contents=query
            )

            raw = response.text.strip()
            raw = re.sub(r"```json|```", "", raw).strip()
            indices = json.loads(raw)

            valid_indices = [i for i in indices if isinstance(i, int) and 0 <= i < len(history)]
            return [history[i] for i in valid_indices]

        except (json.JSONDecodeError, ValueError):
            return []
        except errors.ClientError:
            continue
        except Exception as e:
            if any(code in str(e) for code in RECOVERABLE_ERROR_CODES):
                continue
            return []

    return []


def build_history_context(relevant_history: list, current_model: str, current_context_size: int) -> str:
    if not relevant_history:
        return ""

    limit = MODEL_CONTEXT_LIMITS.get(current_model, 8_192)
    safe_limit = int(limit * CONTEXT_WINDOW_SAFETY_FACTOR)
    available_tokens = safe_limit - current_context_size

    if available_tokens <= 0:
        return ""

    history_parts = []
    used_tokens = 0

    for exchange in reversed(relevant_history):
        entry = (
            f"[Previous exchange — {exchange['timestamp']}]\n"
            f"Developer typed: {exchange['prompt']}\n"
            f"Refined output: {exchange['refined']}"
        )
        entry_tokens = estimate_tokens(entry)

        if used_tokens + entry_tokens > available_tokens:
            break

        history_parts.insert(0, entry)
        used_tokens += entry_tokens

    return "\n\n".join(history_parts)


# ── RAG Functions ─────────────────────────────────────────────────────────────

def retrieve_relevant_chunks(user_input: str) -> str:
    if not RAG_AVAILABLE:
        return ""

    query_embedding = embedding_model.encode(user_input).tolist()

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=5
    )

    if not results or not results["documents"][0]:
        return ""

    chunks = []
    for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
        filepath = meta.get("filepath", "unknown")
        start = meta.get("start_line", "?")
        end = meta.get("end_line", "?")
        chunks.append(f"--- {filepath} (lines {start}-{end}) ---\n{doc}")

    return "\n\n".join(chunks)


# ── Project Context Functions ─────────────────────────────────────────────────

def get_project_structure(root_dir: str = ".") -> str:
    ignore = {".git", "__pycache__", "venv", "node_modules", "chroma_db"}
    lines = []

    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in ignore]

        level = dirpath.replace(root_dir, "").count(os.sep)
        indent = "  " * level
        lines.append(f"{indent}{os.path.basename(dirpath)}/")

        subindent = "  " * (level + 1)
        for filename in filenames:
            lines.append(f"{subindent}{filename}")

    return "\n".join(lines)


def get_most_recent_file(root_dir: str = ".") -> str:
    ignore = {".git", "__pycache__", "venv", "node_modules", "chroma_db"}
    latest_file = None
    latest_time = 0

    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in ignore]
        for filename in filenames:
            filepath = os.path.join(dirpath, filename)
            if is_excluded(filepath):
                continue
            try:
                modified_time = os.path.getmtime(filepath)
                if modified_time > latest_time:
                    latest_time = modified_time
                    latest_file = filepath
            except OSError:
                continue

    return latest_file


def get_all_project_files(root_dir: str = ".") -> list:
    ignore = {".git", "__pycache__", "venv", "node_modules", "chroma_db"}
    all_files = []

    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in ignore]
        for filename in filenames:
            filepath = os.path.join(dirpath, filename)
            if is_excluded(filepath):
                continue
            all_files.append(filepath)

    return all_files


def detect_relevant_files(user_input: str, all_files: list) -> list:
    if not all_files:
        return []

    file_list_str = "\n".join(all_files)
    query = f"Developer instruction: {user_input}\n\nProject files:\n{file_list_str}"

    for model in MODELS:
        try:
            response = client.models.generate_content(
                model=model,
                config={"system_instruction": FILE_SELECTION_PROMPT},
                contents=query
            )

            raw = response.text.strip()
            raw = re.sub(r"```json|```", "", raw).strip()
            relevant_files = json.loads(raw)
            valid_files = [f for f in relevant_files if f in all_files]
            return valid_files

        except (json.JSONDecodeError, ValueError):
            return []
        except errors.ClientError:
            continue
        except Exception as e:
            if any(code in str(e) for code in RECOVERABLE_ERROR_CODES):
                continue
            return []

    return []


def get_context_files(primary_file: str = None, extra_files: list = None) -> str:
    context_parts = []

    config_files = ["requirements.txt", "package.json", "pyproject.toml", "Pipfile"]
    for config in config_files:
        if os.path.exists(config):
            with open(config, "r") as f:
                context_parts.append(f"--- {config} ---\n{f.read()}")

    if primary_file and os.path.exists(primary_file):
        with open(primary_file, "r") as f:
            context_parts.append(f"--- {primary_file} (current file) ---\n{f.read()}")
    elif primary_file:
        context_parts.append(f"--- Note: File '{primary_file}' was not found ---")

    if extra_files:
        for filepath in extra_files:
            if filepath == primary_file:
                continue
            try:
                with open(filepath, "r") as f:
                    context_parts.append(f"--- {filepath} (related file) ---\n{f.read()}")
            except Exception:
                continue

    return "\n\n".join(context_parts)


# ── API Functions ─────────────────────────────────────────────────────────────

def call_gemini_api(
    model_name: str,
    user_input: str,
    context: str,
    attachments: list = None,
    system_prompt: str = None
) -> str:
    """Makes a single call to the Google Gemini API with optional file attachments."""
    if system_prompt is None:
        system_prompt = SYSTEM_PROMPT

    # Only prepend context if it exists
    full_input = f"{context}\n\n--- User Instruction ---\n{user_input}" if context.strip() else user_input

    content_parts = [full_input]

    if attachments:
        for attachment in attachments:
            try:
                file_data = base64.b64decode(attachment['data'])
                mime_type = attachment['mimeType']
                content_parts.append(
                    types.Part.from_bytes(data=file_data, mime_type=mime_type)
                )
                print(f"Attached file: {attachment.get('name', 'unknown')} ({mime_type})")
            except Exception as e:
                print(f"Warning: Could not process attachment: {e}")

    response = client.models.generate_content(
        model=model_name,
        config={"system_instruction": system_prompt},
        contents=content_parts
    )

    if not response.text or not response.text.strip():
        raise ValueError(f"Model {model_name} returned an empty response.")

    return response.text


def rewrite_prompt(user_input: str, context: str, attachments: list = None) -> str:
    """
    Classifies the prompt type and rewrites using the appropriate strategy.
    - coding: uses full codebase context
    - project: uses project planning prompt, no codebase noise
    - general: uses general prompt engineering, no codebase noise
    """
    print("Classifying prompt type...")
    prompt_type = classify_prompt(user_input)
    print(f"Prompt type: {prompt_type}")

    if prompt_type == "coding":
        system = SYSTEM_PROMPT
        active_context = context
    elif prompt_type == "project":
        system = PROJECT_PROMPT
        active_context = ""
    else:
        system = GENERAL_PROMPT
        active_context = ""

    last_error = None

    for model in MODELS:
        try:
            print(f"Attempting with {model}...")
            return call_gemini_api(model, user_input, active_context, attachments, system)
        except errors.ClientError as e:
            last_error = e
            reason = "Quota exceeded" if "RESOURCE_EXHAUSTED" in str(e) else "Not found/supported"
            print(f"Model {model} failed ({reason}).")
            continue
        except Exception as e:
            if any(code in str(e) for code in RECOVERABLE_ERROR_CODES):
                last_error = e
                print(f"Model {model} failed (server unavailable, trying next).")
                continue
            raise e

    raise Exception(f"All Gemini models in the chain failed. Last error: {last_error}")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    user_input = input("\nEnter your rough prompt: ")

    if not user_input.strip():
        print("Please enter a valid prompt.")
    else:
        detected_file = get_most_recent_file()
        print(f"\nAuto-detected current file: {detected_file}")

        override = input("Press Enter to use this file, or type a different filename: ").strip()
        current_file = override if override else detected_file

        # Load persistent session memory
        print("\nLoading session memory...")
        session = load_session()
        file_history = get_file_history(session, current_file)

        if file_history:
            print(f"Found {len(file_history)} previous exchanges for {current_file}.")
        else:
            print(f"No previous history for {current_file}. Starting fresh.")

        # LLM selects which history exchanges are relevant
        print("Selecting relevant history...")
        relevant_history = select_relevant_history(user_input, file_history)
        if relevant_history:
            print(f"{len(relevant_history)} relevant previous exchanges found.")
        else:
            print("No relevant history for this prompt.")

        # RAG — retrieve semantically relevant chunks
        print("\nRetrieving relevant code chunks via RAG...")
        rag_chunks = retrieve_relevant_chunks(user_input)
        if rag_chunks:
            print("Relevant chunks retrieved.")
        else:
            print("No RAG chunks found.")

        # LLM driven file detection
        print("Analysing prompt to find relevant files...")
        all_files = get_all_project_files()
        extra_files = detect_relevant_files(user_input, all_files)

        if extra_files:
            print(f"Relevant files detected: {extra_files}")
        else:
            print("No additional relevant files detected.")

        print("\nReading project context...")
        structure = get_project_structure()
        file_context = get_context_files(current_file, extra_files)

        # Read attachments from temp file passed by extension
        attachments = []
        attachments_file = os.environ.get("PP_ATTACHMENTS_FILE")
        if attachments_file and os.path.exists(attachments_file):
            try:
                with open(attachments_file, "r") as f:
                    attachments = json.load(f)
                if attachments:
                    print(f"Processing {len(attachments)} attachment(s)...")
            except Exception as e:
                print(f"Warning: Could not read attachments file: {e}")

        # Build base context block
        base_context = f"""
--- Project Structure ---
{structure}

{file_context}

--- Semantically Relevant Code Chunks (via RAG) ---
{rag_chunks if rag_chunks else "None retrieved."}
""".strip()

        # Dynamically build history context
        current_model = MODELS[0]
        base_token_size = estimate_tokens(base_context)
        history_context = build_history_context(
            relevant_history,
            current_model,
            base_token_size
        )

        if history_context:
            context_block = f"""
--- Relevant Session History for {current_file} ---
{history_context}

{base_context}
""".strip()
        else:
            context_block = base_context

        print("Engineering your prompt... please wait.")
        try:
            refined = rewrite_prompt(user_input, context_block, attachments)
            print("\n--- Refined Prompt ---")
            print(refined)

            session = append_to_history(session, current_file, user_input, refined)
            save_session(session)
            print(f"\nSession memory updated for {current_file}.")

        except Exception as e:
            print(f"\n[!] ERROR: Failed to refine prompt.")
            print(f"Reason: {e}")