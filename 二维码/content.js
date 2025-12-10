// 监听来自 background.js 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 处理二维码识别请求
    if (message.action === "decodeQR" && message.imageUrl) {
        QRCodeReader(message.imageUrl);
        // 这里传入的图片URL是完整链接
    }
    if (message.action === "screenshotQR") {
        // 处理截图识别请求
        handleScreenshotQR();
    }
});


// 二维码识别流程
function QRCodeReader(imageUrl) {

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
}


// 图片数据加载函数
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
            didOpen: () => {Swal.showLoading();}
        });
        return new Promise((resolve, reject) => {
            // 向 background 发起消息
            chrome.runtime.sendMessage({action: "fetchImage", url: imageUrl}, (response) => {
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


// 二维码解析函数
async function decodeQRCode(imageData) {
    // 先显示加载，再让浏览器完成一次渲染，避免 jsQR 同步阻塞导致弹窗不出现
    const loadingToast = Swal.fire({
        toast: true,
        icon: 'info',
        title: chrome.i18n.getMessage('decodingQR'),
        didOpen: () => {Swal.showLoading();},
        showCloseButton: true
    });
    setTimeout(() => {
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth"});   // 支持反转色
        loadingToast.close();
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


// 截图识别二维码函数
function handleScreenshotQR() {
    // 创建截图插件实例
    // 该插件会自动启用 webrtc 模式来获取屏幕
    const screenShotHandler = new screenShotPlugin({
        enableWebRtc: true,  // 启用 WebRTC 来获取屏幕内容
        // 截图完成回调
        completeCallback: ({base64, cutInfo}) => {
            // 获取到截图的 base64 数据，开始识别二维码
            QRCodeReader(base64);
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
}
