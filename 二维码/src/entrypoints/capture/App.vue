<script lang="ts" setup>
import { onMounted, ref } from 'vue';

import NotifyHost from '@/components/NotifyHost.vue';
import ScreenshotOverlay from '@/components/ScreenshotOverlay.vue';
import { useNotify } from '@/composables/useNotify';
import { isLinkText, toOpenableUrl } from '@/services/linkText';
import {
    decodeQrFromImageData,
    getImageDataFromDataUrl,
    type DecodeResult,
} from '@/services/qrScanner';

// background 截取视口后写入该键, 本页面读取后立即清除
const CAPTURE_IMAGE_KEY = 'qrCaptureImage';

// 优先使用内存态的 session 存储, 不可用时回退 local
const storageArea = () => browser.storage.session ?? browser.storage.local;

const { fire, close, showLoading } = useNotify();

const t = (key: Parameters<typeof browser.i18n.getMessage>[0]) =>
    browser.i18n.getMessage(key) || String(key);

// 截图数据; 确认框选后清空以卸载框选界面
const src = ref('');

async function takeStoredImage(): Promise<string> {
    const storage = storageArea();
    const result = await storage.get(CAPTURE_IMAGE_KEY);
    const value = result?.[CAPTURE_IMAGE_KEY];
    if (typeof value === 'string' && value) {
        await storage.remove(CAPTURE_IMAGE_KEY);
        return value;
    }
    return '';
}

// 标签页由扩展创建, 通常可直接关闭; 不允许时通过后台 API 关闭
function closeTab() {
    window.close();
    void browser.tabs
        .getCurrent()
        .then((tab) => (tab?.id != null ? browser.tabs.remove(tab.id) : undefined))
        .catch(() => {
            // 标签页已关闭时忽略
        });
}

async function showError(title: string, text?: string) {
    await fire({
        toast: false,
        icon: 'error',
        title,
        text,
        confirmButtonText: t('confirm'),
        showCloseButton: true,
    });
}

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        // 复制失败时保持安静, 避免再叠一层通知
    }
}

async function showResult(result: DecodeResult) {
    const isLink = isLinkText(result.text);
    const response = await fire({
        toast: false,
        icon: 'success',
        title: t(result.kind === 'barcode' ? 'barcodeScanSuccess' : 'qrcodeScanSuccess'),
        text: result.text,
        showCancelButton: isLink,
        confirmButtonText: isLink ? t('openLink') : t('copyContent'),
        cancelButtonText: isLink ? t('copyLink') : undefined,
        showCloseButton: true,
    });

    if (response.isConfirmed) {
        if (isLink) {
            window.open(toOpenableUrl(result.text), '_blank');
        } else {
            await copyText(result.text);
        }
    } else if (response.dismiss === 'cancel' && isLink) {
        await copyText(result.text);
    }

    closeTab();
}

async function handleConfirm(dataUrl: string) {
    src.value = '';
    void fire({
        toast: true,
        icon: 'info',
        title: t('decodingQR'),
        didOpen: () => showLoading(),
        showCloseButton: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    let result: DecodeResult | null;
    try {
        result = await decodeQrFromImageData(await getImageDataFromDataUrl(dataUrl));
    } catch (error) {
        close();
        await showError(
            t('screenshotFailed'),
            error instanceof Error ? error.message : String(error),
        );
        closeTab();
        return;
    }

    close();

    if (!result) {
        await showError(t('recognitionFailed'), t('recognitionFailedMsg'));
        closeTab();
        return;
    }

    await showResult(result);
}

async function handleLoadError() {
    await showError(t('screenshotFailed'), t('screenshotFailedMsg'));
    closeTab();
}

onMounted(async () => {
    document.title = t('appName');
    try {
        const stored = await takeStoredImage();
        if (!stored) {
            await handleLoadError();
            return;
        }
        src.value = stored;
    } catch (error) {
        await showError(
            t('screenshotFailed'),
            error instanceof Error ? error.message : String(error),
        );
        closeTab();
    }
});
</script>

<template>
    <ScreenshotOverlay
        v-if="src"
        :src="src"
        @confirm="handleConfirm"
        @cancel="closeTab"
        @error="handleLoadError"
    />
    <NotifyHost />
</template>
