import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import { SidebarPanel } from './panel';

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
			runIndexer(context, true);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('promptEngineer.sendToAgent', async (text: string) => {
			const sent = await sendToIDEAgent(text);
			if (!sent) {
				await vscode.env.clipboard.writeText(text);
				vscode.window.showInformationMessage(
					'PromptPilot: Prompt copied to clipboard. Paste it into your AI agent.'
				);
			}
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

	autoIndexIfNeeded(context);

	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			autoIndexIfNeeded(context);
		})
	);
}

function autoIndexIfNeeded(context: vscode.ExtensionContext) {
	const backendPath = getBackendPath(context);
	const chromaDbPath = path.join(backendPath, 'chroma_db');

	if (!fs.existsSync(chromaDbPath)) {
		vscode.window.showInformationMessage(
			'PromptPilot: No index found. Building index for the first time...'
		);
		runIndexer(context, false);
	}
}

export function runIndexer(
	context: vscode.ExtensionContext,
	showNotification: boolean
) {
	const backendPath = getBackendPath(context);
	const pythonPath = getPythonPath(backendPath);

	if (showNotification) {
		vscode.window.showInformationMessage('PromptPilot: Re-indexing project...');
	}

	const process = cp.spawn(pythonPath, ['indexer.py'], {
		cwd: backendPath
	});

	process.stdout.on('data', (data) => {
		console.log(`PromptPilot Indexer: ${data}`);
	});

	process.stderr.on('data', (data) => {
		console.log(`PromptPilot Indexer (stderr): ${data}`);
	});

	process.on('close', (code) => {
		if (code === 0) {
			if (showNotification) {
				vscode.window.showInformationMessage(
					'PromptPilot: Project indexed successfully.'
				);
			}
		} else {
			vscode.window.showErrorMessage(
				'PromptPilot: Indexing failed. Check the output console for details.'
			);
		}
	});
}

function sendToBrowser(text: string) {
	const WebSocket = require('ws');
	const ws = new WebSocket('ws://localhost:54321');

	ws.on('open', () => {
		ws.send(JSON.stringify({ type: 'prompt', prompt: text }));
		ws.close();
	});

	ws.on('error', () => {
		// Browser extension not active — clipboard fallback handles this
	});
}

export async function sendToIDEAgent(text: string): Promise<boolean> {
	await vscode.env.clipboard.writeText(text);
	sendToBrowser(text);

	try {
		await vscode.commands.executeCommand('aichat.newchataction');
		await new Promise(resolve => setTimeout(resolve, 500));
		await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
		vscode.window.showInformationMessage('PromptPilot: Prompt sent to Cursor agent.');
		return true;
	} catch { }

	try {
		await vscode.commands.executeCommand(
			'workbench.panel.chat.view.copilot.focus'
		);
		await new Promise(resolve => setTimeout(resolve, 500));
		await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
		vscode.window.showInformationMessage('PromptPilot: Prompt sent to Copilot chat.');
		return true;
	} catch { }

	try {
		await vscode.commands.executeCommand(
			'workbench.action.chat.open',
			{ query: text }
		);
		vscode.window.showInformationMessage('PromptPilot: Prompt sent to IDE agent.');
		return true;
	} catch { }

	return false;
}

export function getBackendPath(context: vscode.ExtensionContext): string {
	return path.join(context.extensionPath, '..', 'backend');
}

export function getPythonPath(backendPath: string): string {
	return path.join(backendPath, 'venv', 'bin', 'python3');
}

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
	return await context.secrets.get('geminiApiKey');
}

export function deactivate() { }