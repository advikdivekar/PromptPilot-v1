// Firefox compatible background script
// Uses browser namespace instead of chrome namespace

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
                    // Firefox uses browser namespace
                    browser.tabs.query({ active: true, currentWindow: true })
                        .then((tabs) => {
                            if (tabs[0]) {
                                browser.tabs.sendMessage(tabs[0].id, {
                                    type: 'insertPrompt',
                                    prompt: data.prompt
                                }).catch((err) => {
                                    console.log('PromptPilot: Could not reach content script:', err);
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

// Firefox alarms API
browser.alarms.create('keepAlive', { periodInMinutes: 0.4 });
browser.alarms.onAlarm.addListener(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        connect();
    }
});

connect();