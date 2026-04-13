from google import genai
from google.genai import errors
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
import chromadb
import os
import json
import re
from datetime import datetime

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

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

# We use 80% of the limit as a safe working threshold
CONTEXT_WINDOW_SAFETY_FACTOR = 0.8

# Session memory file — configuration, not logic
SESSION_FILE = "session.json"

MODELS = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite", 
    "gemini-1.5-flash",
    "gemini-flash-latest",
]

# Server side errors that are recoverable — try next model
RECOVERABLE_ERROR_CODES = ["500", "502", "503", "UNAVAILABLE", "INTERNAL"]


# ── Exclusion System ──────────────────────────────────────────────────────────

def load_excluded_files() -> set:
    """
    Reads .promptignore and returns a set of excluded filenames and folders.
    SESSION_FILE is always excluded regardless of .promptignore contents.
    Everything else is driven by the user-controlled .promptignore file.
    """
    excluded = {SESSION_FILE}  # always protect session memory
    if os.path.exists(".promptignore"):
        with open(".promptignore", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    excluded.add(line)
    return excluded


# Load exclusions once at startup
EXCLUDED = load_excluded_files()


def is_excluded(filepath: str) -> bool:
    """
    Returns True if a file should never be surfaced to the LLM
    or auto-detected. Driven entirely by .promptignore.
    """
    basename = os.path.basename(filepath)
    if basename.startswith(".env"):
        return True
    for pattern in EXCLUDED:
        if basename == pattern or filepath.endswith(pattern):
            return True
    return False


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

Use all of this context to make the rewritten prompt specific and accurate 
to their actual codebase and current working session.

Rules:
- Be specific about what needs to be built or changed
- Include relevant constraints (language, framework, patterns)
- Scope the task clearly — not too broad, not too narrow
- Preserve the original intent exactly
- Never ask clarifying questions — make reasonable assumptions and state them explicitly
- Output only the rewritten prompt, nothing else
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
    """Loads the full session history from disk. Creates file if it does not exist."""
    if not os.path.exists(SESSION_FILE):
        return {}
    try:
        with open(SESSION_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def save_session(session: dict):
    """Saves the full session history to disk."""
    try:
        with open(SESSION_FILE, "w") as f:
            json.dump(session, f, indent=2)
    except IOError as e:
        print(f"Warning: Could not save session memory: {e}")


def get_file_history(session: dict, filepath: str) -> list:
    """Returns the history for a specific file."""
    return session.get(filepath, [])


def append_to_history(session: dict, filepath: str, prompt: str, refined: str) -> dict:
    """Appends a new exchange to the history for a specific file."""
    if filepath not in session:
        session[filepath] = []
    session[filepath].append({
        "prompt": prompt,
        "refined": refined,
        "timestamp": datetime.now().isoformat()
    })
    return session


def estimate_tokens(text: str) -> int:
    """
    Estimates token count from text.
    A rough but reliable approximation: 1 token ≈ 4 characters.
    """
    return len(text) // 4


def select_relevant_history(user_input: str, history: list) -> list:
    """
    Uses an LLM call to select which previous exchanges are relevant
    to the current prompt. Pure reasoning — no hardcoded count.
    """
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
    """
    Builds the history context string dynamically.
    Stops adding exchanges when approaching the model's context window limit.
    Fully dynamic — no hardcoded exchange count.
    """
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
    """
    Embeds the user prompt and retrieves the most semantically
    similar code chunks from the ChromaDB index.
    """
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
    """Walks the project directory and returns a tree-like structure string."""
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
    """Finds the most recently modified file in the project."""
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
    """Returns a flat list of all file paths, excluding sensitive and internal files."""
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
    """
    Uses an LLM call to intelligently detect which files are relevant
    to the user's instruction.
    """
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
    """Reads config files, the primary working file, and any extra relevant files."""
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

def call_gemini_api(model_name: str, user_input: str, context: str) -> str:
    """Makes a single call to the Google Gemini API."""
    full_input = f"{context}\n\n--- User Instruction ---\n{user_input}"

    response = client.models.generate_content(
        model=model_name,
        config={"system_instruction": SYSTEM_PROMPT},
        contents=full_input
    )

    if not response.text or not response.text.strip():
        raise ValueError(f"Model {model_name} returned an empty response.")

    return response.text


def rewrite_prompt(user_input: str, context: str) -> str:
    """Attempts to refine the prompt using a chain of Gemini models."""
    last_error = None

    for model in MODELS:
        try:
            print(f"Attempting with {model}...")
            return call_gemini_api(model, user_input, context)
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
        # Auto detect the most recently modified file
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

        # Build base context block without history first
        base_context = f"""
--- Project Structure ---
{structure}

{file_context}

--- Semantically Relevant Code Chunks (via RAG) ---
{rag_chunks if rag_chunks else "None retrieved."}
""".strip()

        # Dynamically build history context based on available token budget
        current_model = MODELS[0]
        base_token_size = estimate_tokens(base_context)
        history_context = build_history_context(
            relevant_history,
            current_model,
            base_token_size
        )

        # Assemble final context block
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
            refined = rewrite_prompt(user_input, context_block)
            print("\n--- Refined Prompt ---")
            print(refined)

            # Save this exchange to persistent memory
            session = append_to_history(session, current_file, user_input, refined)
            save_session(session)
            print(f"\nSession memory updated for {current_file}.")

        except Exception as e:
            print(f"\n[!] ERROR: Failed to refine prompt.")
            print(f"Reason: {e}")