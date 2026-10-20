package org.noorulislam.app.data

data class InstitutionStats(
    val totalStudents: Int = 0,
    val totalStaff: Int = 0,
    val maleStudents: Int = 0,
    val femaleStudents: Int = 0
)

data class TeacherProfile(
    val id: String = "",
    val name: String = "",
    val role: String = "Teacher",
    val phone: String = "",
    val photoUrl: String = "",
    val place: String = "Koduvally"
)

data class NoticeItem(
    val id: String = "",
    val title: String = "",
    val date: String = "",
    val description: String = "",
    val category: String = "General"
)

data class GalleryItem(
    val id: String = "",
    val title: String = "",
    val imageUrl: String = ""
)

data class StudentProfile(
    val id: String = "",
    val admNo: String = "",
    val uid: String = "STD-" + admNo,
    val name: String = "",
    val studentClass: String = "",
    val rollNo: String = "",
    val guardianName: String = "",
    val phone: String = "",
    val gender: String = "Male",
    val dob: String = "2013-05-14",
    val address: String = "",
    val status: String = "ACTIVE",
    val photoUrl: String = "",
    val pendingDues: Double = 0.0,
    val fatherName: String = guardianName,
    val fatherPhone: String = phone,
    val motherName: String = "Suhaida",
    val motherPhone: String = phone,
    val academicYear: String = "2025-2026",
    val concessionGroup: String = "Standard Tier"
)

data class FeeItem(
    val title: String = "",
    val amount: Double = 0.0,
    val isPaid: Boolean = false,
    val category: String = "Tuition",
    val academicYear: String = "2025-2026",
    val dueDate: String = "10th of every month"
)

data class PaymentRecord(
    val id: String = "",
    val receiptNo: String = "",
    val date: String = "",
    val amount: Double = 0.0,
    val paymentMode: String = "CASH",
    val title: String = "Fee Payment",
    val collectorName: String = "Fee Desk Official"
)

data class ExamResultItem(
    val subject: String = "",
    val marks: Double = 0.0,
    val maxMarks: Double = 100.0,
    val grade: String = "A+"
)

data class ExamReport(
    val examTitle: String = "Second Term / Half Yearly Examination",
    val academicYear: String = "2025-2026",
    val totalMarks: Double = 368.0,
    val maxTotal: Double = 400.0,
    val percentage: Double = 92.0,
    val gpa: String = "3.8",
    val status: String = "PASSED",
    val subjects: List<ExamResultItem> = emptyList()
)

data class SavedStudentAccount(
    val studentId: String = "",
    val name: String = "",
    val admNo: String = "",
    val studentClass: String = ""
)

data class FeePaymentPayload(
    val studentId: String,
    val admNo: String,
    val studentName: String,
    val studentClass: String,
    val amount: Double,
    val feeCategory: String = "Tuition Fee",
    val paymentMode: String = "CASH",
    val remarks: String = "",
    val collectorName: String = "Staff Desk"
)

data class PaymentReceipt(
    val receiptNo: String,
    val date: String,
    val studentId: String,
    val admNo: String,
    val studentName: String,
    val studentClass: String,
    val amount: Double,
    val feeCategory: String,
    val paymentMode: String,
    val collectorName: String,
    val timestamp: Long = System.currentTimeMillis()
)

data class AdminOverview(
    val stats: InstitutionStats,
    val todayCollectionTotal: Double = 0.0,
    val todayReceiptsCount: Int = 0,
    val recentPayments: List<PaymentRecord> = emptyList()
)
