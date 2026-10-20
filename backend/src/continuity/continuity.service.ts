import { Injectable, BadRequestException } from '@nestjs/common';
import * as admin from 'firebase-admin';

export interface DiscontinueStudentDto {
  institutionId: string;
  studentId: string;
  departureDate: string; // YYYY-MM-DD
  reason: string;
  notes: string;
  frozenPendingDue: number;
}

export interface ReadmitStudentDto {
  institutionId: string;
  studentId: string;
  returnDate: string; // YYYY-MM-DD
  newClass: string;
  newRollNo: number;
  currentAcademicYear: string;
  notes: string;
}

@Injectable()
export class ContinuityService {
  private getFirestore() {
    return admin.firestore();
  }

  /**
   * Discontinue student: freezes historical pending dues up to departure date
   * and prevents automated billing during gap years.
   */
  async discontinueStudent(dto: DiscontinueStudentDto) {
    const { institutionId, studentId, departureDate, reason, notes, frozenPendingDue } = dto;
    const db = this.getFirestore();
    const studentRef = db.doc(`institutions/${institutionId}/students/${studentId}`);
    const snap = await studentRef.get();

    if (!snap.exists) {
      throw new BadRequestException('Student record not found');
    }

    const currentData = snap.data() || {};
    const trajectory = currentData.academicTrajectory || [];

    trajectory.push({
      academicYear: currentData.academicYear || 'Current',
      class: currentData.class || currentData.currentClass,
      rollNo: currentData.rollNo || null,
      status: 'DISCONTINUED',
      date: departureDate,
      notes: `${reason} - ${notes}`
    });

    await studentRef.update({
      status: 'DISCONTINUED',
      isDiscontinued: true,
      discontinueInfo: {
        date: departureDate,
        reason,
        notes,
        frozenPendingDue: Number(frozenPendingDue || 0),
        discontinuedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      academicTrajectory: trajectory,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      studentId,
      status: 'DISCONTINUED',
      frozenPendingDue
    };
  }

  /**
   * Re-admit student after gap years: preserves previous trajectory and resumes active billing
   */
  async readmitStudent(dto: ReadmitStudentDto) {
    const { institutionId, studentId, returnDate, newClass, newRollNo, currentAcademicYear, notes } = dto;
    const db = this.getFirestore();
    const studentRef = db.doc(`institutions/${institutionId}/students/${studentId}`);
    const snap = await studentRef.get();

    if (!snap.exists) {
      throw new BadRequestException('Student record not found');
    }

    const currentData = snap.data() || {};
    const trajectory = currentData.academicTrajectory || [];

    trajectory.push({
      academicYear: currentAcademicYear,
      class: newClass,
      rollNo: Number(newRollNo),
      status: 'RE_ADMITTED',
      date: returnDate,
      notes: notes || 'Student re-admitted after gap period'
    });

    await studentRef.update({
      status: 'ACTIVE',
      isDiscontinued: false,
      class: newClass,
      currentClass: newClass,
      rollNo: Number(newRollNo),
      academicYear: currentAcademicYear,
      readmissionInfo: {
        returnDate,
        newClass,
        newRollNo,
        notes,
        readmittedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      academicTrajectory: trajectory,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      studentId,
      status: 'ACTIVE',
      assignedClass: newClass,
      rollNo: newRollNo
    };
  }
}
