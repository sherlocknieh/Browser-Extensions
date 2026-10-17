import jsQR from 'jsqr';

type ProxyFetcher = (url: string) => Promise<string>;

type LoadImageOptions = {
    origin?: string;
    fetchViaProxy?: ProxyFetcher;
};

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

export function decodeQrFromImageData(imageData: ImageData): string | null {
    for (const candidate of createDecodeCandidates(imageData)) {
        const code = jsQR(candidate.data, candidate.width, candidate.height, {
            inversionAttempts: 'attemptBoth',
        });
        if (code) return code.data;
    }
    return null;
}

function createDecodeCandidates(imageData: ImageData): ImageData[] {
    const candidates = [imageData];
    const channels = [
        (red: number, green: number, blue: number) => red,
        (_red: number, green: number, _blue: number) => green,
        (_red: number, _green: number, blue: number) => blue,
        (red: number, green: number, blue: number) => Math.round((red + green + blue) / 3),
    ];

    for (const channel of channels) {
        const grayscale = toGrayscale(imageData, channel);
        candidates.push(grayscale);
        for (const threshold of [64, 96, 128, 160, 192]) {
            candidates.push(thresholdImage(grayscale, threshold));
        }
    }

    return candidates;
}

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
    const scale = isSvg ? Math.max(1, Math.min(8, Math.ceil(1024 / Math.max(sourceWidth, sourceHeight)))) : 1;
    canvas.width = sourceWidth * scale;
    canvas.height = sourceHeight * scale;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export async function getImageDataFromDataUrl(dataUrl: string): Promise<ImageData> {
    const img = await loadImageElement(dataUrl);
    return getImageDataFromImageElement(img);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Image load failed.'));
        img.src = src;
    });
}

function isSvgSource(src: string): boolean {
    if (src.startsWith('data:image/svg+xml')) return true;
    try {
        return new URL(src, window.location.href).pathname.toLowerCase().endsWith('.svg');
    } catch {
        return false;
    }
}
