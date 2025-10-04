// 监听 background.js 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "copyLinkText") {
        copyLinkText();
    }
});


// 监听右键点击事件，记录被点击的元素
let lastRightClicked = null;
document.addEventListener('contextmenu', (event) => {
    lastRightClicked = event.target;
});


// 复制链接文字
function copyLinkText() {
    
    const textToCopy = getLinkText(lastRightClicked);

    if (!textToCopy) {
        showToast('该链接没有文本', 'warning');
        return;
    }
    
    // 把文字设为选中状态
    selectElementText(lastRightClicked);

    // 使用 clipboard API 写入剪贴板
    navigator.clipboard.writeText(textToCopy)
        .then(() => {
            showToast(`已复制: ${textToCopy}`, 'success');
        })
        .catch(err => {
            showToast(`复制失败: ${err}`, 'error');
        });

}


// 提取链接文本
function getLinkText(Element) {
    // 获取文本内容
    let text = Element.textContent?.trim();
    if (text) {return text;}

    // 如果是图片链接，获取图片的 alt 文本
    const img = Element.querySelector('img');
    if (img && img.alt) {return img.alt;}
    
    // 没找到文本，返回 null
    return null;
}


// 选中元素的文本内容
function selectElementText(element) {
    const selection = window.getSelection();
    const range = document.createRange();
    
    // 清除现有选择
    selection.removeAllRanges();
    
    // 如果是文本节点，选中整个文本
    if (element.nodeType === Node.TEXT_NODE) {
        range.selectNode(element);
    } else {
        // 选中元素内的所有文本内容
        range.selectNodeContents(element);
    }
    
    // 应用选择
    selection.addRange(range);
    
    // 触发选中相关事件以通知其他插件
    try {
        // 1. selectionchange - 最重要的选择变化事件
        document.dispatchEvent(new Event('selectionchange', {
            bubbles: true,
            cancelable: true
        }));
        
        // 2. mouseup - 划词插件最常监听的事件
        const rect = element.getBoundingClientRect();
        element.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            button: 0
        }));
        
    } catch (error) {
        console.warn('触发选择事件失败:', error);
    }
}


// 显示Toast提示
function showToast(text, icon = 'success') {
    // 用 Toastify 显示 Toast
    Toastify({
        text: text,
        duration: 3000,
        close: true,
        gravity: 'bottom',
        position: 'center',
        style: { background: icon === 'success' ? '#43d477' : (icon === 'error' ? '#e74c3c' : '#f1c40f') },
        stopOnFocus: true
    }).showToast();
}
