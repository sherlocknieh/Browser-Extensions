// 监听来自background.js的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "decodeQR" && message.imageUrl) {
    decodeQRCode(message.imageUrl);
  } else if (message.action === "getContextInfo") {
    // 响应右键上下文信息请求
    const contextInfo = getContextInfo();
    sendResponse(contextInfo);
  }
});

// 检测右键上下文信息
function getContextInfo() {
  const selection = window.getSelection();
  const selectedText = selection.toString();
  
  return {
    hasSelection: selectedText.length > 0,
    selectionText: selectedText,
    isOnLink: false // 这个在右键事件中会被更新
  };
}

// 监听右键点击事件，获取详细上下文信息
let lastRightClickTarget = null;
let lastRightClickInfo = null;
let lastContextUpdateTime = 0;

document.addEventListener('contextmenu', function(event) {
  // 防止过于频繁的更新（限制在300ms内最多更新一次）
  const now = Date.now();
  if (now - lastContextUpdateTime < 300) {
    return;
  }
  
  lastRightClickTarget = event.target;
  
  // 检查是否点击在链接上
  const linkElement = event.target.closest('a');
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  
  const newContextInfo = {
    hasSelection: selectedText.length > 0,
    selectionText: selectedText,
    isOnLink: !!linkElement,
    linkUrl: linkElement ? linkElement.href : null,
    target: event.target.tagName
  };
  
  console.log('右键上下文信息:', newContextInfo);
  
  // 总是发送消息来更新菜单（因为我们要显示实时内容）
  chrome.runtime.sendMessage({
    action: "updateContextMenus",
    contextInfo: newContextInfo
  });
  
  lastRightClickInfo = newContextInfo;
  lastContextUpdateTime = now;
});

// 导出上下文信息给其他函数使用
window.getLastContextInfo = function() {
  return lastRightClickInfo;
};

// 创建调试信息面板
function createDebugPanel(debugInfo) {
  // 移除已存在的调试面板
  const existingPanel = document.getElementById('qr-debug-panel');
  if (existingPanel) {
    existingPanel.remove();
  }
  
  // 创建新的调试面板
  const debugPanel = document.createElement('div');
  debugPanel.id = 'qr-debug-panel';
  debugPanel.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    width: 300px;
    max-height: 400px;
    overflow-y: auto;
    background-color: rgba(0, 0, 0, 0.8);
    color: #fff;
    padding: 10px;
    border-radius: 5px;
    font-family: monospace;
    z-index: 9999;
    font-size: 12px;
  `;
  
  // 添加标题
  const title = document.createElement('h3');
  title.textContent = '二维码解析调试信息';
  title.style.cssText = 'margin: 0 0 10px 0; color: #4CAF50;';
  debugPanel.appendChild(title);
  
  // 添加关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '关闭';
  closeBtn.style.cssText = `
    position: absolute;
    top: 5px;
    right: 5px;
    background: #f44336;
    color: white;
    border: none;
    padding: 2px 8px;
    cursor: pointer;
    border-radius: 3px;
    font-size: 11px;
  `;
  closeBtn.onclick = () => debugPanel.remove();
  debugPanel.appendChild(closeBtn);
  
  // 添加调试信息
  Object.entries(debugInfo).forEach(([key, value]) => {
    const item = document.createElement('div');
    item.style.cssText = 'margin-bottom: 8px; word-break: break-word;';
    
    const keySpan = document.createElement('span');
    keySpan.textContent = key + ': ';
    keySpan.style.cssText = 'color: #FFD700; font-weight: bold;';
    
    const valueSpan = document.createElement('span');
    valueSpan.textContent = typeof value === 'object' ? JSON.stringify(value, null, 2) : value;
    valueSpan.style.cssText = 'color: #E0E0E0;';
    
    item.appendChild(keySpan);
    item.appendChild(valueSpan);
    debugPanel.appendChild(item);
  });
  
  // 添加到页面
  document.body.appendChild(debugPanel);
}

// 解析二维码函数
function decodeQRCode(imageUrl) {
  console.log("开始解析二维码:", imageUrl);
  
  // 创建调试信息对象
  const debugInfo = {
    开始时间: new Date().toLocaleTimeString(),
    图片URL: imageUrl,
    解析状态: "开始加载图片"
  };
  
  // 创建图片对象
  const img = new Image();
  img.crossOrigin = "anonymous";
  
  img.onload = function() {
    try {
      debugInfo.图片大小 = `${img.width} x ${img.height}`;
      debugInfo.解析状态 = "图片加载成功，开始创建canvas";
      
      // 创建canvas来绘制图片
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // 设置canvas大小
      canvas.width = img.width;
      canvas.height = img.height;
      
      // 在canvas上绘制图片
      ctx.drawImage(img, 0, 0, img.width, img.height);
      
      // 确保jsQR库已加载
      if (typeof jsQR === "function") {
        // 获取图像数据
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        debugInfo.解析状态 = "已获取图像数据，开始解析二维码";
        
        // 使用jsQR库解析二维码
        console.log("开始解析二维码数据...");
        const startTime = performance.now();
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        const endTime = performance.now();
        debugInfo.解析耗时 = `${(endTime - startTime).toFixed(2)}ms`;
        
        console.log("解析结果:", code);
        
        if (code && code.data) {
          // 解析成功，保存结果并显示
          const result = code.data;
          debugInfo.解析状态 = "解析成功";
          debugInfo.解析结果 = result;
          debugInfo.二维码位置 = code.location;
          
          chrome.storage.local.set({ qrResult: result });
          
          // 创建通知
          alert("二维码解析成功!\n\n内容: " + result);
          
          // 发送结果到popup
          chrome.runtime.sendMessage({
            action: "qrResult",
            result: result,
            debugInfo: debugInfo
          });
        } else {
          debugInfo.解析状态 = "解析失败，未识别到二维码";
          console.error("未能识别二维码");
          alert("未能识别二维码，请确保图片包含有效的二维码。\n\n查看右上角调试面板获取详细信息。");
        }
      } else {
        debugInfo.解析状态 = "jsQR库未加载，无法解析";
        console.error("jsQR库未加载");
        alert("jsQR库未加载，无法解析二维码。请刷新页面后重试。");
      }
    } catch (error) {
      debugInfo.解析状态 = "解析过程出错";
      debugInfo.错误信息 = error.message;
      console.error("二维码解析错误:", error);
      alert("解析二维码时发生错误: " + error.message + "\n\n查看右上角调试面板获取详细信息。");
    } finally {
      debugInfo.结束时间 = new Date().toLocaleTimeString();
      createDebugPanel(debugInfo);
    }
  };
  
  img.onerror = function() {
    alert("无法加载图片，请检查图片URL是否有效。");
  };
  
  // 设置图片源
  img.src = imageUrl;
}