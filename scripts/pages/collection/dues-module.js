import { escapeHtml, formatCurrency, populateAcademicYearSelect, resolveAcademicYearClasses, compareClassLabelsNatural } from '../../shared/app-common.js';
import { showToast } from '../../shared/toaster.js';
import { appLog } from '../../shared/logger.js';

/**
 * Fee Dues & Defaulters Module
 * Provides comprehensive tracking, multi-parameter filtering, cutoff month scoping,
 * prior academic years backlog dues integration, WhatsApp reminder notifications,
 * Excel export, and professional PDF reports.
 */

// Module state
let duesStudents = [];
let duesRawStudents = [];
let duesGroups = [];
let duesPayments = [];
let duesFeeItems = [];
let duesClasses = [];
let duesDefaultFee = 200;
let duesAcademicYear = '';
let duesAcademicYearSettings = [];
let selectStudentForCollectionCallback = null;

// Filter state
const filters = {
    search: '',
    classFilter: '',
    genderFilter: 'all',
    academicYear: '',
    monthCutoff: 'current', // 'all', 'current', or month string like 'sep'
    includePastYears: true,
    minAmount: 1,
    rowLimit: 25,
    pageOffset: 0
};

// Standard month definitions
const MONTH_SEQUENCE = ['june', 'july', 'august', 'september', 'october', 'november', 'december', 'january', 'february', 'march', 'april', 'may'];
const MONTH_SHORT = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
const CALENDAR_MONTH_INDEX = [5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4]; // 0=Jan .. 11=Dec mapped to June-May

/**
 * Normalizes item names to standard month keys
 */
const normalizeFeeItemName = (name = '') => String(name || '').trim().toLowerCase();

/**
 * Check if a payment itemKey matches a month
 */
const isMonthMatch = (itemKey = '', month = '') => {
    const key = String(itemKey || '').trim().toLowerCase();
    const m = String(month || '').trim().toLowerCase().slice(0, 3);
    if (!key || !m) return false;

    const keyYearMatch = key.match(/^([a-z]{3})-(\d{4})$/);
    if (keyYearMatch) {
        return keyYearMatch[1] === m;
    }
    return key === m || key.startsWith(m) || key.includes(`-${m}`) || key.includes(`_${m}`);
};

/**
 * Helper to get the month sequence for an academic year
 */
const getAcademicMonthSequence = (yearLabel = '') => {
    const yearList = Array.isArray(duesAcademicYearSettings) ? duesAcademicYearSettings : [];
    const yearRecord = yearList.find(y => {
        const lbl = typeof y === 'object' && y !== null ? (y.label || y.year || y.id || '') : y || '';
        return lbl === yearLabel;
    }) || {};

    const startMonth = Number.isInteger(Number(yearRecord?.startMonth)) ? Number(yearRecord.startMonth) : 5; // June default
    const endMonth = Number.isInteger(Number(yearRecord?.endMonth)) ? Number(yearRecord.endMonth) : 4; // May default
    const months = [];
    let cursor = startMonth;
    for (let count = 0; count < 24; count += 1) {
        months.push(cursor);
        if (cursor === endMonth) break;
        cursor = (cursor + 1) % 12;
    }
    return months.length ? months : [5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4];
};

/**
 * Converts month index (0-11) to 3-letter label
 */
const getMonthShortLabel = (monthIndex) => {
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return labels[monthIndex] || '';
};

/**
 * Determines which academic months are within the user's selected cutoff
 */
const getActiveCutoffMonths = (targetYear) => {
    const sequence = getAcademicMonthSequence(targetYear);
    const monthLabels = sequence.map(m => getMonthShortLabel(m));

    if (filters.monthCutoff === 'all') {
        return monthLabels;
    }

    if (filters.monthCutoff === 'current') {
        const now = new Date();
        const currentCalendarMonth = now.getMonth(); // 0-11
        const currentIndexInSequence = sequence.indexOf(currentCalendarMonth);
        if (currentIndexInSequence === -1) {
            // If current calendar month not in sequence or past, default to all elapsed or first 6
            return monthLabels.slice(0, 6);
        }
        return monthLabels.slice(0, currentIndexInSequence + 1);
    }

    // Cutoff is a specific month string (e.g. 'Oct')
    const cutoffLower = String(filters.monthCutoff || '').toLowerCase();
    const cutoffIndex = monthLabels.findIndex(m => m.toLowerCase().startsWith(cutoffLower));
    if (cutoffIndex !== -1) {
        return monthLabels.slice(0, cutoffIndex + 1);
    }

    return monthLabels;
};

/**
 * Computes past academic year dues for a student
 */
const calculateStudentPastDues = (student, currentTargetYear) => {
    if (!filters.includePastYears || !student) {
        return { totalPastDues: 0, breakdown: [] };
    }

    const availableYears = (Array.isArray(duesAcademicYearSettings) ? duesAcademicYearSettings : [])
        .filter(y => {
            const status = String(y?.status || 'active').toLowerCase();
            return status !== 'archived';
        })
        .map(y => typeof y === 'object' && y !== null ? (y.label || y.year || y.id || '') : y || '')
        .filter(Boolean);

    // Identify past years (years occurring before currentTargetYear)
    const currentStartYear = parseInt(String(currentTargetYear).split('-')[0], 10);
    const pastYears = availableYears.filter(yr => {
        if (yr === currentTargetYear) return false;
        const yrStart = parseInt(String(yr).split('-')[0], 10);
        return !isNaN(yrStart) && !isNaN(currentStartYear) ? yrStart < currentStartYear : false;
    });

    let totalPastDues = 0;
    const breakdown = [];

    pastYears.forEach(pastYear => {
        const yearItems = (duesFeeItems || []).filter(item => {
            const itemYear = item.academicYear || '';
            return itemYear === pastYear && item.isVisible !== false;
        });

        if (!yearItems.length) return;

        const studentClassInPastYear = student.academicYears?.[pastYear]?.class || '';
        const pastConcession = student.academicYears?.[pastYear]?.concessionFee;
        const effectiveMonthly = (pastConcession !== undefined && pastConcession !== null && pastConcession !== '')
            ? Number(pastConcession)
            : duesDefaultFee;

        let yearUnpaidTotal = 0;
        let yearUnpaidCount = 0;

        yearItems.forEach(item => {
            const itemType = item.type || 'month';
            let itemAmt = 0;
            if (itemType === 'custom') {
                if (item.scope === 'specific') {
                    if (studentClassInPastYear && item.targetClass && item.targetClass !== studentClassInPastYear) return;
                    itemAmt = Number(item.amount || 0);
                } else if (item.scope === 'class-wise') {
                    itemAmt = Number(item.classValues?.[studentClassInPastYear] || item.amount || 0);
                } else {
                    itemAmt = Number(item.amount || 0);
                }
            } else {
                itemAmt = effectiveMonthly;
            }

            if (itemAmt <= 0) return;

            const isPaid = (duesPayments || []).some(p => {
                if (p.studentId !== student.id && (!student.adm || p.admissionNo !== student.adm)) return false;
                const matchesItem = p.itemKey === item.key || isMonthMatch(p.itemKey, item.name);
                return matchesItem && (p.academicYear || '') === pastYear;
            });

            if (!isPaid) {
                yearUnpaidTotal += itemAmt;
                yearUnpaidCount += 1;
            }
        });

        if (yearUnpaidTotal > 0) {
            totalPastDues += yearUnpaidTotal;
            breakdown.push({
                year: pastYear,
                amount: yearUnpaidTotal,
                count: yearUnpaidCount
            });
        }
    });

    return {
        totalPastDues: Math.max(0, Math.round(totalPastDues)),
        breakdown
    };
};

/**
 * Calculates current and past dues for a single student
 */
export const calculateStudentDueDetails = (student, targetYear, activeCutoffMonths) => {
    if (!student) return null;

    const studentClass = student.academicYears?.[targetYear]?.class || student.class || '';
    const studentAdm = student.adm || student.admissionNo || '-';
    const studentName = student.name || 'Unnamed Student';
    const guardian = student.father || student.guardian || student.parentName || 'Guardian';
    const phone = student.mobile || student.phone || student.contact || student.guardianPhone || '';
    const gender = student.gender || 'Male';

    // Check if in student group
    const group = (duesGroups || []).find(g => Array.isArray(g.memberIds) && g.memberIds.includes(student.id));
    const isGroupMember = Boolean(group);
    const groupMemberCount = group?.memberIds?.length || 1;
    const groupFee = Number(group?.fee || group?.amount || 0);

    // Concession fee
    const concessionVal = student.academicYears?.[targetYear]?.concessionFee ?? student.concessionFee;
    const hasConcession = concessionVal !== undefined && concessionVal !== null && concessionVal !== '';
    const individualMonthlyFee = hasConcession ? Number(concessionVal) : duesDefaultFee;

    // In a family group, monthly fee is shared
    const effectiveMonthlyFee = isGroupMember
        ? (groupFee > 0 ? groupFee : individualMonthlyFee)
        : individualMonthlyFee;

    // Check payments for cutoff months
    const unpaidMonths = [];
    let currentMonthlyDuesTotal = 0;

    activeCutoffMonths.forEach(monthShort => {
        // Find if this month is paid
        const isPaid = (duesPayments || []).some(p => {
            if ((p.academicYear || '') !== targetYear) return false;
            const matchesMonth = isMonthMatch(p.itemKey, monthShort);
            if (!matchesMonth) return false;

            if (isGroupMember && p.billingGroupId === group.id) return true;
            if (p.studentId === student.id || (student.adm && p.admissionNo === student.adm)) return true;
            if (isGroupMember && Array.isArray(group.memberIds) && group.memberIds.includes(p.studentId)) return true;

            return false;
        });

        if (!isPaid) {
            unpaidMonths.push(monthShort);
            currentMonthlyDuesTotal += effectiveMonthlyFee;
        }
    });

    // Check custom fee items for current academic year
    const yearCustomItems = (duesFeeItems || []).filter(item => {
        const itemYear = item.academicYear || duesAcademicYear;
        return itemYear === targetYear && item.type === 'custom' && item.isVisible !== false;
    });

    let currentCustomDuesTotal = 0;
    const unpaidCustomItems = [];

    yearCustomItems.forEach(item => {
        let itemAmt = 0;
        if (item.scope === 'specific') {
            if (studentClass && item.targetClass && item.targetClass !== studentClass) return;
            itemAmt = Number(item.amount || 0);
        } else if (item.scope === 'class-wise') {
            itemAmt = Number(item.classValues?.[studentClass] || item.amount || 0);
        } else {
            itemAmt = Number(item.amount || 0);
        }

        if (itemAmt <= 0) return;

        const isPaid = (duesPayments || []).some(p => {
            if (p.studentId !== student.id && (!student.adm || p.admissionNo !== student.adm)) return false;
            return p.itemKey === item.key && (p.academicYear || '') === targetYear;
        });

        if (!isPaid) {
            currentCustomDuesTotal += itemAmt;
            unpaidCustomItems.push({ name: item.name, amount: itemAmt });
        }
    });

    const currentYearTotalDue = Math.round(currentMonthlyDuesTotal + currentCustomDuesTotal);

    // Calculate past years' dues
    const pastDuesResult = calculateStudentPastDues(student, targetYear);
    const grandTotalDue = currentYearTotalDue + pastDuesResult.totalPastDues;

    return {
        id: student.id,
        adm: studentAdm,
        name: studentName,
        class: studentClass,
        gender,
        guardian,
        phone,
        isGroupMember,
        groupId: group?.id || null,
        groupName: group?.name || 'Family Group',
        groupFee: isGroupMember ? groupFee : null,
        hasConcession,
        concessionFee: hasConcession ? Number(concessionVal) : null,
        effectiveMonthlyFee,
        unpaidMonths,
        unpaidMonthCount: unpaidMonths.length,
        currentMonthlyDuesTotal,
        currentCustomDuesTotal,
        unpaidCustomItems,
        currentYearTotalDue,
        pastYearsDue: pastDuesResult.totalPastDues,
        pastYearsBreakdown: pastDuesResult.breakdown,
        grandTotalDue,
        academicYear: targetYear
    };
};

/**
 * Filter and resolve all students with dues
 */
export const getFilteredDuesList = () => {
    const targetYear = filters.academicYear || duesAcademicYear;
    const activeCutoffMonths = getActiveCutoffMonths(targetYear);
    const studentsPool = Array.isArray(duesStudents) && duesStudents.length ? duesStudents : duesRawStudents;

    const results = [];

    studentsPool.forEach(student => {
        // Exclude alumni unless deliberately targeted
        const isAlumni = student.isAlumni === true ||
            String(student.status || '').trim().toLowerCase() === 'alumni' ||
            String(student.class || '').trim().toLowerCase() === 'alumni';
        if (isAlumni) return;

        // Class filter
        const studentClass = student.academicYears?.[targetYear]?.class || student.class || '';
        if (filters.classFilter && filters.classFilter !== 'all' && studentClass !== filters.classFilter) {
            return;
        }

        // Gender filter
        if (filters.genderFilter !== 'all' && student.gender !== filters.genderFilter) {
            return;
        }

        // Search term filter
        if (filters.search) {
            const term = filters.search.toLowerCase();
            const matchName = String(student.name || '').toLowerCase().includes(term);
            const matchAdm = String(student.adm || student.admissionNo || '').toLowerCase().includes(term);
            const matchPhone = String(student.mobile || student.phone || '').includes(term);
            const matchGuardian = String(student.father || student.guardian || '').toLowerCase().includes(term);
            if (!matchName && !matchAdm && !matchPhone && !matchGuardian) return;
        }

        const dueDetails = calculateStudentDueDetails(student, targetYear, activeCutoffMonths);
        if (!dueDetails) return;

        // Minimum due filter
        if (dueDetails.grandTotalDue < (filters.minAmount || 1)) {
            return;
        }

        results.push(dueDetails);
    });

    // Natural sort: by Class, then by Name
    return results.sort((a, b) => {
        const clsCompare = compareClassLabelsNatural(a.class, b.class);
        if (clsCompare !== 0) return clsCompare;
        return (a.name || '').localeCompare(b.name || '');
    });
};

/**
 * Renders the Fee Dues tab UI
 */
export const renderFeeDues = () => {
    const pageEl = document.getElementById('fee-dues-page');
    if (!pageEl || pageEl.classList.contains('hidden')) return;

    const targetYear = filters.academicYear || duesAcademicYear;
    const allDues = getFilteredDuesList();

    // 1. Update KPI Summary Cards
    const totalStudentsEl = document.getElementById('dues-total-students-count');
    const currentYearAmountEl = document.getElementById('dues-current-year-amount');
    const pastYearsAmountEl = document.getElementById('dues-past-years-amount');
    const grandTotalAmountEl = document.getElementById('dues-grand-total-amount');

    const totalStudents = allDues.length;
    const currentYearSum = allDues.reduce((sum, d) => sum + (d.currentYearTotalDue || 0), 0);
    const pastYearsSum = allDues.reduce((sum, d) => sum + (d.pastYearsDue || 0), 0);
    const grandTotalSum = allDues.reduce((sum, d) => sum + (d.grandTotalDue || 0), 0);

    if (totalStudentsEl) totalStudentsEl.textContent = totalStudents.toLocaleString('en-IN');
    if (currentYearAmountEl) currentYearAmountEl.textContent = `₹${currentYearSum.toLocaleString('en-IN')}`;
    if (pastYearsAmountEl) pastYearsAmountEl.textContent = `₹${pastYearsSum.toLocaleString('en-IN')}`;
    if (grandTotalAmountEl) grandTotalAmountEl.textContent = `₹${grandTotalSum.toLocaleString('en-IN')}`;

    // 2. Render Cutoff badge indicator
    const activeCutoffMonths = getActiveCutoffMonths(targetYear);
    const cutoffBadge = document.getElementById('dues-cutoff-badge');
    if (cutoffBadge) {
        cutoffBadge.textContent = `${activeCutoffMonths.length} Months (${activeCutoffMonths[0]} - ${activeCutoffMonths[activeCutoffMonths.length - 1]})`;
    }

    // 3. Render Table
    const tableContainer = document.getElementById('dues-table-container');
    if (!tableContainer) return;

    if (totalStudents === 0) {
        tableContainer.innerHTML = `
            <div class="text-center py-16 px-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
                <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl shadow-2xs">
                    <i class="fas fa-check-circle"></i>
                </div>
                <h3 class="text-base font-extrabold text-slate-800 mb-1">No Fee Dues Found!</h3>
                <p class="text-xs text-slate-500 max-w-sm mx-auto">All active students matching your filter criteria are fully paid up for the selected period.</p>
            </div>
        `;
        return;
    }

    // Apply pagination slice
    const limit = filters.rowLimit === 'all' ? allDues.length : parseInt(filters.rowLimit, 10) || 25;
    const startIdx = filters.pageOffset || 0;
    const pageSlice = allDues.slice(startIdx, startIdx + limit);

    let html = `
        <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs custom-scroll">
            <table class="w-full text-left border-collapse text-xs">
                <thead>
                    <tr class="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                        <th class="py-3 px-3 w-12 text-center">#</th>
                        <th class="py-3 px-3 w-20 text-center">Adm No</th>
                        <th class="py-3 px-3 min-w-[180px]">Student Details</th>
                        <th class="py-3 px-3 w-20 text-center">Class</th>
                        <th class="py-3 px-3 min-w-[160px]">Guardian & Phone</th>
                        <th class="py-3 px-3 min-w-[160px]">Unpaid Months (${targetYear})</th>
                        <th class="py-3 px-3 text-right min-w-[100px]">Current Due</th>
                        <th class="py-3 px-3 text-right min-w-[100px]">Past Dues</th>
                        <th class="py-3 px-3 text-right min-w-[110px]">Total Due</th>
                        <th class="py-3 px-3 text-center w-28">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
    `;

    pageSlice.forEach((item, index) => {
        const rowNum = startIdx + index + 1;
        const genderIcon = item.gender === 'Female'
            ? '<i class="fas fa-venus text-rose-500 ml-1" title="Female"></i>'
            : '<i class="fas fa-mars text-blue-500 ml-1" title="Male"></i>';

        const groupBadge = item.isGroupMember
            ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 ml-1" title="Family Billing Group"><i class="fas fa-users text-[8px]"></i>Family</span>`
            : '';

        const concessionBadge = item.hasConcession
            ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 ml-1" title="Monthly Concession: ₹${item.concessionFee}"><i class="fas fa-tag text-[8px]"></i>Concession</span>`
            : '';

        // Unpaid months pills
        const unpaidPills = item.unpaidMonths.length
            ? item.unpaidMonths.map(m => `<span class="inline-block px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[10px] font-bold m-0.5">${escapeHtml(m)}</span>`).join('')
            : '<span class="text-slate-400 italic">None</span>';

        // Past dues breakdown
        const pastBreakdownHtml = item.pastYearsBreakdown.length
            ? item.pastYearsBreakdown.map(b => `<span class="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[9px] font-bold m-0.5">${escapeHtml(b.year)}: ₹${b.amount.toLocaleString('en-IN')}</span>`).join('')
            : '<span class="text-slate-400">₹0</span>';

        // WhatsApp prefilled message
        const cleanPhone = String(item.phone || '').replace(/\D/g, '');
        const instName = document.getElementById('header-title')?.textContent?.trim() || 'Institution';
        const waMsg = encodeURIComponent(`Dear Guardian, Fee due reminder from ${instName} for ${item.name} (Class: ${item.class}, Adm: ${item.adm}). Pending Dues: ₹${item.grandTotalDue.toLocaleString('en-IN')} (Unpaid Months: ${item.unpaidMonths.join(', ')}). Please clear at the earliest. Thank you.`);
        const waLink = cleanPhone ? `https://wa.me/91${cleanPhone.length === 10 ? cleanPhone : cleanPhone.slice(-10)}?text=${waMsg}` : '#';

        html += `
            <tr class="hover:bg-slate-50/70 transition">
                <td class="py-2.5 px-3 text-center text-slate-500 font-bold">${rowNum}</td>
                <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-700">${escapeHtml(item.adm)}</td>
                <td class="py-2.5 px-3">
                    <div class="font-extrabold text-slate-800 flex items-center flex-wrap gap-1">
                        <span>${escapeHtml(item.name)}</span>
                        ${genderIcon}
                        ${groupBadge}
                        ${concessionBadge}
                    </div>
                </td>
                <td class="py-2.5 px-3 text-center font-black text-indigo-700 bg-indigo-50/30">${escapeHtml(item.class || '-')}</td>
                <td class="py-2.5 px-3">
                    <div class="text-slate-700 font-semibold truncate max-w-[150px]">${escapeHtml(item.guardian)}</div>
                    <div class="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                        <span>${escapeHtml(item.phone || '--')}</span>
                        ${cleanPhone ? `
                            <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="text-emerald-600 hover:text-emerald-700 p-0.5" title="Send WhatsApp Reminder">
                                <i class="fab fa-whatsapp"></i>
                            </a>
                            <a href="tel:${cleanPhone}" class="text-blue-600 hover:text-blue-700 p-0.5" title="Call Guardian">
                                <i class="fas fa-phone"></i>
                            </a>
                        ` : ''}
                    </div>
                </td>
                <td class="py-2.5 px-3">
                    <div class="flex flex-wrap items-center">${unpaidPills}</div>
                </td>
                <td class="py-2.5 px-3 text-right font-bold text-slate-800">₹${item.currentYearTotalDue.toLocaleString('en-IN')}</td>
                <td class="py-2.5 px-3 text-right font-bold text-amber-700">
                    <div>₹${item.pastYearsDue.toLocaleString('en-IN')}</div>
                    ${item.pastYearsBreakdown.length ? `<div class="mt-0.5 flex flex-wrap justify-end">${pastBreakdownHtml}</div>` : ''}
                </td>
                <td class="py-2.5 px-3 text-right font-black text-rose-700 text-sm">₹${item.grandTotalDue.toLocaleString('en-IN')}</td>
                <td class="py-2.5 px-3 text-center">
                    <button type="button" class="dues-quick-pay-btn px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer inline-flex items-center gap-1" data-id="${escapeHtml(item.id)}">
                        <i class="fas fa-hand-holding-dollar text-[10px]"></i>
                        <span>Collect</span>
                    </button>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    // Pagination info
    const totalPages = Math.ceil(totalStudents / limit);
    const curPage = Math.floor(startIdx / limit) + 1;

    html += `
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 text-xs font-medium text-slate-500">
            <div>
                Showing <strong>${startIdx + 1}</strong> to <strong>${Math.min(startIdx + limit, totalStudents)}</strong> of <strong>${totalStudents}</strong> defaulters
            </div>
            <div class="flex items-center gap-1.5">
                <button type="button" id="dues-prev-page" class="px-3 py-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-bold transition disabled:opacity-40 cursor-pointer" ${startIdx === 0 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left mr-1"></i>Previous
                </button>
                <span class="px-2 font-bold text-slate-700">Page ${curPage} of ${totalPages || 1}</span>
                <button type="button" id="dues-next-page" class="px-3 py-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-bold transition disabled:opacity-40 cursor-pointer" ${startIdx + limit >= totalStudents ? 'disabled' : ''}>
                    Next<i class="fas fa-chevron-right ml-1"></i>
                </button>
            </div>
        </div>
    `;

    tableContainer.innerHTML = html;

    // Attach row listeners
    document.querySelectorAll('.dues-quick-pay-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const studentId = btn.dataset.id;
            if (typeof selectStudentForCollectionCallback === 'function') {
                selectStudentForCollectionCallback(studentId);
            }
        });
    });

    // Pagination buttons
    document.getElementById('dues-prev-page')?.addEventListener('click', () => {
        filters.pageOffset = Math.max(0, filters.pageOffset - limit);
        renderFeeDues();
    });
    document.getElementById('dues-next-page')?.addEventListener('click', () => {
        filters.pageOffset = filters.pageOffset + limit;
        renderFeeDues();
    });
};

/**
 * PDF Export Generator
 */
export const exportFeeDuesPdf = () => {
    if (!window.jspdf?.jsPDF) {
        showToast('PDF generator is loading, please try again.', 'info');
        return;
    }

    const allDues = getFilteredDuesList();
    if (allDues.length === 0) {
        showToast('No defaulter records to export.', 'error');
        return;
    }

    const docPdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const conf = window.institutionConfig || {};
    const instName = conf.appName || document.getElementById('header-title')?.textContent?.trim() || 'Institution Name';
    const place = conf.place || document.getElementById('header-place')?.textContent?.trim() || '';
    const regNo = conf.regNo || document.getElementById('header-regno')?.textContent?.trim() || '';
    const targetYear = filters.academicYear || duesAcademicYear;
    const activeCutoffMonths = getActiveCutoffMonths(targetYear);

    const pageWidth = docPdf.internal.pageSize.getWidth();

    // 1. Header
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(14);
    docPdf.setTextColor(15, 23, 42);
    docPdf.text(instName.toUpperCase(), pageWidth / 2, 28, { align: 'center' });

    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(9);
    docPdf.setTextColor(100, 116, 139);
    const subtitle = [place, regNo ? `Reg No: ${regNo}` : '', `Academic Year: ${targetYear}`].filter(Boolean).join(' • ');
    docPdf.text(subtitle, pageWidth / 2, 42, { align: 'center' });

    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(11);
    docPdf.setTextColor(185, 28, 28); // red-700
    docPdf.text('STUDENTS FEE DUES & DEFAULTERS REGISTER', 20, 60);

    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(8);
    docPdf.setTextColor(71, 85, 105);
    const classScopeText = filters.classFilter && filters.classFilter !== 'all' ? `Class: ${filters.classFilter}` : 'Whole School';
    const periodText = `Period: ${activeCutoffMonths[0]} - ${activeCutoffMonths[activeCutoffMonths.length - 1]}`;
    const metaStr = `${classScopeText} | ${periodText} | Generated: ${new Date().toLocaleString('en-GB')} | Total Defaulters: ${allDues.length}`;
    docPdf.text(metaStr, pageWidth - 20, 60, { align: 'right' });

    // 2. Table Data
    const head = [
        ['NO', 'ADM', 'STUDENT NAME', 'CLASS', 'GUARDIAN & PHONE', 'UNPAID MONTHS', 'CURRENT DUE (₹)', 'PAST DUES (₹)', 'TOTAL DUE (₹)']
    ];

    let grandCurrent = 0;
    let grandPast = 0;
    let grandTotal = 0;

    const body = allDues.map((item, idx) => {
        grandCurrent += (item.currentYearTotalDue || 0);
        grandPast += (item.pastYearsDue || 0);
        grandTotal += (item.grandTotalDue || 0);

        const guardianStr = `${item.guardian}\n${item.phone || '--'}`;
        const unpaidMonthsStr = item.unpaidMonths.join(', ') || 'None';
        const pastStr = item.pastYearsBreakdown.length
            ? item.pastYearsBreakdown.map(b => `${b.year}: ₹${b.amount}`).join('\n')
            : '₹0';

        return [
            idx + 1,
            item.adm,
            item.name,
            item.class,
            guardianStr,
            unpaidMonthsStr,
            item.currentYearTotalDue.toLocaleString('en-IN'),
            pastStr,
            item.grandTotalDue.toLocaleString('en-IN')
        ];
    });

    // Add totals summary row
    body.push([
        '',
        '',
        'TOTAL SUMMARY',
        '',
        `Total Defaulters: ${allDues.length}`,
        '',
        grandCurrent.toLocaleString('en-IN'),
        grandPast.toLocaleString('en-IN'),
        grandTotal.toLocaleString('en-IN')
    ]);

    docPdf.autoTable({
        startY: 70,
        head,
        body,
        theme: 'grid',
        styles: {
            fontSize: 7.5,
            cellPadding: 3.5,
            lineColor: [226, 232, 240],
            lineWidth: 0.5,
            valign: 'middle'
        },
        headStyles: {
            fillColor: [15, 23, 42],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center'
        },
        columnStyles: {
            0: { cellWidth: 26, halign: 'center' },
            1: { cellWidth: 44, halign: 'center', fontStyle: 'bold' },
            2: { cellWidth: 140, fontStyle: 'bold' },
            3: { cellWidth: 46, halign: 'center', fontStyle: 'bold' },
            4: { cellWidth: 120 },
            5: { cellWidth: 150 },
            6: { cellWidth: 80, halign: 'right' },
            7: { cellWidth: 80, halign: 'right' },
            8: { cellWidth: 85, halign: 'right', fontStyle: 'bold' }
        },
        didParseCell: (data) => {
            // Style the summary totals row
            if (data.row.index === body.length - 1) {
                data.cell.styles.fillColor = [241, 245, 249];
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = [15, 23, 42];
            }
        }
    });

    const fileName = `fee-dues-register-${filters.classFilter || 'all'}-${targetYear}-${new Date().toISOString().split('T')[0]}.pdf`;
    docPdf.save(fileName);
    showToast('Fee Dues PDF downloaded successfully!', 'success');
};

/**
 * Excel Export Generator
 */
export const exportFeeDuesExcel = () => {
    if (!window.XLSX) {
        showToast('Excel exporter is loading, please try again.', 'info');
        return;
    }

    const allDues = getFilteredDuesList();
    if (allDues.length === 0) {
        showToast('No defaulter records to export.', 'error');
        return;
    }

    const targetYear = filters.academicYear || duesAcademicYear;
    const rows = [
        ['SL NO', 'ADMISSION NO', 'STUDENT NAME', 'CLASS', 'GENDER', 'GUARDIAN NAME', 'PHONE NUMBER', 'UNPAID MONTHS', 'CURRENT YEAR DUE (INR)', 'PAST YEARS DUE (INR)', 'TOTAL OUTSTANDING (INR)', 'ACADEMIC YEAR']
    ];

    allDues.forEach((item, idx) => {
        rows.push([
            idx + 1,
            item.adm,
            item.name,
            item.class,
            item.gender,
            item.guardian,
            item.phone,
            item.unpaidMonths.join(', '),
            item.currentYearTotalDue,
            item.pastYearsDue,
            item.grandTotalDue,
            targetYear
        ]);
    });

    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Fee Dues');
    const fileName = `fee-dues-${filters.classFilter || 'all'}-${targetYear}-${new Date().toISOString().split('T')[0]}.xlsx`;
    window.XLSX.writeFile(wb, fileName);
    showToast('Excel report downloaded successfully!', 'success');
};

/**
 * Initializes listeners and bindings for Fee Dues Module
 */
export const initFeeDuesModule = ({ onSelectStudentForCollection } = {}) => {
    selectStudentForCollectionCallback = onSelectStudentForCollection;

    // Search input
    document.getElementById('dues-search-input')?.addEventListener('input', (e) => {
        filters.search = e.target.value.trim();
        filters.pageOffset = 0;
        renderFeeDues();
    });

    // Class filter
    document.getElementById('dues-class-filter')?.addEventListener('change', (e) => {
        filters.classFilter = e.target.value;
        filters.pageOffset = 0;
        renderFeeDues();
    });

    // Gender filter
    document.getElementById('dues-gender-filter')?.addEventListener('change', (e) => {
        filters.genderFilter = e.target.value;
        filters.pageOffset = 0;
        renderFeeDues();
    });

    // Academic year select
    document.getElementById('dues-academic-year-select')?.addEventListener('change', (e) => {
        filters.academicYear = e.target.value;
        filters.pageOffset = 0;
        populateDuesMonthCutoffDropdown();
        populateDuesClassDropdown();
        renderFeeDues();
    });

    // Month cutoff select
    document.getElementById('dues-month-cutoff')?.addEventListener('change', (e) => {
        filters.monthCutoff = e.target.value;
        filters.pageOffset = 0;
        renderFeeDues();
    });

    // Include past years toggle
    document.getElementById('dues-include-past-years')?.addEventListener('change', (e) => {
        filters.includePastYears = e.target.checked;
        filters.pageOffset = 0;
        renderFeeDues();
    });

    // Row limit select
    document.getElementById('dues-row-limit')?.addEventListener('change', (e) => {
        filters.rowLimit = e.target.value;
        filters.pageOffset = 0;
        renderFeeDues();
    });

    // Minimum amount select
    document.getElementById('dues-min-amount')?.addEventListener('change', (e) => {
        filters.minAmount = Number(e.target.value) || 0;
        filters.pageOffset = 0;
        renderFeeDues();
    });

    // Export buttons
    document.getElementById('dues-export-pdf-btn')?.addEventListener('click', exportFeeDuesPdf);
    document.getElementById('dues-export-excel-btn')?.addEventListener('click', exportFeeDuesExcel);
    document.getElementById('dues-print-btn')?.addEventListener('click', () => window.print());

    appLog('info', 'collection.dues', 'Fee Dues Module Initialized');
};

/**
 * Populates month cutoff dropdown according to academic year sequence
 */
export const populateDuesMonthCutoffDropdown = () => {
    const cutoffSelect = document.getElementById('dues-month-cutoff');
    if (!cutoffSelect) return;

    const targetYear = filters.academicYear || duesAcademicYear;
    const sequence = getAcademicMonthSequence(targetYear);
    const curVal = cutoffSelect.value || filters.monthCutoff;

    let opts = `
        <option value="current" ${curVal === 'current' ? 'selected' : ''}>Up to Current Month (Auto)</option>
        <option value="all" ${curVal === 'all' ? 'selected' : ''}>All Months (Full Session)</option>
    `;

    sequence.forEach(mIdx => {
        const shortName = getMonthShortLabel(mIdx);
        opts += `<option value="${shortName.toLowerCase()}" ${curVal === shortName.toLowerCase() ? 'selected' : ''}>Up to ${shortName}</option>`;
    });

    cutoffSelect.innerHTML = opts;
};

/**
 * Populates class filter dropdown for dues module
 */
export const populateDuesClassDropdown = () => {
    const classFilter = document.getElementById('dues-class-filter');
    if (!classFilter) return;

    const targetYear = filters.academicYear || duesAcademicYear;
    const resolvedClasses = resolveAcademicYearClasses({
        academicYears: duesAcademicYearSettings,
        targetYear,
        students: duesStudents,
        configuredClasses: duesClasses
    });

    const curVal = classFilter.value || filters.classFilter;
    let opts = `<option value="all">All Classes (Whole School)</option>`;
    resolvedClasses.forEach(cls => {
        opts += `<option value="${escapeHtml(cls)}" ${curVal === cls ? 'selected' : ''}>Class: ${escapeHtml(cls)}</option>`;
    });

    classFilter.innerHTML = opts;
};

/**
 * Populates academic year select for dues module
 */
export const populateDuesAcademicYearDropdown = () => {
    const yearSelect = document.getElementById('dues-academic-year-select');
    if (!yearSelect) return;

    populateAcademicYearSelect(yearSelect, duesAcademicYearSettings, duesAcademicYear, {
        selectedValue: filters.academicYear || duesAcademicYear
    });
};

/**
 * Public data synchronization hook
 */
export const updateFeeDuesData = ({
    students,
    rawStudents,
    groups,
    payments,
    feeItems,
    classes,
    defaultFee,
    academicYear,
    academicYearSettings
} = {}) => {
    if (Array.isArray(students)) duesStudents = students;
    if (Array.isArray(rawStudents)) duesRawStudents = rawStudents;
    if (Array.isArray(groups)) duesGroups = groups;
    if (Array.isArray(payments)) duesPayments = payments;
    if (Array.isArray(feeItems)) duesFeeItems = feeItems;
    if (Array.isArray(classes)) duesClasses = classes;
    if (typeof defaultFee === 'number') duesDefaultFee = defaultFee;
    if (academicYear) duesAcademicYear = academicYear;
    if (Array.isArray(academicYearSettings)) duesAcademicYearSettings = academicYearSettings;

    populateDuesAcademicYearDropdown();
    populateDuesClassDropdown();
    populateDuesMonthCutoffDropdown();

    const pageEl = document.getElementById('fee-dues-page');
    if (pageEl && !pageEl.classList.contains('hidden')) {
        renderFeeDues();
    }
};
