// Selectors for each AI tool's input field
const INPUT_SELECTORS = {
    'claude.ai': [
        'div[contenteditable="true"]',
        '.ProseMirror',
    ],
    'chatgpt.com': [
        '#prompt-textarea',
        'div[contenteditable="true"]',
    ],
    'chat.openai.com': [
        '#prompt-textarea',
        'div[contenteditable="true"]',
    ],
    'gemini.google.com': [
        'div[contenteditable="true"]',
        '.ql-editor',
    ],
    'perplexity.ai': [
        'textarea[placeholder]',
        'div[contenteditable="true"]',
    ]
};

function getInputField() {
    const hostname = window.location.hostname;

    for (const [site, selectors] of Object.entries(INPUT_SELECTORS)) {
        if (hostname.includes(site)) {
            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el) return el;
            }
        }
    }

    // Fallback
    const fallbacks = [
        'div[contenteditable="true"]',
        'textarea',
    ];
    for (const selector of fallbacks) {
        const el = document.querySelector(selector);
        if (el) return el;
    }

    return null;
}

function insertPrompt(prompt) {
    const input = getInputField();

    if (!input) {
        console.error('PromptPilot: Could not find input field on this page');
        return false;
    }

    input.focus();

    if (input.getAttribute('contenteditable') === 'true') {
        // Clear existing content
        input.innerHTML = '';

        // Insert text
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, prompt);

        // Trigger input events so the UI updates
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: prompt }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

    } else {
        // Handle regular textareas
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
        ).set;
        nativeInputValueSetter.call(input, prompt);

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Visual confirmation — green outline flash
    input.style.outline = '2px solid #2ea043';
    setTimeout(() => {
        input.style.outline = '';
    }, 1500);

    return true;
}

// Listen for prompt injection messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'insertPrompt') {
        const success = insertPrompt(message.prompt);
        sendResponse({ success });
    }
    return true;
});

function insertPrompt(text) {
    const host = window.location.hostname;

    try {
        if (host.includes('claude.ai')) {
            return insertIntoClaude(text);
        } else if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) {
            return insertIntoChatGPT(text);
        } else if (host.includes('gemini.google.com')) {
            return insertIntoGemini(text);
        } else if (host.includes('perplexity.ai')) {
            return insertIntoPerplexity(text);
        }
    } catch (e) {
        console.error('PromptPilot: Error inserting prompt', e);
        return false;
    }

    return false;
}

function insertIntoClaude(text) {
    // Claude uses a contenteditable div with specific data attribute
    const selectors = [
        'div[contenteditable="true"].ProseMirror',
        'div[contenteditable="true"][data-testid="chat-input"]',
        'div[contenteditable="true"]',
        'textarea'
    ];

    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
            el.focus();

            if (el.tagName === 'TEXTAREA') {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                ).set;
                nativeInputValueSetter.call(el, text);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                // contenteditable — use execCommand for React compatibility
                el.innerHTML = '';
                el.focus();
                document.execCommand('insertText', false, text);

                // If execCommand didn't work, try clipboard approach
                if (!el.textContent.trim()) {
                    el.textContent = text;
                    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
                }
            }

            flashBorder(el);
            console.log('PromptPilot: Inserted into Claude');
            return true;
        }
    }

    console.log('PromptPilot: Could not find Claude input');
    return false;
}

function insertIntoChatGPT(text) {
    const selectors = [
        'div#prompt-textarea[contenteditable="true"]',
        'div[contenteditable="true"]',
        'textarea[data-id="root"]',
        'textarea'
    ];

    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
            el.focus();

            if (el.tagName === 'TEXTAREA') {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                ).set;
                nativeInputValueSetter.call(el, text);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                el.innerHTML = '';
                el.focus();
                document.execCommand('insertText', false, text);

                if (!el.textContent.trim()) {
                    el.textContent = text;
                    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
                }
            }

            flashBorder(el);
            console.log('PromptPilot: Inserted into ChatGPT');
            return true;
        }
    }

    console.log('PromptPilot: Could not find ChatGPT input');
    return false;
}

function insertIntoGemini(text) {
    const selectors = [
        'div.ql-editor[contenteditable="true"]',
        'rich-textarea div[contenteditable="true"]',
        'div[contenteditable="true"]',
        'textarea'
    ];

    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
            el.focus();

            if (el.tagName === 'TEXTAREA') {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                ).set;
                nativeInputValueSetter.call(el, text);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                el.innerHTML = '';
                el.focus();
                document.execCommand('insertText', false, text);

                if (!el.textContent.trim()) {
                    el.textContent = text;
                    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
                }
            }

            flashBorder(el);
            console.log('PromptPilot: Inserted into Gemini');
            return true;
        }
    }

    console.log('PromptPilot: Could not find Gemini input');
    return false;
}

function insertIntoPerplexity(text) {
    const selectors = [
        'textarea[placeholder]',
        'div[contenteditable="true"]',
        'textarea'
    ];

    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
            el.focus();

            if (el.tagName === 'TEXTAREA') {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                ).set;
                nativeInputValueSetter.call(el, text);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                el.innerHTML = '';
                el.focus();
                document.execCommand('insertText', false, text);
            }

            flashBorder(el);
            console.log('PromptPilot: Inserted into Perplexity');
            return true;
        }
    }

    return false;
}

function flashBorder(el) {
    const original = el.style.outline;
    el.style.outline = '2px solid #10b981';
    setTimeout(() => { el.style.outline = original; }, 1500);
}