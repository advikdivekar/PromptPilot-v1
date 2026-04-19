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

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'insertPrompt') {
        const success = insertPrompt(message.prompt);
        sendResponse({ success });
    }
    return true;
});