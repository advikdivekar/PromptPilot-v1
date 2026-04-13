import os
import chromadb
from sentence_transformers import SentenceTransformer

# The local embedding model — runs entirely on your machine, no API needed
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Folders and files to never index
IGNORE = {".git", "__pycache__", "venv", "node_modules", "chroma_db"}

# File extensions worth indexing
INDEXABLE_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go",
    ".rs", ".cpp", ".c", ".h", ".cs", ".rb", ".php",
    ".html", ".css", ".json", ".yaml", ".yml", ".md"
}


def get_indexable_files(root_dir: str = ".") -> list:
    """Returns all files worth indexing in the project."""
    files = []
    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in IGNORE]
        for filename in filenames:
            if os.path.basename(filename).startswith(".env"):
                continue
            ext = os.path.splitext(filename)[1].lower()
            if ext in INDEXABLE_EXTENSIONS:
                files.append(os.path.join(dirpath, filename))
    return files


def chunk_file(filepath: str, chunk_size: int = 40) -> list:
    """
    Splits a file into overlapping chunks of lines.
    Each chunk knows which file it came from and which lines it covers.
    """
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
    except Exception:
        return []

    chunks = []
    step = chunk_size // 2  # 50% overlap so context is not lost at boundaries

    for i in range(0, max(1, len(lines)), step):
        chunk_lines = lines[i:i + chunk_size]
        chunk_text = "".join(chunk_lines).strip()
        if chunk_text:
            chunks.append({
                "text": chunk_text,
                "filepath": filepath,
                "start_line": i + 1,
                "end_line": i + len(chunk_lines)
            })

    return chunks


def build_index(root_dir: str = "."):
    """
    Walks the project, chunks every indexable file,
    embeds each chunk, and stores everything in ChromaDB.
    """
    print("Loading embedding model...")
    model = SentenceTransformer(EMBEDDING_MODEL)

    print("Connecting to ChromaDB...")
    chroma_client = chromadb.PersistentClient(path="./chroma_db")

    # Clear existing index so rebuilding is always fresh
    try:
        chroma_client.delete_collection("codebase")
    except Exception:
        pass

    collection = chroma_client.create_collection("codebase")

    print("Scanning project files...")
    files = get_indexable_files(root_dir)
    print(f"Found {len(files)} indexable files.")

    all_chunks = []
    for filepath in files:
        chunks = chunk_file(filepath)
        all_chunks.extend(chunks)

    if not all_chunks:
        print("No content found to index.")
        return

    print(f"Indexing {len(all_chunks)} chunks...")

    texts = [c["text"] for c in all_chunks]
    embeddings = model.encode(texts, show_progress_bar=True).tolist()

    collection.add(
        ids=[f"chunk_{i}" for i in range(len(all_chunks))],
        embeddings=embeddings,
        documents=texts,
        metadatas=[{
            "filepath": c["filepath"],
            "start_line": c["start_line"],
            "end_line": c["end_line"]
        } for c in all_chunks]
    )

    print(f"\nIndex built successfully.")
    print(f"Total chunks stored: {len(all_chunks)}")
    print(f"Files indexed: {len(files)}")


if __name__ == "__main__":
    build_index()