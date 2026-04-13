import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { getBackendPath, getPythonPath } from './extension';

export class SidebarPanel implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;
    private _extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._extensionUri = extensionUri;
        this._context = context;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true
        };

        webviewView.webview.html = this._getHtml();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'engineerPrompt':
                    await this._runBackend(
                        message.userPrompt,
                        message.currentFile
                    );
                    break;
                case 'acceptPrompt':
                    await this._copyToClipboard(message.refinedPrompt);
                    break;
                case 'reindex':
                    await this._runIndexer();
                    break;
                case 'getCurrentFile':
                    this._sendCurrentFile();
                    break;
            }
        });

        this._sendCurrentFile();
    }

    private _sendCurrentFile() {
        const editor = vscode.window.activeTextEditor;
        const currentFile = editor
            ? path.basename(editor.document.fileName)
            : 'No file open';

        this._view?.webview.postMessage({
            command: 'currentFile',
            file: currentFile
        });
    }

    private async _runBackend(userPrompt: string, currentFile: string) {
        const backendPath = getBackendPath(this._context);
        const pythonPath = getPythonPath(backendPath);

        this._view?.webview.postMessage({ command: 'loading' });

        // Simulate user typing: prompt + enter, then filename + enter
        const input = `${userPrompt}\n${currentFile}\n`;

        const process = cp.spawn(pythonPath, ['main.py'], {
            cwd: backendPath
        });

        let fullOutput = '';
        let errorOutput = '';

        process.stdin.write(input);
        process.stdin.end();

        process.stdout.on('data', (data: Buffer) => {
            fullOutput += data.toString();
        });

        process.stderr.on('data', (data: Buffer) => {
            errorOutput += data.toString();
        });

        process.on('close', (code) => {
            console.log('Backend output:', fullOutput);
            console.log('Backend error:', errorOutput);

            // Extract the refined prompt from the full output
            const marker = '--- Refined Prompt ---';
            const markerIndex = fullOutput.indexOf(marker);

            if (markerIndex !== -1) {
                let refined = fullOutput.substring(markerIndex + marker.length);

                // Remove everything after session memory line
                const sessionLine = refined.indexOf('Session memory updated');
                if (sessionLine !== -1) {
                    refined = refined.substring(0, sessionLine);
                }

                refined = refined.trim();

                if (refined) {
                    this._view?.webview.postMessage({
                        command: 'refinedPrompt',
                        prompt: refined
                    });
                    return;
                }
            }

            // If we get here something went wrong
            this._view?.webview.postMessage({
                command: 'error',
                message: errorOutput || 'Backend did not return a refined prompt.'
            });
        });
    }

    private async _copyToClipboard(text: string) {
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage(
            'Refined prompt copied to clipboard. Paste it into your AI agent.'
        );
    }

    private async _runIndexer() {
        const backendPath = getBackendPath(this._context);
        const pythonPath = getPythonPath(backendPath);

        this._view?.webview.postMessage({ command: 'indexing' });

        const process = cp.spawn(pythonPath, ['indexer.py'], {
            cwd: backendPath
        });

        process.on('close', (code) => {
            if (code === 0) {
                this._view?.webview.postMessage({ command: 'indexingDone' });
                vscode.window.showInformationMessage('Project indexed successfully.');
            } else {
                this._view?.webview.postMessage({ command: 'indexingFailed' });
                vscode.window.showErrorMessage('Indexing failed.');
            }
        });
    }

    private _getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prompt Engineer</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .section-label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }

        .file-badge {
            font-size: 12px;
            color: var(--vscode-textLink-foreground);
            background: var(--vscode-badge-background);
            padding: 2px 8px;
            border-radius: 10px;
            display: inline-block;
        }

        textarea {
            width: 100%;
            min-height: 80px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 8px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            resize: vertical;
            outline: none;
        }

        textarea:focus {
            border-color: var(--vscode-focusBorder);
        }

        button {
            width: 100%;
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-family: var(--vscode-font-family);
            transition: opacity 0.2s;
        }

        button:hover {
            opacity: 0.85;
        }

        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-success {
            background: #2ea043;
            color: white;
        }

        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn-danger {
            background: #da3633;
            color: white;
        }

        .refined-box {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 8px;
            font-size: 12px;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 300px;
            overflow-y: auto;
        }

        .action-buttons {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .status {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            padding: 8px;
        }

        .divider {
            border: none;
            border-top: 1px solid var(--vscode-widget-border);
        }

        #refined-section {
            display: none;
            flex-direction: column;
            gap: 8px;
        }

        #edit-area {
            display: none;
        }
    </style>
</head>
<body>

    <!-- Current File -->
    <div>
        <div class="section-label">Current File</div>
        <span class="file-badge" id="current-file">Detecting...</span>
    </div>

    <hr class="divider">

    <!-- User Prompt Input -->
    <div>
        <div class="section-label">Your Prompt</div>
        <textarea 
            id="user-prompt" 
            placeholder="Type your rough prompt here... e.g. fix the auth bug"
        ></textarea>
    </div>

    <button class="btn-primary" id="engineer-btn">
        ⚡ Engineer Prompt
    </button>

    <div id="status" class="status" style="display:none"></div>

    <hr class="divider">

    <!-- Refined Prompt Output -->
    <div id="refined-section">
        <div class="section-label">Refined Prompt</div>
        <div class="refined-box" id="refined-output"></div>

        <!-- Edit area (hidden by default) -->
        <textarea id="edit-area" placeholder="Edit the refined prompt..."></textarea>

        <!-- Action buttons -->
        <div class="action-buttons">
            <button class="btn-success" id="accept-btn">
                ✅ Copy & Send to Agent
            </button>
            <button class="btn-secondary" id="edit-btn">
                ✏️ Edit Before Sending
            </button>
            <button class="btn-danger" id="reject-btn">
                ❌ Reject — Try Again
            </button>
        </div>
    </div>

    <hr class="divider">

    <!-- Re-index Button -->
    <button class="btn-secondary" id="reindex-btn">
        🔄 Re-index Project
    </button>

    <script>
        const vscode = acquireVsCodeApi();
        let currentFile = '';
        let refinedPrompt = '';
        let isEditing = false;

        vscode.postMessage({ command: 'getCurrentFile' });

        document.getElementById('engineer-btn').addEventListener('click', () => {
            const prompt = document.getElementById('user-prompt').value.trim();
            if (!prompt) {
                showStatus('Please enter a prompt first.');
                return;
            }

            document.getElementById('engineer-btn').disabled = true;
            document.getElementById('refined-section').style.display = 'none';
            showStatus('⚙️ Engineering your prompt...');

            vscode.postMessage({
                command: 'engineerPrompt',
                userPrompt: prompt,
                currentFile: currentFile
            });
        });

        document.getElementById('accept-btn').addEventListener('click', () => {
            const textToSend = isEditing
                ? document.getElementById('edit-area').value
                : refinedPrompt;

            vscode.postMessage({
                command: 'acceptPrompt',
                refinedPrompt: textToSend
            });

            setTimeout(() => {
                document.getElementById('user-prompt').value = '';
                document.getElementById('refined-section').style.display = 'none';
                document.getElementById('edit-area').style.display = 'none';
                isEditing = false;
            }, 500);
        });

        document.getElementById('edit-btn').addEventListener('click', () => {
            const editArea = document.getElementById('edit-area');
            if (!isEditing) {
                editArea.value = refinedPrompt;
                editArea.style.display = 'block';
                document.getElementById('edit-btn').textContent = '💾 Done Editing';
                isEditing = true;
            } else {
                editArea.style.display = 'none';
                document.getElementById('edit-btn').textContent = '✏️ Edit Before Sending';
                isEditing = false;
            }
        });

        document.getElementById('reject-btn').addEventListener('click', () => {
            document.getElementById('refined-section').style.display = 'none';
            document.getElementById('edit-area').style.display = 'none';
            document.getElementById('user-prompt').value = '';
            document.getElementById('user-prompt').focus();
            isEditing = false;
            hideStatus();
        });

        document.getElementById('reindex-btn').addEventListener('click', () => {
            document.getElementById('reindex-btn').disabled = true;
            showStatus('🔄 Indexing project...');
            vscode.postMessage({ command: 'reindex' });
        });

        window.addEventListener('message', (event) => {
            const message = event.data;

            switch (message.command) {
                case 'currentFile':
                    currentFile = message.file;
                    document.getElementById('current-file').textContent = message.file;
                    break;

                case 'loading':
                    showStatus('⚙️ Engineering your prompt...');
                    break;

                case 'refinedPrompt':
                    refinedPrompt = message.prompt;
                    document.getElementById('refined-output').textContent = message.prompt;
                    document.getElementById('refined-section').style.display = 'flex';
                    document.getElementById('engineer-btn').disabled = false;
                    hideStatus();
                    break;

                case 'error':
                    showStatus('❌ ' + message.message);
                    document.getElementById('engineer-btn').disabled = false;
                    break;

                case 'indexing':
                    showStatus('🔄 Indexing project...');
                    break;

                case 'indexingDone':
                    document.getElementById('reindex-btn').disabled = false;
                    hideStatus();
                    showStatus('✅ Project indexed successfully.');
                    break;

                case 'indexingFailed':
                    document.getElementById('reindex-btn').disabled = false;
                    showStatus('❌ Indexing failed.');
                    break;
            }
        });

        function showStatus(msg) {
            const el = document.getElementById('status');
            el.textContent = msg;
            el.style.display = 'block';
        }

        function hideStatus() {
            document.getElementById('status').style.display = 'none';
        }
    </script>
</body>
</html>`;
    }
}