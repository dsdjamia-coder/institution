import { Injectable, BadRequestException } from '@nestjs/common';
import * as admin from 'firebase-admin';

export interface RecordPaymentDto {
  institutionId: string;
  studentId: string;
  amount: number;
  breakdown: Array<{
    feeId: string;
    feeTitle: string;
    amount: number;
  }>;
  paymentMode: 'CASH' | 'UPI' | 'BANK_TRANSFER';
  academicYear: string;
  collectedBy: {
    uid: string;
    email: string;
    name: string;
  };
}

@Injectable()
export class FeesService {
  private getFirestore() {
    return admin.firestore();
  }

  /**
   * Authoritative Payment Recording with transactional atomic write and receipt generation
   */
  async recordPayment(dto: RecordPaymentDto) {
    const { institutionId, studentId, amount, breakdown, paymentMode, academicYear, collectedBy } = dto;

    if (!amount || amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    const db = this.getFirestore();
    const studentRef = db.doc(`institutions/${institutionId}/students/${studentId}`);
    const studentSnap = await studentRef.get();

    if (!studentSnap.exists) {
      throw new BadRequestException('Student record does not exist');
    }

    const studentData = studentSnap.data() || {};
    const paymentsCol = db.collection(`institutions/${institutionId}/payments`);
    const yearPaymentsCol = db.collection(`institutions/${institutionId}/academicYears/${academicYear}/payments`);

    const receiptNo = `REC-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const today = new Date().toISOString().split('T')[0];

    const paymentPayload = {
      receiptNo,
      studentId,
      admNo: studentData.admNo || '',
      studentName: studentData.name || '',
      class: studentData.class || studentData.currentClass || '',
      academicYear,
      amount: Number(amount),
      breakdown: breakdown || [],
      paymentMode: paymentMode || 'CASH',
      paymentDate: today,
      timestamp: Date.now(),
      status: 'VALID',
      collectedBy,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const batch = db.batch();
    const globalPaymentRef = paymentsCol.doc();
    const yearPaymentRef = yearPaymentsCol.doc(globalPaymentRef.id);

    batch.set(globalPaymentRef, paymentPayload);
    batch.set(yearPaymentRef, paymentPayload);

    await batch.commit();

    return {
      success: true,
      receiptNo,
      paymentId: globalPaymentRef.id,
      paymentDate: today,
      amount,
      studentName: studentData.name,
      admNo: studentData.admNo
    };
  }

  /**
   * Calculates student fee balance, taking into account frozen dues for gap-years
   */
  async calculateStudentLedger(institutionId: string, studentId: string, activeAcademicYear: string) {
    const db = this.getFirestore();
    const studentSnap = await db.doc(`institutions/${institutionId}/students/${studentId}`).get();
    
    if (!studentSnap.exists) {
      throw new BadRequestException('Student not found');
    }

    const student = studentSnap.data() || {};
    const isDiscontinued = student.status === 'DISCONTINUED';

    // Fetch fee items for the class
    const studentClass = student.class || student.currentClass;
    const feeItemsSnap = await db.collection(`institutions/${institutionId}/academicYears/${activeAcademicYear}/feeItems`).get();
    
    let totalAssignedFee = 0;
    const feeStructure: any[] = [];

    feeItemsSnap.forEach((doc) => {
      const item = doc.data();
      const targetClasses = item.targetClasses || [];
      if (targetClasses.includes('ALL') || targetClasses.includes(studentClass)) {
        feeStructure.push(item);
        if (!isDiscontinued) {
          totalAssignedFee += Number(item.amount || 0);
        }
      }
    });

    // If discontinued, use frozenPendingDue up to departure date
    if (isDiscontinued && student.discontinueInfo?.frozenPendingDue !== undefined) {
      totalAssignedFee = Number(student.discontinueInfo.frozenPendingDue);
    }

    // Fetch payments made by this student for this academic year
    const paymentsSnap = await db.collection(`institutions/${institutionId}/academicYears/${activeAcademicYear}/payments`)
      .where('studentId', '==', studentId)
      .where('status', '==', 'VALID')
      .get();

    let totalPaid = 0;
    paymentsSnap.forEach((doc) => {
      totalPaid += Number(doc.data().amount || 0);
    });

    const pendingDue = Math.max(0, totalAssignedFee - totalPaid);

    return {
      studentId,
      name: student.name,
      admNo: student.admNo,
      class: studentClass,
      status: student.status,
      isDiscontinued,
      totalAssignedFee,
      totalPaid,
      pendingDue,
      isFullyPaid: pendingDue === 0
    };
  }
}
