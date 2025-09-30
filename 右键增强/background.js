
// 初始化右键菜单
chrome.runtime.onInstalled.addListener(() => {
    createContextMenus();
});

// 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
    handleContextMenuClick(info, tab);
});

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(request.action);
});


// 右键菜单创建函数
function createContextMenus() {
    // 清理旧菜单
    chrome.contextMenus.removeAll(() => {

        // 复制链接显示文字菜单
        chrome.contextMenus.create({
            id: "copyLinkText",
            title: "复制链接文字",
            contexts: ["link"]
        });

        // 搜图二级菜单父项
        chrome.contextMenus.create({
            id: "searchImage",
            title: "以图搜图",
            contexts: ["image"]
        });

        // Google 搜图
        chrome.contextMenus.create({
            id: "searchImageGoogle",
            title: "Google 搜图",
            contexts: ["image"],
            parentId: "searchImage"
        });

        // Yandex 搜图
        chrome.contextMenus.create({
            id: "searchImageYandex",
            title: "Yandex 搜图",
            contexts: ["image"],
            parentId: "searchImage"
        });

        // 加载自定义搜图引擎
        loadCustomImageSearchEngines();
    });
}

// 右键菜单响应函数
function handleContextMenuClick(info, tab) {
    if (info.menuItemId === "copyLinkText") {
        // 将复制操作委托给 content script，传递所有可能的链接信息
        chrome.tabs.sendMessage(tab.id, {
            action: "copyLinkText", 
            linkText: info.linkText,
            linkUrl: info.linkUrl,
            selectionText: info.selectionText
        }).catch(err => {
            console.error("发送消息到 content script 失败:", err);
        });
    }
    else if (info.menuItemId === "searchImageGoogle") {
        // Google 图片搜索
        const googleUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(info.srcUrl)}`;
        chrome.tabs.create({ url: googleUrl });
    }
    else if (info.menuItemId === "searchImageYandex") {
        // Yandex 图片搜索
        const yandexUrl = `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(info.srcUrl)}`;
        chrome.tabs.create({ url: yandexUrl });
    }
    else if (info.menuItemId.startsWith("customImageSearch_")) {
        // 自定义搜图引擎
        handleCustomImageSearch(info.menuItemId, info.srcUrl);
    }
}

// 加载自定义搜图引擎
function loadCustomImageSearchEngines() {
    chrome.storage.local.get(['customImageSearchEngines'], (result) => {
        const engines = result.customImageSearchEngines || [];
        engines.forEach(engine => {
            if (engine.enabled) {
                chrome.contextMenus.create({
                    id: `customImageSearch_${engine.id}`,
                    title: engine.name,
                    contexts: ["image"],
                    parentId: "searchImage"
                });
            }
        });
    });
}

// 处理自定义搜图
function handleCustomImageSearch(menuItemId, imageUrl) {
    const engineId = menuItemId.replace('customImageSearch_', '');
    chrome.storage.local.get(['customImageSearchEngines'], (result) => {
        const engines = result.customImageSearchEngines || [];
        const engine = engines.find(e => e.id === engineId);
        if (engine) {
            const searchUrl = engine.url.replace('%s', encodeURIComponent(imageUrl));
            chrome.tabs.create({ url: searchUrl });
        }
    });
}

// 监听来自options页面的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getCustomImageSearchEngines') {
        chrome.storage.local.get(['customImageSearchEngines'], (result) => {
            sendResponse({ engines: result.customImageSearchEngines || [] });
        });
        return true;
    }
    else if (request.action === 'saveCustomImageSearchEngines') {
        chrome.storage.local.set({ customImageSearchEngines: request.engines }, () => {
            createContextMenus(); // 重新创建菜单
            sendResponse({ success: true });
        });
        return true;
    }
    console.log(request.action);
});
