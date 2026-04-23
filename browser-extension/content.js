// ── Universal input detector ──────────────────────────────────────────────────

function findBestInput() {
    const candidates = [];

    const editables = document.querySelectorAll(
        '[contenteditable="true"], textarea, input[type="text"]'
    );

    for (const el of editables) {
        const score = scoreElement(el);
        if (score > 0) {
            candidates.push({ el, score });
        }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.length > 0 ? candidates[0].el : null;
}

function scoreElement(el) {
    let score = 0;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return 0;
    if (rect.top < 0 || rect.bottom > window.innerHeight + 200) return 0;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return 0;
    if (style.opacity === '0') return 0;

    if (rect.width > 300) score += 20;
    if (rect.width > 500) score += 10;

    const viewportHeight = window.innerHeight;
    const elementCenter = rect.top + rect.height / 2;
    if (elementCenter > viewportHeight * 0.5) score += 15;
    if (elementCenter > viewportHeight * 0.7) score += 10;

    if (el.tagName === 'TEXTAREA') score += 25;
    if (el.getAttribute('contenteditable') === 'true') score += 20;

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
        if (placeholder.includes(hint)) { score += 30; break; }
    }

    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    for (const hint of chatHints) {
        if (ariaLabel.includes(hint)) { score += 25; break; }
    }

    const role = el.getAttribute('role') || '';
    if (role === 'textbox') score += 20;

    if (el.classList.contains('ProseMirror')) score += 30;

    const distanceFromBottom = viewportHeight - rect.bottom;
    if (distanceFromBottom < 200) score += 20;
    if (distanceFromBottom < 100) score += 15;

    const content = el.textContent || el.value || '';
    if (content.length > 500) score -= 15;

    if (rect.height < 30 && el.tagName !== 'TEXTAREA') score -= 20;

    return score;
}

// ── ChatGPT specific insertion ────────────────────────────────────────────────
// ChatGPT uses ProseMirror with React fiber — standard DOM manipulation
// does not trigger React's state. We simulate real keyboard events instead.

async function insertIntoChatGPT(el, text) {
    el.focus();

    // Clear existing content
    el.innerHTML = '<p><br></p>';
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await wait(50);

    // Move cursor to start
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    // Simulate typing character by character using keyboard events
    // This is the only reliable way to trigger React's onChange in ProseMirror
    for (const char of text) {
        // keydown
        el.dispatchEvent(new KeyboardEvent('keydown', {
            key: char,
            code: `Key${char.toUpperCase()}`,
            charCode: char.charCodeAt(0),
            keyCode: char.charCodeAt(0),
            which: char.charCodeAt(0),
            bubbles: true,
            cancelable: true
        }));

        // beforeinput
        el.dispatchEvent(new InputEvent('beforeinput', {
            inputType: 'insertText',
            data: char,
            bubbles: true,
            cancelable: true
        }));

        // Actually insert the character
        document.execCommand('insertText', false, char);

        // input
        el.dispatchEvent(new InputEvent('input', {
            inputType: 'insertText',
            data: char,
            bubbles: true
        }));

        // keyup
        el.dispatchEvent(new KeyboardEvent('keyup', {
            key: char,
            bubbles: true
        }));
    }

    await wait(100);
    return el.textContent.trim().length > 0;
}

// ── Standard insertion for all other sites ────────────────────────────────────

async function insertIntoElement(el, text) {
    // Detect if this is ChatGPT's ProseMirror editor
    const host = window.location.hostname;
    const isChatGPT = host.includes('chatgpt.com') || host.includes('chat.openai.com');

    if (isChatGPT) {
        return await insertIntoChatGPT(el, text);
    }

    el.focus();

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        const proto = el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;

        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        nativeSetter.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return el.value === text || el.value.includes(text);

    } else {
        // Approach 1: execCommand
        el.innerHTML = '';
        el.focus();
        const execSuccess = document.execCommand('insertText', false, text);
        if (execSuccess && el.textContent.trim()) return true;

        // Approach 2: ClipboardEvent paste
        el.innerHTML = '';
        el.focus();
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', text);
        el.dispatchEvent(new ClipboardEvent('paste', {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true
        }));
        if (el.textContent.trim()) return true;

        // Approach 3: innerHTML with InputEvent
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
    setTimeout(() => { el.style.outline = original; }, 1500);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function prepareSite() {
    const host = window.location.hostname;
    if (host.includes('x.com') || host.includes('grok.com')) await wait(300);
    if (host.includes('mistral.ai')) await wait(300);
}

// ── Main injection ────────────────────────────────────────────────────────────

async function insertPrompt(text) {
    await prepareSite();

    for (let attempt = 0; attempt < 3; attempt++) {
        const el = findBestInput();

        if (el) {
            const success = await insertIntoElement(el, text);
            if (success) {
                flashBorder(el);
                console.log('PromptPilot: Inserted on attempt', attempt + 1);
                return true;
            }
        }

        if (attempt < 2) await wait(500);
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
        return true;
    }
});