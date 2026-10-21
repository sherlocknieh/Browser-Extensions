import jsQR from 'jsqr';
import BarcodeFormat from '@zxing/library/esm/core/BarcodeFormat';
import BinaryBitmap from '@zxing/library/esm/core/BinaryBitmap';
import BitArray from '@zxing/library/esm/core/common/BitArray';
import DecodeHintType from '@zxing/library/esm/core/DecodeHintType';
import GlobalHistogramBinarizer from '@zxing/library/esm/core/common/GlobalHistogramBinarizer';
import HybridBinarizer from '@zxing/library/esm/core/common/HybridBinarizer';
import NotFoundException from '@zxing/library/esm/core/NotFoundException';
import Code128Reader from '@zxing/library/esm/core/oned/Code128Reader';
import Code39Reader from '@zxing/library/esm/core/oned/Code39Reader';
import Code93Reader from '@zxing/library/esm/core/oned/Code93Reader';
import ITFReader from '@zxing/library/esm/core/oned/ITFReader';
import MultiFormatUPCEANReader from '@zxing/library/esm/core/oned/MultiFormatUPCEANReader';
import OneDReader from '@zxing/library/esm/core/oned/OneDReader';
import QRCodeReader from '@zxing/library/esm/core/qrcode/QRCodeReader';
import Result from '@zxing/library/esm/core/Result';
import RGBLuminanceSource from '@zxing/library/esm/core/RGBLuminanceSource';

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

// 尝试识别二维码，并返回二维码中的文本。
// 先用 jsQR 依次尝试原图、灰度、不同阈值的二值化和圆点增强图；
// 全部失败时再交给 ZXing，处理拍摄角度大、透视变形的照片。
export async function decodeQrFromImageData(imageData: ImageData): Promise<string | null> {
    for (const candidate of createDecodeCandidates(imageData)) {
        const code = jsQR(candidate.data, candidate.width, candidate.height, {
            inversionAttempts: 'attemptBoth',
        });
        // 少数二值化候选图会产生空内容的误识别，跳过空结果继续尝试。
        if (code?.data) return code.data;
    }

    return decodeWithZXing(imageData);
}

// ZXing 识别参数：TRY_HARDER 会尝试更多定位图案组合，用于倾斜、模糊的实拍图片。
const zxingHints = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);

// jsQR 找不到定位图案时改用 ZXing。
// ZXing 的定位点检测和透视校正对倾斜拍摄的照片更宽容，代价是速度稍慢，
// 因此只作为兜底方案，不影响常规图片的识别速度。
// 二维码全部失败后，再按一维条形码扫描一遍。
function decodeWithZXing(imageData: ImageData): string | null {
    for (const candidate of createZXingCandidates(imageData)) {
        const text = decodeQrWithZXing(candidate);
        if (text) return text;
    }

    return decodeBarcodeWithZXing(imageData);
}

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
// 一维读取器会逐行二值化，因此只用 GlobalHistogramBinarizer。
// 竖拍的条形码在逐行扫描中会变成竖直条纹，因此再补一张顺时针旋转 90 度的图。
function decodeBarcodeWithZXing(imageData: ImageData): string | null {
    const grayscale = toGrayscale(imageData, (_red, green) => green);
    // 逐行扫描的耗时与图片尺寸成正比，先缩小到合适尺寸再识别。
    const scaled = downscaleToMaxDimension(grayscale, BARCODE_SCAN_DIMENSION);

    for (const candidate of [scaled, rotate90(scaled)]) {
        const text = decodeOneDWithZXing(candidate);
        if (text) return text;
    }
    return null;
}

// 行扫描只处理水平方向，因此一维识别只需要灰度图和一种二值化方式。
function decodeOneDWithZXing(imageData: ImageData): string | null {
    try {
        const bitmap = createZXingBitmap(imageData, GlobalHistogramBinarizer);
        return oneDReader.decode(bitmap, oneDHints).getText() || null;
    } catch {
        return null;
    }
}

// 按整数倍缩小图片，对每个块取平均，避免条形码的细线在缩放中丢失。
function downscaleToMaxDimension(imageData: ImageData, maxDimension: number): ImageData {
    const { width, height, data } = imageData;
    const factor = Math.ceil(Math.max(width, height) / maxDimension);
    if (factor <= 1) return imageData;

    const targetWidth = Math.floor(width / factor);
    const targetHeight = Math.floor(height / factor);
    const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
    const blockSize = factor * factor;

    for (let y = 0; y < targetHeight; y++) {
        for (let x = 0; x < targetWidth; x++) {
            let sum = 0;
            for (let offsetY = 0; offsetY < factor; offsetY++) {
                const rowStart = (y * factor + offsetY) * width + x * factor;
                for (let offsetX = 0; offsetX < factor; offsetX++) {
                    sum += data[(rowStart + offsetX) * 4] ?? 0;
                }
            }
            const value = sum / blockSize;
            const target = (y * targetWidth + x) * 4;
            output[target] = value;
            output[target + 1] = value;
            output[target + 2] = value;
            output[target + 3] = 255;
        }
    }

    return new ImageData(output, targetWidth, targetHeight);
}

// 顺时针旋转 90 度，交换宽高。
function rotate90(imageData: ImageData): ImageData {
    const { width, height, data } = imageData;
    const output = new Uint8ClampedArray(data.length);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const source = (y * width + x) * 4;
            const targetX = height - 1 - y;
            const targetY = x;
            const target = (targetY * height + targetX) * 4;
            output.set(data.subarray(source, source + 4), target);
        }
    }

    return new ImageData(output, height, width);
}

// 用两种二值化方式识别同一张候选图：全局直方图适合亮度整体均匀的屏幕照片，
// 局部自适应阈值适合明暗差异较大的实拍场景。
function decodeQrWithZXing(imageData: ImageData): string | null {
    for (const Binarizer of [GlobalHistogramBinarizer, HybridBinarizer]) {
        try {
            const text = qrReader.decode(createZXingBitmap(imageData, Binarizer), zxingHints).getText();
            // 空白内容视为未识别，继续尝试其他候选图。
            if (text) return text;
        } catch {
            // 换一种二值化方式继续尝试。
        }
    }
    return null;
}

// 将 RGBA 图片转换为 ZXing 的亮度源，并按需套上二值化器。
function createZXingBitmap(
    imageData: ImageData,
    Binarizer: typeof GlobalHistogramBinarizer | typeof HybridBinarizer,
): BinaryBitmap {
    const { width, height, data } = imageData;
    const luminances = new Int32Array(width * height);
    for (let index = 0; index < luminances.length; index++) {
        const offset = index * 4;
        luminances[index] =
            ((data[offset] ?? 0) << 16) | ((data[offset + 1] ?? 0) << 8) | (data[offset + 2] ?? 0);
    }

    return new BinaryBitmap(new Binarizer(new RGBLuminanceSource(luminances, width, height)));
}

// ZXing 的候选图：灰度图加上多个阈值二值化图。
// 拍摄发光的屏幕或广告牌时二维码往往过曝，用较高阈值能保留亮部区域的黑白对比；
// 最后附上反色图，兼容白码黑底的二维码。
function* createZXingCandidates(imageData: ImageData): Generator<ImageData> {
    const grayscale = toGrayscale(imageData, (_red, green) => green);
    yield grayscale;

    for (const threshold of [192, 224, 160, 208, 128, 96]) {
        yield thresholdImage(grayscale, threshold);
    }

    yield invertImage(grayscale);
}

// 按需生成识别候选图像，共 5 张，兼顾成功率和识别速度。
// 使用生成器可以在识别成功后立即停止，避免提前构建后续候选图。
function* createDecodeCandidates(imageData: ImageData): Generator<ImageData> {
    yield imageData;

    // 绿色通道最接近人眼亮度感知，用它转灰度可兼容彩色二维码和彩色背景。
    const grayscale = toGrayscale(imageData, (_red, green) => green);
    yield grayscale;

    // 两个阈值覆盖偏暗和偏亮的图片，适应亮度不均、压缩失真和低对比度的情况。
    for (const threshold of [96, 160]) {
        yield thresholdImage(grayscale, threshold);
    }

    // 圆点型二维码的模块之间有间隙，轻微膨胀黑色像素可帮助 jsQR
    // 连接模块并识别定位点。
    yield dilateBlackPixels(thresholdImage(grayscale, 128), 1);
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

// 生成反色图，用于识别白码黑底的二维码。
function invertImage(imageData: ImageData): ImageData {
    const data = new Uint8ClampedArray(imageData.data.length);
    for (let index = 0; index < imageData.data.length; index += 4) {
        const value = 255 - imageData.data[index];
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
