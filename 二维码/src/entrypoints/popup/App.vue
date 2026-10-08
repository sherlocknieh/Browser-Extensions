<script lang="ts" setup>
import { onMounted } from 'vue';
import qrcode from 'qrcode-generator';

const QR_TEXT_KEY = 'qrCodeText';

// 优先使用内存态的 session 存储, 不可用时回退 local
const storageArea = () => browser.storage.session ?? browser.storage.local;
const storageAreaName = () => (browser.storage.session ? 'session' : 'local');

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
  const value = changes[QR_TEXT_KEY]?.newValue;
  if (typeof value === 'string' && value) {
    render(value);
    void storageArea().remove(QR_TEXT_KEY);
  }
}

// Popup 挂载后开始工作
onMounted(async () => {
  // 先监听, 再解析, 以覆盖 background 稍后写入的竞态
  browser.storage.onChanged.addListener(onStorageChanged);
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
  <div id="qrcode-container" class="bg-slate-50 border border-slate-200 rounded-lg shadow-sm"></div>
</template>

<style>
#app {
  /* 使用 Flexbox 布局 */
  display: flex;
  min-height: 100vh;       /* 占满视口高度 */
  justify-content: center; /* 水平居中 */
  align-items: center;     /* 垂直居中 */
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
