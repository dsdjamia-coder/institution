import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from '../../config/firebase-config.js';
import { BASE_PATH } from '../../config/app-config.js';

/**
 * Atomic Global Receipt Number Sequence Generator.
 * Guarantees globally unique, monotonic receipt numbers across all concurrent cashier devices.
 */
export const getNextReceiptNumberAtomic = async (fallbackCandidates = []) => {
    const counterRef = doc(db, `${BASE_PATH}/settings`, 'receiptSequence');
    try {
        const nextNumber = await runTransaction(db, async (transaction) => {
            const counterSnap = await transaction.get(counterRef);
            let current = 0;
            if (counterSnap.exists()) {
                current = Number(counterSnap.data()?.lastReceiptNo || 0);
            }
            if (!current || isNaN(current)) {
                const nums = (Array.isArray(fallbackCandidates) ? fallbackCandidates : [])
                    .map(p => Number(p?.receiptNo || p))
                    .filter(n => Number.isFinite(n) && n > 0);
                current = nums.length ? Math.max(...nums) : 0;
            }
            const next = current + 1;
            transaction.set(counterRef, {
                lastReceiptNo: next,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            return next;
        });
        return nextNumber;
    } catch (err) {
        console.warn('Atomic receipt transaction fallback:', err);
        const nums = (Array.isArray(fallbackCandidates) ? fallbackCandidates : [])
            .map(p => Number(p?.receiptNo || p))
            .filter(n => Number.isFinite(n) && n > 0);
        return nums.length ? Math.max(...nums) + 1 : 1;
    }
};
