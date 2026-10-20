<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import qrcode from 'qrcode-generator';
import { decodeQrFromImageData, getImageDataFromDataUrl } from '@/services/qrScanner';
import { isLinkText, toOpenableUrl } from '@/services/linkText';
import { useNotify } from '@/composables/useNotify';
import NotifyHost from '@/components/NotifyHost.vue';

// 设置 qrcode 库使用 UTF-8 编码, 避免汉字乱码问题
qrcode.stringToBytes = (s: string) => Array.from(new TextEncoder().encode(s));

const QR_TEXT_KEY = 'qrCodeText';
// SVG 等非 HTML 页面无法使用内容脚本弹窗, 由 background 把图片地址写入该键
const QR_IMAGE_KEY = 'qrImageUrl';
// PDF 等无法注入内容脚本的页面, 由 background 写入该标记, 改为截取当前视口识别
const CAPTURE_KEY = 'qrCaptureScan';

// 优先使用内存态的 session 存储, 不可用时回退 local
const storageArea = () => browser.storage.session ?? browser.storage.local;
const storageAreaName = () => (browser.storage.session ? 'session' : 'local');

const { fire, close, showLoading } = useNotify();

const t = (key: Parameters<typeof browser.i18n.getMessage>[0]) =>
  browser.i18n.getMessage(key) || String(key);

let scanning = false;
// 扫描期间隐藏二维码占位和 PDF 提示
const scanActive = ref(false);
// 当前页面是 PDF 时显示“识别当前视口”入口
const pdfMode = ref(false);

// 读取右键菜单写入的临时图片地址, 读取后立即清除
async function takeStoredImageUrl(): Promise<string> {
  const storage = storageArea();
  const result = await storage.get(QR_IMAGE_KEY);
  const value = result?.[QR_IMAGE_KEY];
  if (typeof value === 'string' && value) {
    await storage.remove(QR_IMAGE_KEY);
    return value;
  }
  return '';
}

// 读取并清除一次性的布尔标记
async function takeStoredFlag(key: string): Promise<boolean> {
  const storage = storageArea();
  const result = await storage.get(key);
  if (!result?.[key]) return false;
  await storage.remove(key);
  return true;
}

// 读取右键菜单写入的临时文本, 读取后立即清除, 避免污染下次打开
async function takeStoredText(): Promise<string> {
  const storage = storageArea();
  const result = await storage.get(QR_TEXT_KEY);
  const value = result?.[QR_TEXT_KEY];
  if (typeof value === 'string' && value) {
    await storage.remove(QR_TEXT_KEY);
    return value;
  }
  return '';
}

// 优先 URL hash(新标签页兜底), 其次临时存储, 最后当前标签页 URL
async function resolveQrText(): Promise<string> {
  const storedText = await takeStoredText();
  const hashText = new URLSearchParams(location.hash.slice(1)).get('text') ?? '';
  if (hashText) return hashText;
  if (storedText) return storedText;

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.url ?? '';
}

// 读取图片并转换为 Data URL: 优先直接请求(右键菜单已通过 activeTab 授权当前站点),
// 失败时再交给 background 代理, 以兼容不允许扩展直接访问的地址。
async function fetchAsDataUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await blobToDataUrl(await response.blob());
  } catch {
    return fetchViaBackground(url);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Read failed.'));
    reader.readAsDataURL(blob);
  });
}

function fetchViaBackground(url: string): Promise<string> {
  return browser.runtime
    .sendMessage({ action: 'fetchImage', url })
    .then((response?: { success?: boolean; dataUrl?: string; error?: string }) => {
      if (response?.success && response.dataUrl) return response.dataUrl;
      throw new Error(response?.error || t('imageFetchFailed'));
    });
}

// 识别图片并展示结果, 交互与内容脚本保持一致
async function decodeAndShow(getDataUrl: () => Promise<string>, errorTitle: string) {
  fire({
    toast: true,
    icon: 'info',
    title: t('decodingQR'),
    didOpen: () => showLoading(),
    showCloseButton: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 50));

  let result: string | null;
  try {
    const imageData = await getImageDataFromDataUrl(await getDataUrl());
    result = decodeQrFromImageData(imageData);
  } catch (error) {
    close();
    fire({
      toast: true,
      icon: 'error',
      title: errorTitle,
      text: error instanceof Error ? error.message : String(error),
      showCloseButton: true,
    });
    return;
  }

  close();
  if (!result) {
    await fire({
      toast: false,
      icon: 'warning',
      title: t('recognitionFailed'),
      text: t('recognitionFailedMsg'),
      confirmButtonText: t('confirm'),
      showCloseButton: true,
    });
    return;
  }

  // 文字结果没有可打开的链接, 只提供复制操作
  const isLink = isLinkText(result);

  const response = await fire({
    toast: false,
    icon: 'success',
    title: t('recognitionSuccess'),
    text: result,
    showCancelButton: isLink,
    confirmButtonText: isLink ? t('openLink') : t('copyContent'),
    cancelButtonText: isLink ? t('copyLink') : undefined,
    showCloseButton: true,
  });

  if (isLink) {
    if (response.isConfirmed) {
      window.open(toOpenableUrl(result), '_blank');
      return;
    }
    if (response.dismiss === 'cancel') {
      await navigator.clipboard.writeText(result);
    }
    return;
  }

  if (response.isConfirmed) {
    await navigator.clipboard.writeText(result);
  }
}

function scanImage(imageUrl: string) {
  return decodeAndShow(() => loadImageDataUrl(imageUrl), t('imageFetchFailed'));
}

// Firefox 中扩展页面和后台脚本都无法 fetch file: 地址，
// 本地图片读取失败时退回截取当前标签页(图片文档会完整显示在视口中)。
async function loadImageDataUrl(imageUrl: string): Promise<string> {
  try {
    return await fetchAsDataUrl(imageUrl);
  } catch (error) {
    if (!imageUrl.startsWith('file:')) throw error;
    return captureVisibleTab();
  }
}

// PDF 查看器等页面没有内容脚本, 改为截取当前视口识别
function captureVisibleTab(): Promise<string> {
  return browser.runtime
    .sendMessage({ action: 'captureVisibleTab' })
    .then((response?: { success?: boolean; dataUrl?: string; error?: string }) => {
      if (response?.success && response.dataUrl) return response.dataUrl;
      throw new Error(response?.error || t('screenshotFailedMsg'));
    });
}

function startCapture() {
  if (scanning) return;
  scanning = true;
  scanActive.value = true;
  prepareScanView();
  void decodeAndShow(captureVisibleTab, t('screenshotFailed'));
}

function prepareScanView() {
  // 扫描结果弹窗需要更宽的展示空间
  document.documentElement.style.minWidth = '360px';
  if (document.body) document.body.style.minHeight = '220px';
}

function startScan(imageUrl: string) {
  if (scanning) return;
  scanning = true;
  scanActive.value = true;
  prepareScanView();
  void scanImage(imageUrl);
}

let currentText = '';

// 避免重复渲染相同内容
function render(text: string) {
  if (!text || text === currentText) return;
  currentText = text;
  generateQRCode(text);
}

// background 在用户手势中同步打开 popup, 临时文本可能稍后才写入, 需监听变更刷新
function onStorageChanged(
  changes: Record<string, { newValue?: unknown }>,
  areaName: string,
) {
  if (areaName !== storageAreaName()) return;
  // PDF 等页面要求截取当前视口
  if (changes[CAPTURE_KEY]?.newValue) {
    startCapture();
    void storageArea().remove(CAPTURE_KEY);
    return;
  }
  // 非 HTML 页面传入的图片地址优先处理
  const imageUrl = changes[QR_IMAGE_KEY]?.newValue;
  if (typeof imageUrl === 'string' && imageUrl) {
    startScan(imageUrl);
    void storageArea().remove(QR_IMAGE_KEY);
    return;
  }
  const value = changes[QR_TEXT_KEY]?.newValue;
  if (typeof value === 'string' && value) {
    render(value);
    void storageArea().remove(QR_TEXT_KEY);
  }
}

// 判断标签页是否为 PDF 文档; 浏览器内置 PDF 查看器页面无法注入内容脚本
function isPdfUrl(url?: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

// Popup 挂载后开始工作
onMounted(async () => {
  // 先监听, 再解析, 以覆盖 background 稍后写入的竞态
  browser.storage.onChanged.addListener(onStorageChanged);
  if (await takeStoredFlag(CAPTURE_KEY)) {
    startCapture();
    return;
  }
  const imageUrl = await takeStoredImageUrl();
  if (imageUrl) {
    startScan(imageUrl);
    return;
  }

  // 直接点击工具栏图标时, 若当前是 PDF 页面则提供“识别当前视口”入口
  const hashText = new URLSearchParams(location.hash.slice(1)).get('text');
  if (!hashText) {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (isPdfUrl(tab?.url)) {
      pdfMode.value = true;
      return;
    }
  }
  render(await resolveQrText());
});


// 二维码生成函数
function generateQRCode(text: string) {

  const container = document.getElementById('qrcode-container');
  if (!container) return;
  container.replaceChildren();  // 清空容器

  try {
    // 使用 qrcode 库生成二维码
    const qr = qrcode(0, 'M'); // 二维码大小:自动, 容错级别:中等
    qr.addData(text);          // 传入原数据
    qr.make();                 // 生成二维码

    // 生成 PNG 图片
    const moduleCount = qr.getModuleCount();    // 获取二维码矩阵尺寸
    const cellSize = 8;                         // 每个点块的像素大小
    const margin = cellSize * 2;                // 设置白边宽度
    const totalSize = (moduleCount * cellSize) + (margin * 2); // 最终图片尺寸

    // 创建 Canvas 用来生成 PNG
    const canvas = document.createElement('canvas');
    canvas.width = totalSize;
    canvas.height = totalSize;

    // 获取 2D 绘图上下文
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法获取Canvas 2D上下文');
    };

    // 绘制白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalSize, totalSize);

    // 绘制黑色色块
    ctx.fillStyle = '#000000';
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) {
          const x = margin + col * cellSize;
          const y = margin + row * cellSize;
          ctx.fillRect(x, y, cellSize, cellSize);
        }
      }
    }

    // 生成 PNG 格式的数据链接
    const dataURL = canvas.toDataURL('image/png');

    // 创建 img 元素显示二维码
    const img = document.createElement('img');
    img.src = dataURL;                        // PNG格式的base64数据
    img.style.display = 'block';              // 去除图片下方空白缝隙
    img.style.width = '100%';                 // 自适应容器宽度
    img.style.imageRendering = 'pixelated';   // 保持像素清晰
    img.title = text;                         // 鼠标悬停显示原始文本
    img.alt = '二维码加载失败';               // 加载失败时的替代文本
    container.appendChild(img);

  } catch (error) {
    const title = document.createElement('div');
    title.style.color = 'red';
    title.textContent = '二维码生成失败:';
    const detail = document.createElement('div');
    detail.textContent = String(error);
    container.replaceChildren(title, detail);
  }
}
</script>

<template>
  <div
    v-if="!pdfMode && !scanActive"
    id="qrcode-container"
    class="bg-slate-50 border border-slate-200 rounded-lg shadow-sm"
  ></div>
  <div v-if="pdfMode && !scanActive" class="pdf-scan">
    <p class="pdf-scan-hint">{{ t('pdfScanHint') }}</p>
    <button type="button" class="pdf-scan-button" @click="startCapture">
      {{ t('pdfScanButton') }}
    </button>
  </div>
  <NotifyHost embedded />
</template>

<style>
body {
  margin: 0; /* 去掉默认的 margin */
}

#app {
  /* 使用 Flexbox 布局 */
  display: flex;
  min-height: 100vh;       /* 占满视口高度 */
  justify-content: center; /* 水平居中 */
  align-items: center;     /* 垂直居中 */
}

.pdf-scan {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 220px;
  padding: 12px;
  box-sizing: border-box;
}

.pdf-scan-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #475569;
}

.pdf-scan-button {
  padding: 8px 10px;
  font-size: 13px;
  color: #fff;
  background: #2563eb;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}

.pdf-scan-button:hover {
  background: #1d4ed8;
}
</style>

<style scoped>
#qrcode-container {
  /* 固定长宽 */
  width: 220px;
  height: 220px;
  /* 内容居中 */
  display: flex;
  justify-content: center;
  align-items: center;
  /* 垂直排列 */
  flex-direction: column; 
}
</style>