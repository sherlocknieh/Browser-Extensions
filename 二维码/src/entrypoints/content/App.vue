<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

// 非UI组件
import {
    decodeQrFromImageData,
    getImageDataFromDataUrl,
    isSameOrigin,
    loadImageDataFromUrl,
} from '@/services/qrScanner';

// UI组件
import PasteImageDialog from '@/components/PasteImageDialog.vue';
import { useNotify } from '@/composables/useSweetAlert2';
import { useScreenshot } from '@/composables/useScreenshot';



const { fire, close, showLoading } = useNotify();
const { startScreenshot } = useScreenshot();


// 图片粘贴对话框的开关变量
const isPasteDialogOpen = ref(false);

// 国际化文本获取函数，提供默认值以防止缺失翻译导致的显示问题
const t = (key: Parameters<typeof browser.i18n.getMessage>[0]) =>
    browser.i18n.getMessage(key) || String(key);

// 内容脚本的主流程函数，根据不同的消息类型调用相应的处理逻辑
const mainProcess = (message: { action?: string; imageUrl?: string }) => {
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

// 当组件挂载时，注册消息监听器，等待来自背景脚本的指令
onMounted(() => {
    browser.runtime.onMessage.addListener(mainProcess);
});

// 当组件卸载时，移除消息监听器，避免内存泄漏
onBeforeUnmount(() => {
    browser.runtime.onMessage.removeListener(mainProcess);
});


// 网页图片处理流程
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

// 截图识别流程
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

// 解码过程+通知流程
async function decodeAndNotify(imageData: ImageData) {
    // 显示正在识别的通知
    fire({
        toast: true,
        icon: 'info',
        title: t('decodingQR'),
        didOpen: () => showLoading(),
        showCloseButton: true,
    });

    // 等待短暂时间以确保通知显示后再进行计算密集型的识别操作，避免界面卡顿
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 调用二维码识别函数，获取识别结果
    const result = decodeQrFromImageData(imageData);
    close();// 关闭正在识别的通知

    if (result) {
        const response = await fire({
            toast: false,
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
        toast: false,
        icon: 'warning',
        title: t('recognitionFailed'),
        text: t('noValidQRCode'),
        confirmButtonText: t('confirm'),
        showCloseButton: true,
    });
}

// 跨域图片获取流程，通过向背景脚本发送消息请求代理获取图片数据
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


#screenShotContainer {
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 9999 !important;
    position: fixed !important;
}
</style>
