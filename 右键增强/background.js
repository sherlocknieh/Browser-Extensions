// 扩展安装后触发
chrome.runtime.onInstalled.addListener(() => {
    // 写入默认配置
    const defaultConfig = {
        imageSearchEngines: getDefaultSettings(),
        batchSearchDelay: 500,
        maxBatchTabs: 10
    };
    chrome.storage.local.set(defaultConfig);
    // 创建右键菜单
    createContextMenus();
});

// 点击菜单时触发
chrome.contextMenus.onClicked.addListener((info, tab) => {
    // 处理菜单点击
    handleContextMenuClick(info, tab);
});


// 创建右键菜单
function createContextMenus() {
    // 清理旧菜单
    chrome.contextMenus.removeAll(() => {

        // 复制链接文字菜单
        chrome.contextMenus.create({
            id: "copyLinkText",
            title: "复制链接文字",
            contexts: ["link"]
        });

        // 图片搜索菜单
        chrome.contextMenus.create({
            id: "searchImage",
            title: "图片搜索",
            contexts: ["image"]
        });

        // 添加一键搜图选项
        chrome.contextMenus.create({
            id: "searchImageAll",
            title: "🔍 一键搜索",
            contexts: ["image"],
            parentId: "searchImage"
        });

        // 添加分隔符
        chrome.contextMenus.create({
            id: "searchImageSeparator",
            type: "separator",
            contexts: ["image"],
            parentId: "searchImage"
        });

        // 加载所有已启用的搜图引擎
        chrome.storage.local.get(['imageSearchEngines'], (result) => {
            const engines = result.imageSearchEngines || getDefaultSettings();
            engines.forEach(engine => {
                if (engine.enabled) {
                    chrome.contextMenus.create({
                        id: `imageSearch_${engine.id}`,
                        title: `${engine.icon || '🔗'} ${engine.name}`,
                        contexts: ["image"],
                        parentId: "searchImage"
                    });
                }
            });
        });
    });
}

// 右键菜单响应函数
function handleContextMenuClick(info, tab) {
    if (info.menuItemId === "copyLinkText") {
        // 通知 content.js 执行复制操作
        chrome.tabs.sendMessage(tab.id, {
            action: "copyLinkText",
            linkUrl: info.linkUrl
        });
    }
    else if (info.menuItemId.startsWith("imageSearch_")) {
        // 单个引擎搜图
        handleSingleEngineSearch(info.menuItemId, info.srcUrl);
    }
    else if (info.menuItemId === "searchImageAll") {
        // 一键用所有引擎搜图
        handleAllEnginesSearch(info.srcUrl);
    }
}


// 设置页面消息处理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 获取配置
    if (request.action === 'getImageSearchEngines') {
        chrome.storage.local.get(['imageSearchEngines'], (result) => {
            sendResponse({ engines: result.imageSearchEngines || getDefaultSettings() });
        });
        return true;
    }
    // 保存配置
    else if (request.action === 'saveImageSearchEngines') {
        chrome.storage.local.set({ imageSearchEngines: request.engines }, () => {
            createContextMenus(); // 重新创建菜单
            sendResponse({ success: true });
        });
        return true;
    }
    // 重置默认配置
    else if (request.action === 'resetToDefaults') {
        const defaultSettings = {
            imageSearchEngines: getDefaultSettings(),
            useSimpleMenu: false,
            batchSearchDelay: 500,
            maxBatchTabs: 10
        };
        
        chrome.storage.local.clear(() => {
            chrome.storage.local.set(defaultSettings, () => {
                createContextMenus(); // 重新创建菜单
                sendResponse({ success: true });
            });
        });
        return true;
    }
});


// 获取默认引擎配置
function getDefaultSettings() {
    return [
        {
            id: 'google',
            name: 'Google Lens',
            url: 'https://lens.google.com/uploadbyurl?url=%s',
            enabled: true,
        },
        {
            id: 'yandex',
            name: 'Yandex 搜图',
            url: 'https://yandex.com/images/search?rpt=imageview&url=%s',
            enabled: true,
        }
    ];
}


// 处理单个引擎搜图
function handleSingleEngineSearch(menuItemId, imageUrl) {
    // 提取引擎ID
    const engineId = menuItemId.replace('imageSearch_', '');
    // 获取引擎配置
    chrome.storage.local.get(['imageSearchEngines'], (result) => {
        // 查找对应引擎
        const engines = result.imageSearchEngines || getDefaultSettings();
        // 查找对应引擎
        const engine = engines.find(e => e.id === engineId);
        // 如果找到，打开新标签页
        if (engine) {
            const searchUrl = engine.url.replace('%s', encodeURIComponent(imageUrl));
            chrome.tabs.create({ url: searchUrl });
        }
    });
}


// 处理一键搜图（所有引擎）
function handleAllEnginesSearch(imageUrl) {
    // 获取所有搜图引擎配置
    chrome.storage.local.get(['imageSearchEngines'], (result) => {
        const engines = result.imageSearchEngines || getDefaultSettings();
        const urls = [];
        
        // 添加启用的引擎URLs
        engines.forEach(engine => {
            if (engine.enabled) {
                urls.push({
                    name: engine.name,
                    url: engine.url.replace('%s', encodeURIComponent(imageUrl))
                });
            }
        });
        
        // 检查是否有引擎可用
        if (urls.length === 0) {
            console.warn('没有可用的搜图引擎');
            return;
        }
        
        // 获取用户设置：是否允许同时打开多个标签页
        chrome.storage.local.get(['batchSearchDelay', 'maxBatchTabs'], (settings) => {
            const delay = settings.batchSearchDelay || 500; // 默认500ms延迟
            const maxTabs = settings.maxBatchTabs || 10; // 默认最多10个标签页
            
            // 限制打开的标签页数量
            const limitedUrls = urls.slice(0, maxTabs);
            
            // 依次打开标签页，避免浏览器阻止批量弹窗
            limitedUrls.forEach((item, index) => {
                setTimeout(() => {
                    chrome.tabs.create({ 
                        url: item.url,
                        active: index === 0 // 只有第一个标签页激活
                    });
                }, index * delay);
            });
            
            // 如果被限制了，显示通知
            if (urls.length > maxTabs) {
                console.log(`已限制同时打开的标签页数量为 ${maxTabs}，共有 ${urls.length} 个引擎`);
            }
        });
    });
}
