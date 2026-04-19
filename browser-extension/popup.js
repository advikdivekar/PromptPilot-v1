chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
    const statusEl = document.getElementById('status');
    if (response && response.connected) {
        statusEl.textContent = '✅ Connected to VS Code';
        statusEl.className = 'status connected';
    } else {
        statusEl.textContent = '⚡ Waiting for VS Code...';
        statusEl.className = 'status disconnected';
    }
});