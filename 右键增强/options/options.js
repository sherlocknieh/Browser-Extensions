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

// DOM 元素
const searchEnginesContainer = document.getElementById('search-engines-container');
const addEngineButton = document.getElementById('add-engine');
const saveSettingsButton = document.getElementById('save-settings');
const resetSettingsButton = document.getElementById('reset-settings');
const useDefaultEnginesCheckbox = document.getElementById('use-default-engines');
const defaultEngineSelect = document.getElementById('default-engine');
const statusMessage = document.getElementById('status-message');
const searchEngineTemplate = document.getElementById('search-engine-template');

// 初始化设置页面
function initOptions() {
  // 加载保存的设置
  chrome.storage.sync.get({
    searchEngines: [],
    useDefaultEngines: true,
    defaultEngine: 'Google'
  }, function(items) {
    // 显示用户自定义的搜图引擎
    if (items.searchEngines && items.searchEngines.length > 0) {
      items.searchEngines.forEach(engine => addSearchEngineItem(engine.name, engine.url));
    }
    
    // 设置是否使用默认搜图引擎
    useDefaultEnginesCheckbox.checked = items.useDefaultEngines;
    
    // 填充默认搜图引擎下拉列表
    populateDefaultEngineSelect(items.defaultEngine);
  });
  
  // 添加事件监听器
  addEngineButton.addEventListener('click', () => addSearchEngineItem());
  saveSettingsButton.addEventListener('click', saveOptions);
  resetSettingsButton.addEventListener('click', resetOptions);
}

// 添加搜图引擎项
function addSearchEngineItem(name = '', url = '') {
  const template = searchEngineTemplate.content.cloneNode(true);
  const engineItem = template.querySelector('.search-engine-item');
  
  const nameInput = engineItem.querySelector('.engine-name');
  const urlInput = engineItem.querySelector('.engine-url');
  const removeButton = engineItem.querySelector('.remove-engine');
  
  nameInput.value = name;
  urlInput.value = url;
  
  removeButton.addEventListener('click', function() {
    engineItem.remove();
  });
  
  searchEnginesContainer.appendChild(engineItem);
}

// 填充默认搜图引擎下拉列表
function populateDefaultEngineSelect(selectedEngine) {
  // 清空现有选项
  defaultEngineSelect.innerHTML = '';
  
  // 添加用户自定义引擎
  const userEngines = getUserEngines();
  userEngines.forEach(engine => {
    const option = document.createElement('option');
    option.value = engine.name;
    option.textContent = engine.name;
    defaultEngineSelect.appendChild(option);
  });
  
  // 如果启用了默认引擎，也添加它们
  if (useDefaultEnginesCheckbox.checked) {
    DEFAULT_ENGINES.forEach(engine => {
      // 检查是否已经存在同名引擎
      if (!userEngines.some(e => e.name === engine.name)) {
        const option = document.createElement('option');
        option.value = engine.name;
        option.textContent = engine.name;
        defaultEngineSelect.appendChild(option);
      }
    });
  }
  
  // 设置选中的引擎
  if (selectedEngine && defaultEngineSelect.querySelector(`option[value="${selectedEngine}"]`)) {
    defaultEngineSelect.value = selectedEngine;
  } else if (defaultEngineSelect.options.length > 0) {
    defaultEngineSelect.selectedIndex = 0;
  }
}

// 获取用户自定义的搜图引擎
function getUserEngines() {
  const engines = [];
  const engineItems = searchEnginesContainer.querySelectorAll('.search-engine-item');
  
  engineItems.forEach(item => {
    const name = item.querySelector('.engine-name').value.trim();
    const url = item.querySelector('.engine-url').value.trim();
    
    if (name && url) {
      engines.push({ name, url });
    }
  });
  
  return engines;
}

// 保存设置
function saveOptions() {
  const userEngines = getUserEngines();
  const useDefaultEngines = useDefaultEnginesCheckbox.checked;
  const defaultEngine = defaultEngineSelect.value;
  
  // 验证至少有一个搜图引擎
  if (userEngines.length === 0 && !useDefaultEngines) {
    showStatusMessage('请至少添加一个搜图引擎或启用默认搜图引擎', 'error');
    return;
  }
  
  // 保存设置到 Chrome 存储
  chrome.storage.sync.set({
    searchEngines: userEngines,
    useDefaultEngines: useDefaultEngines,
    defaultEngine: defaultEngine
  }, function() {
    showStatusMessage('设置已保存', 'success');
    
    // 更新默认引擎下拉列表
    populateDefaultEngineSelect(defaultEngine);
  });
}

// 重置为默认设置
function resetOptions() {
  if (confirm('确定要恢复默认设置吗？这将删除所有自定义搜图引擎。')) {
    // 清空自定义搜图引擎
    searchEnginesContainer.innerHTML = '';
    
    // 恢复默认设置
    useDefaultEnginesCheckbox.checked = true;
    
    // 重新填充默认引擎下拉列表
    populateDefaultEngineSelect('Google');
    
    // 保存默认设置
    chrome.storage.sync.set({
      searchEngines: [],
      useDefaultEngines: true,
      defaultEngine: 'Google'
    }, function() {
      showStatusMessage('已恢复默认设置', 'success');
    });
  }
}

// 显示状态消息
function showStatusMessage(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = 'status-message ' + type;
  
  // 3秒后隐藏消息
  setTimeout(() => {
    statusMessage.className = 'status-message';
  }, 3000);
}

// 当默认引擎选项改变时更新下拉列表
useDefaultEnginesCheckbox.addEventListener('change', function() {
  const currentDefault = defaultEngineSelect.value;
  populateDefaultEngineSelect(currentDefault);
});

// 初始化页面
document.addEventListener('DOMContentLoaded', initOptions);