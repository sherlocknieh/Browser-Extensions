// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {

    // 为已有按钮绑定事件
    basicEventListeners();

    // 加载搜索引擎列表
    loadEngines();
});


function basicEventListeners() {
    // 保存配置按钮已移除，改为自动保存
    // const saveConfigBtn = document.getElementById('saveConfigBtn');
    // if (saveConfigBtn) {saveConfigBtn.addEventListener('click', saveAllConfigurations);}
    // 配置导出按钮
    const exportConfigBtn = document.getElementById('exportConfigBtn');
    if (exportConfigBtn) {exportConfigBtn.addEventListener('click', exportConfig);}
    // 配置导入按钮
    const importConfigFile = document.getElementById('importConfigFile');
    if (importConfigFile) { importConfigFile.addEventListener('change', importConfig);}
    // 重置配置按钮
    const resetConfigBtn = document.getElementById('resetConfigBtn');
    if (resetConfigBtn) {resetConfigBtn.addEventListener('click', resetConfig);}
}


// 加载搜图引擎列表
function loadEngines() {
    // 读取配置
    chrome.storage.local.get('SearchEngines', (result) => {
        const engines = result.SearchEngines || [];
        
        
        // 清空现有内容
        const enginesList = document.getElementById('enginesList');
        enginesList.textContent = '';
        
        if (engines.length === 0) {
            const noEnginesMsg = document.createElement('p');
            noEnginesMsg.style.color = '#666';
            noEnginesMsg.textContent = '暂无自定义搜图引擎';
            enginesList.appendChild(noEnginesMsg);
            return;
        }

        // 创建搜索引擎列表
        engines.forEach((engine, index) => {
            const engineItem = createEngineItem(engine, index);
            enginesList.appendChild(engineItem);
        });
        
        // 创建添加新引擎的表单
        const newEngineForm = createNewEngineForm();
        enginesList.appendChild(newEngineForm);

        // 初始化 Sortable （只在有多于1项时）
        initializeSortable();
        
        // 隐藏保存按钮，因为现在使用自动保存
        updateSaveButtonState();
        
        // 存储原始配置用于检测变更
        storeOriginalConfig();
    });
}

// 纯函数：重排数组（便于单元测试）
function reorderArray(arr, fromIndex, toIndex) {
    const len = arr.length;
    if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len || fromIndex === toIndex) {
        return arr.slice();
    }
    const res = arr.slice();
    const [item] = res.splice(fromIndex, 1);
    res.splice(toIndex, 0, item);
    return res;
}

// 防抖保存到 storage
let saveTimer = null;
function saveEnginesDebounced() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        const currentConfig = getCurrentConfiguration();
        // 增加 updatedAt 字段
        const now = Date.now();
        currentConfig.forEach(item => item.updatedAt = now);
        chrome.storage.local.set({ SearchEngines: currentConfig }, () => {
            // originalConfig = JSON.parse(JSON.stringify(currentConfig)); // 已禁用
            // hasChanges = false; // 已禁用
            // updateSaveButtonState(); // 已禁用
            showStatus('配置已保存（自动）', 'success');
        });
    }, 500);
}

// 存储原始配置用于检测变更
let originalConfigForComparison = [];

function storeOriginalConfig() {
    const currentConfig = getCurrentConfiguration();
    originalConfigForComparison = JSON.parse(JSON.stringify(currentConfig));
}

// 输入框失去焦点时自动保存
function autoSaveOnBlur() {
    const currentConfig = getCurrentConfiguration();
    
    // 检查配置是否有变更
    if (arraysEqual(originalConfigForComparison, currentConfig)) {
        // 内容没有变化，不需要保存
        return;
    }
    
    // 验证配置
    let isValid = true;
    for (const engine of currentConfig) {
        if (!engine.name || !engine.url) {
            showStatus('引擎名称和URL不能为空', 'error');
            isValid = false;
            break;
        }
        if (!engine.url.includes('%s')) {
            showStatus(`引擎“${engine.name}”的URL必须包含占位符 %s`, 'error');
            isValid = false;
            break;
        }
    }
    
    if (isValid) {
        // 添加 updatedAt 字段
        const now = Date.now();
        currentConfig.forEach(item => item.updatedAt = now);
        
        chrome.storage.local.set({ SearchEngines: currentConfig }, () => {
            // 更新原始配置以便下次比较
            originalConfigForComparison = JSON.parse(JSON.stringify(currentConfig));
            showStatus('配置已自动保存', 'success');
        });
    }
}

// 新引擎输入框失去焦点时自动添加引擎（已禁用，改为手动添加）
// function autoAddNewEngine() {
//     const nameInput = document.getElementById('new-engine-name');
//     const urlInput = document.getElementById('new-engine-url');
//     
//     if (!nameInput || !urlInput) return;
//     
//     const name = nameInput.value.trim();
//     const url = urlInput.value.trim();
//     
//     // 只有当两个输入框都有内容时才自动添加
//     if (name && url) {
//         // 检查URL是否包含占位符
//         if (!url.includes('%s')) {
//             showStatus('URL必须包含图片占位符 %s', 'error');
//             return;
//         }
//         
//         // 添加新引擎
//         chrome.storage.local.get('SearchEngines', (result) => {
//             const engines = result.SearchEngines || [];
//             
//             // 检查名称是否重复
//             if (engines.some(e => e.name === name)) {
//                 showStatus('引擎名称已存在', 'error');
//                 return;
//             }
//             
//             // 创建新引擎
//             const newEngine = {
//                 name: name,
//                 url: url,
//                 enabled: true,
//                 updatedAt: Date.now()
//             };
//             
//             engines.push(newEngine);
//             
//             chrome.storage.local.set({ SearchEngines: engines }, () => {
//                 showStatus(`已自动添加 "${name}" 搜索引擎`, 'success');
//                 loadEngines(); // 重新加载列表
//             });
//         });
//     }
// }

// 上移/下移操作已移除，使用拖拽手柄进行排序

// 初始化 Sortable
let sortableInstance = null;
function initializeSortable() {
    const listEl = document.getElementById('enginesList');
    if (!listEl) return;

    // 若已初始化，则销毁后重建（避免重复绑定）
    try { if (sortableInstance) sortableInstance.destroy(); } catch (e) {}

    // 只对实际的引擎项启用拖拽（不包括最后一个用于新增的表单）
    const options = {
        // 取消 handle，使整行均可拖拽；只允许非 non-draggable 的项被拖拽
        animation: 150,
        draggable: '.engine-item:not(.non-draggable)',
        // 过滤所有 input/textarea（包括新增行），并且不要 preventDefault，以便输入框能正常聚焦和输入
        filter: 'input, textarea, .new-engine-input, #new-engine-name, #new-engine-url',
        preventOnFilter: false,
        onEnd: function(evt) {
            // 计算真实索引（排除最后的新增表单）
            const items = Array.from(listEl.querySelectorAll('.engine-item'));
            const engineItems = items.filter((el, idx) => !el.querySelector('.new-engine-input'));
            const oldIndex = evt.oldIndex;
            const newIndex = evt.newIndex;

            // 如果拖拽到了新增表单的位置，忽略
            if (oldIndex === newIndex) return;

            // 从 storage 读取并重排
            chrome.storage.local.get('SearchEngines', (result) => {
                const engines = result.SearchEngines || [];
                const adjustedOld = oldIndex;
                const adjustedNew = newIndex;
                const newArr = reorderArray(engines, adjustedOld, adjustedNew);
                // 更新 updatedAt
                const now = Date.now();
                newArr.forEach(item => item.updatedAt = now);
                chrome.storage.local.set({ SearchEngines: newArr }, () => {
                    showStatus('顺序已保存', 'success');
                    loadEngines();
                });
            });
        }
    };

    sortableInstance = Sortable.create(listEl, options);
}

// 存储原始配置，用于检测变化（已禁用）
// let originalConfig = [];
// let hasChanges = false;

// 配置变化时的回调函数（已禁用）
function onConfigChange() {
    // checkForChanges();
    // updateSaveButtonState();
}

// 检测是否有配置变化（已禁用）
function checkForChanges() {
    // const currentConfig = getCurrentConfiguration();
    // hasChanges = !arraysEqual(originalConfig, currentConfig);
}

// 获取当前页面的配置
function getCurrentConfiguration() {
    const engines = [];
    const engineItems = document.querySelectorAll('.engine-item:not(:last-child)');
    
    engineItems.forEach(item => {
        const checkbox = item.querySelector('.engine-checkbox');
        const nameInput = item.querySelector('.engine-name');
        const urlInput = item.querySelector('.engine-url');
        
        if (checkbox && nameInput && urlInput) {
            engines.push({
                name: nameInput.value.trim(),
                url: urlInput.value.trim(),
                enabled: checkbox.checked
            });
        }
    });
    
    return engines;
}

// 比较两个配置数组是否相等
function arraysEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    
    for (let i = 0; i < arr1.length; i++) {
        const a = arr1[i];
        const b = arr2[i];
        if (a.name !== b.name || a.url !== b.url || a.enabled !== b.enabled) {
            return false;
        }
    }
    return true;
}

// 更新保存按钮状态（已禁用）
function updateSaveButtonState() {
    const saveBtn = document.getElementById('saveConfigBtn');
    if (saveBtn) {
        saveBtn.style.display = 'none'; // 隐藏保存按钮，改为自动保存
    }
}

// 保存所有配置
function saveAllConfigurations() {
    // if (!hasChanges) return; // 已禁用变更检查
    
    const currentConfig = getCurrentConfiguration();
    
    // 验证配置
    for (const engine of currentConfig) {
        if (!engine.name || !engine.url) {
            showStatus('引擎名称和URL不能为空', 'error');
            return;
        }
        if (!engine.url.includes('%s')) {
            showStatus(`引擎"${engine.name}"的URL必须包含占位符 %s`, 'error');
            return;
        }
    }
    
    // 保存到存储
    chrome.storage.local.set({ SearchEngines: currentConfig }, () => {
        // originalConfig = JSON.parse(JSON.stringify(currentConfig)); // 已禁用
        // hasChanges = false; // 已禁用
        // updateSaveButtonState(); // 已禁用
        showStatus('配置已保存', 'success');
    });
}

// 导出配置
function exportConfig() {
    // 读取配置数据
    chrome.storage.local.get('SearchEngines', (result) => {
        const config = {
            version: '1.0',
            exportTime: new Date().toISOString(),
            SearchEngines: result.SearchEngines || [],
        };
        
        // 创建json文件
        const configJson = JSON.stringify(config, null, 2);
        const blob = new Blob([configJson], { type: 'application/json' });

        // 下载保存文件
        chrome.downloads.download({
            url: URL.createObjectURL(blob),
            filename: `右键增强配置.${new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}.json`,
            saveAs: true
        });
    });
}

// 导入配置
function importConfig(event) {
    const file = event.target.files[0];
    if (!file) {
        showStatus('未选择文件', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            // 解析JSON
            const config = JSON.parse(e.target.result);
            
            // 验证配置文件的基本结构和数据
            if (!config || !Array.isArray(config.SearchEngines)) {
                throw new Error('配置文件格式不正确或缺少引擎数据');
            }
            
            // 确认导入
            const engineCount = config.SearchEngines.length;
            if (!confirm(`确定要导入配置吗？\n\n将导入 ${engineCount} 个搜图引擎。\n导入时间：${config.exportTime ? new Date(config.exportTime).toLocaleString() : '未知'}\n\n注意：这将覆盖当前所有搜图引擎设置！`)) {
                event.target.value = ''; // 清空文件输入
                return;
            }

            // 直接使用解析出的引擎配置进行保存
            chrome.storage.local.set({ SearchEngines: config.SearchEngines }, () => {
                showStatus(`配置导入成功！已导入 ${engineCount} 个引擎`, 'success');
                // 重新加载页面数据以显示新配置
                loadEngines();
            });

        } catch (error) {
            showStatus(`导入失败：${error.message}`, 'error');
            console.error('Config import error:', error);
        } finally {
            // 无论成功或失败，都清空文件输入框，以便可以再次选择同一个文件
            event.target.value = '';
        }
    };

    reader.readAsText(file);
}

// 重置配置
function resetConfig() {

    if (!confirm('确定要重置所有配置吗?')) {return;}
    
    // 直接设置默认的搜索引擎
    chrome.storage.local.get('DefaultEngines', (result) => {
        const defaultEngines = result.DefaultEngines || [];
    
        // 直接保存到本地存储
        chrome.storage.local.set({ SearchEngines: defaultEngines }, () => {
            loadEngines(); // 刷新设置页面
            showStatus('配置已重置为默认值', 'success');
        });
    });
}


// 显示状态消息
function showStatus(message, type) {
    const status = document.getElementById('status');
    status.innerHTML = `<div class="status ${type}">${message}</div>`;
    
    // 3秒后自动隐藏
    setTimeout(() => {
        status.innerHTML = '';
    }, 3000);
}


// 创建单个引擎项
function createEngineItem(engine, index) {
    const engineItem = document.createElement('div');
    engineItem.className = 'engine-item';
    engineItem.dataset.engineIndex = index;
    
    const label = document.createElement('label');
    
    // 启用/禁用复选框
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'engine-checkbox';
    checkbox.checked = engine.enabled;
    checkbox.addEventListener('change', function() {
        // 立即保存该项的 enabled 状态到 storage
        chrome.storage.local.get('SearchEngines', (result) => {
            const engines = result.SearchEngines || [];
            const idx = index;
            if (idx >= 0 && idx < engines.length) {
                engines[idx].enabled = checkbox.checked;
                engines[idx].updatedAt = Date.now();
                // 合并并写回（简单策略：覆盖该索引）
                chrome.storage.local.set({ SearchEngines: engines }, () => {
                    // originalConfig = JSON.parse(JSON.stringify(engines)); // 已禁用
                    // hasChanges = false; // 已禁用
                    // updateSaveButtonState(); // 已禁用
                    showStatus('已保存启用状态', 'success');
                    // 重新渲染以保持索引和 DOM 一致
                    loadEngines();
                });
            } else {
                // 如果找不到对应项，回退到整体变更检测（已禁用）
                // onConfigChange();
            }
        });
    });
    
    // 引擎名称输入框
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'engine-name';
    nameInput.value = engine.name;
    nameInput.setAttribute('aria-label', '搜索引擎名称');
    // nameInput.addEventListener('input', onConfigChange); // 已禁用变更监听
    nameInput.addEventListener('blur', autoSaveOnBlur); // 失去焦点时自动保存
    
    // 引擎URL输入框
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'engine-url';
    urlInput.value = engine.url;
    urlInput.setAttribute('aria-label', '搜索引擎URL');
    // urlInput.addEventListener('input', onConfigChange); // 已禁用变更监听
    urlInput.addEventListener('blur', autoSaveOnBlur); // 失去焦点时自动保存
    
    // 删除按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn icon-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = '删除引擎';
    deleteBtn.setAttribute('aria-label', '删除引擎');
    deleteBtn.addEventListener('click', function() {
        deleteEngine(index);
    });

    // 组合元素（移除上移/下移按钮，整行可拖拽）
    const buttonWrapper = document.createElement('div');
    buttonWrapper.className = 'engine-item-buttons';
    buttonWrapper.appendChild(deleteBtn);

    label.append(checkbox, nameInput, urlInput);
    engineItem.append(label, buttonWrapper);
    
    return engineItem;
}

// 创建新增引擎表单
function createNewEngineForm() {
    const engineItem = document.createElement('div');
    engineItem.className = 'engine-item';
    // 新增行不应参与拖拽
    engineItem.classList.add('non-draggable');
    
    const label = document.createElement('label');
    
    // 创建一个加号图标来代替复选框
    const addIcon = document.createElement('div');
    addIcon.className = 'add-engine-icon';
    addIcon.textContent = '+';
    
    // 名称输入框
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'new-engine-name';
    nameInput.className = 'engine-name new-engine-input';
    nameInput.placeholder = '新引擎名称';
    nameInput.setAttribute('aria-label', '新引擎名称');
    // nameInput.addEventListener('blur', autoAddNewEngine); // 已移除自动添加，改为手动添加
    
    // URL输入框
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.id = 'new-engine-url';
    urlInput.className = 'engine-url new-engine-input';
    urlInput.placeholder = '新引擎 URL (图片链接用 %s 占位)';
    urlInput.setAttribute('aria-label', '新引擎URL');
    // urlInput.addEventListener('blur', autoAddNewEngine); // 已移除自动添加，改为手动添加
    
    // 添加按钮
    const addBtn = document.createElement('button');
    addBtn.id = 'add-engine-btn';
    addBtn.className = 'icon-btn';
    addBtn.innerHTML = '+';
    addBtn.title = '添加引擎';
    addBtn.setAttribute('aria-label', '添加引擎');
    addBtn.addEventListener('click', addNewEngine);
    
    // 组合元素
    const buttonWrapper = document.createElement('div');
    buttonWrapper.className = 'engine-item-buttons';
    buttonWrapper.appendChild(addBtn);

    label.append(addIcon, nameInput, urlInput);
    engineItem.append(label, buttonWrapper);
    
    return engineItem;
}







// 删除引擎
function deleteEngine(engineIndex) {
    if (!confirm('确定要删除此搜索引擎吗？')) return;
    
    chrome.storage.local.get('SearchEngines', (result) => {
        const engines = result.SearchEngines || [];
        
        if (engineIndex >= 0 && engineIndex < engines.length) {
            const engineName = engines[engineIndex].name;
            engines.splice(engineIndex, 1);
            
            chrome.storage.local.set({ SearchEngines: engines }, () => {
                showStatus(`已删除 "${engineName}" 搜索引擎`, 'success');
                loadEngines(); // 重新加载列表
            });
        }
    });
}


// 添加新引擎
function addNewEngine() {
    const nameInput = document.getElementById('new-engine-name');
    const urlInput = document.getElementById('new-engine-url');
    
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    
    if (!name || !url) {
        showStatus('名称和URL不能为空', 'error');
        return;
    }
    
    // 检查URL是否包含占位符
    if (!url.includes('%s')) {
        showStatus('URL必须包含图片占位符 %s', 'error');
        return;
    }
    
    // 添加新引擎
    chrome.storage.local.get('SearchEngines', (result) => {
        const engines = result.SearchEngines || [];
        
        // 检查名称是否重复
        if (engines.some(e => e.name === name)) {
            showStatus('引擎名称已存在', 'error');
            return;
        }
        
        // 创建新引擎
        const newEngine = {
            name: name,
            url: url,
            enabled: true
        };
        
        engines.push(newEngine);
        
        chrome.storage.local.set({ SearchEngines: engines }, () => {
            showStatus(`已添加 "${name}" 搜索引擎`, 'success');
            nameInput.value = '';
            urlInput.value = '';
            loadEngines(); // 重新加载列表
        });
    });
}
