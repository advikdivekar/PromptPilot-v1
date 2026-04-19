from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import errors
from google.genai import types
import base64
import os
import re
from typing import Optional

app = FastAPI(title="PromptPilot API")

# Allow requests from VS Code extension and browser extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODELS = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-flash-latest",
]

RECOVERABLE_ERROR_CODES = ["500", "502", "503", "UNAVAILABLE", "INTERNAL"]

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

# ── Request Models ────────────────────────────────────────────────────────────

class Attachment(BaseModel):
    name: str
    mimeType: str
    data: str  # base64 encoded

class EngineerRequest(BaseModel):
    user_prompt: str
    api_key: str
    context: Optional[str] = ""
    history: Optional[str] = ""
    attachments: Optional[list[Attachment]] = []
    prompt_type: Optional[str] = None  # if None, server classifies

class PingResponse(BaseModel):
    status: str
    version: str

# ── Core Logic ────────────────────────────────────────────────────────────────

def classify_prompt(user_input: str, client: genai.Client) -> str:
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


def call_gemini_api(
    model_name: str,
    user_input: str,
    context: str,
    attachments: list,
    system_prompt: str,
    client: genai.Client
) -> str:
    """Makes a single call to the Gemini API."""
    full_input = f"{context}\n\n--- User Instruction ---\n{user_input}" if context.strip() else user_input

    content_parts = [full_input]

    for attachment in attachments:
        try:
            file_data = base64.b64decode(attachment.data)
            content_parts.append(
                types.Part.from_bytes(data=file_data, mime_type=attachment.mimeType)
            )
        except Exception as e:
            print(f"Warning: Could not process attachment {attachment.name}: {e}")

    response = client.models.generate_content(
        model=model_name,
        config={"system_instruction": system_prompt},
        contents=content_parts
    )

    if not response.text or not response.text.strip():
        raise ValueError(f"Model {model_name} returned an empty response.")

    return response.text


def rewrite_prompt_logic(
    user_input: str,
    context: str,
    attachments: list,
    client: genai.Client,
    prompt_type: str = None
) -> tuple[str, str]:
    """
    Classifies and rewrites the prompt.
    Returns (refined_prompt, prompt_type)
    """
    if not prompt_type:
        prompt_type = classify_prompt(user_input, client)

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
            refined = call_gemini_api(
                model, user_input, active_context, attachments, system, client
            )
            return refined, prompt_type
        except errors.ClientError as e:
            last_error = e
            reason = "Quota exceeded" if "RESOURCE_EXHAUSTED" in str(e) else str(e)
            print(f"Model {model} failed ({reason})")
            continue
        except Exception as e:
            if any(code in str(e) for code in RECOVERABLE_ERROR_CODES):
                last_error = e
                continue
            raise e

    raise Exception(f"All models failed. Last error: {last_error}")


# ── API Routes ────────────────────────────────────────────────────────────────

@app.get("/", response_model=PingResponse)
def ping():
    """Health check endpoint."""
    return {"status": "ok", "version": "1.0.0"}


@app.get("/health")
def health():
    """Health check for Render."""
    return {"status": "healthy"}


@app.post("/engineer")
async def engineer_prompt(request: EngineerRequest):
    """
    Main endpoint — takes a rough prompt and returns an engineered one.
    The user's Gemini API key is used directly and never stored.
    """
    if not request.user_prompt.strip():
        raise HTTPException(status_code=400, detail="user_prompt cannot be empty")

    if not request.api_key.strip():
        raise HTTPException(status_code=400, detail="api_key cannot be empty")

    # Create a client using the USER's API key — never stored server side
    try:
        client = genai.Client(api_key=request.api_key)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid API key: {e}")

    # Build full context from what the extension sends
    context_parts = []
    if request.history:
        context_parts.append(f"--- Relevant Session History ---\n{request.history}")
    if request.context:
        context_parts.append(request.context)

    full_context = "\n\n".join(context_parts)

    try:
        refined, prompt_type = rewrite_prompt_logic(
            user_input=request.user_prompt,
            context=full_context,
            attachments=request.attachments or [],
            client=client,
            prompt_type=request.prompt_type
        )
        return {
            "refined_prompt": refined,
            "prompt_type": prompt_type,
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))