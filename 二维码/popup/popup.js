// 已在 html 中引入 qrcode 库, 全局可用


// 等待 Popup 内容加载完成并开始工作
document.addEventListener('DOMContentLoaded', async () => {
  chrome.storage.local.get(['qrCodeText'], (result) => {
  // 检查本地储存
    if (result.qrCodeText) {
      // 有相应数据则生成二维码
      generateQRCode(result.qrCodeText);
      // 使用后清除存储的数据
      chrome.storage.local.remove('qrCodeText');
    } else {
      // 否则生成当前页面URL的二维码
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) { 
          console.log('生成当前页面URL二维码:', tabs[0].url);
          generateQRCode(tabs[0].url);
        }
      });
    }
  });
});


// 二维码生成函数
function generateQRCode(text) {

  const container = document.getElementById('qrcode-container');
  container.innerHTML = '';  // 清空容器
  
  try {
    // 使用 qrcode 库生成二维码
    const qr = qrcode(0, 'M'); // 二维码大小:自动, 纠错级别:中等
    qr.addData(text);          // 传入原数据
    qr.make();                 // 生成二维码
    
    // 生成 PNG 格式的二维码图片
    const cellSize = 8;                       // 每个点块8px
    const margin = cellSize * 2;              // 白边宽2个点块
    const moduleCount = qr.getModuleCount();  // 获取点块数量
    const totalSize = (moduleCount * cellSize) + (margin * 2);
    
    // 创建Canvas来生成PNG格式
    const canvas = document.createElement('canvas');
    canvas.width = totalSize;
    canvas.height = totalSize;
    const ctx = canvas.getContext('2d');
    
    // 设置白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalSize, totalSize);
    
    // 绘制黑色二维码模块
    ctx.fillStyle = '#000000';
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(
            margin + col * cellSize,
            margin + row * cellSize,
            cellSize,
            cellSize
          );
        }
      }
    }
    
    // 转换为PNG格式的DataURL
    const dataURL = canvas.toDataURL('image/png');
    
    // 创建 img 元素显示二维码
    const img = document.createElement('img');
    img.src = dataURL;                       // PNG格式的base64数据
    img.style.display = 'block';             // 去除图片下方空白缝隙
    img.style.width = '100%';
    img.style.imageRendering = 'pixelated';  // 保持像素清晰
    img.alt = '二维码 (PNG格式)';
    img.title = '右键可在新标签中打开PNG图片';
    container.appendChild(img);
    
  } catch (error) {
    console.error('生成二维码失败:', error);
    container.innerHTML = '<p style="color: red;">生成二维码失败</p>';
  }
}