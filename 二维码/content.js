// 监听 background 消息
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    // 处理二维码识别请求
    if (message.action === "decodeQR" && message.imageUrl) {
        handleImageLink(message.imageUrl);
    }
    // 处理截图识别请求
    if (message.action === "screenshotQR") {
        handleScreenshot();           //  截图识别
    }
    // 处理粘贴图片识别请求
    if (message.action === "pasteImageQR") {
        handlePasteImage();           //  粘贴识别
    }
});


// 图片链接处理流程
function handleImageLink(imageUrl) {

    LoadImage(imageUrl)             // 获取图片数据
        .then(imageData => {
            decodeQRCode(imageData);    // 解析二维码
        })
        .catch(error => {
            Swal.fire({
                toast: true,
                icon: 'error',
                title: chrome.i18n.getMessage('imageFetchFailed'),
                text: error.message,
                showCloseButton: true,
            });                         // 显示错误信息
        });


    // 图片链接 => 图片数据
    async function LoadImage(imageUrl) {
        // 检查是否跨域（本地文件 file: 链接视为跨域）
        if (!imageUrl.startsWith('file:') && new URL(imageUrl).origin === window.location.origin) {
            // 未跨域：直接获取
            const img = document.createElement('img');
            img.src = imageUrl;
            await new Promise((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error(chrome.i18n.getMessage('imageLoadFailed')));
            });
            return imgToData(img);
        } else {
            // 跨域：通过 background 代理获取
            const loadingToast = Swal.fire({
                toast: true,
                icon: 'info',
                title: chrome.i18n.getMessage('fetchingImage'),
                text: chrome.i18n.getMessage('crossOriginNotice'),
                showCloseButton: true,
                didOpen: () => { Swal.showLoading(); }
            });
            return new Promise((resolve, reject) => {
                // 向 background 发起消息
                chrome.runtime.sendMessage({ action: "fetchImage", url: imageUrl }, (response) => {
                    if (response && response.success) {
                        const img = new Image();
                        img.onload = () => resolve(imgToData(img));
                        img.onerror = () => reject(new Error(chrome.i18n.getMessage('imageLoadFailed')));
                        img.src = response.dataUrl;
                    } else {
                        reject(new Error(response?.error || chrome.i18n.getMessage('proxyFetchFailed')));
                    }
                    loadingToast.close();
                });
            });
        }

        // 辅助函数：从图片元素获取图片数据
        function imgToData(img) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            ctx.drawImage(img, 0, 0);
            return ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
    }


    // 图片数据 => 解析结果
    function decodeQRCode(imageData) {
        // 显示"解析中"弹窗
        const loadingToast = Swal.fire({
            toast: true,
            icon: 'info',
            title: chrome.i18n.getMessage('decodingQR'),
            didOpen: () => { Swal.showLoading(); },
            showCloseButton: true
        });
        // 延时50ms确保弹窗渲染完成
        setTimeout(() => {
            // 解析二维码
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "attemptBoth"   // 支持反转色
            });

            loadingToast.close(); // 关闭弹窗

            // 显示结果
            if (code) {
                const result = code.data;
                Swal.fire({
                    toast: true,
                    icon: 'success',
                    title: chrome.i18n.getMessage('recognitionSuccess'),
                    text: result,
                    showCancelButton: true,
                    confirmButtonText: chrome.i18n.getMessage('openLink'),
                    cancelButtonText: chrome.i18n.getMessage('copyLink'),
                    showCloseButton: true
                }).then((res) => {
                    if (res.isConfirmed) {
                        const url = result.startsWith('http') ? result : 'https://' + result;
                        window.open(url, '_blank');
                    } else if (res.dismiss === Swal.DismissReason.cancel) {
                        navigator.clipboard.writeText(result);
                    }
                });
            } else {
                // "未识别到二维码"弹窗
                Swal.fire({
                    toast: true,
                    icon: 'warning',
                    title: chrome.i18n.getMessage('recognitionFailed'),
                    text: chrome.i18n.getMessage('noValidQRCode'),
                    confirmButtonText: chrome.i18n.getMessage('confirm'),
                    showCloseButton: true
                });
            }
        }, 50);  // 延时让浏览器渲染加载弹窗
    }
}

// 截图识别流程
function handleScreenshot() {
    // 创建截图插件实例
    // 该插件会自动启用 webrtc 模式来获取屏幕
    const screenShotHandler = new screenShotPlugin({
        enableWebRtc: true,  // 启用 WebRTC 来获取屏幕内容
        // 截图完成回调
        completeCallback: ({ base64, cutInfo }) => {
            // 获取到截图的 base64 数据，开始识别二维码
            handleImageLink(base64);
            // 销毁截图容器
            screenShotHandler.destroyComponents();
        },
        // 截图取消回调
        closeCallback: () => {
            console.log("截图窗口已关闭");
        },
        // WebRTC 响应完成回调（用户选择要截图的内容后触发）
        triggerCallback: (response) => {
            if (response.code === 0) {
                console.log("截图组件加载完成");
            } else {
                Swal.fire({
                    toast: true,
                    icon: 'warning',
                    title: chrome.i18n.getMessage('screenshotFailed'),
                    text: response.msg,
                    showCloseButton: true
                });
            }
        },
        // WebRTC 被取消或浏览器不支持时的回调
        cancelCallback: (response) => {
            Swal.fire({
                toast: true,
                icon: 'error',
                title: chrome.i18n.getMessage('screenshotCancelled'),
                text: response.msg,
                showCloseButton: true
            });
        }
    });

    // 确保截图容器位于最顶层
    setTimeout(() => {
        // 截屏容器置顶（需完整定位和尺寸）
        const screenshotContainer = document.getElementById('screenShotContainer');
        if (screenshotContainer) {
            screenshotContainer.style.zIndex = '2147483647';
            screenshotContainer.style.position = 'fixed';
            screenshotContainer.style.top = '0';
            screenshotContainer.style.left = '0';
            screenshotContainer.style.width = '100%';
            screenshotContainer.style.height = '100%';
        }

        // 功能面板置顶
        const panelIds = [
            'toolPanel',
            'optionIcoController',
            'cutBoxSizePanel',
            'optionPanel'
        ];

        panelIds.forEach(id => {
            const panel = document.getElementById(id);
            if (panel) {
                panel.style.zIndex = '2147483647';
                panel.style.position = 'fixed';
            }
        });
    }, 100);
}

// 粘贴识别流程
async function handlePasteImage() {
    // 防止重复创建对话框：若已存在则聚焦并返回
    const existing = document.getElementById('qr-paste-dialog-container');
    if (existing) {
        try {
            existing.style.zIndex = '2147483647';
            const focusBtn = existing.querySelector('#qr-paste-btn') || existing.querySelector('button');
            if (focusBtn && typeof focusBtn.focus === 'function') focusBtn.focus();
        } catch (e) {
            // ignore
        }
        return;
    }
    // 创建对话框容器并加载模板与样式
    const dialogContainer = document.createElement('div');
    dialogContainer.id = 'qr-paste-dialog-container';

    const loadDialogAssets = async () => {
        try {
            const htmlResponse = await fetch(chrome.runtime.getURL('libs/paste-image-dialog.html'));
            let htmlContent = await htmlResponse.text();
            // 替换多语言占位符
            return htmlContent.replace(/__MSG_(\w+)__/g, (match, key) => {
                return chrome.i18n.getMessage(key) || match;
            });
        } catch (error) {
            console.error('加载对话框资源失败:', error);
            return null;
        }
    };

    const content = await loadDialogAssets();
    if (!content) throw new Error('无法加载对话框资源');
    dialogContainer.innerHTML = content;
    document.body.appendChild(dialogContainer);

    // 下面为对话框内逻辑（保留原实现，但以更小的、局部函数形式组织）
    const overlay = document.getElementById('qr-paste-dialog-overlay');
    const dialog = document.getElementById('qr-paste-dialog');
    // 确保对话框或容器可聚焦，以便接收系统 paste 事件和键盘粘贴
    if (dialog) {
        try {
            dialog.tabIndex = -1;
            dialog.focus();
            dialog.addEventListener('click', () => { try { dialog.focus(); } catch (e) { } });
        } catch (e) { }
    } else {
        try { dialogContainer.tabIndex = -1; dialogContainer.focus(); } catch (e) { }
    }
    const dropZone = document.getElementById('qr-drop-zone');
    const imagePreview = document.getElementById('qr-image-preview');
    const fileInput = document.getElementById('qr-file-input');
    const clearBtn = document.getElementById('qr-clear-btn');
    const closeBtn = document.getElementById('qr-close-btn');
    const loading = document.getElementById('qr-loading');
    const result = document.getElementById('qr-result');
    const resultText = document.getElementById('qr-result-text');
    const resultButtons = document.getElementById('qr-result-buttons');

    let currentImageData = null;
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/gif', 'image/webp'];

    function closeDialog() {
        dialogContainer.remove();
        document.removeEventListener('keydown', keydownHandler);
        try { document.removeEventListener('paste', pasteHandler); } catch (e) { /* ignore */ }
    }

    closeBtn.addEventListener('click', closeDialog);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(); });

    clearBtn.addEventListener('click', clearImage);

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); if (!currentImageData) dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); dropZone.classList.remove('dragover'); if (currentImageData) return;
        const files = e.dataTransfer.files; if (files.length === 0) { showResult(chrome.i18n.getMessage('dragDropImageOnly'), 'error'); return; }
        const file = files[0]; if (supportedTypes.includes(file.type.toLowerCase())) loadImageFromBlob(file); else showResult(`${chrome.i18n.getMessage('unsupportedFormat')}${file.type || chrome.i18n.getMessage('formatUnknown')}`, 'error');
    });

    dropZone.addEventListener('click', () => { if (!currentImageData) fileInput.click(); });
    fileInput.addEventListener('change', (e) => { const file = e.target.files[0]; if (!file) return; if (supportedTypes.includes(file.type.toLowerCase())) loadImageFromBlob(file); else showResult(`${chrome.i18n.getMessage('unsupportedFormat')}${file.type || chrome.i18n.getMessage('formatUnknown')}`, 'error'); });

    // 处理键盘粘贴（Ctrl/Cmd+V）与关闭键
    const keydownHandler = (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
            // 当对话框或其中元素有焦点时，触发粘贴处理
            if (dialog && dialog.contains(document.activeElement)) {
                e.preventDefault();
                handlePaste();
            }
        } else if (e.key === 'Escape') {
            closeDialog();
        }
    };
    document.addEventListener('keydown', keydownHandler);

    // 直接响应系统 paste 事件（更可靠），优先从 event 获取图片数据
    const pasteHandler = (e) => {
        try {
            if (!dialog || !document.body.contains(dialog)) return;
            const items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            for (const item of items) {
                if (item && item.type && item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) {
                        e.preventDefault();
                        loadImageFromBlob(file);
                        return;
                    }
                }
            }
        } catch (err) {
            console.error('paste event error', err);
        }
    };
    document.addEventListener('paste', pasteHandler);

    async function handlePaste() {
        try {
            if (!navigator.clipboard || !navigator.clipboard.read) { showResult(chrome.i18n.getMessage('unknownError'), 'error'); return; }
            const clipboardItems = await navigator.clipboard.read();
            for (const clipboardItem of clipboardItems) {
                for (const type of clipboardItem.types) {
                    if (type.startsWith('image/')) { const blob = await clipboardItem.getType(type); loadImageFromBlob(blob); return; }
                }
            }
            showResult(chrome.i18n.getMessage('clipboardNoImage'), 'error');
        } catch (error) {
            console.error('粘贴失败:', error);
            let errorMessage = chrome.i18n.getMessage('unknownError');
            showResult(errorMessage, 'error');
        }
    }

    function loadImageFromBlob(blob) {
        const reader = new FileReader();
        reader.onload = (e) => { currentImageData = e.target.result; displayImage(currentImageData); clearResult(); };
        reader.onerror = () => showResult(chrome.i18n.getMessage('imageLoadFailed'), 'error');
        reader.readAsDataURL(blob);
    }

    function displayImage(dataUrl) {
        imagePreview.src = dataUrl;
        imagePreview.style.display = 'block';
        dropZone.classList.add('has-image');
        const uploadIcon = dropZone.querySelector('.qr-upload-icon');
        const uploadText = dropZone.querySelector('.qr-upload-text');
        const uploadHint = dropZone.querySelector('.qr-upload-hint');
        if (uploadIcon) uploadIcon.style.display = 'none';
        if (uploadText) uploadText.style.display = 'none';
        if (uploadHint) uploadHint.style.display = 'none';
        // 有图片后自动开始识别
        scanQRCode();
    }

    function clearImage() {
        currentImageData = null;
        imagePreview.src = '';
        imagePreview.style.display = 'none';
        dropZone.classList.remove('has-image');
        const uploadIcon = dropZone.querySelector('.qr-upload-icon');
        const uploadText = dropZone.querySelector('.qr-upload-text');
        const uploadHint = dropZone.querySelector('.qr-upload-hint');
        if (uploadIcon) uploadIcon.style.display = 'block';
        if (uploadText) uploadText.style.display = 'block';
        if (uploadHint) uploadHint.style.display = 'block';
        clearResult();
        fileInput.value = '';
    }

    function showResult(message, type) {
        result.className = `qr-result ${type}`;
        resultText.textContent = message;
        resultButtons.innerHTML = '';
        result.style.display = 'block';
    }

    function showSuccess(qrData) {
        result.className = 'qr-result success'; resultText.textContent = chrome.i18n.getMessage('recognitionSuccessTitle') + qrData;
        const miniBtnStyle = 'padding: 6px 12px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; transition: all 0.2s ease;';
        const openBtn = document.createElement('button');
        openBtn.className = 'qr-mini-btn qr-mini-btn-open';
        openBtn.style.cssText = miniBtnStyle + 'background: #007bff; color: white;';
        openBtn.textContent = chrome.i18n.getMessage('openLink');
        openBtn.onclick = () => {
            let url = qrData.trim(); if (!url.startsWith('http://') && !url.startsWith('https://')) { if (url.includes('.') && !url.includes(' ')) url = 'https://' + url; else url = `https://www.google.com/search?q=${encodeURIComponent(qrData)}`; }
            try { const parsedUrl = new URL(url); if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('不支持的协议'); window.open(url, '_blank'); } catch (error) { showResult(chrome.i18n.getMessage('unknownError'), 'error'); }
        };
        const copyBtn = document.createElement('button');
        copyBtn.className = 'qr-mini-btn qr-mini-btn-copy';
        copyBtn.style.cssText = miniBtnStyle + 'background: #6c757d; color: white;';
        copyBtn.textContent = chrome.i18n.getMessage('copyContent');
        copyBtn.onclick = () => { navigator.clipboard.writeText(qrData); copyBtn.textContent = chrome.i18n.getMessage('alreadyCopied'); setTimeout(() => { copyBtn.textContent = chrome.i18n.getMessage('copyContent'); }, 2000); };
        resultButtons.innerHTML = ''; if (qrData.startsWith('http') || qrData.includes('.')) resultButtons.appendChild(openBtn); resultButtons.appendChild(copyBtn);
        result.style.display = 'block';
    }

    function clearResult() { result.style.display = 'none'; result.className = 'qr-result'; }

    async function scanQRCode() {
        if (!currentImageData) return;
        loading.style.display = 'block';
        clearResult();
        setTimeout(async () => {
            try {
                let imageData;
                // 优先使用已展示的图片元素获取像素数据，避免 dataURL/new Image 的潜在问题
                if (imagePreview && imagePreview.src) {
                    imageData = await (async () => {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        canvas.width = imagePreview.naturalWidth || imagePreview.width;
                        canvas.height = imagePreview.naturalHeight || imagePreview.height;
                        ctx.drawImage(imagePreview, 0, 0);
                        return ctx.getImageData(0, 0, canvas.width, canvas.height);
                    })();
                } else {
                    imageData = await getImageData(currentImageData);
                }

                const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
                loading.style.display = 'none';
                if (code) {
                    showSuccess(code.data);
                } else {
                    showResult(chrome.i18n.getMessage('recognitionFailedMsg'), 'error');
                }
            } catch (error) {
                loading.style.display = 'none';
                console.error('识别失败:', error);
                showResult(chrome.i18n.getMessage('recognitionFailed') + ': ' + (error && error.message ? error.message : String(error)), 'error');
            }
        }, 100);
    }

    async function getImageData(dataUrl) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); canvas.width = img.width; canvas.height = img.height; ctx.drawImage(img, 0, 0); resolve(ctx.getImageData(0, 0, canvas.width, canvas.height)); }; img.onerror = () => reject(new Error('图片加载失败')); img.src = dataUrl; }); }

}