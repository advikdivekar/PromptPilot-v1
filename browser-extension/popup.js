chrome.storage.local.get(['channelId'], (result) => {
    const statusEl = document.getElementById('status');
    if (result.channelId) {
        statusEl.textContent = '✅ Connected to PromptPilot';
        statusEl.className = 'status connected';
    } else {
        statusEl.textContent = '⚡ Open VS Code with PromptPilot to connect';
        statusEl.className = 'status disconnected';
    }
});