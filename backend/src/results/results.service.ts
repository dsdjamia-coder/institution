import { Injectable, BadRequestException } from '@nestjs/common';
import * as admin from 'firebase-admin';

export interface RecordMarksDto {
  institutionId: string;
  examId: string;
  examTitle: string;
  academicYear: string;
  class: string;
  studentId: string;
  admNo: string;
  marks: Record<string, number>;
  totalScore: number;
  percentage: number;
}

export interface IssueTcDto {
  institutionId: string;
  studentId: string;
  admissionDate: string;
  leavingDate: string;
  classAtLeaving: string;
  qualifiedForPromotion: boolean;
  feesPaidUpTo: string;
  conduct: string;
  issuedByUid: string;
}

@Injectable()
export class ResultsService {
  private getFirestore() {
    return admin.firestore();
  }

  /**
   * Calculates GPA and grade scale according to Madrasa curriculum standards
   */
  calculateGrade(percentage: number): { grade: string; gpa: number; status: 'PASSED' | 'FAILED' } {
    if (percentage >= 90) return { grade: 'A+', gpa: 4.0, status: 'PASSED' };
    if (percentage >= 80) return { grade: 'A', gpa: 3.5, status: 'PASSED' };
    if (percentage >= 70) return { grade: 'B+', gpa: 3.0, status: 'PASSED' };
    if (percentage >= 60) return { grade: 'B', gpa: 2.5, status: 'PASSED' };
    if (percentage >= 50) return { grade: 'C+', gpa: 2.0, status: 'PASSED' };
    if (percentage >= 40) return { grade: 'C', gpa: 1.5, status: 'PASSED' };
    return { grade: 'F', gpa: 0.0, status: 'FAILED' };
  }

  /**
   * Save exam marks and auto-compute GPA & ranking
   */
  async recordExamMarks(dto: RecordMarksDto) {
    const { institutionId, examId, examTitle, academicYear, class: studentClass, studentId, admNo, marks, totalScore, percentage } = dto;
    const db = this.getFirestore();

    const { grade, gpa, status } = this.calculateGrade(percentage);

    const docId = `${examId}_${studentId}`;
    const resultRef = db.doc(`institutions/${institutionId}/examResults/${docId}`);

    const payload = {
      resultId: docId,
      examId,
      examTitle,
      academicYear,
      class: studentClass,
      studentId,
      admNo,
      marks,
      totalScore,
      percentage,
      grade,
      gpa,
      status,
      published: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await resultRef.set(payload, { merge: true });

    return {
      success: true,
      resultId: docId,
      grade,
      status
    };
  }

  /**
   * Issues official Transfer Certificate (TC) with auto-incrementing sequential number
   */
  async issueTransferCertificate(dto: IssueTcDto) {
    const { institutionId, studentId, admissionDate, leavingDate, classAtLeaving, qualifiedForPromotion, feesPaidUpTo, conduct, issuedByUid } = dto;
    const db = this.getFirestore();

    const studentSnap = await db.doc(`institutions/${institutionId}/students/${studentId}`).get();
    if (!studentSnap.exists) {
      throw new BadRequestException('Student record not found');
    }
    const student = studentSnap.data() || {};

    const counterRef = db.doc(`institutions/${institutionId}/settings/tcCounter`);
    let tcNumber = '';

    await db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      const currentCount = counterDoc.exists ? (counterDoc.data()?.lastNumber || 0) : 0;
      const nextCount = currentCount + 1;
      const year = new Date().getFullYear();
      tcNumber = `TC/${year}/${String(nextCount).padStart(4, '0')}`;

      transaction.set(counterRef, { lastNumber: nextCount, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

      const tcRef = db.collection(`institutions/${institutionId}/transferCertificates`).doc();
      transaction.set(tcRef, {
        tcId: tcRef.id,
        tcNumber,
        studentId,
        admNo: student.admNo,
        studentName: student.name,
        guardianName: student.guardianName || '',
        admissionDate,
        leavingDate,
        classAtLeaving,
        qualifiedForPromotion: Boolean(qualifiedForPromotion),
        feesPaidUpTo,
        conduct: conduct || 'Good',
        issuedByUid,
        issuedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Mark student status as TRANSFERRED
      transaction.update(studentSnap.ref, {
        status: 'TRANSFERRED',
        transferredAt: admin.firestore.FieldValue.serverTimestamp(),
        lastTcNumber: tcNumber
      });
    });

    return {
      success: true,
      tcNumber,
      studentName: student.name,
      admNo: student.admNo
    };
  }
}
