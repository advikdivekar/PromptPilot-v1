/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.activate = activate;
exports.getBackendPath = getBackendPath;
exports.getPythonPath = getPythonPath;
exports.deactivate = deactivate;
const vscode = __importStar(__webpack_require__(1));
const path = __importStar(__webpack_require__(2));
const cp = __importStar(__webpack_require__(3));
const panel_1 = __webpack_require__(4);
function activate(context) {
    console.log('Prompt Engineer extension activated');
    // Register the sidebar panel provider
    const sidebarProvider = new panel_1.SidebarPanel(context.extensionUri, context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('promptEngineer.sidebar', sidebarProvider));
    // Register the re-index command
    context.subscriptions.push(vscode.commands.registerCommand('promptEngineer.reindex', () => {
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
            }
            else {
                vscode.window.showErrorMessage('Indexing failed. Check the console for details.');
            }
        });
    }));
}
function getBackendPath(context) {
    // Backend sits one level up from the extension folder
    return path.join(context.extensionPath, '..', 'backend');
}
function getPythonPath(backendPath) {
    // Use the venv Python if it exists, otherwise fall back to system Python
    const venvPython = path.join(backendPath, 'venv', 'bin', 'python3');
    return venvPython;
}
function deactivate() { }


/***/ }),
/* 1 */
/***/ ((module) => {

module.exports = require("vscode");

/***/ }),
/* 2 */
/***/ ((module) => {

module.exports = require("path");

/***/ }),
/* 3 */
/***/ ((module) => {

module.exports = require("child_process");

/***/ }),
/* 4 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SidebarPanel = void 0;
const vscode = __importStar(__webpack_require__(1));
const cp = __importStar(__webpack_require__(3));
const path = __importStar(__webpack_require__(2));
const extension_1 = __webpack_require__(0);
class SidebarPanel {
    _view;
    _context;
    _extensionUri;
    constructor(extensionUri, context) {
        this._extensionUri = extensionUri;
        this._context = context;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true
        };
        webviewView.webview.html = this._getHtml();
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'engineerPrompt':
                    await this._runBackend(message.userPrompt, message.currentFile);
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
    _sendCurrentFile() {
        const editor = vscode.window.activeTextEditor;
        const currentFile = editor
            ? path.basename(editor.document.fileName)
            : 'No file open';
        this._view?.webview.postMessage({
            command: 'currentFile',
            file: currentFile
        });
    }
    async _runBackend(userPrompt, currentFile) {
        const backendPath = (0, extension_1.getBackendPath)(this._context);
        const pythonPath = (0, extension_1.getPythonPath)(backendPath);
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
        process.stdout.on('data', (data) => {
            fullOutput += data.toString();
        });
        process.stderr.on('data', (data) => {
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
    async _copyToClipboard(text) {
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage('Refined prompt copied to clipboard. Paste it into your AI agent.');
    }
    async _runIndexer() {
        const backendPath = (0, extension_1.getBackendPath)(this._context);
        const pythonPath = (0, extension_1.getPythonPath)(backendPath);
        this._view?.webview.postMessage({ command: 'indexing' });
        const process = cp.spawn(pythonPath, ['indexer.py'], {
            cwd: backendPath
        });
        process.on('close', (code) => {
            if (code === 0) {
                this._view?.webview.postMessage({ command: 'indexingDone' });
                vscode.window.showInformationMessage('Project indexed successfully.');
            }
            else {
                this._view?.webview.postMessage({ command: 'indexingFailed' });
                vscode.window.showErrorMessage('Indexing failed.');
            }
        });
    }
    _getHtml() {
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
exports.SidebarPanel = SidebarPanel;


/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__(0);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=extension.js.map