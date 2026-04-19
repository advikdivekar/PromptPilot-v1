// Firefox compatible content script
// Same logic as content.js but uses browser namespace where needed

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
        input.innerHTML = '';
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, prompt);
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: prompt }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
        ).set;
        nativeInputValueSetter.call(input, prompt);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    input.style.outline = '2px solid #2ea043';
    setTimeout(() => {
        input.style.outline = '';
    }, 1500);

    return true;
}

// Firefox uses browser namespace
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'insertPrompt') {
        const success = insertPrompt(message.prompt);
        sendResponse({ success });
    }
    return true;
});