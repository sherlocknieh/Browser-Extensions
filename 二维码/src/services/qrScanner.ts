import jsQR from 'jsqr';

// SVG 提取像素时的目标尺寸上限，避免超大 SVG 生成大量候选图后占用过多内存。
const SVG_SCAN_DIMENSION = 512;

// 通过后台脚本获取跨域图片，并返回可供识别器使用的 Data URL。
type ProxyFetcher = (url: string) => Promise<string>;

// 图片加载选项：可指定页面来源，以及跨域图片的代理获取函数。
type LoadImageOptions = {
    origin?: string;
    fetchViaProxy?: ProxyFetcher;
};

// 判断图片地址是否可以直接从当前页面读取。
// file、data 和 blob 地址需要单独处理，不能简单按普通 URL 判断来源。
export function isSameOrigin(url: string, origin: string): boolean {
    try {
        if (url.startsWith('file:')) return false;
        if (url.startsWith('data:') || url.startsWith('blob:')) return true;
        const resolved = new URL(url, origin);
        return resolved.origin === origin;
    } catch (error) {
        return false;
    }
}

// 从图片 URL 加载像素数据。
// 同源图片直接读取；跨域图片必须先通过调用方提供的代理转换为 Data URL。
export async function loadImageDataFromUrl(imageUrl: string, options: LoadImageOptions = {}): Promise<ImageData> {
    const origin = options.origin ?? window.location.origin;
    const sameOrigin = isSameOrigin(imageUrl, origin);

    if (sameOrigin) {
        const img = await loadImageElement(imageUrl);
        return getImageDataFromImageElement(img);
    }

    if (!options.fetchViaProxy) {
        throw new Error('Cross-origin image requires a proxy fetcher.');
    }

    const dataUrl = await options.fetchViaProxy(imageUrl);
    return getImageDataFromDataUrl(dataUrl);
}

// 尝试识别二维码，并返回二维码中的文本。
// 识别器会依次尝试原图、不同颜色通道、灰度、二值化和圆点增强图。
export function decodeQrFromImageData(imageData: ImageData): string | null {
    for (const candidate of createDecodeCandidates(imageData)) {
        const code = jsQR(candidate.data, candidate.width, candidate.height, {
            inversionAttempts: 'attemptBoth',
        });
        if (code) return code.data;
    }
    return null;
}

// 按需生成识别候选图像。
// 不同图片的颜色、对比度和二维码模块样式差异较大，多组候选图可以提高识别成功率；
// 使用生成器可以在识别成功后立即停止，避免一次性构建全部候选图（数量可达 40 多张）。
function* createDecodeCandidates(imageData: ImageData): Generator<ImageData> {
    yield imageData;

    // 分别使用红、绿、蓝通道和 RGB 平均值，减少背景颜色对二值化的影响。
    const channels = [
        (red: number, green: number, blue: number) => red,
        (_red: number, green: number, _blue: number) => green,
        (_red: number, _green: number, blue: number) => blue,
        (red: number, green: number, blue: number) => Math.round((red + green + blue) / 3),
    ];

    for (const channel of channels) {
        const grayscale = toGrayscale(imageData, channel);
        yield grayscale;
        // 多个阈值用于适应亮度不均、压缩失真和低对比度图片。
        for (const threshold of [64, 96, 128, 160, 192]) {
            const binary = thresholdImage(grayscale, threshold);
            yield binary;
            // 圆点型二维码的模块之间有间隙，轻微膨胀黑色像素可帮助 jsQR
            // 连接模块并识别定位点；原始二值图仍会优先尝试。
            yield dilateBlackPixels(binary, 1);
        }
    }
}

// 将指定颜色通道转换为灰度图，同时保留原始透明度。
function toGrayscale(
    imageData: ImageData,
    channel: (red: number, green: number, blue: number) => number,
): ImageData {
    const data = new Uint8ClampedArray(imageData.data.length);
    for (let index = 0; index < imageData.data.length; index += 4) {
        const value = channel(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]);
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
        data[index + 3] = imageData.data[index + 3];
    }
    return new ImageData(data, imageData.width, imageData.height);
}

// 根据阈值生成纯黑白图。
// 深色像素变为黑色，其他像素变为白色，便于 jsQR 分析二维码模块边界。
function thresholdImage(imageData: ImageData, threshold: number): ImageData {
    const data = new Uint8ClampedArray(imageData.data.length);
    for (let index = 0; index < imageData.data.length; index += 4) {
        const value = imageData.data[index] < threshold ? 0 : 255;
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
        data[index + 3] = imageData.data[index + 3];
    }
    return new ImageData(data, imageData.width, imageData.height);
}

// 对黑色像素进行方形邻域膨胀。
// 该处理只用于额外候选图，不会修改原始图片，可修复圆点模块过于分散导致的定位失败。
function dilateBlackPixels(imageData: ImageData, radius: number): ImageData {
    const { width, height, data } = imageData;
    const output = new Uint8ClampedArray(data);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            if (data[index] !== 0) continue;

            for (let offsetY = -radius; offsetY <= radius; offsetY++) {
                const targetY = y + offsetY;
                if (targetY < 0 || targetY >= height) continue;

                for (let offsetX = -radius; offsetX <= radius; offsetX++) {
                    const targetX = x + offsetX;
                    if (targetX < 0 || targetX >= width) continue;
                    output[(targetY * width + targetX) * 4] = 0;
                    output[(targetY * width + targetX) * 4 + 1] = 0;
                    output[(targetY * width + targetX) * 4 + 2] = 0;
                }
            }
        }
    }

    return new ImageData(output, width, height);
}

// 将 HTMLImageElement 绘制到 Canvas，并提取完整像素数据。
// SVG 会先缩放到合适的尺寸：过小则放大以保留二维码细节，过大则缩小以避免生成候选图时占用过多内存。
export async function getImageDataFromImageElement(img: HTMLImageElement): Promise<ImageData> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Unable to get 2d canvas context.');
    }

    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    if (!sourceWidth || !sourceHeight) {
        throw new Error('Image has no usable dimensions.');
    }

    const isSvg = isSvgSource(img.currentSrc || img.src);
    const scale = isSvg ? getSvgScale(sourceWidth, sourceHeight) : 1;
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 放大时保持模块边缘锐利；缩小时启用平滑，避免采样丢失二维码细节。
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// 计算 SVG 的绘制缩放比例，使最长边不超过 SVG_SCAN_DIMENSION。
// 尺寸较小时最多放大 8 倍以保留二维码细节，放大后同样不超过上限。
function getSvgScale(sourceWidth: number, sourceHeight: number): number {
    const maxDimension = Math.max(sourceWidth, sourceHeight);
    if (maxDimension > SVG_SCAN_DIMENSION) {
        return SVG_SCAN_DIMENSION / maxDimension;
    }
    return Math.max(1, Math.min(8, Math.floor(SVG_SCAN_DIMENSION / maxDimension)));
}

// 加载 Data URL 图片，并复用统一的 Canvas 像素提取流程。
export async function getImageDataFromDataUrl(dataUrl: string): Promise<ImageData> {
    const img = await loadImageElement(dataUrl);
    return getImageDataFromImageElement(img);
}

// 将图片地址加载为 HTMLImageElement。
// 成功和失败都通过 Promise 显式返回，便于上层统一处理错误。
function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Image load failed.'));
        img.src = src;
    });
}

// 判断图片来源是否为 SVG，用于决定是否需要放大后再提取像素。
function isSvgSource(src: string): boolean {
    if (src.startsWith('data:image/svg+xml')) return true;
    try {
        return new URL(src, window.location.href).pathname.toLowerCase().endsWith('.svg');
    } catch {
        return false;
    }
}
