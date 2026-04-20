const SERVER = 'https://promptpilot-api.onrender.com';

async function deriveChannelId(apiKey) {
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function init() {
    const statusEl = document.getElementById('status');
    const result = await chrome.storage.local.get(['channelId', 'connected']);

    if (result.channelId && result.connected) {
        showConnected();
    } else {
        showSetup();
    }
}

function showConnected() {
    document.getElementById('status').textContent = '✅ Connected — ready to receive prompts';
    document.getElementById('status').className = 'status connected';
    document.getElementById('setup-view').style.display = 'none';
    document.getElementById('connected-view').style.display = 'block';
}

function showSetup() {
    document.getElementById('status').textContent = 'Enter your API key to connect';
    document.getElementById('status').className = 'status disconnected';
    document.getElementById('setup-view').style.display = 'block';
    document.getElementById('connected-view').style.display = 'none';
}

document.getElementById('connect-btn').addEventListener('click', async () => {
    const apiKey = document.getElementById('api-key-input').value.trim();
    if (!apiKey) return;

    const statusEl = document.getElementById('status');
    statusEl.textContent = 'Connecting...';
    statusEl.className = 'status disconnected';

    try {
        const channelId = await deriveChannelId(apiKey);
        await chrome.storage.local.set({ channelId, connected: true });
        chrome.runtime.sendMessage({ type: 'setChannelId', channelId });
        showConnected();
    } catch (e) {
        statusEl.textContent = 'Failed to connect. Try again.';
        statusEl.className = 'status error';
    }
});

document.getElementById('disconnect-btn').addEventListener('click', async () => {
    await chrome.storage.local.remove(['channelId', 'connected']);
    chrome.runtime.sendMessage({ type: 'disconnect' });
    showSetup();
});

init();