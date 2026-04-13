import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import { SidebarPanel } from './panel';

export function activate(context: vscode.ExtensionContext) {
	console.log('Prompt Engineer extension activated');

	// Register the sidebar panel provider
	const sidebarProvider = new SidebarPanel(context.extensionUri, context);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'promptEngineer.sidebar',
			sidebarProvider
		)
	);

	// Register the re-index command
	context.subscriptions.push(
		vscode.commands.registerCommand('promptEngineer.reindex', () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder open.');
				return;
			}

			const backendPath = getBackendPath(context);
			const pythonPath = getPythonPath(backendPath);

			vscode.window.showInformationMessage('Re-indexing project...');

			const process = cp.spawn(pythonPath, ['indexer.py'], {
				cwd: backendPath
			});

			process.stdout.on('data', (data) => {
				console.log(`Indexer: ${data}`);
			});

			process.stderr.on('data', (data) => {
				console.error(`Indexer error: ${data}`);
			});

			process.on('close', (code) => {
				if (code === 0) {
					vscode.window.showInformationMessage('Project indexed successfully.');
				} else {
					vscode.window.showErrorMessage('Indexing failed. Check the console for details.');
				}
			});
		})
	);
}

export function getBackendPath(context: vscode.ExtensionContext): string {
	// Backend sits one level up from the extension folder
	return path.join(context.extensionPath, '..', 'backend');
}

export function getPythonPath(backendPath: string): string {
	// Use the venv Python if it exists, otherwise fall back to system Python
	const venvPython = path.join(backendPath, 'venv', 'bin', 'python3');
	return venvPython;
}

export function deactivate() { }