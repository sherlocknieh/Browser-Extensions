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


// 显示Toast提示
function showToast(text, icon = 'success') {
    // 使用 Toastify 显示 Toast
    Toastify({
        text: text,
        duration: 3000,
        close: true,
        gravity: 'top',
        position: 'right',
        style: { background: icon === 'success' ? '#43d477' : (icon === 'error' ? '#e74c3c' : '#f1c40f') },
        stopOnFocus: true
    }).showToast();
}
