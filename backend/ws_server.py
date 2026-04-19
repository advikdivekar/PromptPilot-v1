import asyncio
import websockets
import json

browser_clients = set()

async def handler(websocket):
    """Handles incoming connections from both VS Code and browser extension."""
    global browser_clients
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)

                if data.get('type') == 'prompt':
                    # From VS Code extension — broadcast to all browser clients
                    print(f"PromptPilot: Received prompt from VS Code, broadcasting to {len(browser_clients)} browser clients")
                    disconnected = set()
                    for client in browser_clients:
                        try:
                            await client.send(message)
                        except websockets.exceptions.ConnectionClosed:
                            disconnected.add(client)
                    browser_clients -= disconnected

                elif data.get('type') == 'register':
                    # Browser extension registering itself
                    browser_clients.add(websocket)
                    print(f"PromptPilot: Browser extension registered. Total: {len(browser_clients)}")
                    await websocket.send(json.dumps({"type": "registered"}))

            except json.JSONDecodeError:
                pass

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        browser_clients.discard(websocket)
        print(f"PromptPilot: Client disconnected. Total browser clients: {len(browser_clients)}")


async def start_server():
    """Starts the WebSocket server on port 54321."""
    async with websockets.serve(handler, "localhost", 54321):
        print("PromptPilot: WebSocket server running on ws://localhost:54321")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(start_server())