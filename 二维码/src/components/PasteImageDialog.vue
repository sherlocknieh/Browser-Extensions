<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import {
    decodeQrFromImageData,
    getImageDataFromDataUrl,
    getImageDataFromImageElement,
} from '@/services/qrScanner';

const emit = defineEmits<{ (event: 'close'): void }>();

const t = (key: Parameters<typeof browser.i18n.getMessage>[0]) =>
    browser.i18n.getMessage(key) || String(key);

const dropZoneRef = ref<HTMLElement | null>(null);
const dialogRef = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const imagePreviewRef = ref<HTMLImageElement | null>(null);

const currentImageData = ref<string | null>(null);
const isLoading = ref(false);
const resultType = ref<'success' | 'error' | null>(null);
const resultMessage = ref('');
const resultData = ref('');
const copyLabel = ref(t('copyContent'));

const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/gif', 'image/webp'];

const hasImage = computed(() => Boolean(currentImageData.value));
const isSuccess = computed(() => resultType.value === 'success');
const canOpenLink = computed(() => isSuccess.value && /\.|^https?:/i.test(resultData.value));

function closeDialog() {
    emit('close');
}

function clearResult() {
    resultType.value = null;
    resultMessage.value = '';
    resultData.value = '';
    copyLabel.value = t('copyContent');
}

function showError(message: string) {
    resultType.value = 'error';
    resultMessage.value = message;
    resultData.value = '';
}

function showSuccess(data: string) {
    resultType.value = 'success';
    resultData.value = data;
    resultMessage.value = `${t('recognitionSuccessTitle')}${data}`;
    copyLabel.value = t('copyContent');
}

function clearImage() {
    currentImageData.value = null;
    clearResult();
    if (imagePreviewRef.value) {
        imagePreviewRef.value.src = '';
    }
    if (fileInputRef.value) {
        fileInputRef.value.value = '';
    }
}

function openFilePicker() {
    if (hasImage.value) return;
    fileInputRef.value?.click();
}

function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (!file) return;
    if (supportedTypes.includes(file.type.toLowerCase())) {
        loadImageFromBlob(file);
    } else {
        showError(`${t('unsupportedFormat')}${file.type || t('formatUnknown')}`);
    }
}

function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (!hasImage.value) {
        dropZoneRef.value?.classList.add('dragover');
    }
}

function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    dropZoneRef.value?.classList.remove('dragover');
}

function handleDrop(event: DragEvent) {
    event.preventDefault();
    dropZoneRef.value?.classList.remove('dragover');
    if (hasImage.value) return;
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
        showError(t('dragDropImageOnly'));
        return;
    }
    const file = files[0];
    if (supportedTypes.includes(file.type.toLowerCase())) {
        loadImageFromBlob(file);
    } else {
        showError(`${t('unsupportedFormat')}${file.type || t('formatUnknown')}`);
    }
}

function handlePasteEvent(event: ClipboardEvent) {
    if (!event.clipboardData) return;
    const items = event.clipboardData.items;
    for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
                event.preventDefault();
                loadImageFromBlob(file);
                return;
            }
        }
    }
}

async function handlePasteShortcut() {
    try {
        if (!navigator.clipboard || !navigator.clipboard.read) {
            showError(t('unknownError'));
            return;
        }
        const clipboardItems = await navigator.clipboard.read();
        for (const clipboardItem of clipboardItems) {
            for (const type of clipboardItem.types) {
                if (type.startsWith('image/')) {
                    const blob = await clipboardItem.getType(type);
                    loadImageFromBlob(blob);
                    return;
                }
            }
        }
        showError(t('clipboardNoImage'));
    } catch (error) {
        showError(t('unknownError'));
    }
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
        closeDialog();
        return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === 'v' || event.key === 'V')) {
        event.preventDefault();
        handlePasteShortcut();
    }
}

function loadImageFromBlob(blob: Blob) {
    const reader = new FileReader();
    reader.onload = async (e: ProgressEvent<FileReader>) => {
        const result = e.target?.result;
        if (typeof result !== 'string') {
            showError(t('imageLoadFailed'));
            return;
        }
        currentImageData.value = result;
        clearResult();
        await nextTick();
        scanQRCode();
    };
    reader.onerror = () => showError(t('imageLoadFailed'));
    reader.readAsDataURL(blob);
}

async function getImageData() {
    if (imagePreviewRef.value) {
        const img = imagePreviewRef.value;
        if (!img.complete || img.naturalWidth === 0) {
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('Image load failed.'));
            });
        }
        return getImageDataFromImageElement(img);
    }
    if (!currentImageData.value) {
        throw new Error('Image data is empty.');
    }
    return getImageDataFromDataUrl(currentImageData.value);
}

async function scanQRCode() {
    if (!currentImageData.value) return;
    isLoading.value = true;
    clearResult();
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
        const imageData = await getImageData();
        const code = decodeQrFromImageData(imageData);
        if (code) {
            showSuccess(code);
        } else {
            showError(t('recognitionFailedMsg'));
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showError(`${t('recognitionFailed')}: ${message}`);
    } finally {
        isLoading.value = false;
    }
}

function openLink() {
    if (!resultData.value) return;
    let url = resultData.value.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) {
            url = `https://${url}`;
        } else {
            url = `https://www.google.com/search?q=${encodeURIComponent(resultData.value)}`;
        }
    }
    try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error('Unsupported protocol.');
        }
        window.open(url, '_blank');
    } catch (error) {
        showError(t('unknownError'));
    }
}

async function copyResult() {
    if (!resultData.value) return;
    await navigator.clipboard.writeText(resultData.value);
    copyLabel.value = t('alreadyCopied');
    setTimeout(() => {
        copyLabel.value = t('copyContent');
    }, 2000);
}

onMounted(() => {
    document.addEventListener('keydown', handleKeydown);
    dialogRef.value?.focus();
});

onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
    <div class="qr-paste-dialog-overlay" @click.self="closeDialog" @paste="handlePasteEvent">
        <div ref="dialogRef" class="qr-paste-dialog" tabindex="-1">
            <div class="qr-header">
                <h2 class="qr-title">{{ t('pasteDialogTitle') }}</h2>
                <p class="qr-subtitle">{{ t('pasteDialogHint') }}</p>
            </div>

            <div
                ref="dropZoneRef"
                class="qr-drop-zone"
                :class="{ 'has-image': hasImage }"
                @dragover="handleDragOver"
                @dragleave="handleDragLeave"
                @drop="handleDrop"
                @click="openFilePicker"
            >
                <svg v-if="!hasImage" class="qr-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>

                <div v-if="!hasImage" class="qr-upload-text">{{ t('dropZoneText') }}</div>
                <div v-if="!hasImage" class="qr-upload-hint">{{ t('dropZoneHint') }}</div>

                <img ref="imagePreviewRef" class="qr-image-preview" :class="{ show: hasImage }" :src="currentImageData || ''" />
                <input ref="fileInputRef" class="qr-file-input" type="file" accept="image/*" @change="handleFileChange" />
            </div>

            <div class="qr-loading" :class="{ show: isLoading }">
                <div class="qr-spinner"></div>
                <div class="qr-loading-text">{{ t('scanningText') }}</div>
            </div>

            <div v-if="resultType" class="qr-result" :class="resultType">
                <div>{{ resultMessage }}</div>
                <div v-if="isSuccess" class="qr-result-buttons">
                    <button v-if="canOpenLink" class="qr-mini-btn qr-mini-btn-open" @click="openLink">
                        {{ t('openLink') }}
                    </button>
                    <button class="qr-mini-btn qr-mini-btn-copy" @click="copyResult">
                        {{ copyLabel }}
                    </button>
                </div>
            </div>

            <div class="qr-actions">
                <button class="qr-btn qr-btn-secondary" @click="clearImage">
                    {{ t('clearImageBtn') }}
                </button>
                <button class="qr-btn qr-btn-primary" @click="closeDialog">
                    {{ t('closeBtn') }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.qr-paste-dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
}

.qr-paste-dialog {
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
    padding: 16px;
    border-radius: 6px;
    font-size: 13px;
    word-break: break-all;
    margin-top: 16px;
}

.qr-result.success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
.qr-result.error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }

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
.qr-btn-secondary:hover:not(:disabled) { background: #545b62; transform: translateY(-1px); }
.qr-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.qr-mini-btn {
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.qr-mini-btn-open { background: #007bff; color: white; }
.qr-mini-btn-copy { background: #6c757d; color: white; }
.qr-mini-btn:hover { opacity: 0.8; }
</style>
