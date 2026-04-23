// ── Universal input detector ──────────────────────────────────────────────────
// Instead of hardcoded selectors that break on UI updates, we score every
// input/contenteditable on the page and pick the best candidate.
// This works even when sites redesign their UI.

function findBestInput() {
    const candidates = [];

    // Collect all possible input elements
    const editables = document.querySelectorAll(
        '[contenteditable="true"], textarea, input[type="text"]'
    );

    for (const el of editables) {
        const score = scoreElement(el);
        if (score > 0) {
            candidates.push({ el, score });
        }
    }

    // Sort by score descending — highest score = most likely chat input
    candidates.sort((a, b) => b.score - a.score);

    return candidates.length > 0 ? candidates[0].el : null;
}

function scoreElement(el) {
    let score = 0;

    // Must be visible
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return 0;
    if (rect.top < 0 || rect.bottom > window.innerHeight + 200) return 0;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return 0;
    if (style.opacity === '0') return 0;

    // Size scoring — chat inputs are usually wide and near the bottom
    if (rect.width > 300) score += 20;
    if (rect.width > 500) score += 10;

    // Position scoring — chat inputs are usually in the bottom half
    const viewportHeight = window.innerHeight;
    const elementCenter = rect.top + rect.height / 2;
    if (elementCenter > viewportHeight * 0.5) score += 15;
    if (elementCenter > viewportHeight * 0.7) score += 10;

    // Element type scoring
    if (el.tagName === 'TEXTAREA') score += 25;
    if (el.getAttribute('contenteditable') === 'true') score += 20;

    // Placeholder text hints
    const placeholder = (
        el.getAttribute('placeholder') ||
        el.getAttribute('aria-placeholder') ||
        el.getAttribute('data-placeholder') || ''
    ).toLowerCase();

    const chatHints = [
        'message', 'prompt', 'ask', 'type', 'chat', 'send',
        'question', 'help', 'write', 'input', 'talk'
    ];

    for (const hint of chatHints) {
        if (placeholder.includes(hint)) {
            score += 30;
            break;
        }
    }

    // Aria label hints
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    for (const hint of chatHints) {
        if (ariaLabel.includes(hint)) {
            score += 25;
            break;
        }
    }

    // Role hints
    const role = el.getAttribute('role') || '';
    if (role === 'textbox') score += 20;

    // ProseMirror editor (used by Claude, Notion, many modern apps)
    if (el.classList.contains('ProseMirror')) score += 30;

    // Near the bottom of the page is a strong signal
    const distanceFromBottom = viewportHeight - rect.bottom;
    if (distanceFromBottom < 200) score += 20;
    if (distanceFromBottom < 100) score += 15;

    // Penalty for small inputs (likely search boxes or form fields)
    if (rect.height < 30 && el.tagName !== 'TEXTAREA') score -= 20;

    // Penalty for inputs that already have a lot of content (not empty chat box)
    const content = el.textContent || el.value || '';
    if (content.length > 500) score -= 15;

    return score;
}

function insertIntoElement(el, text) {
    el.focus();

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        // Standard textarea/input — use React-compatible setter
        const proto = el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;

        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        nativeSetter.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return el.value === text || el.value.includes(text);

    } else {
        // contenteditable — try multiple approaches in order

        // Approach 1: execCommand (works in most cases)
        el.innerHTML = '';
        el.focus();
        const execSuccess = document.execCommand('insertText', false, text);
        if (execSuccess && el.textContent.trim()) return true;

        // Approach 2: ClipboardEvent paste simulation
        el.innerHTML = '';
        el.focus();
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', text);
        const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true
        });
        el.dispatchEvent(pasteEvent);
        if (el.textContent.trim()) return true;

        // Approach 3: Direct innerHTML with InputEvent
        el.innerHTML = `<p>${text}</p>`;
        el.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text
        }));
        if (el.textContent.trim()) return true;

        // Approach 4: Range and Selection API
        el.innerHTML = '';
        el.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        if (el.textContent.trim()) return true;

        return false;
    }
}

function flashBorder(el) {
    const original = el.style.outline;
    el.style.outline = '2px solid #10b981';
    el.style.transition = 'outline 0.3s ease';
    setTimeout(() => {
        el.style.outline = original;
    }, 1500);
}

// ── Site-specific pre-processing ──────────────────────────────────────────────
// Some sites need special handling before injection.
// This is kept minimal — just navigation/preparation, not selector hunting.

async function prepareSite() {
    const host = window.location.hostname;

    // For Grok — sometimes need to wait for hydration
    if (host.includes('x.com') || host.includes('grok.com')) {
        await wait(300);
    }

    // For Mistral — wait for editor to initialise
    if (host.includes('mistral.ai') || host.includes('chat.mistral.ai')) {
        await wait(300);
    }
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main injection function ───────────────────────────────────────────────────

async function insertPrompt(text) {
    await prepareSite();

    // Try to find the best input up to 3 times with short delays
    // (some sites render the input after page load)
    for (let attempt = 0; attempt < 3; attempt++) {
        const el = findBestInput();

        if (el) {
            const success = insertIntoElement(el, text);
            if (success) {
                flashBorder(el);
                console.log('PromptPilot: Prompt inserted successfully on attempt', attempt + 1);
                return true;
            }
        }

        // Wait before retrying
        if (attempt < 2) {
            await wait(500);
        }
    }

    console.log('PromptPilot: Could not find a suitable input field');
    return false;
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'insertPrompt') {
        insertPrompt(message.prompt).then(success => {
            sendResponse({ success });
        });
        return true; // Keep channel open for async response
    }
});