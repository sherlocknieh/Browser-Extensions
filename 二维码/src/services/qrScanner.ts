import BarcodeFormat from '@zxing/library/esm/core/BarcodeFormat';
import BinaryBitmap from '@zxing/library/esm/core/BinaryBitmap';
import BitArray from '@zxing/library/esm/core/common/BitArray';
import DecodeHintType from '@zxing/library/esm/core/DecodeHintType';
import GlobalHistogramBinarizer from '@zxing/library/esm/core/common/GlobalHistogramBinarizer';
import NotFoundException from '@zxing/library/esm/core/NotFoundException';
import Code128Reader from '@zxing/library/esm/core/oned/Code128Reader';
import Code39Reader from '@zxing/library/esm/core/oned/Code39Reader';
import Code93Reader from '@zxing/library/esm/core/oned/Code93Reader';
import ITFReader from '@zxing/library/esm/core/oned/ITFReader';
import MultiFormatUPCEANReader from '@zxing/library/esm/core/oned/MultiFormatUPCEANReader';
import OneDReader from '@zxing/library/esm/core/oned/OneDReader';
import PlanarYUVLuminanceSource from '@zxing/library/esm/core/PlanarYUVLuminanceSource';
import QRCodeReader from '@zxing/library/esm/core/qrcode/QRCodeReader';
import Result from '@zxing/library/esm/core/Result';

// SVG 提取像素时的目标尺寸上限，避免超大 SVG 生成大量候选图后占用过多内存。
const SVG_SCAN_DIMENSION = 512;

// 位图的目标扫描尺寸：小图（如聊天截图、缩略图）中的二维码模块往往只有几个像素，
// ZXing 难以定位；平滑放大后模块边缘更清晰，识别率明显提升。
const RASTER_SCAN_DIMENSION = 1000;

// 位图的最大放大倍数。放大过多只会增加内存和耗时，识别率不再提升。
const RASTER_MAX_UPSCALE = 4;

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
        if (url.startsWith('data:') || url.startsWith('blob:')) return true;
        // 本地页面中的 file 图片直接加载: Firefox 的扩展页面和后台脚本都无法
        // fetch file: 地址(会报 NetworkError)，但内容脚本可以把图片绘制到 canvas。
        if (url.startsWith('file:')) return isFileOrigin(origin);
        const resolved = new URL(url, origin);
        return resolved.origin === origin;
    } catch (error) {
        return false;
    }
}

// file 页面在 Chrome 中的 origin 为 file://，Firefox 中为 null。
function isFileOrigin(origin: string): boolean {
    return origin === 'null' || origin === 'file://';
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

// 识别结果及来源类型，来源用于在通知中区分二维码和条形码。
export type DecodeResult = {
    text: string;
    kind: 'qr' | 'barcode';
};

// 优先识别一维条形码，失败后再按二维码识别。
// 条形码只需在缩小后的灰度图上逐行扫描，命中时比二维码的多阈值候选图更快；
// 二维码的识别全部交给 ZXing：依次尝试灰度图和不同阈值的二值化图，
// 兼顾过曝、低对比度、圆点模块和白码黑底等情况。
export async function decodeQrFromImageData(imageData: ImageData): Promise<DecodeResult | null> {
    const gray = toGrayImage(imageData);

    const barcode = decodeBarcodeWithZXing(gray);
    if (barcode) return { text: barcode, kind: 'barcode' };

    for (const candidate of createQrCandidates(gray)) {
        const text = decodeQrWithZXing(candidate);
        if (text) return { text, kind: 'qr' };
    }

    return null;
}

// 灰度图：每像素 1 字节。ZXing 只需要亮度，用灰度数据比 RGBA 少 3/4 内存，
// 大图反复生成阈值候选图时不容易触发垃圾回收抖动。
type GrayImage = {
    data: Uint8ClampedArray;
    width: number;
    height: number;
};

// 按人眼亮度取灰度：绿色权重最高。
function toGrayImage(imageData: ImageData): GrayImage {
    const { width, height, data } = imageData;
    const gray = new Uint8ClampedArray(width * height);
    for (let index = 0; index < gray.length; index++) {
        const offset = index * 4;
        gray[index] = ((data[offset] ?? 0) + (data[offset + 1] ?? 0) * 2 + (data[offset + 2] ?? 0)) >> 2;
    }
    return { data: gray, width, height };
}

// ZXing 识别参数：TRY_HARDER 会尝试更多定位图案组合，用于倾斜、模糊的实拍图片。
const zxingHints = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);

// 一维条形码的候选格式。
// 不使用 MultiFormatOneDReader：它会连带打包尚未完善的 RSS 系列读取器，
// 体积多出约 120KB。Codabar 没有校验位、误识别率高，ZXing 默认也将其禁用。
const oneDHints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.TRY_HARDER, true],
    [
        DecodeHintType.POSSIBLE_FORMATS,
        [
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.CODE_93,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.ITF,
        ],
    ],
]);

// 依次尝试上面列出的几种一维格式，任一命中即返回。
class SupportedOneDReader extends OneDReader {
    private readonly readers: OneDReader[] = [
        new MultiFormatUPCEANReader(oneDHints),
        new Code39Reader(),
        new Code93Reader(),
        new Code128Reader(),
        new ITFReader(),
    ];

    decodeRow(rowNumber: number, row: BitArray, hints?: Map<DecodeHintType, unknown>): Result {
        for (const reader of this.readers) {
            try {
                return reader.decodeRow(rowNumber, row, hints);
            } catch {
                // 当前行不是这种格式，继续尝试下一个格式。
            }
        }
        throw new NotFoundException();
    }
}

const qrReader = new QRCodeReader();
const oneDReader = new SupportedOneDReader();

// 一维条形码逐行扫描的尺寸上限。条形码的模块宽度通常远大于 1 像素，
// 缩小后仍可识别，但大图的逐行扫描会明显拖慢失败场景下的兜底速度。
const BARCODE_SCAN_DIMENSION = 1600;

// 扫描一维条形码：条形码印在平面上，灰度图已足够，无需像二维码那样尝试全部阈值图。
// 一维读取器会逐行二值化，因此只需要一种二值化方式。
// 竖拍的条形码在逐行扫描中会变成竖直条纹，因此再补一张顺时针旋转 90 度的图。
function decodeBarcodeWithZXing(gray: GrayImage): string | null {
    const scaled = downscaleGrayToMaxDimension(gray, BARCODE_SCAN_DIMENSION);

    for (const candidate of [scaled, rotateGray90(scaled)]) {
        const text = decodeOneDWithZXing(candidate);
        if (text) return text;
    }
    return null;
}

// 行扫描只处理水平方向，因此一维识别只需要灰度图和一种二值化方式。
function decodeOneDWithZXing(gray: GrayImage): string | null {
    try {
        return oneDReader.decode(createZXingBitmap(gray), oneDHints).getText() || null;
    } catch {
        return null;
    }
}

// 按整数倍缩小灰度图，对每个块取平均，避免条形码的细线在缩放中丢失。
function downscaleGrayToMaxDimension(gray: GrayImage, maxDimension: number): GrayImage {
    const { width, height, data } = gray;
    const factor = Math.ceil(Math.max(width, height) / maxDimension);
    if (factor <= 1) return gray;

    const targetWidth = Math.floor(width / factor);
    const targetHeight = Math.floor(height / factor);
    const output = new Uint8ClampedArray(targetWidth * targetHeight);
    const blockSize = factor * factor;

    for (let y = 0; y < targetHeight; y++) {
        for (let x = 0; x < targetWidth; x++) {
            let sum = 0;
            for (let offsetY = 0; offsetY < factor; offsetY++) {
                const rowStart = (y * factor + offsetY) * width + x * factor;
                for (let offsetX = 0; offsetX < factor; offsetX++) {
                    sum += data[rowStart + offsetX] ?? 0;
                }
            }
            output[y * targetWidth + x] = sum / blockSize;
        }
    }

    return { data: output, width: targetWidth, height: targetHeight };
}

// 顺时针旋转 90 度，交换宽高。
function rotateGray90(gray: GrayImage): GrayImage {
    const { width, height, data } = gray;
    const output = new Uint8ClampedArray(data.length);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            output[x * height + (height - 1 - y)] = data[y * width + x] ?? 0;
        }
    }

    return { data: output, width: height, height: width };
}

// 用 ZXing 识别单一灰度候选图。
function decodeQrWithZXing(gray: GrayImage): string | null {
    try {
        return qrReader.decode(createZXingBitmap(gray), zxingHints).getText() || null;
    } catch {
        return null;
    }
}

// 灰度图直接作为 Y 平面交给 ZXing，不需要再复制成亮度数组。
function createZXingBitmap(gray: GrayImage): BinaryBitmap {
    const { data, width, height } = gray;
    const source = new PlanarYUVLuminanceSource(data, width, height, 0, 0, width, height, false);
    return new BinaryBitmap(new GlobalHistogramBinarizer(source));
}

// 生成灰度阈值图，深色像素变黑，其他变白。
function thresholdGray(gray: GrayImage, threshold: number): GrayImage {
    const data = new Uint8ClampedArray(gray.data.length);
    for (let index = 0; index < data.length; index++) {
        data[index] = (gray.data[index] ?? 0) < threshold ? 0 : 255;
    }
    return { data, width: gray.width, height: gray.height };
}

// 生成反色灰度图，用于识别白码黑底的二维码。
function invertGray(gray: GrayImage): GrayImage {
    const data = new Uint8ClampedArray(gray.data.length);
    for (let index = 0; index < data.length; index++) {
        data[index] = 255 - (gray.data[index] ?? 0);
    }
    return { data, width: gray.width, height: gray.height };
}

// 对黑色像素进行方形邻域膨胀。
// 圆点型二维码的模块之间有间隙，轻微膨胀可帮助 ZXing 连接模块并识别定位点。
function dilateBlackPixels(gray: GrayImage, radius: number): GrayImage {
    const { width, height, data } = gray;
    const output = new Uint8ClampedArray(data);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[y * width + x] !== 0) continue;

            for (let offsetY = -radius; offsetY <= radius; offsetY++) {
                const targetY = y + offsetY;
                if (targetY < 0 || targetY >= height) continue;

                for (let offsetX = -radius; offsetX <= radius; offsetX++) {
                    const targetX = x + offsetX;
                    if (targetX < 0 || targetX >= width) continue;
                    output[targetY * width + targetX] = 0;
                }
            }
        }
    }

    return { data: output, width, height };
}

// 二维码候选图，按命中概率排序。
// 普通二维码在灰度图就能识别；拍摄发光的屏幕或广告牌时二维码往往过曝，
// 用较高阈值能保留亮部区域的黑白对比；反色图兼容白码黑底；
// 圆点型二维码需要先膨胀再识别。
function* createQrCandidates(gray: GrayImage): Generator<GrayImage> {
    yield gray;

    for (const threshold of [192, 160, 128, 96, 224]) {
        yield thresholdGray(gray, threshold);
    }

    yield invertGray(gray);

    for (const threshold of [160, 192]) {
        yield dilateBlackPixels(thresholdGray(gray, threshold), 1);
    }
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
    const scale = isSvg ? getSvgScale(sourceWidth, sourceHeight) : getRasterScale(sourceWidth, sourceHeight);
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 位图放大时用平滑插值补齐模块边缘；SVG 放大保持锐利，缩小时两者都启用平滑。
    ctx.imageSmoothingEnabled = !isSvg || scale < 1;
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

// 位图缩放比例：小图平滑放大到目标扫描尺寸，大图保持原样。
function getRasterScale(sourceWidth: number, sourceHeight: number): number {
    const maxDimension = Math.max(sourceWidth, sourceHeight);
    if (maxDimension >= RASTER_SCAN_DIMENSION) return 1;
    return Math.min(RASTER_MAX_UPSCALE, RASTER_SCAN_DIMENSION / maxDimension);
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
