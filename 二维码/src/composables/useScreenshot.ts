export type ScreenshotResult =
    | { type: 'failed' }
    | { type: 'cancelled'; silent?: boolean };

const getMessage = (key: Parameters<typeof browser.i18n.getMessage>[0], fallback: string) =>
    browser.i18n.getMessage(key) || fallback;

type CaptureResponse = { success: true; dataUrl: string } | { success: false; error?: string };

// 由后台调用 captureVisibleTab 获取当前视口图像: 不会弹出屏幕共享提示条,
// 也不会压缩页面视口, 避免截图区域底部出现空白带。
async function captureVisibleTab(): Promise<string> {
    let response: CaptureResponse | undefined;
    try {
        response = await browser.runtime.sendMessage({ action: 'captureVisibleTab' });
    } catch {
        throw { type: 'failed' } satisfies ScreenshotResult;
    }
    if (!response?.success || !response.dataUrl) {
        throw { type: 'failed' } satisfies ScreenshotResult;
    }
    return response.dataUrl;
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('image load failed'));
        image.src = src;
    });
}

const FLOATING_MAX_WIDTH = 1200;
const FLOATING_MAX_HEIGHT = 800;
const FLOATING_VIEWPORT_WIDTH_RATIO = 0.9;
const FLOATING_VIEWPORT_HEIGHT_RATIO = 0.8;

const ROOT_ID = 'qr-shot-root';
const STYLE_ID = 'qr-shot-style';
const MASK_COLOR = 'rgba(0, 0, 0, 0.6)';
const ACCENT_COLOR = '#2CABFF';
const MIN_SELECTION = 8;
const HANDLE_SIZE = 6;
const HANDLE_HIT_SIZE = 9;
const LAYOUT_PADDING = 8;

const STYLES = `
@keyframes qr-shot-enter {
    from { opacity: 0; }
    to { opacity: 1; }
}

#${ROOT_ID} {
    position: fixed;
    box-sizing: content-box;
    z-index: 2147483647;
    border: 1px solid rgba(255, 255, 255, 0.7);
    border-radius: 12px;
    box-shadow:
        0 0 0 1px rgba(0, 0, 0, 0.18),
        0 20px 45px rgba(0, 0, 0, 0.42);
    cursor: crosshair;
    overflow: hidden;
    user-select: none;
    animation: qr-shot-enter 220ms ease-out both;
}

#${ROOT_ID} canvas {
    display: block;
    touch-action: none;
}

#${ROOT_ID} .qr-shot-toolbar {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 8px;
    background: rgba(25, 25, 25, 0.92);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    color: #fff;
    font: 12px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
    white-space: nowrap;
}

#${ROOT_ID} .qr-shot-size {
    margin-right: 4px;
    opacity: 0.85;
    font-variant-numeric: tabular-nums;
}

#${ROOT_ID} .qr-shot-btn {
    padding: 4px 10px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition: background-color 120ms ease;
}

#${ROOT_ID} .qr-shot-btn:hover {
    background: rgba(255, 255, 255, 0.16);
}

#${ROOT_ID} .qr-shot-btn.primary {
    border-color: ${ACCENT_COLOR};
    background: ${ACCENT_COLOR};
}

#${ROOT_ID} .qr-shot-btn.primary:hover {
    background: #1b9be9;
}

#${ROOT_ID} .qr-shot-close {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.72);
    border-radius: 50%;
    background: rgba(25, 25, 25, 0.82);
    color: #fff;
    cursor: pointer;
    font: 22px/26px Arial, sans-serif;
    text-align: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    transition: background-color 120ms ease, transform 120ms ease;
}

#${ROOT_ID} .qr-shot-close:hover {
    background: #d93025;
    transform: scale(1.08);
}
`;

// 浮窗尺寸跟随截图本身的宽高比, 避免不同 dpr / 缩放环境下把画面拉伸变形,
// 也能保证选区坐标与截图像素之间的换算始终精确。
function getFloatingCanvasConfig(imageAspect: number) {
    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);

    const maxWidth = Math.min(FLOATING_MAX_WIDTH, Math.floor(viewportWidth * FLOATING_VIEWPORT_WIDTH_RATIO));
    const maxHeight = Math.min(FLOATING_MAX_HEIGHT, Math.floor(viewportHeight * FLOATING_VIEWPORT_HEIGHT_RATIO));

    let canvasWidth = maxWidth;
    let canvasHeight = Math.round(canvasWidth / imageAspect);
    if (canvasHeight > maxHeight) {
        canvasHeight = maxHeight;
        canvasWidth = Math.round(canvasHeight * imageAspect);
    }

    canvasWidth = Math.max(1, canvasWidth);
    canvasHeight = Math.max(1, canvasHeight);

    return {
        canvasWidth,
        canvasHeight,
        position: {
            left: Math.floor((viewportWidth - canvasWidth) / 2),
            top: Math.floor((viewportHeight - canvasHeight) / 2),
        },
    };
}

type Rect = { x: number; y: number; width: number; height: number };
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type DragState =
    | { mode: 'create'; startX: number; startY: number }
    | { mode: 'move'; startX: number; startY: number; origin: Rect }
    | { mode: 'resize'; handle: Handle; startX: number; startY: number; origin: Rect };

const HANDLE_CURSORS: Record<Handle, string> = {
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
};

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(Math.max(min, max), value));

function getHandlePoints(rect: Rect): Array<[Handle, number, number]> {
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    return [
        ['nw', left, top],
        ['n', centerX, top],
        ['ne', right, top],
        ['e', right, centerY],
        ['se', right, bottom],
        ['s', centerX, bottom],
        ['sw', left, bottom],
        ['w', left, centerY],
    ];
}

export function useScreenshot() {
    const startScreenshot = async (): Promise<string> => {
        const captured = await captureVisibleTab();
        let image: HTMLImageElement;
        try {
            image = await loadImage(captured);
        } catch {
            throw { type: 'failed' } satisfies ScreenshotResult;
        }

        return new Promise<string>((resolve, reject) => {
            const dpr = window.devicePixelRatio || 1;
            const imageAspect = image.naturalWidth / Math.max(1, image.naturalHeight);
            let layout = getFloatingCanvasConfig(imageAspect);
            let selection: Rect | null = null;
            let drag: DragState | null = null;
            let cleanedUp = false;
            let resizeFrame: number | undefined;

            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = STYLES;
            document.head.appendChild(style);

            const root = document.createElement('div');
            root.id = ROOT_ID;
            root.style.left = `${layout.position.left - 1}px`;
            root.style.top = `${layout.position.top - 1}px`;

            const canvas = document.createElement('canvas');
            root.appendChild(canvas);

            const toolbar = document.createElement('div');
            toolbar.className = 'qr-shot-toolbar';
            toolbar.style.display = 'none';
            const sizeLabel = document.createElement('span');
            sizeLabel.className = 'qr-shot-size';
            const selectAllButton = document.createElement('button');
            selectAllButton.type = 'button';
            selectAllButton.className = 'qr-shot-btn';
            selectAllButton.textContent = getMessage('screenshotSelectAll', 'Select all');
            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.className = 'qr-shot-btn';
            cancelButton.textContent = getMessage('screenshotCancel', 'Cancel');
            const confirmButton = document.createElement('button');
            confirmButton.type = 'button';
            confirmButton.className = 'qr-shot-btn primary';
            confirmButton.textContent = getMessage('screenshotConfirm', 'Scan');
            confirmButton.disabled = true;
            toolbar.append(sizeLabel, selectAllButton, cancelButton, confirmButton);
            root.appendChild(toolbar);

            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'qr-shot-close';
            closeButton.textContent = '×';
            closeButton.setAttribute('aria-label', getMessage('closeBtn', 'Close'));
            root.appendChild(closeButton);

            const context = canvas.getContext('2d');
            if (!context) {
                style.remove();
                reject({ type: 'failed' } satisfies ScreenshotResult);
                return;
            }
            const ctx = context;

            const applyLayout = () => {
                root.style.width = `${layout.canvasWidth}px`;
                root.style.height = `${layout.canvasHeight}px`;
                root.style.left = `${layout.position.left - 1}px`;
                root.style.top = `${layout.position.top - 1}px`;
                canvas.width = Math.max(1, Math.round(layout.canvasWidth * dpr));
                canvas.height = Math.max(1, Math.round(layout.canvasHeight * dpr));
                canvas.style.width = `${layout.canvasWidth}px`;
                canvas.style.height = `${layout.canvasHeight}px`;
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            };

            const sourceScaleX = () => image.naturalWidth / layout.canvasWidth;
            const sourceScaleY = () => image.naturalHeight / layout.canvasHeight;

            const getPointerPosition = (event: PointerEvent) => {
                const rect = canvas.getBoundingClientRect();
                return {
                    x: clamp(event.clientX - rect.left, 0, layout.canvasWidth),
                    y: clamp(event.clientY - rect.top, 0, layout.canvasHeight),
                };
            };

            const hitHandle = (x: number, y: number): Handle | undefined => {
                if (!selection) return undefined;
                return getHandlePoints(selection).find(
                    ([, pointX, pointY]) =>
                        Math.abs(x - pointX) <= HANDLE_HIT_SIZE &&
                        Math.abs(y - pointY) <= HANDLE_HIT_SIZE,
                )?.[0];
            };

            const isInsideSelection = (x: number, y: number) =>
                selection !== null &&
                x >= selection.x &&
                x <= selection.x + selection.width &&
                y >= selection.y &&
                y <= selection.y + selection.height;

            const drawHandles = () => {
                if (!selection) return;
                ctx.fillStyle = ACCENT_COLOR;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                for (const [, pointX, pointY] of getHandlePoints(selection)) {
                    ctx.beginPath();
                    ctx.rect(
                        pointX - HANDLE_SIZE / 2,
                        pointY - HANDLE_SIZE / 2,
                        HANDLE_SIZE,
                        HANDLE_SIZE,
                    );
                    ctx.fill();
                    ctx.stroke();
                }
            };

            const draw = () => {
                const width = layout.canvasWidth;
                const height = layout.canvasHeight;
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(image, 0, 0, width, height);

                ctx.beginPath();
                ctx.rect(0, 0, width, height);
                if (selection) {
                    ctx.rect(selection.x, selection.y, selection.width, selection.height);
                    ctx.fillStyle = MASK_COLOR;
                    ctx.fill('evenodd');

                    ctx.strokeStyle = ACCENT_COLOR;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(
                        selection.x + 0.5,
                        selection.y + 0.5,
                        Math.max(0, selection.width - 1),
                        Math.max(0, selection.height - 1),
                    );
                    drawHandles();
                } else {
                    ctx.fillStyle = MASK_COLOR;
                    ctx.fill();
                }
            };

            const positionToolbar = () => {
                if (!selection || selection.width < MIN_SELECTION || selection.height < MIN_SELECTION) {
                    toolbar.style.display = 'none';
                    confirmButton.disabled = true;
                    return;
                }
                toolbar.style.display = 'flex';
                confirmButton.disabled = false;
                sizeLabel.textContent =
                    `${Math.round(selection.width * sourceScaleX())} × ` +
                    `${Math.round(selection.height * sourceScaleY())}`;

                const width = layout.canvasWidth;
                const height = layout.canvasHeight;
                const toolbarWidth = toolbar.offsetWidth;
                const toolbarHeight = toolbar.offsetHeight;
                const maxLeft = Math.max(LAYOUT_PADDING, width - toolbarWidth - LAYOUT_PADDING);
                const maxTop = Math.max(LAYOUT_PADDING, height - toolbarHeight - LAYOUT_PADDING);
                const left = clamp(
                    selection.x + (selection.width - toolbarWidth) / 2,
                    LAYOUT_PADDING,
                    maxLeft,
                );
                let top = selection.y + selection.height + 8;
                if (top > maxTop) {
                    top = selection.y - toolbarHeight - 8;
                }
                toolbar.style.left = `${Math.round(left)}px`;
                toolbar.style.top = `${Math.round(clamp(top, LAYOUT_PADDING, maxTop))}px`;
            };

            const updateCursor = (x?: number, y?: number) => {
                if (!selection) {
                    root.style.cursor = 'crosshair';
                    return;
                }
                if (x === undefined || y === undefined) {
                    root.style.cursor = 'crosshair';
                    return;
                }
                const handle = hitHandle(x, y);
                if (handle) {
                    root.style.cursor = HANDLE_CURSORS[handle];
                    return;
                }
                root.style.cursor = isInsideSelection(x, y) ? 'move' : 'crosshair';
            };

            const cleanup = () => {
                if (cleanedUp) return;
                cleanedUp = true;
                window.removeEventListener('resize', handleResize);
                window.removeEventListener('pointermove', handlePointerMove);
                window.removeEventListener('pointerup', handlePointerUp);
                document.removeEventListener('keydown', handleKeyDown, true);
                document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
                if (resizeFrame !== undefined) {
                    window.cancelAnimationFrame(resizeFrame);
                    resizeFrame = undefined;
                }
                root.remove();
                style.remove();
            };

            const cancel = () => {
                cleanup();
                reject({ type: 'cancelled', silent: true } satisfies ScreenshotResult);
            };

            const cropSelection = () => {
                if (!selection) return '';
                const scaleX = sourceScaleX();
                const scaleY = sourceScaleY();
                const sourceX = clamp(Math.round(selection.x * scaleX), 0, image.naturalWidth);
                const sourceY = clamp(Math.round(selection.y * scaleY), 0, image.naturalHeight);
                const sourceWidth = Math.max(
                    1,
                    Math.min(Math.round(selection.width * scaleX), image.naturalWidth - sourceX),
                );
                const sourceHeight = Math.max(
                    1,
                    Math.min(Math.round(selection.height * scaleY), image.naturalHeight - sourceY),
                );

                const output = document.createElement('canvas');
                output.width = sourceWidth;
                output.height = sourceHeight;
                const outputContext = output.getContext('2d');
                if (!outputContext) return '';
                outputContext.drawImage(
                    image,
                    sourceX,
                    sourceY,
                    sourceWidth,
                    sourceHeight,
                    0,
                    0,
                    sourceWidth,
                    sourceHeight,
                );
                return output.toDataURL('image/png');
            };

            const confirm = () => {
                if (!selection || selection.width < MIN_SELECTION || selection.height < MIN_SELECTION) {
                    return;
                }
                const result = cropSelection();
                if (!result) return;
                cleanup();
                resolve(result);
            };

            const resizeSelection = (origin: Rect, handle: Handle, dx: number, dy: number): Rect => {
                let left = origin.x;
                let top = origin.y;
                let right = origin.x + origin.width;
                let bottom = origin.y + origin.height;

                if (handle.includes('w')) left = Math.min(right - MIN_SELECTION, left + dx);
                if (handle.includes('e')) right = Math.max(left + MIN_SELECTION, right + dx);
                if (handle.includes('n')) top = Math.min(bottom - MIN_SELECTION, top + dy);
                if (handle.includes('s')) bottom = Math.max(top + MIN_SELECTION, bottom + dy);

                left = clamp(left, 0, layout.canvasWidth);
                right = clamp(right, 0, layout.canvasWidth);
                top = clamp(top, 0, layout.canvasHeight);
                bottom = clamp(bottom, 0, layout.canvasHeight);

                return { x: left, y: top, width: right - left, height: bottom - top };
            };

            const handlePointerDown = (event: PointerEvent) => {
                if (event.button !== 0) return;
                event.preventDefault();
                // 捕获指针, 保证在窗口外松开鼠标时也能收到 pointerup
                canvas.setPointerCapture(event.pointerId);
                const { x, y } = getPointerPosition(event);
                const handle = hitHandle(x, y);
                if (selection && handle) {
                    drag = { mode: 'resize', handle, startX: x, startY: y, origin: { ...selection } };
                    return;
                }
                if (selection && isInsideSelection(x, y)) {
                    drag = { mode: 'move', startX: x, startY: y, origin: { ...selection } };
                    return;
                }
                selection = { x, y, width: 0, height: 0 };
                drag = { mode: 'create', startX: x, startY: y };
                draw();
                positionToolbar();
            };

            const handlePointerMove = (event: PointerEvent) => {
                const { x, y } = getPointerPosition(event);
                if (!drag) {
                    updateCursor(x, y);
                    return;
                }
                event.preventDefault();

                if (drag.mode === 'create') {
                    const left = Math.min(drag.startX, x);
                    const top = Math.min(drag.startY, y);
                    selection = {
                        x: left,
                        y: top,
                        width: Math.abs(x - drag.startX),
                        height: Math.abs(y - drag.startY),
                    };
                } else if (drag.mode === 'move') {
                    const dx = x - drag.startX;
                    const dy = y - drag.startY;
                    const left = clamp(drag.origin.x + dx, 0, layout.canvasWidth - drag.origin.width);
                    const top = clamp(drag.origin.y + dy, 0, layout.canvasHeight - drag.origin.height);
                    selection = { x: left, y: top, width: drag.origin.width, height: drag.origin.height };
                    root.style.cursor = 'move';
                } else {
                    selection = resizeSelection(drag.origin, drag.handle, x - drag.startX, y - drag.startY);
                }

                draw();
                positionToolbar();
            };

            const handlePointerUp = (event: PointerEvent) => {
                if (canvas.hasPointerCapture(event.pointerId)) {
                    canvas.releasePointerCapture(event.pointerId);
                }
                if (!drag) return;
                drag = null;
                if (selection && (selection.width < MIN_SELECTION || selection.height < MIN_SELECTION)) {
                    selection = null;
                }
                draw();
                positionToolbar();
            };

            const handleOutsidePointerDown = (event: PointerEvent) => {
                const target = event.target;
                if (target instanceof Node && root.contains(target)) return;
                cancel();
            };

            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    cancel();
                    return;
                }
                if (event.key === 'Enter') {
                    event.preventDefault();
                    event.stopPropagation();
                    confirm();
                }
            };

            const handleResize = () => {
                if (resizeFrame !== undefined) return;
                resizeFrame = window.requestAnimationFrame(() => {
                    resizeFrame = undefined;
                    const next = getFloatingCanvasConfig(imageAspect);
                    if (selection) {
                        const ratioX = next.canvasWidth / layout.canvasWidth;
                        const ratioY = next.canvasHeight / layout.canvasHeight;
                        selection = {
                            x: selection.x * ratioX,
                            y: selection.y * ratioY,
                            width: selection.width * ratioX,
                            height: selection.height * ratioY,
                        };
                    }
                    layout = next;
                    applyLayout();
                    draw();
                    positionToolbar();
                });
            };

            selectAllButton.addEventListener('click', () => {
                selection = { x: 0, y: 0, width: layout.canvasWidth, height: layout.canvasHeight };
                draw();
                positionToolbar();
            });
            cancelButton.addEventListener('click', cancel);
            confirmButton.addEventListener('click', confirm);
            closeButton.addEventListener('click', cancel);
            canvas.addEventListener('pointerdown', handlePointerDown);
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
            window.addEventListener('resize', handleResize);
            document.addEventListener('keydown', handleKeyDown, true);
            document.addEventListener('pointerdown', handleOutsidePointerDown, true);

            applyLayout();
            draw();
            document.body.appendChild(root);
        });
    };

    return { startScreenshot };
}
