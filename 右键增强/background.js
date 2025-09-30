
// 初始化右键菜单
chrome.runtime.onInstalled.addListener(() => {
    // 初始化引擎配置
    initializeEngineConfig();
    // 创建右键菜单
    createContextMenus();
});

// 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
    // 处理菜单点击
    handleContextMenuClick(info, tab);
});

// 初始化引擎配置
function initializeEngineConfig() {
    chrome.storage.local.get(['imageSearchEngines', 'customImageSearchEngines'], (result) => {
        let engines = result.imageSearchEngines;
        
        if (!engines) {
            // 首次安装，创建默认配置
            engines = getDefaultEngines();
            
            // 如果存在旧的自定义引擎，迁移过来
            if (result.customImageSearchEngines) {
                const customEngines = result.customImageSearchEngines.map(engine => ({
                    ...engine,
                    builtin: false
                }));
                engines = engines.concat(customEngines);
                
                // 清理旧配置
                chrome.storage.local.remove(['customImageSearchEngines']);
            }
            
            // 保存新配置
            chrome.storage.local.set({ imageSearchEngines: engines });
        } else {
            // 检查是否需要添加新的内置引擎
            const defaultEngines = getDefaultEngines();
            let hasUpdates = false;
            
            defaultEngines.forEach(defaultEngine => {
                const existingEngine = engines.find(e => e.id === defaultEngine.id);
                if (!existingEngine) {
                    engines.push(defaultEngine);
                    hasUpdates = true;
                }
            });
            
            if (hasUpdates) {
                chrome.storage.local.set({ imageSearchEngines: engines });
            }
        }
    });
}

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

        // 检查是否使用简化菜单模式
        chrome.storage.local.get(['useSimpleMenu'], (result) => {
            if (result.useSimpleMenu) {
                // 简化模式：直接可点击的搜图菜单
                chrome.contextMenus.create({
                    id: "searchImageDirect",
                    title: "⚡ 一键搜图（所有引擎）",
                    contexts: ["image"]
                });
            } else {
                // 标准模式：带子菜单的搜图菜单
                createStandardImageSearchMenu();
            }
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
    else if (info.menuItemId === "searchImageAll" || info.menuItemId === "searchImageDirect") {
        // 一键用所有引擎搜图
        handleAllEnginesSearch(info.srcUrl);
    }
    else if (info.menuItemId.startsWith("imageSearch_")) {
        // 单个引擎搜图
        handleSingleEngineSearch(info.menuItemId, info.srcUrl);
    }
}


// 监听来自options页面的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getImageSearchEngines') {
        chrome.storage.local.get(['imageSearchEngines'], (result) => {
            sendResponse({ engines: result.imageSearchEngines || getDefaultEngines() });
        });
        return true;
    }
    else if (request.action === 'saveImageSearchEngines') {
        chrome.storage.local.set({ imageSearchEngines: request.engines }, () => {
            createContextMenus(); // 重新创建菜单
            sendResponse({ success: true });
        });
        return true;
    }
    // 保持向后兼容
    else if (request.action === 'getCustomImageSearchEngines') {
        chrome.storage.local.get(['imageSearchEngines'], (result) => {
            const engines = result.imageSearchEngines || getDefaultEngines();
            const customEngines = engines.filter(e => !e.builtin);
            sendResponse({ engines: customEngines });
        });
        return true;
    }
    else if (request.action === 'saveCustomImageSearchEngines') {
        chrome.storage.local.get(['imageSearchEngines'], (result) => {
            const engines = result.imageSearchEngines || getDefaultEngines();
            const builtinEngines = engines.filter(e => e.builtin);
            const newEngines = builtinEngines.concat(request.engines.map(e => ({...e, builtin: false})));
            chrome.storage.local.set({ imageSearchEngines: newEngines }, () => {
                createContextMenus(); // 重新创建菜单
                sendResponse({ success: true });
            });
        });
        return true;
    }
    else if (request.action === 'getDefaultImageSearchEngine') {
        chrome.storage.local.get(['defaultImageSearchEngine'], (result) => {
            sendResponse({ defaultEngine: result.defaultImageSearchEngine || 'google' });
        });
        return true;
    }
    else if (request.action === 'saveDefaultImageSearchEngine') {
        chrome.storage.local.set({ defaultImageSearchEngine: request.defaultEngine }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
    else if (request.action === 'getUseSimpleMenu') {
        chrome.storage.local.get(['useSimpleMenu'], (result) => {
            sendResponse({ useSimpleMenu: result.useSimpleMenu || false });
        });
        return true;
    }
    else if (request.action === 'saveUseSimpleMenu') {
        chrome.storage.local.set({ useSimpleMenu: request.useSimpleMenu }, () => {
            createContextMenus(); // 重新创建菜单
            sendResponse({ success: true });
        });
        return true;
    }
    else if (request.action === 'getBatchSearchSettings') {
        chrome.storage.local.get(['batchSearchDelay', 'maxBatchTabs'], (result) => {
            sendResponse({ 
                delay: result.batchSearchDelay || 500,
                maxTabs: result.maxBatchTabs || 10
            });
        });
        return true;
    }
    else if (request.action === 'saveBatchSearchSettings') {
        chrome.storage.local.set({ 
            batchSearchDelay: request.delay,
            maxBatchTabs: request.maxTabs 
        }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
    else if (request.action === 'resetToDefaults') {
        // 重置为默认配置
        const defaultSettings = {
            imageSearchEngines: getDefaultEngines(),
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
    console.log(request.action);
});




// 获取默认引擎配置
function getDefaultEngines() {
    return [
        {
            id: 'google',
            name: 'Google 搜图',
            url: 'https://lens.google.com/uploadbyurl?url=%s',
            enabled: true,
            builtin: true,
            icon: '🔍'
        },
        {
            id: 'yandex',
            name: 'Yandex 搜图',
            url: 'https://yandex.com/images/search?rpt=imageview&url=%s',
            enabled: true,
            builtin: true,
            icon: '🔎'
        }
    ];
}

// 创建标准的搜图菜单（带子菜单）
function createStandardImageSearchMenu() {
    // 搜图二级菜单父项
    chrome.contextMenus.create({
        id: "searchImage",
        title: "以图搜图",
        contexts: ["image"]
    });

    // 添加一键搜图选项（作为第一个子菜单项）
    chrome.contextMenus.create({
        id: "searchImageAll",
        title: "⚡ 一键搜图（所有引擎）",
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

    // 加载所有搜图引擎
    loadAllImageSearchEngines();
}

// 加载所有搜图引擎
function loadAllImageSearchEngines() {
    chrome.storage.local.get(['imageSearchEngines'], (result) => {
        const engines = result.imageSearchEngines || getDefaultEngines();
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
}

// 处理一键搜图（所有引擎）
function handleAllEnginesSearch(imageUrl) {
    // 获取所有搜图引擎配置
    chrome.storage.local.get(['imageSearchEngines'], (result) => {
        const engines = result.imageSearchEngines || getDefaultEngines();
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

// 处理单个引擎搜图
function handleSingleEngineSearch(menuItemId, imageUrl) {
    const engineId = menuItemId.replace('imageSearch_', '');
    chrome.storage.local.get(['imageSearchEngines'], (result) => {
        const engines = result.imageSearchEngines || getDefaultEngines();
        const engine = engines.find(e => e.id === engineId);
        if (engine) {
            const searchUrl = engine.url.replace('%s', encodeURIComponent(imageUrl));
            chrome.tabs.create({ url: searchUrl });
        }
    });
}
