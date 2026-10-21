// Firefox 右键菜单图标
// Firefox 只允许 chrome:// 资源使用 context-fill, 扩展图片会被忽略, 因此改用
// SVG 内部的 prefers-color-scheme 切换颜色: 深色主题白色, 浅色主题黑色。
// Chrome/Edge 不支持菜单图标, 不会使用这里的图标。

const icon = (id: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">`
    + `<style>:root{color:#111827}@media (prefers-color-scheme:dark){:root{color:#f3f4f6}}</style>`
    + `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">`
    + `<rect width="16" height="16" fill="#000"/>`
    + `<g fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</g>`
    + `</mask></defs>`
    + `<rect width="16" height="16" fill="currentColor" mask="url(#${id})"/>`
    + `</svg>`;

const MENU_ICONS = {
    scan: icon('scan',
        '<path d="M2 5V3.5A1.5 1.5 0 0 1 3.5 2H5"/>'
        + '<path d="M11 2h1.5A1.5 1.5 0 0 1 14 3.5V5"/>'
        + '<path d="M14 11v1.5a1.5 1.5 0 0 1-1.5 1.5H11"/>'
        + '<path d="M5 14H3.5A1.5 1.5 0 0 1 2 12.5V11"/>'
        + '<path d="M6 6h1.2M8.8 6H10M6 9h1.2M8.8 9H10"/>'),
    text: icon('text',
        '<path d="M3 3h10"/>'
        + '<path d="M8 3v10"/>'
        + '<path d="M5.5 13h5"/>'),
    link: icon('link',
        '<path d="M6.8 9.2 9.2 6.8"/>'
        + '<path d="M7.2 5.1 8.3 4a2.5 2.5 0 0 1 3.7 3.7l-1.1 1.1"/>'
        + '<path d="M8.8 10.9 7.7 12a2.5 2.5 0 0 1-3.7-3.7l1.1-1.1"/>'),
    paste: icon('paste',
        '<rect x="3.5" y="3" width="9" height="11" rx="1.5"/>'
        + '<path d="M6 3v-.5A1.5 1.5 0 0 1 7.5 1h1A1.5 1.5 0 0 1 10 2.5V3"/>'
        + '<circle cx="6.5" cy="6.7" r=".8"/>'
        + '<path d="M4.8 11.8 7 9.6l1.4 1.4 1.3-1.3 1.5 1.5"/>'),
    screenshot: icon('screenshot',
        '<path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h1.7L6 2.5h4L10.8 4h1.7A1.5 1.5 0 0 1 14 5.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z"/>'
        + '<circle cx="8" cy="8.5" r="2.3"/>'),
    show: icon('show',
        '<path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4S1.5 8 1.5 8z"/>'
        + '<circle cx="8" cy="8" r="2"/>'),
    hide: icon('hide',
        '<path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4S1.5 8 1.5 8z"/>'
        + '<circle cx="8" cy="8" r="2"/>'
        + '<path d="M2.5 2.5l11 11"/>'),
} as const;

export type MenuIconName = keyof typeof MENU_ICONS;

export const getMenuIcon = (name: MenuIconName) =>
    `data:image/svg+xml;base64,${btoa(MENU_ICONS[name])}`;
