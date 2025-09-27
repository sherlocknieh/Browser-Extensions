// 存储当前右键上下文信息
let currentContextInfo = null;

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateContextMenus" && message.contextInfo) {
    currentContextInfo = message.contextInfo;
    console.log('接收到上下文信息:', message.contextInfo);
    updateContextMenusBasedOnContext(message.contextInfo);
  }
});

// 根据上下文动态更新菜单
function updateContextMenusBasedOnContext(contextInfo) {
  console.log('更新菜单，上下文信息:', contextInfo);
  
  // 清除现有的二维码生成菜单
  chrome.contextMenus.removeAll(() => {
    try {
      // 重新创建基础菜单
      chrome.contextMenus.create({
        id: "decodeQR",
        title: "🔍 识别二维码",
        contexts: ["image"]
      });
      
      // 根据上下文创建不同的二维码生成菜单
      if (contextInfo.hasSelection) {
        // 截取选中文字，最多显示15个字符，避免菜单过长
        let displayText = contextInfo.selectionText.trim();
        if (displayText.length > 15) {
          displayText = displayText.substring(0, 15) + "...";
        }
        
        // 有选中文字时，显示文字内容在菜单标题中
        chrome.contextMenus.create({
          id: "textToQR",
          title: `📱 "${displayText}" 生成二维码`,
          contexts: ["selection"]
        });
      } else if (contextInfo.isOnLink && contextInfo.linkUrl) {
        // 提取链接的域名部分显示
        let displayUrl;
        try {
          const url = new URL(contextInfo.linkUrl);
          displayUrl = url.hostname;
          if (displayUrl.length > 25) {
            displayUrl = displayUrl.substring(0, 25) + "...";
          }
        } catch (e) {
          // 如果URL解析失败，直接截取
          displayUrl = contextInfo.linkUrl.length > 25 
            ? contextInfo.linkUrl.substring(0, 25) + "..." 
            : contextInfo.linkUrl;
        }
        
        // 没有选中文字但在链接上时，显示链接地址
        chrome.contextMenus.create({
          id: "linkToQR",
          title: `📱 链接 ${displayUrl} 生成二维码`,
          contexts: ["link"]
        });
      }
      
      // 总是创建一个通用菜单作为fallback
      chrome.contextMenus.create({
        id: "smartQR",
        title: "📱 生成二维码",
        contexts: ["selection", "link"]
      });
      
      console.log('菜单创建完成');
    } catch (error) {
      console.error('创建菜单时出错:', error);
      // 如果动态更新失败，回退到静态菜单
      createContextMenus();
    }
  });
}

// 创建右键菜单（初始版本）
function createContextMenus() {
  // 清除所有现有菜单
  chrome.contextMenus.removeAll(() => {
    console.log('已清除所有右键菜单');
    
    // 创建主菜单项
    chrome.contextMenus.create({
      id: "decodeQR",
      title: "🔍 识别二维码",
      contexts: ["image"]
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('创建解析二维码菜单失败:', chrome.runtime.lastError);
      } else {
        console.log('解析二维码菜单创建成功');
      }
    });
    
    // 创建文字生成二维码菜单
    chrome.contextMenus.create({
      id: "textToQR",
      title: "📱 文字生成二维码",
      contexts: ["selection"]
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('创建文字生成二维码菜单失败:', chrome.runtime.lastError);
      } else {
        console.log('文字生成二维码菜单创建成功');
      }
    });
    
    // 创建链接生成二维码菜单
    chrome.contextMenus.create({
      id: "linkToQR",
      title: "📱 链接生成二维码",
      contexts: ["link"]
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('创建链接生成二维码菜单失败:', chrome.runtime.lastError);
      } else {
        console.log('链接生成二维码菜单创建成功');
      }
    });
  });
}

// 初始化插件
chrome.runtime.onInstalled.addListener(() => {
  console.log('二维码扩展已安装，正在创建右键菜单...');
  createContextMenus();
});

// Service Worker启动时也创建菜单
chrome.runtime.onStartup.addListener(() => {
  console.log('二维码扩展Service Worker启动，正在创建右键菜单...');
  createContextMenus();
});

// 扩展启动时强制创建菜单
setTimeout(() => {
  console.log('强制创建二维码菜单 - 确保扩展正常工作');
  createContextMenus();
}, 1000);

// 处理右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
  // 获取图片URL
  const imageUrl = info.srcUrl;
  
  if (info.menuItemId === "decodeQR") {
    // 发送消息到内容脚本进行二维码解析
    chrome.tabs.sendMessage(tab.id, {
      action: "decodeQR",
      imageUrl: imageUrl
    });
  } else if (info.menuItemId === "textToQR") {
    // 处理选中文字生成二维码
    const text = info.selectionText || "";
    if (text) {
      console.log('使用选中文字生成二维码:', text.substring(0, 50) + '...');
      chrome.storage.local.set({ qrCodeText: text }, function() {
        chrome.action.openPopup();
      });
    }
  } else if (info.menuItemId === "linkToQR") {
    // 处理链接生成二维码，但优先使用选中文字
    const text = info.selectionText || info.linkUrl || "";
    if (text) {
      const source = info.selectionText ? "选中文字" : "链接地址";
      console.log(`使用${source}生成二维码:`, text.substring(0, 50) + '...');
      chrome.storage.local.set({ qrCodeText: text }, function() {
        chrome.action.openPopup();
      });
    }
  } else if (info.menuItemId === "smartQR") {
    // 智能处理：优先使用选中文字，其次使用链接
    let text = "";
    let menuTitle = "";
    
    if (info.selectionText) {
      text = info.selectionText;
      menuTitle = "选中文字";
    } else if (info.linkUrl) {
      text = info.linkUrl;
      menuTitle = "链接地址";
    }
    
    if (text) {
      // 显示处理信息给用户
      console.log(`正在生成${menuTitle}的二维码: ${text.substring(0, 50)}...`);
      chrome.storage.local.set({ qrCodeText: text }, function() {
        chrome.action.openPopup();
      });
    }
  }
});