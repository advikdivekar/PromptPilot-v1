let socket = null;
let reconnectTimeout = null;
let channelId = null;

// Get channel ID from storage
chrome.storage.local.get(['channelId'], (result) => {
    if (result.channelId) {
        channelId = result.channelId;
        connect();
    }
});

// Listen for channel ID being set
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'setChannelId') {
        channelId = message.channelId;
        chrome.storage.local.set({ channelId });
        connect();
    }
    if (message.type === 'getStatus') {
        return { connected: socket && socket.readyState === WebSocket.OPEN };
    }
});

function connect() {
    if (!channelId) return;
    if (socket && socket.readyState === WebSocket.OPEN) return;

    try {
        socket = new WebSocket(`wss://promptpilot-api.onrender.com/ws/${channelId}`);

        socket.onopen = () => {
            console.log('PromptPilot: Connected to hosted server');
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'prompt') {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                type: 'insertPrompt',
                                prompt: data.prompt
                            }, (response) => {
                                if (chrome.runtime.lastError) {
                                    console.log('PromptPilot: Could not reach content script');
                                }
                            });
                        }
                    });
                }
            } catch (e) {
                console.error('PromptPilot: Failed to parse message', e);
            }
        };

        socket.onclose = () => {
            console.log('PromptPilot: Disconnected. Retrying in 5s...');
            socket = null;
            reconnectTimeout = setTimeout(connect, 5000);
        };

        socket.onerror = () => {
            socket = null;
        };

    } catch (e) {
        console.log('PromptPilot: Could not connect');
        reconnectTimeout = setTimeout(connect, 5000);
    }
}

// Keep service worker alive
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        connect();
    }
});