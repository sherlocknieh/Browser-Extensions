// =========================
//      设置页面初始化
// =========================
import './styles.css';
import Sortable from 'sortablejs';
import "toastify-js/src/toastify.css";
import Toastify from 'toastify-js';

type SearchEngine = {
    enabled: boolean;
    name: string;
    url: string;
};


document.addEventListener('DOMContentLoaded', function() {
    loadConfigButtons(); // 加载配置管理按钮
    loadEngines();       // 加载搜索引擎列表
});

// 加载配置管理按钮
function loadConfigButtons() {
    // 支持 id 或 class 作为容器，增强容错
    const configButtonsDiv = document.getElementById('config-buttons') || document.querySelector('.config-buttons');
    if (!configButtonsDiv) return;

    // 导出配置按钮
    const exportBtn = document.createElement('button');
    exportBtn.textContent = '📤 导出配置';
    exportBtn.className = 'config-btn';
    exportBtn.id = 'exportConfigBtn';
    exportBtn.addEventListener('click', exportConfig);
    configButtonsDiv.appendChild(exportBtn);

    // 隐藏的文件输入框
    const importFileInput = document.createElement('input');
    importFileInput.type = 'file';
    importFileInput.id = 'importConfigFile';
    importFileInput.accept = 'application/json,.json';
    importFileInput.style.display = 'none';
    importFileInput.addEventListener('change', importConfig);
    configButtonsDiv.appendChild(importFileInput);

    // 导入配置按钮（触发文件选择）
    const importBtn = document.createElement('button');
    importBtn.textContent = '📥 导入配置';
    importBtn.className = 'config-btn import-btn';
    importBtn.id = 'importConfigBtn';
    importBtn.addEventListener('click', () => importFileInput.click());
    configButtonsDiv.appendChild(importBtn);

    // 重置配置按钮
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '🔄 重置配置';
    resetBtn.className = 'config-btn';
    resetBtn.id = 'resetConfigBtn';
    resetBtn.addEventListener('click', resetConfig);
    configButtonsDiv.appendChild(resetBtn);
}

// 加载搜图引擎列表
function loadEngines() {

    const enginesList = document.getElementById('enginesList');
    if (!enginesList) return;
    enginesList.textContent = '';

    browser.storage.local.get('SearchEngines', (result: { SearchEngines?: SearchEngine[] }) => {

        const engines = result.SearchEngines || [];

        if (engines.length === 0) {
            const noEnginesMsg = document.createElement('p');
            noEnginesMsg.style.color = '#666';
            noEnginesMsg.textContent = '暂无自定义搜图引擎';
            enginesList.appendChild(noEnginesMsg);
            return;
        }

        // 渲染引擎项
        engines.forEach((engine: SearchEngine, index: number) => {
            const engineItem = createEngineItem(engine, index);
            enginesList.appendChild(engineItem);
        });

        // 新增引擎输入行
        const newEngineForm = createNewEngineForm();
        enginesList.appendChild(newEngineForm);

        initializeSortable();
    });
}

// 创建单个引擎项
function createEngineItem(engine: { enabled: boolean; name: string; url: string; }, index: number) {
    
    const engineItem = document.createElement('div');
    engineItem.className = 'engine-item';

    engineItem.dataset.engineIndex = String(index);

    // 启用/禁用复选框
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'engine-checkbox';
    checkbox.checked = engine.enabled;
    checkbox.addEventListener('change', function() {
        browser.storage.local.get('SearchEngines', (result: { SearchEngines?: SearchEngine[] }) => {
            const engines = result.SearchEngines || [];
            const idx = index;
            if (idx >= 0 && idx < engines.length) {
                engines[idx].enabled = checkbox.checked;
                browser.storage.local.set({ SearchEngines: engines }, () => {
                    showStatus('已保存启用状态', 'success');
                    loadEngines();
                });
            }
        });
    });

    // 引擎名称输入框
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'engine-name';
    nameInput.value = engine.name;

    // 引擎URL输入框
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'engine-url';
    urlInput.value = engine.url;

    // 删除按钮
    const deleteBtn = document.createElement('button') as HTMLButtonElement & { _confirmInterval?: ReturnType<typeof setInterval> | null };
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = '删除引擎';
    // 二次确认：首次点击进入确认态并显示倒计时，二次点击才执行删除
    deleteBtn.addEventListener('click', function() {
        const confirming = deleteBtn.dataset.confirm === 'true';

        // 工具函数：清理倒计时定时器
        const clearCountdown = () => {
            if (deleteBtn._confirmInterval) {
                clearInterval(deleteBtn._confirmInterval);
                deleteBtn._confirmInterval = null;
            }
        };

        if (!confirming) {
            // 进入确认态并启动倒计时
            deleteBtn.dataset.confirm = 'true';
            deleteBtn.classList.add('confirm');
            deleteBtn.title = '再次点击确认删除';

            let remaining = 3;
            deleteBtn.innerHTML = `确认(${remaining})`;
            clearCountdown();
            deleteBtn._confirmInterval = setInterval(() => {
                remaining -= 1;
                if (remaining <= 0) {
                    // 超时自动还原
                    clearCountdown();
                    deleteBtn.dataset.confirm = 'false';
                    deleteBtn.innerHTML = '<span class="icon-trash">🗑️</span>';
                    deleteBtn.title = '删除引擎';
                    deleteBtn.classList.remove('confirm');
                } else {
                    deleteBtn.innerHTML = `确认(${remaining})`;
                }
            }, 1000);
        } else {
            // 确认删除
            clearCountdown();
            deleteBtn.dataset.confirm = 'false';
            deleteBtn.innerHTML = '<span class="icon-trash">🗑️</span>';
            deleteBtn.title = '删除引擎';
            deleteBtn.classList.remove('confirm');
            deleteEngine(index);
        }
    });
    engineItem.append(checkbox, nameInput, urlInput, deleteBtn);
    // 绑定本行输入框的就地保存处理
    attachInlineSaveHandlers(nameInput, urlInput, index);
    return engineItem;
}

// 创建新增引擎表单
function createNewEngineForm() {
    const engineItem = document.createElement('div');
    engineItem.className = 'engine-item';
    engineItem.classList.add('non-draggable');

    const addIcon = document.createElement('button');
    addIcon.className = 'add-engine-icon';
    addIcon.textContent = '+';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'new-engine-name';
    nameInput.className = 'engine-name new-engine-input';
    nameInput.placeholder = '新引擎名称';

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.id = 'new-engine-url';
    urlInput.className = 'engine-url new-engine-input';
    urlInput.placeholder = '新引擎 URL (图片链接用 %s 占位)';

    const addBtn = document.createElement('button');
    addBtn.id = 'add-engine-btn';
    addBtn.innerHTML = '+';
    addBtn.title = '添加引擎';
    addBtn.addEventListener('click', addNewEngine);

    engineItem.append(addIcon, nameInput, urlInput, addBtn);
    // 支持回车提交：在新增引擎输入框按 Enter 时触发添加
    const newEngineKeyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addNewEngine();
        }
    };
    nameInput.addEventListener('keydown', newEngineKeyHandler);
    urlInput.addEventListener('keydown', newEngineKeyHandler);
    return engineItem;
}



// =============================
// 配置更改: 增加/删除/修改/排序
// =============================

// 添加引擎
function addNewEngine() {
    const nameInput = document.getElementById('new-engine-name') as HTMLInputElement | null;
    const urlInput = document.getElementById('new-engine-url') as HTMLInputElement | null;
    if (!nameInput || !urlInput) return;
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    if (!name || !url) {
        showStatus('名称和URL不能为空', 'error');
        return;
    }
    if (!url.includes('%s')) {
        showStatus('URL必须包含图片占位符 %s', 'error');
        return;
    }
    browser.storage.local.get('SearchEngines', (result: { SearchEngines?: SearchEngine[] }) => {
        const engines = result.SearchEngines || [];
        if (engines.some((e: SearchEngine) => e.name === name)) {
            showStatus('引擎名称已存在', 'error');
            return;
        }
        const newEngine: SearchEngine = { name, url, enabled: true };
        engines.push(newEngine);
        browser.storage.local.set({ SearchEngines: engines }, () => {
            showStatus(`已添加 "${name}" 搜索引擎`, 'success');
            nameInput.value = '';
            urlInput.value = '';
            loadEngines();
        });
    });
}

// 删除引擎
function deleteEngine(engineIndex: number) {
    browser.storage.local.get('SearchEngines', (result: { SearchEngines?: SearchEngine[] }) => {
        const engines = result.SearchEngines || [];
        if (engineIndex >= 0 && engineIndex < engines.length) {
            const engineName = engines[engineIndex].name;
            engines.splice(engineIndex, 1);
            browser.storage.local.set({ SearchEngines: engines }, () => {
                showStatus(`已删除 "${engineName}" 搜索引擎`, 'success');
                loadEngines();
            });
        }
    });
}

// 修改引擎
function attachInlineSaveHandlers(nameInput: HTMLInputElement, urlInput: HTMLInputElement, index: number) {
    const setPrev = () => {
        nameInput.dataset.prev = nameInput.value.trim();
        urlInput.dataset.prev = urlInput.value.trim();
    };
    // 初始记录一次
    setPrev();
    nameInput.addEventListener('focus', setPrev);
    urlInput.addEventListener('focus', setPrev);

    const trySaveRow = () => {
        const newName = nameInput.value.trim();
        const newUrl = urlInput.value.trim();
        const prevName = nameInput.dataset.prev || '';
        const prevUrl = urlInput.dataset.prev || '';
        // 未变化则跳过
        if (newName === prevName && newUrl === prevUrl) return;
        // 基本校验
        if (!newName || !newUrl) {
            showStatus('引擎名称和URL不能为空', 'error');
            return;
        }
        if (!newUrl.includes('%s')) {
            showStatus('URL必须包含图片占位符 %s', 'error');
            return;
        }
        browser.storage.local.get('SearchEngines', (result: { SearchEngines?: SearchEngine[] }) => {
            const engines: SearchEngine[] = (result.SearchEngines || []).slice();
            if (index < 0 || index >= engines.length) return;
            // 如果名称重复且不是同一项，提示错误
            const duplicate = engines.some((e, i) => i !== index && e.name === newName);
            if (duplicate) {
                showStatus('引擎名称已存在', 'error');
                return;
            }
            engines[index] = { ...engines[index], name: newName, url: newUrl };
            browser.storage.local.set({ SearchEngines: engines }, () => {
                showStatus('配置已自动保存', 'success');
                // 更新 prev 值
                nameInput.dataset.prev = newName;
                urlInput.dataset.prev = newUrl;
            });
        });
    };

    nameInput.addEventListener('blur', trySaveRow);
    urlInput.addEventListener('blur', trySaveRow);
    // 支持回车保存：在行内输入框按 Enter 时触发保存并移除焦点
    const inlineKeyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            trySaveRow();
            // 让输入框失去焦点以触发视觉上的“提交”行为
            (e.target as HTMLInputElement | null)?.blur();
        }
    };
    nameInput.addEventListener('keydown', inlineKeyHandler);
    urlInput.addEventListener('keydown', inlineKeyHandler);
}

// 拖拽排序
function initializeSortable() {
    const listEl = document.getElementById('enginesList') as (HTMLElement & { _sortableInstance?: Sortable }) | null;
    if (!listEl) return;

    // 如果已存在实例则不重复创建（优先用 Sortable.get，回退到元素自带属性）
    const existing = (typeof Sortable !== 'undefined' && typeof Sortable.get === 'function')
        ? Sortable.get(listEl)
        : listEl._sortableInstance;
    if (existing) return;

    const options = {
        animation: 150,
        draggable: '.engine-item:not(.non-draggable)',
        filter: 'input, textarea, .new-engine-input, #new-engine-name, #new-engine-url',
        preventOnFilter: false,
        onEnd: function(evt: Sortable.SortableEvent) {
            const oldIndex = evt.oldIndex;
            const newIndex = evt.newIndex;
            if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
            browser.storage.local.get('SearchEngines', (result: { SearchEngines?: SearchEngine[] }) => {
                const engines = result.SearchEngines || [];
                const adjustedOld = oldIndex;
                const adjustedNew = newIndex;
                const newArr = reorderArray(engines, adjustedOld, adjustedNew);
                browser.storage.local.set({ SearchEngines: newArr }, () => {
                    showStatus('顺序已保存', 'success');
                    loadEngines();
                });
            });
        }
    };

    const instance = Sortable.create(listEl, options);
    // 若库不支持 Sortable.get，则手动挂在元素上做缓存
    if (!(typeof Sortable !== 'undefined' && typeof Sortable.get === 'function')) {
        listEl._sortableInstance = instance;
    }
}

// 数组重排工具
function reorderArray<T>(arr: T[], fromIndex: number, toIndex: number) {
    const len = arr.length;
    if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len || fromIndex === toIndex) {
        return arr.slice();
    }
    const res = arr.slice();
    const [item] = res.splice(fromIndex, 1);
    res.splice(toIndex, 0, item);
    return res;
}



// =========================
//    配置导入/导出/重置
// =========================

function exportConfig() {
    browser.storage.local.get('SearchEngines', (result: { SearchEngines?: SearchEngine[] }) => {
        const config = {
            version: '1.0',
            exportTime: new Date().toISOString(),
            SearchEngines: result.SearchEngines || [],
        };
        const configJson = JSON.stringify(config, null, 2);
        const blob = new Blob([configJson], { type: 'application/json' });
        browser.downloads.download({
            url: URL.createObjectURL(blob),
            filename: `右键增强配置.${new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}.json`,
            saveAs: true
        });
    });
}

function importConfig(event: Event) {
    const inputEl = event.target as HTMLInputElement | null;
    const file = inputEl?.files?.[0];
    if (!file) {
        showStatus('未选择文件', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e: ProgressEvent<FileReader>) {
        try {
            const raw = e.target?.result;
            if (typeof raw !== 'string') {
                throw new Error('读取配置文件失败');
            }
            const config = JSON.parse(raw) as { exportTime?: string; SearchEngines?: SearchEngine[] };
            if (!config || !Array.isArray(config.SearchEngines)) {
                throw new Error('配置文件格式不正确或缺少引擎数据');
            }
            const engineCount = config.SearchEngines.length;
            if (!confirm(`确定要导入配置吗？\n\n将导入 ${engineCount} 个搜图引擎。\n导入时间：${config.exportTime ? new Date(config.exportTime).toLocaleString() : '未知'}\n\n注意：这将覆盖当前所有搜图引擎设置！`)) {
                if (inputEl) inputEl.value = '';
                return;
            }
            browser.storage.local.set({ SearchEngines: config.SearchEngines }, () => {
                showStatus(`配置导入成功！已导入 ${engineCount} 个引擎`, 'success');
                loadEngines();
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showStatus(`导入失败：${message}`, 'error');
            console.error('Config import error:', error);
        } finally {
            if (inputEl) inputEl.value = '';
        }
    };
    reader.readAsText(file);
}

function resetConfig() {
    if (!confirm('确定要重置所有配置吗?')) {return;}
    browser.storage.local.get('DefaultEngines', (result: { DefaultEngines?: SearchEngine[] }) => {
        const defaultEngines = result.DefaultEngines || [];
        browser.storage.local.set({ SearchEngines: defaultEngines }, () => {
            loadEngines();
            showStatus('配置已重置为默认值', 'success');
        });
    });
}



// =========================
//         消息提示
// =========================
function showStatus(message: string, type: 'success' | 'error') {
    
    // 使用 toastify 库显示消息
    if (typeof Toastify === 'function') {
        Toastify({
            text: message,
            duration: 3000,
            close: true,
            gravity: 'bottom', // 底部显示
            position: 'center', // 居中显示
            style: {
                background: type === 'success' ? 'var(--success-color)' : 'var(--danger-color)'
            },
            stopOnFocus: true, // 鼠标悬停时暂停消失
        }).showToast();
        return;
    }

    // 如果没有 toastify 库，则使用页面内的状态栏显示（降级方案）
    const statusDiv = document.getElementById('statusMessage') as (HTMLElement & { _hideTimeout?: ReturnType<typeof setTimeout> }) | null;
    if (!statusDiv) return;

    statusDiv.textContent = message;
    statusDiv.className = `status ${type === 'success' ? 'success' : 'error'}`;
    statusDiv.style.display = 'inline-block';

    // 自动隐藏
    if (statusDiv._hideTimeout) clearTimeout(statusDiv._hideTimeout);
    statusDiv._hideTimeout = setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
}
