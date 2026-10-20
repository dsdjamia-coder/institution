import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as admin from 'firebase-admin';

export interface StudentAuthDto {
  institutionId: string;
  admNo: string;
  phone: string;
}

export interface StaffAuthDto {
  idToken: string;
  institutionId: string;
}

@Injectable()
export class AuthService {
  private getFirestore() {
    return admin.firestore();
  }

  /**
   * Verifies Student Admission Number and registered phone number.
   * Returns a custom token or session profile for cross-platform clients.
   */
  async authenticateStudent(dto: StudentAuthDto) {
    const { institutionId, admNo, phone } = dto;
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const cleanAdm = admNo.trim();

    const db = this.getFirestore();
    const studentsRef = db.collection(`institutions/${institutionId}/students`);
    
    const snapshot = await studentsRef.where('admNo', '==', cleanAdm).get();
    if (snapshot.empty) {
      throw new UnauthorizedException('Student record not found for provided Admission Number');
    }

    const studentDoc = snapshot.docs[0];
    const studentData = studentDoc.data();
    const studentPhone = String(studentData.phone || '').replace(/\D/g, '').slice(-10);
    const guardianPhone = String(studentData.guardianPhone || '').replace(/\D/g, '').slice(-10);

    if (cleanPhone !== studentPhone && cleanPhone !== guardianPhone) {
      throw new UnauthorizedException('Phone number does not match registered student or guardian records');
    }

    // Generate custom JWT or return authenticated session profile
    const customToken = await admin.auth().createCustomToken(studentDoc.id, {
      role: 'student',
      institutionId,
      studentId: studentDoc.id,
      admNo: studentData.admNo,
      studentClass: studentData.class || studentData.currentClass
    });

    return {
      authenticated: true,
      token: customToken,
      student: {
        id: studentDoc.id,
        admNo: studentData.admNo,
        name: studentData.name,
        class: studentData.class || studentData.currentClass,
        rollNo: studentData.rollNo || null,
        phone: studentPhone
      }
    };
  }

  /**
   * Verifies Firebase Auth ID Token and validates staff/admin role permissions from Firestore.
   */
  async verifyStaffToken(dto: StaffAuthDto) {
    const { idToken, institutionId } = dto;
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email;

    if (!email) {
      throw new UnauthorizedException('Staff account must have an associated email address');
    }

    const db = this.getFirestore();
    const adminDoc = await db.doc(`institutions/${institutionId}/settings/adminAuth`).get();
    const adminData = adminDoc.data() || {};
    const isAdmin = adminData.email === email || (adminData.adminsIndex && adminData.adminsIndex[email] === true);

    const staffAccessDoc = await db.doc(`institutions/${institutionId}/staffAccess/${email}`).get();
    const staffData = staffAccessDoc.data() || {};

    return {
      uid: decodedToken.uid,
      email,
      isAdmin,
      permissions: {
        canCollectFees: isAdmin || staffData.collection === true,
        canManageResults: isAdmin || staffData.result === true || staffData.canManageResults === true,
        canManageStudents: isAdmin || staffData.students === true,
        canViewWorksheets: isAdmin || staffData.worksheet !== false
      }
    };
  }
}
