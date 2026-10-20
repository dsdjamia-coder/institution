package org.noorulislam.app.data

data class InstitutionStats(
    val totalStudents: Int = 0,
    val totalStaff: Int = 0,
    val maleStudents: Int = 0,
    val femaleStudents: Int = 0
)

data class StudentProfile(
    val id: String = "",
    val admNo: String = "",
    val name: String = "",
    val studentClass: String = "",
    val rollNo: String = "",
    val guardianName: String = "",
    val phone: String = "",
    val gender: String = "",
    val dob: String = "",
    val address: String = "",
    val status: String = "ACTIVE",
    val photoUrl: String = "",
    val pendingDues: Double = 0.0
)

data class FeeItem(
    val title: String = "",
    val amount: Double = 0.0,
    val isPaid: Boolean = false
)

data class PaymentRecord(
    val id: String = "",
    val receiptNo: String = "",
    val date: String = "",
    val amount: Double = 0.0,
    val paymentMode: String = "CASH",
    val title: String = "Fee Payment"
)

data class ExamResultItem(
    val subject: String = "",
    val marks: Double = 0.0,
    val maxMarks: Double = 100.0,
    val grade: String = "A+"
)

data class ExamReport(
    val examTitle: String = "First Term Examination",
    val totalMarks: Double = 0.0,
    val maxTotal: Double = 0.0,
    val percentage: Double = 0.0,
    val gpa: String = "4.0",
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

