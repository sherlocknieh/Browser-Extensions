import jsQR from 'jsqr';

type ProxyFetcher = (url: string) => Promise<string>;

type LoadImageOptions = {
    origin?: string;
    fetchViaProxy?: ProxyFetcher;
};

export function isSameOrigin(url: string, origin: string): boolean {
    try {
        if (url.startsWith('file:')) return false;
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
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
    });
    return code ? code.data : null;
}

export async function getImageDataFromImageElement(img: HTMLImageElement): Promise<ImageData> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Unable to get 2d canvas context.');
    }
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    ctx.drawImage(img, 0, 0);
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
