// 判断识别结果是否为可打开的链接: 需带协议或为常见域名形式
export function isLinkText(text: string): boolean {
    const value = text.trim();
    if (!value || /\s/.test(value)) return false;

    try {
        const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
        return url.hostname.includes('.');
    } catch {
        return false;
    }
}

// 补齐协议, 便于 window.open 打开
export function toOpenableUrl(text: string): string {
    const value = text.trim();
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}
