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
    val place: String = ""
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
    val uid: String = "",
    val name: String = "",
    val studentClass: String = "",
    val rollNo: String = "",
    val guardianName: String = "",
    val phone: String = "",
    val gender: String = "Male",
    val dob: String = "",
    val address: String = "",
    val status: String = "ACTIVE",
    val photoUrl: String = "",
    val pendingDues: Double = 0.0,
    val fatherName: String = "",
    val fatherPhone: String = "",
    val motherName: String = "",
    val motherPhone: String = "",
    val academicYear: String = "",
    val concessionGroup: String = ""
)

data class FeeItem(
    val key: String = "",
    val title: String = "",
    val amount: Double = 0.0,
    val isPaid: Boolean = false,
    val category: String = "Tuition",
    val academicYear: String = "",
    val dueDate: String = "",
    val paidDate: String = "",
    val receiptNo: String = ""
)

data class PaymentRecord(
    val id: String = "",
    val receiptNo: String = "",
    val date: String = "",
    val amount: Double = 0.0,
    val paymentMode: String = "CASH",
    val title: String = "Fee Payment",
    val collectorName: String = "",
    val academicYear: String = ""
)

data class ExamResultItem(
    val subject: String = "",
    val marks: Double = 0.0,
    val maxMarks: Double = 100.0,
    val grade: String = "",
    val status: String = "PASS"
)

data class ExamReport(
    val id: String = "",
    val examKey: String = "",
    val examTitle: String = "Annual Examination",
    val academicYear: String = "",
    val classLabel: String = "",
    val totalMarks: Double = 0.0,
    val maxTotal: Double = 0.0,
    val percentage: Double = 0.0,
    val gpa: String = "",
    val status: String = "PASSED",
    val rank: Int = 0,
    val subjects: List<ExamResultItem> = emptyList(),
    val published: Boolean = true
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
