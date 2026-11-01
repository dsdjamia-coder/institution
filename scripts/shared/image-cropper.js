/**
 * Interactive Touch & Mouse Image Cropper
 * Pure Vanilla JS, zero dependencies, CSP-compliant.
 * Supports:
 * - Natural aspect ratio display (no stretching)
 * - Touch & mouse drag to move crop box
 * - 4 Corner handles for resizing (Freeform, 1:1 Square, 4:3 Landscape, 3:4 Portrait, 16:9)
 * - 90-degree rotation
 * - Reset, zoom, and aspect ratio controls
 * - High-resolution crisp export with automatic <50KB compression
 */

export class InteractiveCropper {
    /**
     * @param {Object} options
     * @param {HTMLCanvasElement} options.canvas - The canvas element to render on
     * @param {number} [options.targetSize=400] - Base target output dimension in px
     * @param {number} [options.maxKb=50] - Maximum base64 file size in KB
     * @param {string} [options.aspectRatio='1:1'] - 'free', '1:1', '4:3', '3:4', '16:9'
     */
    constructor(options = {}) {
        this.canvas = options.canvas;
        if (!this.canvas) throw new Error('InteractiveCropper: canvas is required');
        this.ctx = this.canvas.getContext('2d');
        this.targetSize = options.targetSize || 400;
        this.maxKb = options.maxKb || 50;
        this.aspectRatio = options.aspectRatio || '1:1';

        this.image = null;
        this.rotation = 0; // 0, 90, 180, 270
        this.imgDisplayRect = { x: 0, y: 0, width: 0, height: 0 };
        this._cropRect = { x: 0, y: 0, width: 100, height: 100 };

        this.dragMode = null; // 'move', 'tl', 'tr', 'bl', 'br'
        this.dragStart = { x: 0, y: 0 };
        this.initialCropRect = { x: 0, y: 0, width: 100, height: 100 };
        this.handleRadius = 14; // Visible touch handle radius
        this.handleHitRadius = 26; // Generous touch hit radius for mobile fingers

        this._boundPointerDown = this._onPointerDown.bind(this);
        this._boundPointerMove = this._onPointerMove.bind(this);
        this._boundPointerUp = this._onPointerUp.bind(this);
        this._boundPointerCancel = this._onPointerUp.bind(this);

        this._setupEvents();
    }

    get cropRect() {
        return this._cropRect;
    }

    set cropRect(r) {
        if (!r) return;
        this._cropRect.x = r.x || 0;
        this._cropRect.y = r.y || 0;
        this._cropRect.width = r.width || r.size || 100;
        this._cropRect.height = r.height || r.size || 100;
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
     * Set crop aspect ratio preset
     * @param {string} ratio - 'free', '1:1', '4:3', '3:4', '16:9'
     */
    setAspectRatio(ratio = '1:1') {
        this.aspectRatio = ratio;
        this._fitImageAndResetCrop();
        this.render();
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
     * Calculates image containment and initial centered crop box based on aspectRatio
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

        let ratioVal = 1;
        if (this.aspectRatio === '4:3') ratioVal = 4 / 3;
        else if (this.aspectRatio === '3:4') ratioVal = 3 / 4;
        else if (this.aspectRatio === '16:9') ratioVal = 16 / 9;
        else if (this.aspectRatio === 'free') ratioVal = dispW / dispH;

        let cropW = Math.min(dispW * 0.85, dispH * 0.85 * ratioVal);
        let cropH = cropW / ratioVal;

        if (cropH > dispH * 0.88) {
            cropH = dispH * 0.88;
            cropW = cropH * ratioVal;
        }

        cropW = Math.max(40, Math.min(cropW, dispW));
        cropH = Math.max(40, Math.min(cropH, dispH));

        this._cropRect = {
            x: dispX + (dispW - cropW) / 2,
            y: dispY + (dispH - cropH) / 2,
            width: cropW,
            height: cropH,
            size: Math.min(cropW, cropH)
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
        const oldW = this._cropRect.width;
        const oldH = this._cropRect.height;
        const maxW = this.imgDisplayRect.width;
        const maxH = this.imgDisplayRect.height;

        let newW = Math.min(maxW, Math.max(40, oldW * factor));
        let newH = Math.min(maxH, Math.max(40, oldH * factor));

        if (this.aspectRatio !== 'free') {
            const ratio = oldW / oldH;
            if (newW / ratio > maxH) {
                newH = maxH;
                newW = newH * ratio;
            } else {
                newH = newW / ratio;
            }
        }

        const cx = this._cropRect.x + oldW / 2;
        const cy = this._cropRect.y + oldH / 2;

        let newX = cx - newW / 2;
        let newY = cy - newH / 2;

        newX = Math.max(this.imgDisplayRect.x, Math.min(newX, this.imgDisplayRect.x + this.imgDisplayRect.width - newW));
        newY = Math.max(this.imgDisplayRect.y, Math.min(newY, this.imgDisplayRect.y + this.imgDisplayRect.height - newH));

        this._cropRect = {
            x: newX,
            y: newY,
            width: newW,
            height: newH,
            size: Math.min(newW, newH)
        };
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
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        this.ctx.beginPath();
        // Outer rect (viewport)
        this.ctx.rect(0, 0, w, h);
        // Inner cutout (crop box, reverse path)
        const { x: cx, y: cy, width: cw, height: ch } = this._cropRect;
        this.ctx.rect(cx + cw, cy, -cw, ch);
        this.ctx.fill();
        this.ctx.restore();

        // 3. Draw crop box border
        this.ctx.save();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        this.ctx.shadowBlur = 6;
        this.ctx.strokeRect(cx, cy, cw, ch);
        this.ctx.restore();

        // 4. Draw rule-of-thirds grid lines
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        // Verticals
        this.ctx.moveTo(cx + cw / 3, cy);
        this.ctx.lineTo(cx + cw / 3, cy + ch);
        this.ctx.moveTo(cx + (2 * cw) / 3, cy);
        this.ctx.lineTo(cx + (2 * cw) / 3, cy + ch);
        // Horizontals
        this.ctx.moveTo(cx, cy + ch / 3);
        this.ctx.lineTo(cx + cw, cy + ch / 3);
        this.ctx.moveTo(cx, cy + (2 * ch) / 3);
        this.ctx.lineTo(cx + cw, cy + (2 * ch) / 3);
        this.ctx.stroke();
        this.ctx.restore();

        // 5. Draw 4 Corner Handles
        this._drawHandle(cx, cy); // tl
        this._drawHandle(cx + cw, cy); // tr
        this._drawHandle(cx, cy + ch); // bl
        this._drawHandle(cx + cw, cy + ch); // br
    }

    _drawHandle(x, y) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.handleRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#4f46e5'; // indigo-600
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
        const { x: cx, y: cy, width: cw, height: ch } = this._cropRect;
        const hr = this.handleHitRadius;

        const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);

        if (dist(x, y, cx, cy) <= hr) return 'tl';
        if (dist(x, y, cx + cw, cy) <= hr) return 'tr';
        if (dist(x, y, cx, cy + ch) <= hr) return 'bl';
        if (dist(x, y, cx + cw, cy + ch) <= hr) return 'br';

        if (x >= cx && x <= cx + cw && y >= cy && y <= cy + ch) {
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
        this.initialCropRect = { ...this._cropRect };

        try {
            this.canvas.setPointerCapture(e.pointerId);
        } catch (_) {}
    }

    _onPointerMove(e) {
        if (!this.image) return;
        const { x, y } = this._getCanvasCoords(e);

        if (!this.dragMode) {
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
        const { x: ix, y: iy, width: iw, height: ih } = this.initialCropRect;
        const { x: minX, y: minY, width: maxW, height: maxH } = this.imgDisplayRect;
        const maxX = minX + maxW;
        const maxY = minY + maxH;

        if (this.dragMode === 'move') {
            let nextX = ix + dx;
            let nextY = iy + dy;

            nextX = Math.max(minX, Math.min(nextX, maxX - iw));
            nextY = Math.max(minY, Math.min(nextY, maxY - ih));

            this._cropRect.x = nextX;
            this._cropRect.y = nextY;
        } else if (this.dragMode === 'br') {
            if (this.aspectRatio === 'free') {
                let nextW = Math.max(40, Math.min(iw + dx, maxX - ix));
                let nextH = Math.max(40, Math.min(ih + dy, maxY - iy));
                this._cropRect.width = nextW;
                this._cropRect.height = nextH;
            } else {
                const ratio = iw / ih;
                const delta = Math.max(dx, dy * ratio);
                let nextW = iw + delta;
                let nextH = nextW / ratio;
                if (ix + nextW > maxX) {
                    nextW = maxX - ix;
                    nextH = nextW / ratio;
                }
                if (iy + nextH > maxY) {
                    nextH = maxY - iy;
                    nextW = nextH * ratio;
                }
                nextW = Math.max(40, nextW);
                nextH = Math.max(40, nextH);
                this._cropRect.width = nextW;
                this._cropRect.height = nextH;
            }
        } else if (this.dragMode === 'tl') {
            if (this.aspectRatio === 'free') {
                let nextW = Math.max(40, Math.min(iw - dx, ix + iw - minX));
                let nextH = Math.max(40, Math.min(ih - dy, iy + ih - minY));
                this._cropRect.x = ix + (iw - nextW);
                this._cropRect.y = iy + (ih - nextH);
                this._cropRect.width = nextW;
                this._cropRect.height = nextH;
            } else {
                const ratio = iw / ih;
                const delta = Math.min(dx, dy * ratio);
                let nextW = iw - delta;
                let nextH = nextW / ratio;
                const maxAllowedW = ix + iw - minX;
                const maxAllowedH = iy + ih - minY;
                if (nextW > maxAllowedW) {
                    nextW = maxAllowedW;
                    nextH = nextW / ratio;
                }
                if (nextH > maxAllowedH) {
                    nextH = maxAllowedH;
                    nextW = nextH * ratio;
                }
                nextW = Math.max(40, nextW);
                nextH = Math.max(40, nextH);
                this._cropRect.x = ix + (iw - nextW);
                this._cropRect.y = iy + (ih - nextH);
                this._cropRect.width = nextW;
                this._cropRect.height = nextH;
            }
        } else if (this.dragMode === 'tr') {
            if (this.aspectRatio === 'free') {
                let nextW = Math.max(40, Math.min(iw + dx, maxX - ix));
                let nextH = Math.max(40, Math.min(ih - dy, iy + ih - minY));
                this._cropRect.y = iy + (ih - nextH);
                this._cropRect.width = nextW;
                this._cropRect.height = nextH;
            } else {
                const ratio = iw / ih;
                const delta = Math.max(dx, -dy * ratio);
                let nextW = iw + delta;
                let nextH = nextW / ratio;
                if (ix + nextW > maxX) {
                    nextW = maxX - ix;
                    nextH = nextW / ratio;
                }
                if (iy + (ih - nextH) < minY) {
                    nextH = iy + ih - minY;
                    nextW = nextH * ratio;
                }
                nextW = Math.max(40, nextW);
                nextH = Math.max(40, nextH);
                this._cropRect.y = iy + (ih - nextH);
                this._cropRect.width = nextW;
                this._cropRect.height = nextH;
            }
        } else if (this.dragMode === 'bl') {
            if (this.aspectRatio === 'free') {
                let nextW = Math.max(40, Math.min(iw - dx, ix + iw - minX));
                let nextH = Math.max(40, Math.min(ih + dy, maxY - iy));
                this._cropRect.x = ix + (iw - nextW);
                this._cropRect.width = nextW;
                this._cropRect.height = nextH;
            } else {
                const ratio = iw / ih;
                const delta = Math.max(-dx, dy * ratio);
                let nextW = iw + delta;
                let nextH = nextW / ratio;
                if (ix + (iw - nextW) < minX) {
                    nextW = ix + iw - minX;
                    nextH = nextW / ratio;
                }
                if (iy + nextH > maxY) {
                    nextH = maxY - iy;
                    nextW = nextH * ratio;
                }
                nextW = Math.max(40, nextW);
                nextH = Math.max(40, nextH);
                this._cropRect.x = ix + (iw - nextW);
                this._cropRect.width = nextW;
                this._cropRect.height = nextH;
            }
        }

        this._cropRect.size = Math.min(this._cropRect.width, this._cropRect.height);
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
     * @param {number} [maxDim=500]
     * @returns {string} base64 data URL (image/jpeg)
     */
    getCroppedBase64(maxKb = this.maxKb, maxDim = 500) {
        if (!this.image) throw new Error('No image loaded in cropper');

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

        const { x: imgX, y: imgY, width: dispW } = this.imgDisplayRect;
        const scale = natW / dispW;

        const cropNormX = (this._cropRect.x - imgX) * scale;
        const cropNormY = (this._cropRect.y - imgY) * scale;
        const cropNormW = this._cropRect.width * scale;
        const cropNormH = this._cropRect.height * scale;

        // Calculate output dimensions keeping aspect ratio
        let outW = cropNormW;
        let outH = cropNormH;
        const maxOut = Math.max(outW, outH);
        if (maxOut > maxDim) {
            const s = maxDim / maxOut;
            outW = Math.round(outW * s);
            outH = Math.round(outH * s);
        } else {
            outW = Math.round(outW);
            outH = Math.round(outH);
        }

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = Math.max(50, outW);
        exportCanvas.height = Math.max(50, outH);
        const eCtx = exportCanvas.getContext('2d');
        eCtx.imageSmoothingEnabled = true;
        eCtx.imageSmoothingQuality = 'high';

        eCtx.drawImage(
            rotatedCanvas,
            cropNormX,
            cropNormY,
            cropNormW,
            cropNormH,
            0,
            0,
            exportCanvas.width,
            exportCanvas.height
        );

        // Smart iterative compression strictly under maxKb
        let quality = 0.85;
        let base64 = exportCanvas.toDataURL('image/jpeg', quality);
        const maxBytes = maxKb * 1024;

        while (base64.length * 0.75 > maxBytes && quality > 0.15) {
            quality -= 0.08;
            base64 = exportCanvas.toDataURL('image/jpeg', quality);
        }

        // If still over budget, step down dimensions
        let currentScale = 0.9;
        while (base64.length * 0.75 > maxBytes && currentScale > 0.3) {
            const sw = Math.round(exportCanvas.width * currentScale);
            const sh = Math.round(exportCanvas.height * currentScale);
            const scaleCanvas = document.createElement('canvas');
            scaleCanvas.width = Math.max(40, sw);
            scaleCanvas.height = Math.max(40, sh);
            const sCtx = scaleCanvas.getContext('2d');
            sCtx.drawImage(exportCanvas, 0, 0, scaleCanvas.width, scaleCanvas.height);
            base64 = scaleCanvas.toDataURL('image/jpeg', 0.65);
            currentScale -= 0.1;
        }

        return base64;
    }
}

if (typeof window !== 'undefined') {
    window.InteractiveCropper = InteractiveCropper;
}
