<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import PasteImageDialog from '@/components/PasteImageDialog.vue';
import { useNotify } from '@/composables/useNotify';
import { useScreenshot } from '@/composables/useScreenshot';
import {
    decodeQrFromImageData,
    getImageDataFromDataUrl,
    isSameOrigin,
    loadImageDataFromUrl,
} from '@/services/qrScanner';

const { fire, close, showLoading } = useNotify();
const { startScreenshot } = useScreenshot();

const isPasteDialogOpen = ref(false);

const t = (key: Parameters<typeof browser.i18n.getMessage>[0]) =>
    browser.i18n.getMessage(key) || String(key);

const onMessage = (message: { action?: string; imageUrl?: string }) => {
    if (message.action === 'decodeQR' && message.imageUrl) {
        handleImageUrl(message.imageUrl);
    }
    if (message.action === 'screenshotQR') {
        handleScreenshot();
    }
    if (message.action === 'pasteImageQR') {
        isPasteDialogOpen.value = true;
    }
};

onMounted(() => {
    browser.runtime.onMessage.addListener(onMessage);
});

onBeforeUnmount(() => {
    browser.runtime.onMessage.removeListener(onMessage);
});

async function handleImageUrl(imageUrl: string) {
    const origin = window.location.origin;
    const needsProxy = !isSameOrigin(imageUrl, origin);
    if (needsProxy) {
        fire({
            toast: true,
            icon: 'info',
            title: t('fetchingImage'),
            text: t('crossOriginNotice'),
            showCloseButton: true,
            didOpen: () => showLoading(),
        });
    }

    try {
        const imageData = await loadImageDataFromUrl(imageUrl, {
            origin,
            fetchViaProxy: needsProxy ? fetchImageViaProxy : undefined,
        });
        close();
        await decodeAndNotify(imageData);
    } catch (error) {
        close();
        const message = error instanceof Error ? error.message : String(error);
        fire({
            toast: true,
            icon: 'error',
            title: t('imageFetchFailed'),
            text: message,
            showCloseButton: true,
        });
    }
}

async function handleScreenshot() {
    try {
        const base64 = await startScreenshot();
        const imageData = await getImageDataFromDataUrl(base64);
        await decodeAndNotify(imageData);
    } catch (error) {
        const payload = error as { type?: 'warning' | 'error'; message?: string } | null;
        if (payload?.type === 'warning') {
            fire({
                toast: true,
                icon: 'warning',
                title: t('screenshotFailed'),
                text: payload.message,
                showCloseButton: true,
            });
            return;
        }
        if (payload?.type === 'error') {
            fire({
                toast: true,
                icon: 'error',
                title: t('screenshotCancelled'),
                text: payload.message,
                showCloseButton: true,
            });
            return;
        }
        fire({
            toast: true,
            icon: 'error',
            title: t('screenshotFailed'),
            showCloseButton: true,
        });
    }
}

async function decodeAndNotify(imageData: ImageData) {
    fire({
        toast: true,
        icon: 'info',
        title: t('decodingQR'),
        didOpen: () => showLoading(),
        showCloseButton: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const result = decodeQrFromImageData(imageData);
    close();

    if (result) {
        const response = await fire({
            toast: true,
            icon: 'success',
            title: t('recognitionSuccess'),
            text: result,
            showCancelButton: true,
            confirmButtonText: t('openLink'),
            cancelButtonText: t('copyLink'),
            showCloseButton: true,
        });

        if (response.isConfirmed) {
            const url = result.startsWith('http') ? result : `https://${result}`;
            window.open(url, '_blank');
            return;
        }
        if (response.dismiss === 'cancel') {
            await navigator.clipboard.writeText(result);
        }
        return;
    }

    fire({
        toast: true,
        icon: 'warning',
        title: t('recognitionFailed'),
        text: t('noValidQRCode'),
        confirmButtonText: t('confirm'),
        showCloseButton: true,
    });
}

function fetchImageViaProxy(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        browser.runtime.sendMessage({ action: 'fetchImage', url }, (response) => {
            if (browser.runtime.lastError) {
                reject(new Error(browser.runtime.lastError.message || 'Background did not respond.'));
                return;
            }
            if (response?.success && response.dataUrl) {
                resolve(response.dataUrl);
                return;
            }
            reject(new Error(response?.error || t('proxyFetchFailed')));
        });
    });
}
</script>

<template>
    <div class="qr-content-root">
        <PasteImageDialog v-if="isPasteDialogOpen" @close="isPasteDialogOpen = false" />
    </div>
</template>

<style>
.swal2-container {
    z-index: 2147483647 !important;
}

#screenShotContainer,
#toolPanel,
#optionIcoController,
#cutBoxSizePanel,
#optionPanel {
    z-index: 2147483647 !important;
    position: fixed !important;
}

#screenShotContainer {
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}
</style>
