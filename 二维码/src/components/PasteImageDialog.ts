const template = document.createElement('template');
template.innerHTML = `
<style>
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

:host {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

#qr-paste-dialog-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
}

#qr-paste-dialog {
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 480px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
    outline: none;
}

.qr-header {
    text-align: center;
    margin-bottom: 24px;
}

.qr-title {
    margin: 0 0 8px 0;
    color: #333;
    font-size: 20px;
    font-weight: 600;
}

.qr-subtitle {
    margin: 0;
    color: #666;
    font-size: 14px;
}

.qr-drop-zone {
    border: 2px dashed #ccc;
    border-radius: 8px;
    padding: 32px 16px;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s ease;
    background: #fafafa;
    position: relative;
    margin-bottom: 20px;
}

.qr-drop-zone:hover { border-color: #007bff; background: #f0f8ff; }
.qr-drop-zone.dragover { border-color: #007bff; background: #e3f2fd; transform: scale(1.02); }
.qr-drop-zone.has-image { border-style: solid; border-color: #28a745; background: white; cursor: default; }

.qr-upload-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto 16px;
    opacity: 0.6;
}

.qr-upload-text {
    color: #666;
    font-size: 14px;
    margin-bottom: 8px;
}

.qr-upload-hint {
    color: #999;
    font-size: 12px;
}

.qr-image-preview {
    max-width: 100%;
    max-height: 200px;
    object-fit: contain;
    display: none;
    margin: 16px auto;
}

.qr-image-preview.show { display: block; }

.qr-file-input { display: none; }

.qr-loading {
    display: none;
    text-align: center;
    padding: 20px;
}

.qr-loading.show { display: block; }

.qr-spinner {
    border: 3px solid #f3f3f3;
    border-top: 3px solid #007bff;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    animation: spin 1s linear infinite;
    margin: 0 auto 12px;
}

.qr-loading-text {
    font-size: 14px;
    color: #666;
}

.qr-result {
    display: none;
    padding: 16px;
    border-radius: 6px;
    font-size: 13px;
    word-break: break-all;
    margin-top: 16px;
}

.qr-result.success { display: block; background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
.qr-result.error { display: block; background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }

.qr-result-buttons {
    display: flex;
    gap: 8px;
    margin-top: 12px;
}

.qr-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 16px;
}

.qr-btn {
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.qr-btn-primary {
    padding: 8px 24px;
    font-size: 14px;
    font-weight: 500;
    background: #007bff;
    color: white;
}

.qr-btn-secondary {
    padding: 8px 16px;
    font-size: 13px;
    background: #f0f0f0;
    color: #666;
}

.qr-btn-primary:hover:not(:disabled) { background: #0056b3; transform: translateY(-1px); }
.qr-btn-success:hover:not(:disabled) { background: #1e7e34; transform: translateY(-1px); }
.qr-btn-secondary:hover:not(:disabled) { background: #545b62; transform: translateY(-1px); }
.qr-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.qr-mini-btn:hover { opacity: 0.8; }
</style>

<div id="qr-paste-dialog-overlay">
    <div id="qr-paste-dialog">
        <div class="qr-header">
            <h2 class="qr-title" data-i18n="pasteDialogTitle">__MSG_pasteDialogTitle__</h2>
            <p class="qr-subtitle" data-i18n="pasteDialogHint">__MSG_pasteDialogHint__</p>
        </div>

        <div class="qr-drop-zone" id="qr-drop-zone">
            <svg class="qr-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
            </svg>

            <div class="qr-upload-text" data-i18n="dropZoneText">__MSG_dropZoneText__</div>
            <div class="qr-upload-hint" data-i18n="dropZoneHint">__MSG_dropZoneHint__</div>

            <img class="qr-image-preview" id="qr-image-preview">
            <input class="qr-file-input" type="file" id="qr-file-input" accept="image/*">
        </div>

        <div class="qr-loading" id="qr-loading">
            <div class="qr-spinner"></div>
            <div class="qr-loading-text" data-i18n="scanningText">__MSG_scanningText__</div>
        </div>

        <div class="qr-result" id="qr-result">
            <div id="qr-result-text"></div>
            <div class="qr-result-buttons" id="qr-result-buttons"></div>
        </div>

        <div class="qr-actions">
            <button class="qr-btn qr-btn-secondary" id="qr-clear-btn" data-i18n="clearImageBtn">__MSG_clearImageBtn__</button>
            <button class="qr-btn qr-btn-primary" id="qr-close-btn" data-i18n="closeBtn">__MSG_closeBtn__</button>
        </div>
    </div>
</div>
`;

class PasteImageDialog extends HTMLElement {
    connectedCallback() {
        if (this.shadowRoot) return;
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.appendChild(template.content.cloneNode(true));
    }
}

export function registerPasteImageDialog() {
    if (!customElements.get('qr-paste-dialog')) {
        customElements.define('qr-paste-dialog', PasteImageDialog);
    }
}
