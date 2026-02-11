<script lang="ts" setup>
import qrcode from 'qrcode-generator';

// 等待 Popup 页面加载完成后开始工作
document.addEventListener('DOMContentLoaded', async () => {
  // 检查本地储存是否存在 qrCodeText 数据
  const result = await chrome.storage.local.get(['qrCodeText']);
  if (result.qrCodeText) {
    // 有则生成其二维码
    generateQRCode(result.qrCodeText);
    // 使用后清除存储的数据
    await chrome.storage.local.remove('qrCodeText');
  }
  else {
    // 否则生成当前页面URL的二维码
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    generateQRCode(tabs[0].url);
  }
});


// 二维码生成函数
function generateQRCode(text: string) {

  const container = document.getElementById('qrcode-container');
  if (!container) return;
  container.innerHTML = '';  // 清空容器

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
    container.innerHTML = `<div style="color: red;">二维码生成失败:</div><div>${error}</div>`;
  }
}
</script>

<template>
  <div id="qrcode-container"></div>
</template>

<style scoped>
#qrcode-container {
  width: 220px;
  height: 220px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
</style>
