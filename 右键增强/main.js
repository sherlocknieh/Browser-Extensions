// 默认搜图引擎配置
const DEFAULT_ENGINES = [
  {
    name: 'Google',
    url: 'https://www.google.com/searchbyimage?image_url={imageUrl}'
  },
  {
    name: 'Yandex',
    url: 'https://yandex.com/images/search?rpt=imageview&url={imageUrl}'
  }
];

// 创建搜图菜单
function createSearchImageMenus() {
  // 获取设置
  chrome.storage.sync.get({
    searchEngines: [],
    useDefaultEngines: true,
    defaultEngine: 'Google'
  }, function(items) {
    // 合并用户自定义引擎和默认引擎
    let engines = [...items.searchEngines];
    if (items.useDefaultEngines) {
      // 添加不重复的默认引擎
      DEFAULT_ENGINES.forEach(defaultEngine => {
        if (!engines.some(e => e.name === defaultEngine.name)) {
          engines.push(defaultEngine);
        }
      });
    }
    
    // 如果没有引擎，至少添加Google
    if (engines.length === 0) {
      engines = [DEFAULT_ENGINES[0]];
    }
    
    // 创建搜图主菜单
    chrome.contextMenus.create({
      id: "searchImage",
      title: "🔎 以图搜图",
      contexts: ["image"]
    });
    
    // 如果只有一个引擎，不创建子菜单
    if (engines.length === 1) {
      return;
    }
    
    // 为每个搜图引擎创建子菜单
    engines.forEach((engine, index) => {
      chrome.contextMenus.create({
        id: `searchImage_${index}`,
        parentId: "searchImage",
        title: engine.name,
        contexts: ["image"]
      });
    });
  });
}

// 创建右键菜单
function createContextMenus() {
  // 清除所有现有菜单
  chrome.contextMenus.removeAll(() => {
    console.log('已清除所有右键菜单');
    
    // 创建搜图菜单
    createSearchImageMenus();
  });
}

// 初始化插件
chrome.runtime.onInstalled.addListener(() => {
  console.log('搜图扩展已安装，正在创建右键菜单...');
  createContextMenus();
});

// Service Worker启动时也创建菜单
chrome.runtime.onStartup.addListener(() => {
  console.log('搜图扩展Service Worker启动，正在创建右键菜单...');
  createContextMenus();
});

// 当存储变化时重新创建菜单
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && 
      (changes.searchEngines || changes.useDefaultEngines || changes.defaultEngine)) {
    console.log('存储变化，重新创建菜单');
    createContextMenus();
  }
});

// 处理右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
  // 获取图片URL
  const imageUrl = info.srcUrl;
  
  if (info.menuItemId === "searchImage") {
    // 使用默认搜图引擎
    chrome.storage.sync.get({
      searchEngines: [],
      useDefaultEngines: true,
      defaultEngine: 'Google'
    }, function(items) {
      // 查找默认引擎
      let engines = [...items.searchEngines];
      if (items.useDefaultEngines) {
        engines = engines.concat(DEFAULT_ENGINES);
      }
      
      const defaultEngine = engines.find(e => e.name === items.defaultEngine) || DEFAULT_ENGINES[0];
      const searchUrl = defaultEngine.url.replace('{imageUrl}', encodeURIComponent(imageUrl));
      
      chrome.tabs.create({ url: searchUrl });
    });
  } else if (info.menuItemId.startsWith("searchImage_")) {
    // 使用选定的搜图引擎
    const engineIndex = parseInt(info.menuItemId.split('_')[1]);
    
    chrome.storage.sync.get({
      searchEngines: [],
      useDefaultEngines: true
    }, function(items) {
      let engines = [...items.searchEngines];
      if (items.useDefaultEngines) {
        engines = engines.concat(DEFAULT_ENGINES);
      }
      
      if (engineIndex < engines.length) {
        const engine = engines[engineIndex];
        const searchUrl = engine.url.replace('{imageUrl}', encodeURIComponent(imageUrl));
        
        chrome.tabs.create({ url: searchUrl });
      }
    });
  }
});