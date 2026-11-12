import { APP_VERSION, LAST_UPDATED, RELEASE_STAGE } from '../../config/version.js';
import { BASE_PATH } from '../../config/app-config.js';

export { BASE_PATH };
export const formatCurrency = (value = 0) => {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return '₹0';
    const hasFractions = (num % 1 !== 0);
    return '₹' + num.toLocaleString('en-IN', {
        minimumFractionDigits: hasFractions ? 2 : 0,
        maximumFractionDigits: hasFractions ? 2 : 0
    });
};
export const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
export const sanitizePhone = (value = '') => String(value).replace(/[^\d+]/g, '');
export const sanitizeUrl = (value = '', allowedProtocols = ['https:', 'http:', 'mailto:', 'tel:', 'data:']) => {
    if (!value) return '';
    if (value.startsWith('data:')) return value;
    try {
        const parsed = new URL(value, window.location.origin);
        return allowedProtocols.includes(parsed.protocol) ? parsed.href : '';
    } catch (error) {
        return '';
    }
};
export const resolveSafePhotoUrl = (value = '', fallback = '') => {
    if (!value || typeof value !== 'string') return fallback;
    const clean = value.trim();
    if (!clean) return fallback;
    if (clean.startsWith('data:image/') || clean.startsWith('data:')) return clean;
    const sanitized = sanitizeUrl(clean, ['https:', 'http:', 'data:']);
    return sanitized || fallback;
};
export const formatDateDisplay = (value, locale = 'en-GB') => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(locale);
};
export const formatMonthLabel = (value) => {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) return value || '--';
    const [year, month] = value.split('-').map(Number);
    return new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
};
export const buildEmptyState = (message, icon = 'fa-circle-info') => `
    <div class="shared-empty-state">
        <i class="fas ${icon}"></i>
        <span>${escapeHtml(message)}</span>
    </div>
`;
export const hardenExternalLinks = () => {
    document.querySelectorAll('a[target="_blank"]').forEach((link) => {
        link.rel = 'noopener noreferrer';
    });
};

export const initGlobalModalScrollLock = () => {
    const rootEl = document.documentElement;
    if (!rootEl || rootEl.dataset.modalScrollLockBound === 'true') return;
    rootEl.dataset.modalScrollLockBound = 'true';

    const isVisible = (el) => {
        if (!el || el.classList.contains('hidden') || el.style.display === 'none') return false;
        if (el.style.display === 'flex' || el.style.display === 'block') return true;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };

    let syncRaf = null;
    const syncBodyLock = () => {
        if (syncRaf) cancelAnimationFrame(syncRaf);
        syncRaf = requestAnimationFrame(() => {
            syncRaf = null;
            const overlays = document.querySelectorAll('.modal-overlay:not(.hidden), .popup-overlay:not(.hidden)');
            const hasOpenOverlay = Array.from(overlays).some((overlay) => isVisible(overlay));
            if (document.body && document.body.classList.contains('modal-scroll-lock') !== hasOpenOverlay) {
                document.body.classList.toggle('modal-scroll-lock', hasOpenOverlay);
            }
        });
    };

    const bindObserver = () => {
        if (!document.body) return;
        const overlays = document.querySelectorAll('.modal-overlay, .popup-overlay');
        if (overlays.length > 0) {
            const observer = new MutationObserver(syncBodyLock);
            overlays.forEach((el) => {
                observer.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
            });
        }
        syncBodyLock();
    };

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            syncBodyLock();
        }
    });

    if (document.body) bindObserver();
    else window.addEventListener('DOMContentLoaded', bindObserver, { once: true });
};

export const registerServiceWorker = () => {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((registration) => {
            registration.addEventListener('updatefound', () => {
                const installingWorker = registration.installing;
                if (installingWorker) {
                    installingWorker.addEventListener('statechange', () => {
                        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('[Service Worker] New update available, will activate on next load.');
                        }
                    });
                }
            });
            // Skip waiting automatically if there is a waiting worker to install immediately
            if (registration.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
        }).catch((error) => {
            console.warn('Service worker registration failed.', error);
        });
    }, { once: true });
};

const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};

const setLink = (id, value, prefix = '') => {
    const el = document.getElementById(id);
    if (!el) return;
    const safeValue = prefix === 'tel:'
        ? `${prefix}${sanitizePhone(value)}`
        : sanitizeUrl(prefix ? `${prefix}${value}` : value, prefix ? [prefix === 'mailto:' ? 'mailto:' : 'tel:'] : undefined);
    if (safeValue) el.href = safeValue;
};

const DEFAULT_LOGO_URL = 'assets/images/logo.png';
const LOGO_CACHE_KEY = 'institution_logo_url_v1';
const FAST_LOGO_IDS = [
    'splash-logo-img',
    'header-logo',
    'hero-logo-img',
    'admin-loader-logo',
    'admin-header-logo',
    'header-logo-right',
    'official-login-modal-logo'
];

const normalizeLogoUrl = (logoUrl = '') => {
    const value = String(logoUrl || '').trim();
    if (!value) return '';
    return sanitizeUrl(value, ['https:', 'http:', 'data:']) || '';
};

export const getCachedInstitutionLogo = () => {
    try {
        return normalizeLogoUrl(localStorage.getItem(LOGO_CACHE_KEY) || '');
    } catch (_error) {
        return '';
    }
};

export const rememberInstitutionLogo = (logoUrl = '') => {
    const normalizedLogo = normalizeLogoUrl(logoUrl);
    try {
        if (normalizedLogo) localStorage.setItem(LOGO_CACHE_KEY, normalizedLogo);
        else localStorage.removeItem(LOGO_CACHE_KEY);
    } catch (_error) {}
    return normalizedLogo;
};

const warmLogoCache = (logoUrl = '') => {
    const normalizedLogo = normalizeLogoUrl(logoUrl);
    if (!normalizedLogo) return;
    try {
        const img = new Image();
        img.decoding = 'async';
        img.src = normalizedLogo;
    } catch (_error) {}
};

const setLogo = (ids, logoUrl, { useCachedFallback = false } = {}) => {
    const normalizedLogo = normalizeLogoUrl(logoUrl);
    const effectiveLogo = normalizedLogo || (useCachedFallback ? getCachedInstitutionLogo() : '') || DEFAULT_LOGO_URL;
    warmLogoCache(effectiveLogo);
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.getAttribute('src') !== effectiveLogo) el.src = effectiveLogo;
        el.style.opacity = '1';
        el.onerror = () => {
            el.onerror = null;
            el.src = DEFAULT_LOGO_URL;
            el.style.opacity = '1';
        };
    });
};

export const applyCachedInstitutionLogo = (ids = FAST_LOGO_IDS) => {
    setLogo(ids, '', { useCachedFallback: true });
};

const applyCachedLogoWhenReady = () => applyCachedInstitutionLogo();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyCachedLogoWhenReady, { once: true });
} else {
    applyCachedLogoWhenReady();
}

export const normalizePhone = (value = '') => value.toString().replace(/\D/g, '');

export const normalizeStudentEntity = (raw = {}) => {
    if (!raw || typeof raw !== 'object') return raw;
    const id = String(raw.id || '').trim();
    const adm = String(raw.adm || raw.admNo || raw.admissionNo || raw.admissionNumber || id).trim();
    const rollNo = String(raw.rollNo ?? raw.roll ?? '').trim();
    const name = String(raw.name || raw.studentName || '').trim();
    const studentClass = String(raw.class || raw.className || raw.studentClass || '').trim();
    const mobile = String(raw.mobile || raw.phone || raw.contact || raw.guardianPhone || '').trim();
    const father = String(raw.father || raw.guardian || raw.parentName || '').trim();
    const passedOutYear = String(raw.passedOutYear || raw.graduatedYear || '').trim();
    const isAlumni = raw.isAlumni === true || raw.status === 'Alumni' || studentClass.toUpperCase() === 'ALUMNI' || studentClass.toUpperCase() === 'GRADUATED';
    const status = isAlumni ? 'Alumni' : (raw.status || 'Active');
    return {
        ...raw,
        id,
        adm,
        admNo: adm,
        admissionNo: adm,
        rollNo,
        roll: rollNo,
        name,
        class: studentClass,
        studentClass,
        className: studentClass,
        mobile,
        phone: mobile,
        father,
        passedOutYear,
        isAlumni,
        status
    };
};

export const fitTextToContainer = (elementId, minFontSize = 12) => {
    const el = document.getElementById(elementId);
    if (!el || !el.parentElement) return;
    el.style.fontSize = '';
    el.style.whiteSpace = 'nowrap';
    let fontSize = parseInt(window.getComputedStyle(el).fontSize, 10);
    while (el.scrollWidth > el.parentElement.clientWidth && fontSize > minFontSize) {
        fontSize -= 1;
        el.style.fontSize = `${fontSize}px`;
    }
};

export const enableSmartSelectWindowing = (root = document, { visibleCount = 6 } = {}) => {
    const hostEl = root instanceof Document ? root.documentElement : root;
    const selects = Array.from(root.querySelectorAll('select'))
        .filter((select) => !select.multiple && !select.dataset.smartWindowBound && select.dataset.nativeSelect !== 'true' && select.options.length > visibleCount);
    const closeAll = () => root.querySelectorAll('.smart-select-list.active').forEach((el) => el.classList.remove('active'));

    selects.forEach((select) => {
        select.dataset.smartWindowBound = 'true';
        const wrapper = document.createElement('div');
        wrapper.className = 'smart-select-wrapper relative';
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = select.className;
        input.classList.add('smart-select-input');
        input.placeholder = 'Type to search...';
        input.autocomplete = 'off';
        wrapper.insertBefore(input, select);

        const list = document.createElement('div');
        list.className = 'suggestions-box smart-select-list';
        wrapper.appendChild(list);

        select.classList.add('smart-select-native-hidden');

        const renderList = (term = '') => {
            const normalizedTerm = String(term || '').trim().toLowerCase();
            const options = Array.from(select.options);
            const filtered = options.filter((option) => String(option.textContent || '').toLowerCase().includes(normalizedTerm));
            list.innerHTML = filtered.length
                ? filtered.map((option) => `<div class="suggestion-item smart-select-option ${option.value === select.value ? 'smart-selected-option' : ''}" data-value="${escapeHtml(option.value)}">${escapeHtml(option.textContent || '')}</div>`).join('')
                : '<div class="suggestion-item text-gray-400">No matches</div>';
            list.classList.add('active');
        };

        const syncInputValue = () => {
            const selectedOption = select.options[select.selectedIndex];
            input.value = selectedOption ? selectedOption.textContent : '';
        };

        syncInputValue();
        input.addEventListener('focus', () => {
            closeAll();
            renderList(input.value);
        });
        input.addEventListener('input', () => renderList(input.value));
        input.addEventListener('click', () => {
            closeAll();
            renderList(input.value);
        });

        list.addEventListener('click', (event) => {
            const optionEl = event.target.closest('.smart-select-option');
            if (!optionEl) return;
            select.value = optionEl.dataset.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            syncInputValue();
            list.classList.remove('active');
            input.blur();
        });

        select.addEventListener('change', syncInputValue);
        const observer = new MutationObserver(() => syncInputValue());
        observer.observe(select, { childList: true, subtree: true, characterData: true });
    });

    if (!hostEl?.dataset?.smartSelectGlobalBound) {
        if (hostEl?.dataset) hostEl.dataset.smartSelectGlobalBound = 'true';
        document.addEventListener('click', (event) => {
            if (event.target.closest('.smart-select-wrapper')) return;
            closeAll();
        });
    }
};

export const renderVersionInfo = (options = {}) => {
    const {
        versionId = 'footer-version',
        updatedId = 'footer-updated',
        prefix = 'Version'
    } = options;

    setText(versionId, `${prefix}: ${APP_VERSION}`);
    setText(updatedId, `Last Updated: ${LAST_UPDATED}`);
};

export const applyInstitutionBranding = (conf = {}, options = {}) => {
    const {
        defaultAppName = 'Institution Tracer',
        defaultSubtitle = 'Excellence in Education',
        headerTitleIds = ['header-title'],
        primaryTitleIds = [],
        subtitleIds = [],
        footerNameIds = ['footer-inst-name'],
        logoIds = ['header-logo'],
        updateDocumentTitle = false,
        documentTitleSuffix = ''
    } = options;

    const appName = conf.appName || defaultAppName;
    const subtitle = conf.appSubtitle || defaultSubtitle;

    headerTitleIds.forEach((id) => setText(id, appName));
    primaryTitleIds.forEach((id) => setText(id, appName));
    subtitleIds.forEach((id) => setText(id, subtitle));
    footerNameIds.forEach((id) => setText(id, appName));

    const regEl = document.getElementById('header-regno');
    const placeEl = document.getElementById('header-place');
    const sepEl = document.getElementById('header-sep');
    const subContainer = document.getElementById('header-subtitle');
    if (regEl && placeEl && sepEl && subContainer) {
        regEl.textContent = conf.regNo ? `Reg: ${conf.regNo}` : '';
        placeEl.textContent = conf.place || '';
        if (conf.regNo || conf.place) {
            subContainer.classList.remove('hidden');
            sepEl.classList.toggle('hidden', !(conf.regNo && conf.place));
        } else {
            subContainer.classList.add('hidden');
        }
    }

    const heroRegEl = document.getElementById('hero-regno');
    const heroPlaceEl = document.getElementById('hero-place');
    const heroSepEl = document.getElementById('hero-place-separator');
    if (heroRegEl && heroPlaceEl && heroSepEl) {
        heroRegEl.textContent = conf.regNo ? `Reg No: ${conf.regNo}` : '';
        heroPlaceEl.textContent = conf.place || '';
        heroSepEl.classList.toggle('hidden', !(conf.regNo && conf.place));
    }

    setText('footer-phone', conf.contactPhone || 'Not Available');
    setText('footer-email', conf.contactEmail || 'Not Available');
    setLink('footer-phone-link', conf.contactPhone, 'tel:');
    setLink('footer-email-link', conf.contactEmail, 'mailto:');

    ['youtube', 'telegram', 'instagram', 'whatsapp', 'facebook'].forEach((key) => {
        const id = `link-${key}`;
        const url = key === 'youtube'
            ? conf.socialYouTube
            : conf[`social${key.charAt(0).toUpperCase()}${key.slice(1)}`];
        const el = document.getElementById(id);
        if (!el) return;
        const safeUrl = sanitizeUrl(url);
        if (safeUrl) {
            el.href = safeUrl;
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });

    rememberInstitutionLogo(conf.logoUrl || '');
    setLogo(logoIds, conf.logoUrl);

    if (updateDocumentTitle) {
        document.title = documentTitleSuffix ? `${appName} - ${documentTitleSuffix}` : appName;
    }

    hardenExternalLinks();
    renderVersionInfo();
};

export const getPeriodDateRange = (cadence = 'daily', { weeklyResetDay = 'sunday', monthlyResetDay = 1, referenceDate = new Date() } = {}) => {
    const ref = new Date(referenceDate);
    if (Number.isNaN(ref.getTime())) ref.setTime(Date.now());

    const toDateStr = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    if (cadence === 'daily') {
        const dStr = toDateStr(ref);
        return {
            startDate: dStr,
            endDate: dStr,
            label: formatDateDisplay(dStr),
            periodKey: dStr
        };
    }

    if (cadence === 'weekly') {
        const DAY_MAP = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
        const resetIdx = DAY_MAP[String(weeklyResetDay).toLowerCase()] ?? 0;
        const currentDayIdx = ref.getDay();
        const diff = (currentDayIdx - resetIdx + 7) % 7;
        const start = new Date(ref);
        start.setDate(ref.getDate() - diff);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        const sStr = toDateStr(start);
        const eStr = toDateStr(end);
        return {
            startDate: sStr,
            endDate: eStr,
            label: `${formatDateDisplay(sStr)} – ${formatDateDisplay(eStr)}`,
            periodKey: `${sStr}__${eStr}`
        };
    }

    if (cadence === 'monthly') {
        const resetDayNum = Math.max(1, Math.min(28, Number(monthlyResetDay) || 1));
        const y = ref.getFullYear();
        const m = ref.getMonth();
        const d = ref.getDate();

        let startYear = y;
        let startMonth = m;
        if (d < resetDayNum) {
            startMonth = m - 1;
            if (startMonth < 0) {
                startMonth = 11;
                startYear = y - 1;
            }
        }
        const start = new Date(startYear, startMonth, resetDayNum);
        let endYear = startYear;
        let endMonth = startMonth + 1;
        if (endMonth > 11) {
            endMonth = 0;
            endYear = startYear + 1;
        }
        const end = new Date(endYear, endMonth, resetDayNum - 1);
        if (resetDayNum === 1) {
            end.setDate(new Date(startYear, startMonth + 1, 0).getDate());
            end.setMonth(startMonth);
            end.setFullYear(startYear);
        }
        const sStr = toDateStr(start);
        const eStr = toDateStr(end);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return {
            startDate: sStr,
            endDate: eStr,
            label: `${monthNames[startMonth]} ${startYear} (${formatDateDisplay(sStr)} – ${formatDateDisplay(eStr)})`,
            periodKey: `${startYear}-${String(startMonth + 1).padStart(2, '0')}`
        };
    }

    if (cadence === 'yearly') {
        const sStr = `${ref.getFullYear()}-01-01`;
        const eStr = `${ref.getFullYear()}-12-31`;
        return {
            startDate: sStr,
            endDate: eStr,
            label: `Session ${ref.getFullYear()}`,
            periodKey: String(ref.getFullYear())
        };
    }

    const dStr = toDateStr(ref);
    return { startDate: dStr, endDate: dStr, label: dStr, periodKey: dStr };
};

export const initInfoMessageTags = () => {
    if (typeof document === 'undefined' || window.__infoMessageTagsInitialized) return;
    window.__infoMessageTagsInitialized = true;

    const dismissActiveTag = () => {
        const active = document.getElementById('active-info-message-tag');
        if (active) active.remove();
    };

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.info-tooltip-btn, [data-info]');
        if (!btn) {
            if (!e.target.closest('#active-info-message-tag')) {
                dismissActiveTag();
            }
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const activeTag = document.getElementById('active-info-message-tag');
        if (activeTag && activeTag._triggerEl === btn) {
            dismissActiveTag();
            return;
        }
        dismissActiveTag();

        const text = btn.getAttribute('data-info') || btn.getAttribute('title');
        if (!text) return;

        const tag = document.createElement('div');
        tag.id = 'active-info-message-tag';
        tag.className = 'fixed z-[99999] max-w-[280px] sm:max-w-[340px] p-3 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-2xl border border-slate-700 animate-fadeIn';
        tag._triggerEl = btn;
        tag.innerHTML = `
            <div class="flex items-start gap-2">
                <i class="fas fa-info-circle text-blue-400 mt-0.5 text-xs shrink-0"></i>
                <div class="flex-1 leading-relaxed text-[11px] sm:text-xs text-slate-100 font-normal">${escapeHtml(text)}</div>
                <button type="button" class="text-slate-400 hover:text-white p-0.5 ml-1 text-xs shrink-0 cursor-pointer" aria-label="Close"><i class="fas fa-times"></i></button>
            </div>
            <div class="tag-arrow absolute w-2.5 h-2.5 bg-slate-900 border-slate-700 transform rotate-45"></div>
        `;

        tag.querySelector('button')?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            tag.remove();
        });

        document.body.appendChild(tag);

        const rect = btn.getBoundingClientRect();
        const tagRect = tag.getBoundingClientRect();

        let top = rect.bottom + 8;
        let left = Math.min(Math.max(10, rect.left - 20), window.innerWidth - tagRect.width - 10);
        const arrow = tag.querySelector('.tag-arrow');

        if (top + tagRect.height > window.innerHeight - 10) {
            top = Math.max(10, rect.top - tagRect.height - 8);
            if (arrow) {
                arrow.style.bottom = '-5px';
                arrow.style.top = 'auto';
                arrow.style.borderBottom = '1px solid #334155';
                arrow.style.borderRight = '1px solid #334155';
            }
        } else {
            if (arrow) {
                arrow.style.top = '-5px';
                arrow.style.bottom = 'auto';
                arrow.style.borderTop = '1px solid #334155';
                arrow.style.borderLeft = '1px solid #334155';
            }
        }

        if (arrow) {
            const arrowLeft = Math.max(12, Math.min(tagRect.width - 24, rect.left - left + (rect.width / 2) - 5));
            arrow.style.left = `${arrowLeft}px`;
        }

        tag.style.top = `${top}px`;
        tag.style.left = `${left}px`;
    });
};

// --- 16 Canonical Student Fields Definition & Safe Normalizer ---
export const STUDENT_STANDARD_FIELDS = Object.freeze([
    { num: 1, key: 'photo', label: 'Student Profile Photo', type: 'image' },
    { num: 2, key: 'class', label: 'Class', type: 'text' },
    { num: 3, key: 'uid', label: 'ID/UID', type: 'text' },
    { num: 4, key: 'name', label: 'Student Name', type: 'text' },
    { num: 5, key: 'father', label: "Father's Name", type: 'text' },
    { num: 6, key: 'mother', label: "Mother's Name", type: 'text' },
    { num: 7, key: 'gender', label: 'Gender', type: 'text' },
    { num: 8, key: 'adm', label: 'Admission Number (Adm. No.)', type: 'text' },
    { num: 9, key: 'dob', label: 'Date of Birth', type: 'date' },
    { num: 10, key: 'admDate', label: 'Date of Admission', type: 'date' },
    { num: 11, key: 'status', label: 'Student Status', type: 'badge' },
    { num: 12, key: 'adhaar', label: 'Aadhaar Number', type: 'text' },
    { num: 13, key: 'mobile', label: "Father's Phone Number", type: 'tel' },
    { num: 14, key: 'motherMobile', label: "Mother's Phone Number", type: 'tel' },
    { num: 15, key: 'address', label: 'Permanent Address', type: 'text' },
    { num: 16, key: 'academicYear', label: 'Academic Year', type: 'text' }
]);

export const getStudentNormalizedDetails = (student = {}, defaultAcademicYear = '') => {
    if (!student || typeof student !== 'object') return {};
    const prof = (student.profile && typeof student.profile === 'object') ? student.profile : {};
    const pick = (...vals) => {
        for (const v of vals) {
            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
    };
    const formatDate = (val) => {
        if (!val) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
            const [y, m, d] = val.split('-');
            return `${d}/${m}/${y}`;
        }
        return val;
    };

    return {
        photo: pick(student.photo, prof.photo, student.profilePhoto, student.photoUrl),
        class: pick(student.class, student.studentClass, prof.class),
        uid: pick(student.uid, prof.uid),
        name: pick(student.name, prof.name),
        father: pick(student.father, prof.father, student.guardian),
        mother: pick(student.mother, prof.mother),
        gender: pick(student.gender, prof.gender) || 'Male',
        adm: pick(student.adm, prof.admNo, prof.adm),
        dob: formatDate(pick(student.dob, prof.dob)),
        dobRaw: pick(student.dob, prof.dob),
        admDate: formatDate(pick(student.admDate, prof.admDate, student.adm_date, prof.adm_date)),
        admDateRaw: pick(student.admDate, prof.admDate, student.adm_date, prof.adm_date),
        status: pick(student.status, prof.status) || 'Active',
        passedOutYear: pick(student.passedOutYear, student.graduatedYear),
        adhaar: pick(student.adhaar, prof.adhaar, student.aadhaar, prof.aadhaar),
        mobile: pick(student.mobile, prof.mobile, student.phone, prof.fatherMobile, student.fatherMobile),
        motherMobile: pick(student.motherMobile, prof.motherMobile),
        address: pick(student.address, prof.address, student.permanentAddress),
        academicYear: pick(student.academicYear, prof.academicYear, defaultAcademicYear)
    };
};

initGlobalModalScrollLock();
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInfoMessageTags);
    } else {
        initInfoMessageTags();
    }
}
