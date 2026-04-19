import * as vscode from 'vscode';
import * as https from 'https';
import * as crypto from 'crypto';
import { SidebarPanel } from './panel';

export const SERVER_URL = 'https://promptpilot-api.onrender.com';
export const WS_SERVER_URL = 'wss://promptpilot-api.onrender.com';

export function activate(context: vscode.ExtensionContext) {
	console.log('PromptPilot extension activated');

	const sidebarProvider = new SidebarPanel(context.extensionUri, context);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'promptEngineer.sidebar',
			sidebarProvider
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('promptEngineer.reindex', () => {
			vscode.window.showInformationMessage(
				'PromptPilot: Project files are read automatically with each prompt.'
			);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('promptEngineer.setApiKey', async () => {
			const key = await vscode.window.showInputBox({
				prompt: 'Enter your Gemini API key',
				password: true,
				placeHolder: 'AIza...',
				ignoreFocusOut: true
			});
			if (key) {
				await context.secrets.store('geminiApiKey', key);
				vscode.window.showInformationMessage('PromptPilot: API key saved successfully.');
				sidebarProvider.refresh();
			}
		})
	);
}

export function getChannelId(apiKey: string): string {
	return crypto.createHash('sha256').update(apiKey).digest('hex');
}

export async function sendToIDEAgent(text: string, apiKey: string): Promise<boolean> {
	await vscode.env.clipboard.writeText(text);

	// Send to browser extension via hosted WebSocket server
	const channelId = getChannelId(apiKey);
	sendToBrowserViaServer(channelId, text);

	// Try IDE agent commands
	try {
		await vscode.commands.executeCommand('aichat.newchataction');
		await new Promise(resolve => setTimeout(resolve, 500));
		await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
		vscode.window.showInformationMessage('PromptPilot: Prompt sent to Cursor agent.');
		return true;
	} catch { }

	try {
		await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
		await new Promise(resolve => setTimeout(resolve, 500));
		await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
		vscode.window.showInformationMessage('PromptPilot: Prompt sent to Copilot chat.');
		return true;
	} catch { }

	try {
		await vscode.commands.executeCommand('workbench.action.chat.open', { query: text });
		vscode.window.showInformationMessage('PromptPilot: Prompt sent to IDE agent.');
		return true;
	} catch { }

	return false;
}

function sendToBrowserViaServer(channelId: string, prompt: string) {
	const body = JSON.stringify({ channel_id: channelId, prompt: prompt });
	const serverUrl = new URL(SERVER_URL);

	const options = {
		hostname: serverUrl.hostname,
		path: '/send',
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(body)
		}
	};

	const req = https.request(options, (res) => {
		let data = '';
		res.on('data', (chunk: Buffer) => data += chunk.toString());
		res.on('end', () => console.log('Browser send result:', data));
	});

	req.on('error', (e) => console.log('Browser send error:', e.message));
	req.write(body);
	req.end();
}

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
	return await context.secrets.get('geminiApiKey');
}

export function deactivate() { }