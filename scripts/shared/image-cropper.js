/**
 * Interactive Touch & Mouse Image Cropper
 * Pure Vanilla JS, zero dependencies, CSP-compliant.
 * Supports:
 * - Natural aspect ratio display (no stretching)
 * - Touch & mouse drag to move crop box
 * - 4 Corner handles for resizing (locked to 1:1 aspect ratio)
 * - 90-degree rotation
 * - Reset and zoom controls
 * - High-resolution crisp export with automatic <50KB compression
 */

export class InteractiveCropper {
    /**
     * @param {Object} options
     * @param {HTMLCanvasElement} options.canvas - The canvas element to render on
     * @param {number} [options.targetSize=400] - Output square resolution in px
     * @param {number} [options.maxKb=50] - Maximum base64 file size in KB
     */
    constructor(options = {}) {
        this.canvas = options.canvas;
        if (!this.canvas) throw new Error('InteractiveCropper: canvas is required');
        this.ctx = this.canvas.getContext('2d');
        this.targetSize = options.targetSize || 400;
        this.maxKb = options.maxKb || 50;

        this.image = null;
        this.rotation = 0; // 0, 90, 180, 270
        this.imgDisplayRect = { x: 0, y: 0, width: 0, height: 0 };
        this.cropRect = { x: 0, y: 0, size: 100 };

        this.dragMode = null; // 'move', 'tl', 'tr', 'bl', 'br'
        this.dragStart = { x: 0, y: 0 };
        this.initialCropRect = { x: 0, y: 0, size: 100 };
        this.handleRadius = 14; // Visible touch handle radius
        this.handleHitRadius = 26; // Generous touch hit radius for mobile fingers

        this._boundPointerDown = this._onPointerDown.bind(this);
        this._boundPointerMove = this._onPointerMove.bind(this);
        this._boundPointerUp = this._onPointerUp.bind(this);
        this._boundPointerCancel = this._onPointerUp.bind(this);

        this._setupEvents();
    }

    _setupEvents() {
        this.canvas.style.touchAction = 'none';
        this.canvas.addEventListener('pointerdown', this._boundPointerDown);
        window.addEventListener('pointermove', this._boundPointerMove);
        window.addEventListener('pointerup', this._boundPointerUp);
        window.addEventListener('pointercancel', this._boundPointerCancel);
    }

    destroy() {
        this.canvas.removeEventListener('pointerdown', this._boundPointerDown);
        window.removeEventListener('pointermove', this._boundPointerMove);
        window.removeEventListener('pointerup', this._boundPointerUp);
        window.removeEventListener('pointercancel', this._boundPointerCancel);
    }

    /**
     * Loads an image from DataURL or Image object
     * @param {string|HTMLImageElement} src
     * @returns {Promise<void>}
     */
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this.image = img;
                this.rotation = 0;
                this.resizeCanvasToContainer();
                this._fitImageAndResetCrop();
                this.render();
                resolve();
            };
            img.onerror = (err) => reject(new Error('Failed to load image for cropping: ' + err));
            if (typeof src === 'string') {
                img.src = src;
            } else if (src instanceof HTMLImageElement) {
                img.src = src.src;
            } else {
                reject(new Error('Invalid image source'));
            }
        });
    }

    /**
     * Automatically adjusts canvas internal width/height to its CSS bounding rect
     */
    resizeCanvasToContainer() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round(rect.width || 360);
        const h = Math.round(rect.height || 360);

        if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
            this.canvas.width = w * dpr;
            this.canvas.height = h * dpr;
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        this.viewWidth = w;
        this.viewHeight = h;
    }

    /**
     * Calculates image containment and initial centered 1:1 crop box
     */
    _fitImageAndResetCrop() {
        if (!this.image || !this.viewWidth || !this.viewHeight) return;

        const isRotated90or270 = this.rotation === 90 || this.rotation === 270;
        const naturalW = isRotated90or270 ? this.image.height : this.image.width;
        const naturalH = isRotated90or270 ? this.image.width : this.image.height;

        const pad = 12;
        const availW = Math.max(50, this.viewWidth - pad * 2);
        const availH = Math.max(50, this.viewHeight - pad * 2);

        const scale = Math.min(availW / naturalW, availH / naturalH);
        const dispW = naturalW * scale;
        const dispH = naturalH * scale;

        const dispX = (this.viewWidth - dispW) / 2;
        const dispY = (this.viewHeight - dispH) / 2;

        this.imgDisplayRect = { x: dispX, y: dispY, width: dispW, height: dispH };

        // Center a square crop box that takes around 85% of the shortest dimension
        const cropSize = Math.max(40, Math.min(dispW, dispH) * 0.85);
        this.cropRect = {
            x: dispX + (dispW - cropSize) / 2,
            y: dispY + (dispH - cropSize) / 2,
            size: cropSize
        };
    }

    /**
     * Rotates image 90 degrees clockwise
     */
    rotateClockwise() {
        this.rotation = (this.rotation + 90) % 360;
        this.resizeCanvasToContainer();
        this._fitImageAndResetCrop();
        this.render();
    }

    /**
     * Resets crop box to center of image
     */
    reset() {
        this.rotation = 0;
        this.resizeCanvasToContainer();
        this._fitImageAndResetCrop();
        this.render();
    }

    /**
     * Zooms crop box in or out
     * @param {number} factor e.g. 1.1 or 0.9
     */
    zoomCropBox(factor) {
        if (!this.imgDisplayRect.width) return;
        const oldSize = this.cropRect.size;
        const maxSize = Math.min(this.imgDisplayRect.width, this.imgDisplayRect.height);
        const minSize = Math.min(50, maxSize);
        const newSize = Math.min(maxSize, Math.max(minSize, oldSize * factor));

        // Adjust coordinates from center
        const cx = this.cropRect.x + oldSize / 2;
        const cy = this.cropRect.y + oldSize / 2;

        let newX = cx - newSize / 2;
        let newY = cy - newSize / 2;

        newX = Math.max(this.imgDisplayRect.x, Math.min(newX, this.imgDisplayRect.x + this.imgDisplayRect.width - newSize));
        newY = Math.max(this.imgDisplayRect.y, Math.min(newY, this.imgDisplayRect.y + this.imgDisplayRect.height - newSize));

        this.cropRect = { x: newX, y: newY, size: newSize };
        this.render();
    }

    /**
     * Renders the image, overlay, crop box, grid, and corner handles
     */
    render() {
        if (!this.ctx || !this.image) return;

        const w = this.viewWidth;
        const h = this.viewHeight;

        // Clear background
        this.ctx.fillStyle = '#090d16';
        this.ctx.fillRect(0, 0, w, h);

        const { x: imgX, y: imgY, width: imgW, height: imgH } = this.imgDisplayRect;

        // 1. Draw transformed image
        this.ctx.save();
        this.ctx.translate(imgX + imgW / 2, imgY + imgH / 2);
        this.ctx.rotate((this.rotation * Math.PI) / 180);

        const isRotated90or270 = this.rotation === 90 || this.rotation === 270;
        const drawW = isRotated90or270 ? imgH : imgW;
        const drawH = isRotated90or270 ? imgW : imgH;

        this.ctx.drawImage(this.image, -drawW / 2, -drawH / 2, drawW, drawH);
        this.ctx.restore();

        // 2. Draw dark semi-transparent mask outside crop area
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
        this.ctx.beginPath();
        // Outer rect (viewport)
        this.ctx.rect(0, 0, w, h);
        // Inner cutout (crop box, reverse path)
        const { x: cx, y: cy, size: cs } = this.cropRect;
        this.ctx.rect(cx + cs, cy, -cs, cs);
        this.ctx.fill();
        this.ctx.restore();

        // 3. Draw crop box border
        this.ctx.save();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        this.ctx.shadowBlur = 6;
        this.ctx.strokeRect(cx, cy, cs, cs);
        this.ctx.restore();

        // 4. Draw rule-of-thirds grid lines
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        // Verticals
        this.ctx.moveTo(cx + cs / 3, cy);
        this.ctx.lineTo(cx + cs / 3, cy + cs);
        this.ctx.moveTo(cx + (2 * cs) / 3, cy);
        this.ctx.lineTo(cx + (2 * cs) / 3, cy + cs);
        // Horizontals
        this.ctx.moveTo(cx, cy + cs / 3);
        this.ctx.lineTo(cx + cs, cy + cs / 3);
        this.ctx.moveTo(cx, cy + (2 * cs) / 3);
        this.ctx.lineTo(cx + cs, cy + (2 * cs) / 3);
        this.ctx.stroke();
        this.ctx.restore();

        // 5. Draw 4 Corner Handles
        this._drawHandle(cx, cy); // tl
        this._drawHandle(cx + cs, cy); // tr
        this._drawHandle(cx, cy + cs); // bl
        this._drawHandle(cx + cs, cy + cs); // br
    }

    _drawHandle(x, y) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.handleRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#2563eb'; // blue-600
        this.ctx.fill();
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.shadowColor = 'rgba(0,0,0,0.4)';
        this.ctx.shadowBlur = 4;
        this.ctx.stroke();

        // Inner white dot
        this.ctx.beginPath();
        this.ctx.arc(x, y, 4, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fill();
        this.ctx.restore();
    }

    _getCanvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    _getHitMode(x, y) {
        const { x: cx, y: cy, size: cs } = this.cropRect;
        const hr = this.handleHitRadius;

        const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);

        if (dist(x, y, cx, cy) <= hr) return 'tl';
        if (dist(x, y, cx + cs, cy) <= hr) return 'tr';
        if (dist(x, y, cx, cy + cs) <= hr) return 'bl';
        if (dist(x, y, cx + cs, cy + cs) <= hr) return 'br';

        if (x >= cx && x <= cx + cs && y >= cy && y <= cy + cs) {
            return 'move';
        }

        return null;
    }

    _onPointerDown(e) {
        if (!this.image) return;
        const { x, y } = this._getCanvasCoords(e);
        const mode = this._getHitMode(x, y);
        if (!mode) return;

        this.dragMode = mode;
        this.dragStart = { x, y };
        this.initialCropRect = { ...this.cropRect };

        try {
            this.canvas.setPointerCapture(e.pointerId);
        } catch (_) {}
    }

    _onPointerMove(e) {
        if (!this.image) return;
        const { x, y } = this._getCanvasCoords(e);

        if (!this.dragMode) {
            // Update cursor based on hover
            const hoverMode = this._getHitMode(x, y);
            if (hoverMode === 'tl' || hoverMode === 'br') {
                this.canvas.style.cursor = 'nwse-resize';
            } else if (hoverMode === 'tr' || hoverMode === 'bl') {
                this.canvas.style.cursor = 'nesw-resize';
            } else if (hoverMode === 'move') {
                this.canvas.style.cursor = 'move';
            } else {
                this.canvas.style.cursor = 'default';
            }
            return;
        }

        const dx = x - this.dragStart.x;
        const dy = y - this.dragStart.y;
        const { x: ix, y: iy, size: is } = this.initialCropRect;
        const { x: minX, y: minY, width: maxW, height: maxH } = this.imgDisplayRect;
        const maxX = minX + maxW;
        const maxY = minY + maxH;

        if (this.dragMode === 'move') {
            let nextX = ix + dx;
            let nextY = iy + dy;

            nextX = Math.max(minX, Math.min(nextX, maxX - is));
            nextY = Math.max(minY, Math.min(nextY, maxY - is));

            this.cropRect.x = nextX;
            this.cropRect.y = nextY;
        } else if (this.dragMode === 'br') {
            // Bottom Right corner resize
            const delta = Math.max(dx, dy);
            let nextSize = is + delta;
            const maxSize = Math.min(maxX - ix, maxY - iy);
            nextSize = Math.max(40, Math.min(nextSize, maxSize));

            this.cropRect.size = nextSize;
        } else if (this.dragMode === 'tl') {
            // Top Left corner resize
            const delta = Math.min(dx, dy);
            let nextSize = is - delta;
            const maxSize = Math.min(ix + is - minX, iy + is - minY);
            nextSize = Math.max(40, Math.min(nextSize, maxSize));

            this.cropRect.x = ix + (is - nextSize);
            this.cropRect.y = iy + (is - nextSize);
            this.cropRect.size = nextSize;
        } else if (this.dragMode === 'tr') {
            // Top Right corner resize
            const delta = Math.max(dx, -dy);
            let nextSize = is + delta;
            const maxSize = Math.min(maxX - ix, iy + is - minY);
            nextSize = Math.max(40, Math.min(nextSize, maxSize));

            this.cropRect.y = iy + (is - nextSize);
            this.cropRect.size = nextSize;
        } else if (this.dragMode === 'bl') {
            // Bottom Left corner resize
            const delta = Math.max(-dx, dy);
            let nextSize = is + delta;
            const maxSize = Math.min(ix + is - minX, maxY - iy);
            nextSize = Math.max(40, Math.min(nextSize, maxSize));

            this.cropRect.x = ix + (is - nextSize);
            this.cropRect.size = nextSize;
        }

        this.render();
    }

    _onPointerUp(e) {
        if (this.dragMode) {
            this.dragMode = null;
            try {
                if (e && e.pointerId) {
                    this.canvas.releasePointerCapture(e.pointerId);
                }
            } catch (_) {}
            this.canvas.style.cursor = 'default';
        }
    }

    /**
     * Extracts cropped region with high resolution and compresses to under target maxKb
     * @param {number} [maxKb=50]
     * @param {number} [outputSize=400]
     * @returns {string} base64 data URL (image/jpeg)
     */
    getCroppedBase64(maxKb = this.maxKb, outputSize = this.targetSize) {
        if (!this.image) throw new Error('No image loaded in cropper');

        // First render full rotated source onto an offscreen canvas at true natural resolution
        const isRotated90or270 = this.rotation === 90 || this.rotation === 270;
        const natW = isRotated90or270 ? this.image.height : this.image.width;
        const natH = isRotated90or270 ? this.image.width : this.image.height;

        const rotatedCanvas = document.createElement('canvas');
        rotatedCanvas.width = natW;
        rotatedCanvas.height = natH;
        const rCtx = rotatedCanvas.getContext('2d');

        rCtx.translate(natW / 2, natH / 2);
        rCtx.rotate((this.rotation * Math.PI) / 180);
        const rawW = isRotated90or270 ? natH : natW;
        const rawH = isRotated90or270 ? natW : natH;
        rCtx.drawImage(this.image, -rawW / 2, -rawH / 2, rawW, rawH);

        // Map cropRect relative to imgDisplayRect back to natural pixels
        const { x: imgX, y: imgY, width: dispW } = this.imgDisplayRect;
        const scale = natW / dispW;

        const cropNormX = (this.cropRect.x - imgX) * scale;
        const cropNormY = (this.cropRect.y - imgY) * scale;
        const cropNormSize = this.cropRect.size * scale;

        // Create destination export canvas
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = outputSize;
        exportCanvas.height = outputSize;
        const eCtx = exportCanvas.getContext('2d');
        eCtx.imageSmoothingEnabled = true;
        eCtx.imageSmoothingQuality = 'high';

        eCtx.drawImage(
            rotatedCanvas,
            cropNormX,
            cropNormY,
            cropNormSize,
            cropNormSize,
            0,
            0,
            outputSize,
            outputSize
        );

        // Smart iterative compression under maxKb
        let quality = 0.88;
        let base64 = exportCanvas.toDataURL('image/jpeg', quality);
        const maxBytes = maxKb * 1024;

        while (base64.length * 0.75 > maxBytes && quality > 0.15) {
            quality -= 0.1;
            base64 = exportCanvas.toDataURL('image/jpeg', quality);
        }

        // If still over budget, step down resolution
        let currentRes = outputSize;
        while (base64.length * 0.75 > maxBytes && currentRes > 160) {
            currentRes -= 40;
            const scaleCanvas = document.createElement('canvas');
            scaleCanvas.width = currentRes;
            scaleCanvas.height = currentRes;
            const sCtx = scaleCanvas.getContext('2d');
            sCtx.drawImage(exportCanvas, 0, 0, currentRes, currentRes);
            base64 = scaleCanvas.toDataURL('image/jpeg', 0.72);
        }

        return base64;
    }
}

// Make accessible on window object as well for universal access
if (typeof window !== 'undefined') {
    window.InteractiveCropper = InteractiveCropper;
}
