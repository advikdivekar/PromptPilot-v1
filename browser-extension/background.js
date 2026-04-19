let socket = null;
let reconnectTimeout = null;

function connect() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        return;
    }

    try {
        socket = new WebSocket('ws://localhost:54321');

        socket.onopen = () => {
            console.log('PromptPilot: Connected to WebSocket server');
            // Register as a browser extension client
            socket.send(JSON.stringify({ type: 'register' }));
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'registered') {
                    console.log('PromptPilot: Successfully registered with server');
                }

                if (data.type === 'prompt') {
                    // Forward the prompt to the active tab
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                type: 'insertPrompt',
                                prompt: data.prompt
                            }, (response) => {
                                if (chrome.runtime.lastError) {
                                    console.log('PromptPilot: Could not reach content script:', chrome.runtime.lastError.message);
                                } else {
                                    console.log('PromptPilot: Prompt delivered to tab');
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
            console.log('PromptPilot: Disconnected. Retrying in 3s...');
            socket = null;
            reconnectTimeout = setTimeout(connect, 3000);
        };

        socket.onerror = () => {
            socket = null;
        };

    } catch (e) {
        console.log('PromptPilot: Could not connect');
        reconnectTimeout = setTimeout(connect, 3000);
    }
}

// Keep service worker alive
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        connect();
    }
});

// Start connecting when extension loads
connect();