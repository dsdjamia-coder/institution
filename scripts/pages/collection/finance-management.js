import { doc, collection, writeBatch, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from '../../../config/firebase-config.js';
import { BASE_PATH, escapeHtml, formatCurrency } from '../../shared/app-common.js';
import { showToast } from '../../shared/toaster.js';

const MONTH_SEQUENCE = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
];

let ctx = {
    getStudents: () => [],
    getRawStudents: () => [],
    getClasses: () => [],
    getStudentGroups: () => [],
    getFeeItems: () => [],
    getDefaultFee: () => 200,
    getAcademicYear: () => '',
    getUserEmail: () => ''
};

let editGroupWorkingMembers = [];
let pendingGroupCreationData = null;

// --- Helper Audit Logging ---
const logAudit = async (category, action, entityType, entityId, message) => {
    try {
        const payload = {
            category,
            action,
            entityType,
            entityId,
            message,
            performedBy: ctx.getUserEmail() || 'cashier',
            createdAt: new Date().toISOString()
        };
        const ref = doc(collection(db, `${BASE_PATH}/auditLogs`));
        await setDoc(ref, payload);
    } catch (e) {
        console.warn('Audit log write error:', e);
    }
};

// =========================================================================
// 1. FEE SETTINGS CONTROLLER
// =========================================================================

export const renderFeeItemsManagement = () => {
    const cont = document.getElementById('fee-items-management-container');
    if (!cont) return;

    const activeYear = ctx.getAcademicYear();
    const feeItems = ctx.getFeeItems();
    const scopedFeeItems = feeItems.filter((item) => (item.academicYear || activeYear) === activeYear);

    const monthlyItems = scopedFeeItems
        .filter((item) => (item.type || 'month') === 'month')
        .sort((a, b) => {
            const aMonth = (a.name || '').split('(')[0].trim().toLowerCase();
            const bMonth = (b.name || '').split('(')[0].trim().toLowerCase();
            const aIndex = MONTH_SEQUENCE.indexOf(aMonth);
            const bIndex = MONTH_SEQUENCE.indexOf(bMonth);
            if (aIndex === -1 && bIndex === -1) return (a.name || '').localeCompare(b.name || '');
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        });

    const customItems = scopedFeeItems.filter((item) => item.type === 'custom');

    const renderMonthlyItemCard = (item) => {
        const cleanName = (item.name || '').replace(/^default\s*[-:—–]?\s*/i, '').trim();
        return `<div class="flex items-center gap-3 p-3.5 bg-white border border-slate-200 hover:border-blue-300 rounded-xl shadow-2xs hover:shadow-xs transition drag-item" data-key="${escapeHtml(item.key)}">
            <span class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 text-xs shadow-2xs"><i class="fas fa-calendar-alt"></i></span>
            <span class="font-bold text-gray-800 text-sm truncate">${escapeHtml(cleanName)}</span>
        </div>`;
    };

    const renderItemCard = (item) => {
        let detailsHtml = '';
        if (item.type === 'custom') {
            detailsHtml = `<div class="text-xs text-gray-500 mt-1">Scope: <span class="font-semibold text-blue-600 uppercase">${escapeHtml(item.scope || 'GLOBAL')}</span> | Receipt Mandatory: <span class="font-semibold ${item.isReceiptMandatory ? 'text-red-500' : 'text-gray-400'}">${item.isReceiptMandatory ? 'YES' : 'NO'}</span></div>`;
        }
        const handleHtml = item.type === 'custom'
            ? `<span class="drag-handle mr-4 text-gray-500 text-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg px-2 py-1 cursor-grab active:cursor-grabbing select-none" title="Drag to reorder"><i class="fas fa-grip-lines"></i></span>`
            : `<span class="mr-4 text-[10px] font-bold uppercase text-gray-400">Fixed</span>`;

        return `<div class="flex items-center bg-white border border-gray-200 p-4 rounded-xl shadow-sm drag-item transition hover:shadow-md" data-key="${escapeHtml(item.key)}">
            ${handleHtml}
            <div class="flex-grow">
                <span class="font-bold text-gray-800 text-base sm:text-lg">${escapeHtml(item.name)}</span>
                ${detailsHtml}
            </div>
            ${item.type === 'custom' ? `
                <button type="button" class="text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-sm font-bold transition edit-fee mr-2 cursor-pointer" data-key="${escapeHtml(item.key)}"><i class="fas fa-edit"></i></button>
                <button type="button" class="text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg text-sm font-bold transition del-fee cursor-pointer" data-key="${escapeHtml(item.key)}"><i class="fas fa-trash"></i></button>
            ` : `<span class="px-3 py-1 bg-gray-100 text-gray-500 rounded-lg text-xs font-bold uppercase tracking-wider">Month</span>`}
        </div>`;
    };

    cont.innerHTML = `
        <div class="mb-5">
            <h4 class="text-sm font-bold text-blue-800 mb-2.5 uppercase tracking-wider flex items-center gap-2"><i class="fas fa-calendar-check text-blue-600"></i> Default Months (${escapeHtml(activeYear || '--')})</h4>
            <div id="fee-items-monthly-list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                ${monthlyItems.map(renderMonthlyItemCard).join('') || '<p class="text-xs text-gray-500 italic col-span-full">Monthly defaults are not available.</p>'}
            </div>
        </div>
        <div>
            <h4 class="text-sm font-bold text-emerald-800 mb-2.5 uppercase tracking-wider flex items-center gap-2"><i class="fas fa-layer-group text-emerald-600"></i> Other Fee Items (${escapeHtml(activeYear || '--')})</h4>
            <div id="fee-items-custom-list" class="space-y-3">
                ${customItems.map(renderItemCard).join('') || '<p class="text-xs text-gray-500 italic">No custom fee items added yet.</p>'}
            </div>
        </div>
    `;

    const persistFeeOrder = async () => {
        const orderedKeys = [
            ...Array.from(cont.querySelectorAll('#fee-items-monthly-list .drag-item')).map((el) => el.dataset.key),
            ...Array.from(cont.querySelectorAll('#fee-items-custom-list .drag-item')).map((el) => el.dataset.key)
        ];
        const allItems = ctx.getFeeItems();
        const orderedItems = orderedKeys.map((key) => allItems.find((item) => item.key === key)).filter(Boolean);
        const remainingItems = allItems.filter((item) => !orderedKeys.includes(item.key));
        const nextItems = [...orderedItems, ...remainingItems];
        if (orderedItems.length === 0) return;
        await setDoc(doc(db, `${BASE_PATH}/settings`, 'config'), { feeItems: nextItems }, { merge: true });
        showToast('Fee item order saved.', 'info');
    };

    const customList = document.getElementById('fee-items-custom-list');
    if (customList && customItems.length > 1 && typeof Sortable !== 'undefined') {
        new Sortable(customList, {
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: persistFeeOrder
        });
    }
};

export const syncFeeConfigUI = (data = {}) => {
    const defFeeInput = document.getElementById('default-fee-input');
    const titleInput = document.getElementById('fee-status-title-input');
    const reqCheckbox = document.getElementById('default-fee-receipt-req');
    const startDaySelect = document.getElementById('fee-collect-start-day');
    const endDaySelect = document.getElementById('fee-collect-end-day');
    const notifyModeSelect = document.getElementById('fee-notify-mode');
    const notifyDaysInput = document.getElementById('fee-notify-days-before');

    if (defFeeInput && data.defaultFee !== undefined) defFeeInput.value = data.defaultFee;
    if (titleInput && data.feeStatusTitle !== undefined) titleInput.value = data.feeStatusTitle;
    if (reqCheckbox && data.defaultReceiptMandatory !== undefined) reqCheckbox.checked = !!data.defaultReceiptMandatory;

    const windowCfg = data.feeCollectionWindow || {};
    if (startDaySelect && windowCfg.startDay) startDaySelect.value = String(windowCfg.startDay);
    if (endDaySelect && windowCfg.endDay) endDaySelect.value = String(windowCfg.endDay);
    if (notifyModeSelect && windowCfg.notifyMode) {
        notifyModeSelect.value = windowCfg.notifyMode;
        const daysContainer = document.getElementById('fee-notify-days-container');
        if (daysContainer) {
            daysContainer.classList.toggle('hidden', !['days_before_end', 'days_before_month_end'].includes(windowCfg.notifyMode));
        }
    }
    if (notifyDaysInput && windowCfg.notifyDaysBefore !== undefined) notifyDaysInput.value = windowCfg.notifyDaysBefore;

    updateFeeScheduleSummary();
};

const updateFeeScheduleSummary = () => {
    const startDay = parseInt(document.getElementById('fee-collect-start-day')?.value || '1', 10);
    const endDay = parseInt(document.getElementById('fee-collect-end-day')?.value || '10', 10);
    const mode = document.getElementById('fee-notify-mode')?.value || 'month_start';
    const daysBefore = parseInt(document.getElementById('fee-notify-days-before')?.value || '5', 10);

    const badge = document.getElementById('fee-collection-window-badge');
    const summaryText = document.getElementById('fee-schedule-live-summary-text');

    if (badge) badge.textContent = `Every Month: Day ${startDay} to Day ${endDay}`;

    let notifyDesc = 'on the 1st of every month';
    if (mode === 'collection_start') notifyDesc = `on Day ${startDay} of each month (when collection begins)`;
    else if (mode === 'days_before_end') notifyDesc = `${daysBefore} days before collection ends (Day ${Math.max(1, endDay - daysBefore)})`;
    else if (mode === 'days_before_month_end') notifyDesc = `${daysBefore} days before the end of each month`;

    if (summaryText) {
        summaryText.textContent = `Regular monthly fee collection runs from the ${startDay} to the ${endDay} of every month. Student alerts trigger ${notifyDesc}.`;
    }
};

const saveFeeConfiguration = async () => {
    const defFeeInput = document.getElementById('default-fee-input');
    const titleInput = document.getElementById('fee-status-title-input');
    const reqCheckbox = document.getElementById('default-fee-receipt-req');
    const startDaySelect = document.getElementById('fee-collect-start-day');
    const endDaySelect = document.getElementById('fee-collect-end-day');
    const notifyModeSelect = document.getElementById('fee-notify-mode');
    const notifyDaysInput = document.getElementById('fee-notify-days-before');

    const defaultFee = parseFloat(defFeeInput?.value) || 0;
    const feeStatusTitle = (titleInput?.value || '').trim();
    const defaultReceiptMandatory = !!reqCheckbox?.checked;

    const startDay = parseInt(startDaySelect?.value || '1', 10);
    const endDay = parseInt(endDaySelect?.value || '10', 10);
    const notifyMode = notifyModeSelect?.value || 'month_start';
    const notifyDaysBefore = parseInt(notifyDaysInput?.value || '5', 10);

    const payload = {
        defaultFee,
        feeStatusTitle,
        defaultReceiptMandatory,
        feeCollectionWindow: {
            startDay,
            endDay,
            notifyMode,
            notifyDaysBefore
        }
    };

    try {
        await setDoc(doc(db, `${BASE_PATH}/settings`, 'config'), payload, { merge: true });
        await logAudit('fee', 'config.save', 'feeConfig', 'config', `Fee config updated. Default Fee: ₹${defaultFee}.`);
        showToast('Fee configuration successfully saved!', 'success');
        alert('Fee configuration saved successfully!');
    } catch (err) {
        console.error('Error saving fee config:', err);
        alert('Failed to save fee configuration: ' + err.message);
    }
};

// =========================================================================
// 2. STUDENT GROUPS CONTROLLER
// =========================================================================

export const renderStudentGroups = () => {
    const listNode = document.getElementById('student-groups-list');
    if (!listNode) return;

    populateExistingGroupClassFilter();

    const students = ctx.getStudents();
    const rawStudents = ctx.getRawStudents();
    const studentGroups = ctx.getStudentGroups();

    const sTerm = (document.getElementById('grp-search-input')?.value || '').trim().toLowerCase();
    const fCls = document.getElementById('grp-class-filter')?.value || 'all';
    const countBadge = document.getElementById('grp-count-badge');

    const uniqueGroups = Array.from(new Map((studentGroups || []).map((g) => [g.id, g])).values());

    const filteredGroups = uniqueGroups.filter((g) => {
        const memberStudents = (g.memberIds || []).map((mid) => students.find((entry) => entry.id === mid) || rawStudents.find((entry) => entry.id === mid)).filter(Boolean);

        let matchClass = (fCls === 'all');
        if (!matchClass) {
            matchClass = memberStudents.some((st) => st.class === fCls);
        }

        let matchSearch = true;
        if (sTerm) {
            const matchesMember = memberStudents.some((st) => {
                const sName = (st.name || '').toLowerCase();
                const sAdm = (st.adm ? String(st.adm) : '').toLowerCase();
                const fName = (st.father || st.fatherName || st.profile?.father || '').toLowerCase();
                const fPhone = (st.mobile || st.fatherMobile || st.parentPhone || st.phone || st.profile?.fatherMobile || '').toLowerCase();
                const mName = (st.mother || st.motherName || st.profile?.mother || '').toLowerCase();
                const mPhone = (st.motherMobile || st.profile?.motherMobile || '').toLowerCase();

                return sName.includes(sTerm) ||
                    sAdm.includes(sTerm) ||
                    fName.includes(sTerm) ||
                    fPhone.includes(sTerm) ||
                    mName.includes(sTerm) ||
                    mPhone.includes(sTerm);
            });
            const matchesFee = String(g.fee || '').includes(sTerm);
            matchSearch = matchesMember || matchesFee;
        }

        return matchClass && matchSearch;
    });

    if (countBadge) {
        if (fCls !== 'all' || sTerm) {
            countBadge.textContent = `Showing ${filteredGroups.length} of ${uniqueGroups.length} Groups`;
        } else {
            countBadge.textContent = `${uniqueGroups.length} Groups`;
        }
    }

    if (filteredGroups.length === 0) {
        listNode.innerHTML = `
            <div class="text-center py-8 px-4 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-500 text-xs">
                <i class="fas fa-users-slash text-gray-400 text-xl mb-1.5 block"></i>
                ${uniqueGroups.length === 0 ? 'No groups created yet.' : 'No student groups match the current search or class filter.'}
            </div>
        `;
        return;
    }

    listNode.innerHTML = filteredGroups.map((g, gIdx) => {
        const memberRows = (g.memberIds || []).map((memberId, mIdx) => {
            const student = students.find((entry) => entry.id === memberId) || rawStudents.find((entry) => entry.id === memberId);
            if (!student) {
                return `
                    <tr class="hover:bg-amber-50/50">
                        <td class="py-2.5 px-3 text-center text-gray-400 font-semibold">${mIdx + 1}</td>
                        <td colspan="4" class="py-2.5 px-3 text-amber-600 font-semibold italic text-xs">
                            <i class="fas fa-exclamation-triangle mr-1"></i> Missing student record (ID: ${escapeHtml(memberId)})
                        </td>
                    </tr>
                `;
            }

            const studentName = escapeHtml(student.name || '-');
            const studentClass = escapeHtml(student.class || '--');
            const admNo = escapeHtml(student.adm || '-');

            const fatherName = (student.father || student.fatherName || student.profile?.father || '').trim();
            const fatherPhone = (student.mobile || student.fatherMobile || student.parentPhone || student.phone || student.profile?.fatherMobile || '').trim();
            const motherName = (student.mother || student.motherName || student.profile?.mother || '').trim();
            const motherPhone = (student.motherMobile || student.profile?.motherMobile || '').trim();

            let parentDisplayName = '';
            let parentDisplayPhone = '';

            if (fatherName || fatherPhone) {
                parentDisplayName = fatherName;
                parentDisplayPhone = fatherPhone;
            } else if (motherName || motherPhone) {
                parentDisplayName = motherName;
                parentDisplayPhone = motherPhone;
            }

            return `
                <tr class="hover:bg-blue-50/40 transition-colors">
                    <td class="py-2.5 px-3 text-center text-gray-400 font-semibold">${mIdx + 1}</td>
                    <td class="py-2.5 px-3">
                        <span class="font-bold text-slate-800 text-xs">${studentName}</span>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[11px] border border-blue-200">
                            Class ${studentClass}
                        </span>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-semibold text-[11px] border border-gray-200">
                            ${admNo}
                        </span>
                    </td>
                    <td class="py-2.5 px-3 text-xs">
                        ${parentDisplayName || parentDisplayPhone ? `
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-bold text-gray-800">${escapeHtml(parentDisplayName || '-')}</span>
                                ${parentDisplayPhone ? `<span class="text-gray-500 font-mono text-[11px] inline-flex items-center gap-1"><i class="fas fa-phone text-[10px] text-gray-400"></i>${escapeHtml(parentDisplayPhone)}</span>` : ''}
                            </div>
                        ` : `<span class="text-gray-400 italic">--</span>`}
                    </td>
                </tr>
            `;
        }).join('');

        const feeAmount = Number(g.fee) || 0;

        return `
            <div class="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden hover:border-blue-300 transition-all">
                <div class="bg-slate-50 px-3.5 py-2.5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div class="flex items-center gap-2.5 flex-wrap">
                        <span class="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black shadow-2xs">
                            ${gIdx + 1}
                        </span>
                        <h4 class="font-bold text-sm text-gray-800">Group #${gIdx + 1}</h4>
                        <span class="inline-flex items-center gap-1 text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full">
                            <i class="fas fa-users text-[10px]"></i> ${(g.memberIds || []).length} Students
                        </span>
                        <span class="inline-flex items-center gap-1 text-xs font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-md shadow-2xs">
                            ${formatCurrency(feeAmount)}/month
                        </span>
                    </div>

                    <div class="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                        <button type="button" class="text-blue-600 bg-white hover:bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md text-xs font-bold transition inline-flex items-center gap-1 edit-grp cursor-pointer" data-id="${escapeHtml(g.id)}">
                            <i class="fas fa-edit text-[10px]"></i> Edit
                        </button>
                        <button type="button" class="text-rose-600 bg-white hover:bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-md text-xs font-bold transition inline-flex items-center gap-1 del-grp cursor-pointer" data-id="${escapeHtml(g.id)}">
                            <i class="fas fa-trash-alt text-[10px]"></i> Delete
                        </button>
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead class="bg-gray-50/80 text-gray-600 uppercase font-bold text-[10px] tracking-wider border-b border-gray-200">
                            <tr>
                                <th class="py-2 px-3 w-10 text-center">#</th>
                                <th class="py-2 px-3">Student Name</th>
                                <th class="py-2 px-3 text-center">Class</th>
                                <th class="py-2 px-3 text-center">Adm No</th>
                                <th class="py-2 px-3">Parent (Father / Mother)</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            ${memberRows || '<tr><td colspan="5" class="py-3 text-center text-gray-400 italic">No linked members.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');
};

const populateExistingGroupClassFilter = () => {
    const classFilter = document.getElementById('grp-class-filter');
    if (!classFilter || classFilter.options.length > 1) return;
    const classes = ctx.getClasses();
    classFilter.innerHTML = '<option value="all">All Classes</option>' + classes.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
};

const renderGroupStudentDatalist = (idx) => {
    const cls = document.querySelector(`.grp-cls[data-idx="${idx}"]`)?.value;
    const gen = document.querySelector(`.grp-gen[data-idx="${idx}"]`)?.value;
    const optionsList = document.getElementById(`grp-stu-options-${idx}`);
    if (!optionsList) return;

    if (!cls) {
        optionsList.innerHTML = '';
        return;
    }

    const students = ctx.getStudents();
    const alreadySelected = Array.from(document.querySelectorAll('.grp-stu'))
        .map((input) => input.dataset.selectedId)
        .filter(Boolean);

    const matches = students.filter((s) => s.class === cls && (!gen || s.gender === gen) && !alreadySelected.includes(s.id));
    optionsList.innerHTML = matches.map((s) => `<option value="${escapeHtml(s.name)} (Adm: ${escapeHtml(s.adm || '--')}) [ID: ${escapeHtml(s.id)}]"></option>`).join('');
};

const openUnifyFamilyModal = (creationData) => {
    const modal = document.getElementById('group-unify-family-modal');
    const listContainer = document.getElementById('unify-family-members-list');
    const skipCheckbox = document.getElementById('unify-family-skip-checkbox');
    const confirmBtn = document.getElementById('unify-family-confirm-btn');
    if (!modal || !listContainer) return;

    pendingGroupCreationData = creationData;
    const { studentIds, isEdit } = creationData;

    const students = ctx.getStudents();
    const rawStudents = ctx.getRawStudents();
    const groupStudents = studentIds.map((id) => (rawStudents || []).find((s) => s.id === id) || (students || []).find((s) => s.id === id)).filter(Boolean);

    if (groupStudents.length < 2) {
        alert('Could not load member details for unification.');
        return;
    }

    if (skipCheckbox) skipCheckbox.checked = false;
    if (confirmBtn) {
        confirmBtn.innerHTML = isEdit
            ? '<i class="fas fa-check-circle mr-1"></i> <span>Confirm &amp; Update Group</span>'
            : '<i class="fas fa-check-circle mr-1"></i> <span>Confirm &amp; Save Group</span>';
    }

    listContainer.innerHTML = groupStudents.map((st, idx) => {
        const fatherName = st.father || st.profile?.father || '--';
        const fatherMobile = st.mobile || st.phone || st.profile?.mobile || '--';
        const motherName = st.mother || st.profile?.mother || '--';
        const motherMobile = st.motherMobile || st.profile?.motherMobile || '--';
        const address = st.address || st.profile?.address || '--';
        const className = st.class || st.studentClass || '--';
        const adm = st.adm || '--';
        const isChecked = (idx === 0);

        return `
            <label class="unify-student-card block p-3.5 rounded-xl border ${isChecked ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-400' : 'border-slate-200 bg-white'} hover:border-blue-300 transition cursor-pointer relative select-none">
                <div class="flex items-start gap-3">
                    <input type="radio" name="unify-primary-student" value="${st.id}" class="unify-primary-radio mt-1 w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 shrink-0" ${isChecked ? 'checked' : ''}>
                    <div class="flex-1 min-w-0">
                        <div class="flex flex-wrap items-center justify-between gap-1 pb-1.5 border-b border-slate-100">
                            <div class="font-extrabold text-sm text-slate-900">${escapeHtml(st.name)}</div>
                            <div class="text-xs text-slate-500 font-mono">
                                <span>Adm: <b class="text-slate-700">${escapeHtml(adm)}</b></span> · 
                                <span>Class: <b class="text-slate-700">${escapeHtml(className)}</b></span>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-2 text-xs">
                            <div>
                                <span class="text-slate-500 font-medium">Father:</span>
                                <span class="font-bold text-slate-800 ml-1">${escapeHtml(fatherName)}</span>
                            </div>
                            <div>
                                <span class="text-slate-500 font-medium">Father Phone:</span>
                                <span class="font-bold font-mono text-slate-800 ml-1">${escapeHtml(fatherMobile)}</span>
                            </div>
                            <div>
                                <span class="text-slate-500 font-medium">Mother:</span>
                                <span class="font-bold text-slate-800 ml-1">${escapeHtml(motherName)}</span>
                            </div>
                            <div>
                                <span class="text-slate-500 font-medium">Mother Phone:</span>
                                <span class="font-bold font-mono text-slate-800 ml-1">${escapeHtml(motherMobile)}</span>
                            </div>
                            <div class="sm:col-span-2">
                                <span class="text-slate-500 font-medium">Address:</span>
                                <span class="font-medium text-slate-800 ml-1">${escapeHtml(address)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </label>
        `;
    }).join('');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

const closeUnifyFamilyModal = () => {
    const modal = document.getElementById('group-unify-family-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    pendingGroupCreationData = null;
};

const handleConfirmGroupCreation = async () => {
    if (!pendingGroupCreationData) return;

    const { studentIds, groupFee, isEdit, groupId } = pendingGroupCreationData;
    const modal = document.getElementById('group-unify-family-modal');
    const confirmBtn = document.getElementById('unify-family-confirm-btn');
    const skipCheckbox = document.getElementById('unify-family-skip-checkbox');

    const students = ctx.getStudents();
    const rawStudents = ctx.getRawStudents();
    const groupStudents = studentIds.map((id) => (rawStudents || []).find((s) => s.id === id) || (students || []).find((s) => s.id === id)).filter(Boolean);

    const isSkipped = !!skipCheckbox?.checked;
    let chosenStudent = null;

    if (!isSkipped) {
        const chosenId = modal?.querySelector('input[name="unify-primary-student"]:checked')?.value;
        chosenStudent = groupStudents.find((s) => s.id === chosenId) || groupStudents[0];
    }

    try {
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> <span>Saving...</span>';
        }

        const batch = writeBatch(db);
        const nowTs = Date.now();

        // 1. Unify parent details if requested
        if (chosenStudent) {
            const father = (chosenStudent.father || chosenStudent.profile?.father || '').toUpperCase().trim();
            const mobile = (chosenStudent.mobile || chosenStudent.phone || chosenStudent.profile?.mobile || '').trim();
            const mother = (chosenStudent.mother || chosenStudent.profile?.mother || '').toUpperCase().trim();
            const motherMobile = (chosenStudent.motherMobile || chosenStudent.profile?.motherMobile || '').trim();
            const address = (chosenStudent.address || chosenStudent.profile?.address || '').trim();

            groupStudents.forEach((st) => {
                const stRef = doc(db, `${BASE_PATH}/students`, st.id);
                batch.update(stRef, {
                    father,
                    mobile,
                    mother,
                    motherMobile,
                    address,
                    'profile.father': father,
                    'profile.mobile': mobile,
                    'profile.mother': mother,
                    'profile.motherMobile': motherMobile,
                    'profile.address': address,
                    updatedAt: new Date().toISOString()
                });
            });
        }

        if (isEdit && groupId) {
            const groupRef = doc(db, `${BASE_PATH}/studentGroups`, groupId);
            batch.update(groupRef, {
                memberIds: studentIds,
                fee: groupFee,
                updatedAt: nowTs
            });
            await batch.commit();
            await logAudit('group', 'group.update', 'studentGroup', groupId, `Student group updated: ${studentIds.length} members. Fee: ₹${groupFee}.`);
            closeUnifyFamilyModal();
            showToast('Student group updated successfully!', 'success');
            alert('Student Group updated successfully!');
        } else {
            const groupRef = doc(collection(db, `${BASE_PATH}/studentGroups`));
            batch.set(groupRef, {
                academicYear: ctx.getAcademicYear(),
                memberIds: studentIds,
                fee: groupFee,
                createdAt: nowTs,
                updatedAt: nowTs
            });
            await batch.commit();
            await logAudit('group', 'group.create', 'studentGroup', groupRef.id, `Student group created: ${studentIds.length} members. Fee: ₹${groupFee}.`);
            closeUnifyFamilyModal();

            // Clear inputs
            const numInput = document.getElementById('num-of-students-group');
            const feeInput = document.getElementById('group-monthly-fee');
            if (numInput) numInput.value = '';
            if (feeInput) feeInput.value = '';
            const cont = document.getElementById('group-creation-container');
            if (cont) cont.innerHTML = '';
            document.getElementById('create-group-btn-container')?.classList.add('hidden');

            showToast('Student group created successfully!', 'success');
            alert('Student Group created successfully!');
        }

        renderStudentGroups();
    } catch (err) {
        console.error('Failed to save student group:', err);
        alert('Failed to save student group: ' + err.message);
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check-circle mr-1"></i> <span>Confirm &amp; Save Group</span>';
        }
    }
};

// =========================================================================
// 3. FEE CONCESSIONS CONTROLLER
// =========================================================================

export const renderConcessionsList = () => {
    const fCls = document.getElementById('filter-conc-class')?.value || '';
    const sTerm = (document.getElementById('search-conc-input')?.value || '').trim().toLowerCase();
    const cont = document.getElementById('conc-list-container');
    const emptyState = document.getElementById('conc-list-empty');

    renderActiveConcessionsList();

    if (!cont || !emptyState) return;

    if (!fCls && !sTerm) {
        emptyState.classList.remove('hidden');
        cont.classList.add('hidden');
        return;
    }
    emptyState.classList.add('hidden');
    cont.classList.remove('hidden');

    const students = ctx.getStudents();
    const fil = students.filter((s) => {
        let match = true;
        if (fCls) match = match && s.class === fCls;
        if (sTerm) match = match && ((s.name || '').toLowerCase().includes(sTerm) || (s.adm && String(s.adm).toLowerCase().includes(sTerm)));
        return match;
    });

    if (fil.length === 0) {
        cont.innerHTML = '<p class="text-xs text-slate-500 py-4 text-center">No matching students found.</p>';
        return;
    }

    cont.innerHTML = fil.map((s) => {
        const hasConc = s.concessionFee !== undefined && s.concessionFee !== null && s.concessionFee !== '';
        return `
            <div class="p-2.5 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-blue-200 transition flex items-center justify-between gap-2">
                <div class="min-w-0 flex-1">
                    <span class="font-bold text-xs text-slate-800 break-words leading-tight block">${escapeHtml(s.name || '-')}</span>
                    <div class="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1">
                        <span class="font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">Class ${escapeHtml(s.class || '--')}</span>
                        <span>•</span>
                        <span>Adm: ${escapeHtml(s.adm || '-')}</span>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    ${hasConc ? `<span class="bg-emerald-50 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded border border-emerald-200">₹${escapeHtml(String(s.concessionFee))}</span>` : ''}
                    <button type="button" class="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-2.5 py-1 rounded-md text-xs transition concession-open-btn cursor-pointer" data-id="${escapeHtml(s.id)}">
                        ${hasConc ? 'Edit' : 'Assign'}
                    </button>
                    ${hasConc ? `<button type="button" class="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-2 py-1 rounded-md text-xs transition concession-delete-btn cursor-pointer" data-id="${escapeHtml(s.id)}"><i class="fas fa-trash-alt text-[10px]"></i></button>` : ''}
                </div>
            </div>
        `;
    }).join('');
};

const renderActiveConcessionsList = () => {
    const cont = document.getElementById('active-concessions-list');
    const badge = document.getElementById('active-conc-count-badge');
    const statusLabel = document.getElementById('active-conc-filter-status');
    const sTerm = (document.getElementById('active-conc-search')?.value || '').trim().toLowerCase();
    const fCls = document.getElementById('active-conc-class-filter')?.value || 'all';

    if (!cont) return;

    const students = ctx.getStudents();
    const active = students.filter((s) => s.concessionFee !== undefined && s.concessionFee !== null && s.concessionFee !== '');

    if (badge) badge.textContent = String(active.length);

    const filtered = active.filter((s) => {
        if (fCls !== 'all' && s.class !== fCls) return false;
        if (sTerm) {
            const name = (s.name || '').toLowerCase();
            const adm = (s.adm ? String(s.adm) : '').toLowerCase();
            return name.includes(sTerm) || adm.includes(sTerm);
        }
        return true;
    });

    if (statusLabel) {
        statusLabel.textContent = (fCls !== 'all' || sTerm) ? `Showing ${filtered.length} of ${active.length}` : 'Showing All';
    }

    if (!filtered.length) {
        cont.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400 font-semibold text-xs">No active concessions found.</td></tr>';
        return;
    }

    cont.innerHTML = filtered.map((s, idx) => `
        <tr class="hover:bg-slate-50 transition">
            <td class="py-2.5 px-3 text-center text-slate-400 font-semibold">${idx + 1}</td>
            <td class="py-2.5 px-3">
                <span class="font-bold text-slate-800 text-xs">${escapeHtml(s.name || '-')}</span>
            </td>
            <td class="py-2.5 px-3 text-center">
                <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">${escapeHtml(s.class || '--')}</span>
            </td>
            <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-700">${escapeHtml(s.adm || '-')}</td>
            <td class="py-2.5 px-3 text-right font-extrabold text-emerald-700">₹${escapeHtml(String(s.concessionFee))}</td>
            <td class="py-2.5 px-3 text-center">
                <button type="button" class="text-blue-600 hover:text-blue-800 font-bold px-2 py-1 text-xs concession-open-btn cursor-pointer mr-1" data-id="${escapeHtml(s.id)}"><i class="fas fa-edit mr-0.5"></i>Edit</button>
                <button type="button" class="text-rose-600 hover:text-rose-800 font-bold px-2 py-1 text-xs concession-delete-btn cursor-pointer" data-id="${escapeHtml(s.id)}"><i class="fas fa-trash-alt mr-0.5"></i>Remove</button>
            </td>
        </tr>
    `).join('');
};

const openConcModal = (studentId) => {
    const students = ctx.getStudents();
    const s = students.find((st) => st.id === studentId);
    if (!s) return;

    document.getElementById('conc-student-id').value = s.id;
    document.getElementById('conc-student-name').textContent = `${s.name} (Class: ${s.class || '--'}, Adm: ${s.adm || '--'})`;
    document.getElementById('conc-fee-amount').value = (s.concessionFee !== undefined && s.concessionFee !== null) ? s.concessionFee : '';
    const hasConc = s.concessionFee !== undefined && s.concessionFee !== null && s.concessionFee !== '';
    document.getElementById('conc-remove').classList.toggle('hidden', !hasConc);

    const popup = document.getElementById('concession-popup');
    if (popup) {
        popup.classList.remove('hidden');
        popup.classList.add('flex');
    }
};

const closeConcModal = () => {
    const popup = document.getElementById('concession-popup');
    if (popup) {
        popup.classList.add('hidden');
        popup.classList.remove('flex');
    }
};

// =========================================================================
// 4. MODULE INITIALIZER
// =========================================================================

export const initFinanceManagementModule = (stateContext) => {
    ctx = { ...ctx, ...stateContext };

    // --- Populate 1..28 Day Selectors ---
    const startSelect = document.getElementById('fee-collect-start-day');
    const endSelect = document.getElementById('fee-collect-end-day');
    if (startSelect && startSelect.options.length === 0) {
        for (let i = 1; i <= 28; i++) {
            startSelect.innerHTML += `<option value="${i}">Day ${i} of every month</option>`;
            endSelect.innerHTML += `<option value="${i}">Day ${i} of every month</option>`;
        }
        if (startSelect) startSelect.value = '1';
        if (endSelect) endSelect.value = '10';
    }

    // --- Fee Settings Listeners ---
    document.getElementById('save-fee-config-btn')?.addEventListener('click', saveFeeConfiguration);

    ['fee-collect-start-day', 'fee-collect-end-day', 'fee-notify-mode', 'fee-notify-days-before'].forEach((id) => {
        document.getElementById(id)?.addEventListener('change', updateFeeScheduleSummary);
        document.getElementById(id)?.addEventListener('input', updateFeeScheduleSummary);
    });

    document.getElementById('fee-notify-mode')?.addEventListener('change', (e) => {
        const val = e.target.value;
        const daysContainer = document.getElementById('fee-notify-days-container');
        if (daysContainer) {
            daysContainer.classList.toggle('hidden', !['days_before_end', 'days_before_month_end'].includes(val));
        }
    });

    // --- Advanced Fee Builder Scope Toggle ---
    document.getElementById('adv-fee-scope')?.addEventListener('change', (e) => {
        const val = e.target.value;
        document.getElementById('scope-global-container')?.classList.toggle('hidden', val !== 'global');
        document.getElementById('scope-class-wise-container')?.classList.toggle('hidden', val !== 'class-wise');
        document.getElementById('scope-specific-container')?.classList.toggle('hidden', val !== 'specific');

        const classes = ctx.getClasses();
        if (val === 'class-wise') {
            const inputsCont = document.getElementById('class-wise-inputs');
            if (inputsCont) {
                inputsCont.innerHTML = classes.map((c) => `<div><label class="block text-xs font-bold text-gray-600 mb-1">${escapeHtml(c)}</label><input type="number" data-class="${escapeHtml(c)}" class="cw-input w-full p-2 border rounded text-sm font-medium"></div>`).join('');
            }
        }
        if (val === 'specific') {
            const targetSelect = document.getElementById('adv-fee-specific-class');
            if (targetSelect) {
                targetSelect.innerHTML = classes.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            }
        }
    });

    document.getElementById('add-adv-fee-btn')?.addEventListener('click', async () => {
        const nameInput = document.getElementById('adv-fee-name');
        const scopeSelect = document.getElementById('adv-fee-scope');
        const name = (nameInput?.value || '').trim();
        const scope = scopeSelect?.value || 'global';
        if (!name) return alert('Fee item name is required.');

        const key = `custom_fee_${Date.now()}`;
        const newFee = {
            key,
            name,
            type: 'custom',
            scope,
            isVisible: true,
            isReceiptMandatory: !!document.getElementById('adv-fee-receipt-req')?.checked,
            academicYear: ctx.getAcademicYear(),
            createdAt: new Date().toISOString(),
            timestamp: Date.now()
        };

        if (scope === 'global') {
            const amt = parseFloat(document.getElementById('adv-fee-global-amt')?.value);
            if (isNaN(amt) || amt < 0) return alert('Please enter a valid global amount.');
            newFee.amount = amt;
        } else if (scope === 'class-wise') {
            const classAmounts = {};
            document.querySelectorAll('.cw-input').forEach((inp) => {
                const amt = parseFloat(inp.value);
                if (!isNaN(amt)) classAmounts[inp.dataset.class] = amt;
            });
            if (Object.keys(classAmounts).length === 0) return alert('Enter amount for at least one class.');
            newFee.classValues = classAmounts;
        } else if (scope === 'specific') {
            const targetClass = document.getElementById('adv-fee-specific-class')?.value;
            const amt = parseFloat(document.getElementById('adv-fee-specific-amt')?.value);
            if (!targetClass || isNaN(amt)) return alert('Select class and enter valid amount.');
            newFee.targetClass = targetClass;
            newFee.amount = amt;
        }

        const feeItems = ctx.getFeeItems();
        const nextItems = [...feeItems, newFee];
        await setDoc(doc(db, `${BASE_PATH}/settings`, 'config'), { feeItems: nextItems }, { merge: true });
        await logAudit('fee', 'fee.create', 'feeItem', key, `Custom fee item created: ${name}.`);

        nameInput.value = '';
        const globalAmtInput = document.getElementById('adv-fee-global-amt');
        if (globalAmtInput) globalAmtInput.value = '';
        renderFeeItemsManagement();
        showToast(`Fee item "${name}" created!`, 'success');
    });

    // --- Fee Items Container Delegated Click ---
    document.getElementById('fee-items-management-container')?.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('.del-fee');
        const editBtn = e.target.closest('.edit-fee');
        const feeItems = ctx.getFeeItems();

        if (delBtn) {
            const key = delBtn.dataset.key;
            if (!confirm('Permanently delete this fee item?')) return;
            const nextItems = feeItems.filter((i) => i.key !== key);
            await setDoc(doc(db, `${BASE_PATH}/settings`, 'config'), { feeItems: nextItems }, { merge: true });
            await logAudit('fee', 'fee.delete', 'feeItem', key, `Fee item deleted: ${key}.`);
            renderFeeItemsManagement();
            showToast('Fee item deleted.', 'info');
        }

        if (editBtn) {
            const key = editBtn.dataset.key;
            const item = feeItems.find((i) => i.key === key);
            if (!item) return;

            document.getElementById('e-fee-key').value = item.key;
            document.getElementById('e-fee-name').value = item.name;
            document.getElementById('e-fee-scope').value = item.scope || 'global';
            document.getElementById('e-fee-receipt-req').checked = !!item.isReceiptMandatory;

            document.getElementById('e-scope-global-container')?.classList.add('hidden');
            document.getElementById('e-scope-class-wise-container')?.classList.add('hidden');
            document.getElementById('e-scope-specific-container')?.classList.add('hidden');

            const classes = ctx.getClasses();
            if (item.scope === 'global' || !item.scope) {
                document.getElementById('e-scope-global-container')?.classList.remove('hidden');
                document.getElementById('e-fee-global-amt').value = item.amount || '';
            } else if (item.scope === 'class-wise') {
                document.getElementById('e-scope-class-wise-container')?.classList.remove('hidden');
                document.getElementById('e-class-wise-inputs').innerHTML = classes.map((c) => `<div><label class="block text-xs font-bold text-gray-600 mb-1">${escapeHtml(c)}</label><input type="number" data-class="${escapeHtml(c)}" class="e-cw-input w-full p-2 border rounded text-sm font-medium" value="${item.classValues && item.classValues[c] ? item.classValues[c] : ''}"></div>`).join('');
            } else if (item.scope === 'specific') {
                document.getElementById('e-scope-specific-container')?.classList.remove('hidden');
                document.getElementById('e-fee-specific-class').innerHTML = classes.map((c) => `<option value="${escapeHtml(c)}" ${item.targetClass === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
                document.getElementById('e-fee-specific-amt').value = item.amount || '';
            }

            const modal = document.getElementById('edit-fee-popup');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        }
    });

    document.getElementById('e-fee-cancel')?.addEventListener('click', () => {
        document.getElementById('edit-fee-popup')?.classList.add('hidden');
        document.getElementById('edit-fee-popup')?.classList.remove('flex');
    });

    document.getElementById('e-fee-update')?.addEventListener('click', async () => {
        const key = document.getElementById('e-fee-key').value;
        const name = (document.getElementById('e-fee-name').value || '').trim();
        const scope = document.getElementById('e-fee-scope').value;
        if (!name) return alert('Name is mandatory.');

        const feeItems = ctx.getFeeItems();
        const existing = feeItems.find((f) => f.key === key) || {};
        const updated = {
            ...existing,
            key,
            name,
            type: 'custom',
            scope,
            isVisible: true,
            isReceiptMandatory: !!document.getElementById('e-fee-receipt-req')?.checked,
            academicYear: existing.academicYear || ctx.getAcademicYear(),
            updatedAt: new Date().toISOString()
        };

        if (scope === 'global') {
            const amt = parseFloat(document.getElementById('e-fee-global-amt')?.value);
            if (isNaN(amt)) return alert('Enter valid amount.');
            updated.amount = amt;
        } else if (scope === 'class-wise') {
            const classAmounts = {};
            document.querySelectorAll('.e-cw-input').forEach((inp) => {
                const amt = parseFloat(inp.value);
                if (!isNaN(amt)) classAmounts[inp.dataset.class] = amt;
            });
            if (Object.keys(classAmounts).length === 0) return alert('Enter amount for at least one class.');
            updated.classValues = classAmounts;
        } else if (scope === 'specific') {
            const targetCls = document.getElementById('e-fee-specific-class')?.value;
            const amt = parseFloat(document.getElementById('e-fee-specific-amt')?.value);
            if (!targetCls || isNaN(amt)) return alert('Select class and enter valid amount.');
            updated.targetClass = targetCls;
            updated.amount = amt;
        }

        const nextFees = feeItems.map((f) => f.key === key ? updated : f);
        await setDoc(doc(db, `${BASE_PATH}/settings`, 'config'), { feeItems: nextFees }, { merge: true });
        await logAudit('fee', 'fee.update', 'feeItem', key, `Fee item updated: ${name}.`);

        document.getElementById('edit-fee-popup')?.classList.add('hidden');
        document.getElementById('edit-fee-popup')?.classList.remove('flex');
        renderFeeItemsManagement();
        showToast(`Fee item "${name}" updated!`, 'success');
    });

    // --- Student Group Form Listeners ---
    document.getElementById('num-of-students-group')?.addEventListener('input', (e) => {
        const count = parseInt(e.target.value, 10) || 0;
        const cont = document.getElementById('group-creation-container');
        if (!cont) return;
        cont.innerHTML = '';
        document.getElementById('create-group-btn-container')?.classList.toggle('hidden', count < 2);
        if (count < 2) return;

        const classes = ctx.getClasses();
        const clsOpts = '<option value="">Select Class</option>' + classes.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

        for (let i = 0; i < count; i++) {
            cont.innerHTML += `
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-4 border-b border-gray-100 mb-2">
                    <select class="grp-cls p-2.5 border rounded-lg bg-gray-50 text-sm font-semibold" data-idx="${i}">${clsOpts}</select>
                    <select class="grp-gen p-2.5 border rounded-lg bg-gray-50 text-sm font-semibold" data-idx="${i}"><option value="Male">Male</option><option value="Female">Female</option></select>
                    <div class="sm:col-span-3">
                        <input id="grp-stu-${i}" list="grp-stu-options-${i}" class="grp-stu p-2.5 border rounded-lg text-sm font-semibold bg-white w-full" data-idx="${i}" autocomplete="off" placeholder="Select class and gender first...">
                        <datalist id="grp-stu-options-${i}"></datalist>
                        <p class="text-xs text-gray-500 mt-1">Type student name and pick from suggestions.</p>
                    </div>
                </div>
            `;
        }
    });

    document.getElementById('group-creation-container')?.addEventListener('change', (e) => {
        if (e.target.classList.contains('grp-cls') || e.target.classList.contains('grp-gen')) {
            const idx = e.target.dataset.idx;
            const input = document.getElementById(`grp-stu-${idx}`);
            if (input) input.value = '';
            renderGroupStudentDatalist(idx);
        }
    });

    document.getElementById('group-creation-container')?.addEventListener('input', (e) => {
        if (e.target.classList.contains('grp-stu')) {
            const val = e.target.value;
            const idMatch = val.match(/\[ID:\s*([^\]]+)\]/);
            if (idMatch) {
                e.target.dataset.selectedId = idMatch[1].trim();
            } else {
                delete e.target.dataset.selectedId;
            }
        }
    });

    document.getElementById('create-group-btn')?.addEventListener('click', () => {
        const studentInputs = Array.from(document.querySelectorAll('.grp-stu'));
        const studentIds = studentInputs.map((inp) => inp.dataset.selectedId).filter(Boolean);
        const feeInput = document.getElementById('group-monthly-fee');
        const groupFee = parseFloat(feeInput?.value);

        if (studentIds.length < 2) {
            return alert('Please select at least 2 valid students from the suggestions.');
        }

        const uniqueIds = [...new Set(studentIds)];
        if (uniqueIds.length !== studentIds.length) {
            return alert('Duplicate students selected in group. Each student must be unique.');
        }

        if (isNaN(groupFee) || groupFee <= 0) {
            alert('Please enter a valid Group Monthly Fee.');
            feeInput?.focus();
            return;
        }

        openUnifyFamilyModal({
            studentIds: uniqueIds,
            groupFee,
            isEdit: false
        });
    });

    document.getElementById('unify-family-modal-close')?.addEventListener('click', closeUnifyFamilyModal);
    document.getElementById('unify-family-cancel-btn')?.addEventListener('click', closeUnifyFamilyModal);
    document.getElementById('unify-family-confirm-btn')?.addEventListener('click', handleConfirmGroupCreation);

    // Existing groups filters
    ['grp-search-input', 'grp-class-filter'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', renderStudentGroups);
        document.getElementById(id)?.addEventListener('change', renderStudentGroups);
    });

    // Existing groups delegated actions (Edit / Delete)
    document.getElementById('student-groups-list')?.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('.del-grp');
        const editBtn = e.target.closest('.edit-grp');

        if (delBtn) {
            const gid = delBtn.dataset.id;
            if (!confirm('Permanently delete this student group?')) return;
            await deleteDoc(doc(db, `${BASE_PATH}/studentGroups`, gid));
            await logAudit('group', 'group.delete', 'studentGroup', gid, 'Student group deleted.');
            renderStudentGroups();
            showToast('Student group deleted.', 'info');
        }

        if (editBtn) {
            const gid = editBtn.dataset.id;
            const groups = ctx.getStudentGroups();
            const g = groups.find((gr) => gr.id === gid);
            if (!g) return;

            document.getElementById('e-grp-id').value = g.id;
            document.getElementById('e-grp-fee').value = g.fee || '';
            editGroupWorkingMembers = [...(g.memberIds || [])];

            const classFilter = document.getElementById('e-grp-class-filter');
            if (classFilter) {
                const classes = ctx.getClasses();
                classFilter.innerHTML = '<option value="">Select Class</option>' + classes.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            }

            renderEditGroupMembers();

            const modal = document.getElementById('edit-group-popup');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        }
    });

    const renderEditGroupMembers = () => {
        const cont = document.getElementById('e-grp-members');
        if (!cont) return;
        const students = ctx.getStudents();
        const rawStudents = ctx.getRawStudents();

        cont.innerHTML = editGroupWorkingMembers.length
            ? editGroupWorkingMembers.map((sid) => {
                const s = students.find((st) => st.id === sid) || rawStudents.find((st) => st.id === sid);
                if (!s) return '';
                return `
                    <div class="flex items-center justify-between bg-white border border-gray-200 px-2 py-1.5 rounded">
                        <span class="text-sm font-medium text-gray-700">${escapeHtml(s.name || '-')} <span class="text-xs text-gray-500">(Class ${escapeHtml(s.class || '--')})</span></span>
                        <button type="button" class="text-red-600 hover:text-red-800 text-xs font-bold e-grp-remove-member cursor-pointer" data-id="${escapeHtml(s.id)}"><i class="fas fa-times mr-1"></i>Remove</button>
                    </div>
                `;
            }).join('')
            : '<p class="text-sm italic text-gray-500">No members in this group.</p>';
    };

    document.getElementById('e-grp-members')?.addEventListener('click', (e) => {
        const rem = e.target.closest('.e-grp-remove-member');
        if (rem) {
            editGroupWorkingMembers = editGroupWorkingMembers.filter((id) => id !== rem.dataset.id);
            renderEditGroupMembers();
        }
    });

    document.getElementById('e-grp-class-filter')?.addEventListener('change', () => {
        const cls = document.getElementById('e-grp-class-filter')?.value;
        const gen = document.getElementById('e-grp-gender-filter')?.value;
        const opts = document.getElementById('e-grp-student-options');
        if (!opts) return;
        const students = ctx.getStudents();
        const matches = students.filter((s) => s.class === cls && (!gen || s.gender === gen) && !editGroupWorkingMembers.includes(s.id));
        opts.innerHTML = matches.map((s) => `<option value="${escapeHtml(s.name)} (Adm: ${escapeHtml(s.adm || '--')}) [ID: ${escapeHtml(s.id)}]"></option>`).join('');
    });

    document.getElementById('e-grp-add-member')?.addEventListener('click', () => {
        const inp = document.getElementById('e-grp-student-select');
        const val = inp?.value || '';
        const idMatch = val.match(/\[ID:\s*([^\]]+)\]/);
        if (!idMatch) return alert('Please pick a student from the suggestions.');
        const studentId = idMatch[1].trim();
        if (editGroupWorkingMembers.includes(studentId)) return alert('Student already in group.');
        editGroupWorkingMembers.push(studentId);
        inp.value = '';
        renderEditGroupMembers();
    });

    document.getElementById('edit-group-cancel')?.addEventListener('click', () => {
        document.getElementById('edit-group-popup')?.classList.add('hidden');
        document.getElementById('edit-group-popup')?.classList.remove('flex');
    });

    document.getElementById('edit-group-update')?.addEventListener('click', () => {
        const gid = document.getElementById('e-grp-id')?.value;
        const feeVal = document.getElementById('e-grp-fee')?.value;
        const gfee = parseFloat(feeVal);

        if (editGroupWorkingMembers.length < 2) {
            return alert('Group must contain at least 2 members.');
        }

        if (isNaN(gfee) || gfee <= 0) {
            return alert('Please enter a valid monthly fee.');
        }

        document.getElementById('edit-group-popup')?.classList.add('hidden');
        document.getElementById('edit-group-popup')?.classList.remove('flex');

        openUnifyFamilyModal({
            isEdit: true,
            groupId: gid,
            studentIds: [...editGroupWorkingMembers],
            groupFee: gfee
        });
    });

    // --- Fee Concessions Listeners ---
    document.getElementById('filter-conc-class')?.addEventListener('change', renderConcessionsList);
    document.getElementById('search-conc-input')?.addEventListener('input', renderConcessionsList);
    document.getElementById('active-conc-search')?.addEventListener('input', renderActiveConcessionsList);
    document.getElementById('active-conc-class-filter')?.addEventListener('change', renderActiveConcessionsList);

    // Populate concession class filter dropdowns
    const concClassFilter = document.getElementById('filter-conc-class');
    const activeConcClassFilter = document.getElementById('active-conc-class-filter');
    const classes = ctx.getClasses();
    if (concClassFilter && concClassFilter.options.length <= 1) {
        concClassFilter.innerHTML = '<option value="">-- All Classes / Select --</option>' + classes.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    }
    if (activeConcClassFilter && activeConcClassFilter.options.length <= 1) {
        activeConcClassFilter.innerHTML = '<option value="all">All Classes</option>' + classes.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    }

    document.getElementById('fee-concessions-page')?.addEventListener('click', async (e) => {
        const openBtn = e.target.closest('.concession-open-btn');
        const delBtn = e.target.closest('.concession-delete-btn');

        if (openBtn) {
            openConcModal(openBtn.dataset.id);
        }

        if (delBtn) {
            const sid = delBtn.dataset.id;
            if (!confirm('Remove fee concession for this student?')) return;
            await updateDoc(doc(db, `${BASE_PATH}/students`, sid), { concessionFee: null, concessionUpdatedAt: Date.now() });
            const s = ctx.getStudents().find((st) => st.id === sid);
            if (s) s.concessionFee = null;
            await logAudit('fee', 'concession.remove', 'student', sid, 'Concession removed.');
            renderConcessionsList();
            showToast('Fee concession removed.', 'info');
        }
    });

    document.getElementById('conc-cancel')?.addEventListener('click', closeConcModal);

    document.getElementById('conc-save')?.addEventListener('click', async () => {
        const sid = document.getElementById('conc-student-id')?.value;
        const amt = parseFloat(document.getElementById('conc-fee-amount')?.value);
        if (isNaN(amt) || amt < 0) return alert('Please enter a valid concession amount.');

        try {
            await updateDoc(doc(db, `${BASE_PATH}/students`, sid), {
                concessionFee: amt,
                concessionAppliedAt: Date.now(),
                concessionUpdatedAt: Date.now()
            });
            const s = ctx.getStudents().find((st) => st.id === sid);
            if (s) {
                s.concessionFee = amt;
                s.concessionUpdatedAt = Date.now();
            }
            await logAudit('fee', 'concession.save', 'student', sid, `Concession saved: ₹${amt}.`);
            closeConcModal();
            renderConcessionsList();
            showToast(`Concession of ₹${amt} saved!`, 'success');
        } catch (err) {
            console.error('Failed to save concession:', err);
            alert('Failed to save concession: ' + err.message);
        }
    });

    document.getElementById('conc-remove')?.addEventListener('click', async () => {
        const sid = document.getElementById('conc-student-id')?.value;
        if (!confirm('Remove fee concession for this student?')) return;
        await updateDoc(doc(db, `${BASE_PATH}/students`, sid), { concessionFee: null, concessionUpdatedAt: Date.now() });
        const s = ctx.getStudents().find((st) => st.id === sid);
        if (s) s.concessionFee = null;
        await logAudit('fee', 'concession.remove', 'student', sid, 'Concession removed.');
        closeConcModal();
        renderConcessionsList();
        showToast('Fee concession removed.', 'info');
    });
};
