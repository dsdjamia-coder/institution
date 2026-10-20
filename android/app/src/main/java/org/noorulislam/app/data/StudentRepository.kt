package org.noorulislam.app.data

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import androidx.core.content.FileProvider
import com.google.firebase.FirebaseApp
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.*

class StudentRepository(private val context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences("noorul_islam_prefs", Context.MODE_PRIVATE)
    private val TAG = "StudentRepository"
    private val INSTITUTION_ID = "TEST_INSTITUTE_01"
    private val BASE_PATH = "institutions/$INSTITUTION_ID"
    private val FIRESTORE_DB_ID = "ai-studio-feee-81b4709b-982c-4f96-b21b-c346855b9aa2"

    private val firestore: FirebaseFirestore by lazy {
        try {
            val app = FirebaseApp.getInstance()
            try {
                FirebaseFirestore.getInstance(app, FIRESTORE_DB_ID)
            } catch (e: Exception) {
                Log.w(TAG, "Named Firestore instance failed, falling back to default", e)
                FirebaseFirestore.getInstance(app)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Firebase app initialization fallback", e)
            FirebaseFirestore.getInstance()
        }
    }

    fun isOnline(): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            val network = cm?.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(network) ?: return false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } catch (e: Exception) {
            true
        }
    }

    private fun normalizePhone(value: String): String {
        return value.replace(Regex("[^0-9]"), "")
    }

    /**
     * Synchronize distinct classes dynamically from Firestore.
     * Mirrors distinctClasses in index-page.js and collection-page.js.
     */
    suspend fun getDistinctClasses(): List<String> = withContext(Dispatchers.IO) {
        try {
            val studentsSnap = firestore.collection("$BASE_PATH/students").get().await()
            val rawClasses = mutableSetOf<String>()

            for (doc in studentsSnap.documents) {
                val cls = (doc.getString("class") ?: doc.getString("studentClass") ?: "").trim()
                if (cls.isNotEmpty()) {
                    rawClasses.add(cls)
                }
            }

            // Also check classes collection if configured
            try {
                val classSnap = firestore.collection("$BASE_PATH/classes").get().await()
                for (doc in classSnap.documents) {
                    val name = (doc.getString("name") ?: doc.getString("className") ?: doc.id).trim()
                    if (name.isNotEmpty()) {
                        rawClasses.add(name)
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Optional classes collection query notice", e)
            }

            val regularClasses = rawClasses
                .filter { !it.equals("alumni", ignoreCase = true) }
                .sortedWith(Comparator { a, b ->
                    // Natural numeric comparator matching web localeCompare numeric: true
                    compareClassNames(a, b)
                })

            val hasAlumni = rawClasses.any { it.equals("alumni", ignoreCase = true) }
            val result = mutableListOf<String>()
            result.addAll(regularClasses)
            if (hasAlumni || regularClasses.isNotEmpty()) {
                result.add("Alumni")
            }
            result
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching distinct classes", e)
            emptyList()
        }
    }

    private fun compareClassNames(a: String, b: String): Int {
        val numA = Regex("\\d+").find(a)?.value?.toIntOrNull()
        val numB = Regex("\\d+").find(b)?.value?.toIntOrNull()
        return if (numA != null && numB != null) {
            numA.compareTo(numB)
        } else {
            a.compareTo(b, ignoreCase = true)
        }
    }

    suspend fun getInstitutionStats(): InstitutionStats = withContext(Dispatchers.IO) {
        try {
            val studentsSnap = firestore.collection("$BASE_PATH/students").get().await()
            var maleCount = 0
            var femaleCount = 0
            var activeStudentCount = 0

            for (doc in studentsSnap.documents) {
                val cls = (doc.getString("class") ?: doc.getString("studentClass") ?: "").trim().lowercase()
                val status = (doc.getString("status") ?: "ACTIVE").trim().lowercase()
                if (cls == "alumni" || status == "alumni" || status == "graduated" || status == "discontinued") {
                    continue
                }
                activeStudentCount++
                val gender = doc.getString("gender") ?: doc.getString("sex") ?: ""
                if (gender.equals("male", ignoreCase = true) || gender.equals("m", ignoreCase = true) || gender.equals("boy", ignoreCase = true)) {
                    maleCount++
                } else if (gender.equals("female", ignoreCase = true) || gender.equals("f", ignoreCase = true) || gender.equals("girl", ignoreCase = true)) {
                    femaleCount++
                }
            }

            var staffCount = 0
            try {
                val staffSnap = firestore.collection("$BASE_PATH/staff").get().await()
                staffCount = staffSnap.size()
            } catch (e: Exception) {
                Log.w(TAG, "Staff fetch notice", e)
            }

            InstitutionStats(
                totalStudents = activeStudentCount,
                totalStaff = staffCount,
                maleStudents = maleCount,
                femaleStudents = femaleCount
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching stats", e)
            InstitutionStats(0, 0, 0, 0)
        }
    }

    suspend fun getAboutUsText(): String = withContext(Dispatchers.IO) {
        try {
            val doc = firestore.collection("$BASE_PATH/settings").document("publicInfo").get().await()
            if (doc.exists()) {
                doc.getString("about") ?: doc.getString("description") ?: ""
            } else {
                val generalDoc = firestore.collection(BASE_PATH).document("settings").get().await()
                generalDoc.getString("about") ?: generalDoc.getString("description") ?: ""
            }
        } catch (e: Exception) {
            ""
        }
    }

    suspend fun getTeachers(): List<TeacherProfile> = withContext(Dispatchers.IO) {
        try {
            val snap = firestore.collection("$BASE_PATH/staff").get().await()
            if (!snap.isEmpty) {
                snap.documents.map { doc ->
                    TeacherProfile(
                        id = doc.id,
                        name = doc.getString("name") ?: "Teacher",
                        role = doc.getString("role") ?: doc.getString("designation") ?: "Faculty",
                        phone = doc.getString("phone") ?: doc.getString("mobile") ?: "",
                        photoUrl = doc.getString("photoUrl") ?: doc.getString("photo") ?: "",
                        place = doc.getString("place") ?: doc.getString("address") ?: ""
                    )
                }
            } else {
                emptyList()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Teacher fetch error", e)
            emptyList()
        }
    }

    suspend fun getNotices(): List<NoticeItem> = withContext(Dispatchers.IO) {
        try {
            val snap = firestore.collection("$BASE_PATH/notices")
                .orderBy("timestamp", Query.Direction.DESCENDING)
                .limit(15)
                .get()
                .await()

            snap.documents.map { doc ->
                NoticeItem(
                    id = doc.id,
                    title = doc.getString("title") ?: "Notice",
                    date = doc.getString("date") ?: "",
                    description = doc.getString("description") ?: doc.getString("body") ?: "",
                    category = doc.getString("category") ?: "General"
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "Notice fetch error", e)
            emptyList()
        }
    }

    suspend fun getGallery(): List<GalleryItem> = withContext(Dispatchers.IO) {
        try {
            val snap = firestore.collection("$BASE_PATH/gallery").limit(20).get().await()
            snap.documents.mapNotNull { doc ->
                val url = doc.getString("url") ?: doc.getString("imageUrl") ?: ""
                if (url.isNotEmpty()) {
                    GalleryItem(
                        id = doc.id,
                        title = doc.getString("title") ?: "",
                        imageUrl = url
                    )
                } else null
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    /**
     * Authenticate student exactly mirroring index-page.js logic.
     * Validates class, student identifier, and registered phone number.
     * Throws specific errors if mobile is missing or mismatch.
     */
    suspend fun authenticateStudent(
        studentClass: String,
        searchQuery: String,
        phoneInput: String
    ): Result<StudentProfile> = withContext(Dispatchers.IO) {
        try {
            val cleanQuery = searchQuery.trim().lowercase()
            val inputPhoneNormalized = normalizePhone(phoneInput)
            val isAlumni = studentClass.equals("alumni", ignoreCase = true)

            val querySnapshot = firestore.collection("$BASE_PATH/students").get().await()
            val matchingClassStudents = mutableListOf<com.google.firebase.firestore.DocumentSnapshot>()

            for (doc in querySnapshot.documents) {
                val sClass = (doc.getString("class") ?: doc.getString("studentClass") ?: "").trim()
                val sStatus = (doc.getString("status") ?: "ACTIVE").trim()

                val classMatches = if (isAlumni) {
                    sClass.equals("alumni", ignoreCase = true) ||
                            sStatus.equals("alumni", ignoreCase = true) ||
                            sStatus.equals("graduated", ignoreCase = true) ||
                            doc.getBoolean("isAlumni") == true
                } else {
                    sClass.equals(studentClass, ignoreCase = true)
                }

                if (classMatches) {
                    matchingClassStudents.add(doc)
                }
            }

            // Find matching student by name or admission number
            val candidateDocs = matchingClassStudents.filter { doc ->
                val sAdm = (doc.getString("adm") ?: doc.getString("admNo") ?: doc.id).trim().lowercase()
                val sName = (doc.getString("name") ?: "").trim().lowercase()
                cleanQuery.isEmpty() || sAdm == cleanQuery || sName.contains(cleanQuery)
            }

            if (candidateDocs.isEmpty()) {
                return@withContext Result.failure(
                    Exception("No student found matching '$searchQuery' in $studentClass.")
                )
            }

            // Find target student document
            val targetDoc = candidateDocs.first()

            // Resolve registered phone number from Firestore document
            val regPhoneRaw = targetDoc.getString("mobile")
                ?: targetDoc.getString("phone")
                ?: targetDoc.getString("primaryMobile")
                ?: targetDoc.getString("fatherPhone")
                ?: targetDoc.getString("fatherMobile")
                ?: targetDoc.getString("guardianPhone")
                ?: targetDoc.getString("guardianMobile")
                ?: ""

            val normalizedRegisteredPhone = normalizePhone(regPhoneRaw)

            if (normalizedRegisteredPhone.isEmpty()) {
                return@withContext Result.failure(
                    Exception("MISSING_PHONE: This student does not have a registered mobile number. Please contact the Madrasa office.")
                )
            }

            if (inputPhoneNormalized.isEmpty()) {
                return@withContext Result.failure(
                    Exception("Please enter the registered mobile number.")
                )
            }

            // Match phone (exact, endsWith 10 digits or 4 digits)
            val phoneMatches = normalizedRegisteredPhone == inputPhoneNormalized ||
                    (normalizedRegisteredPhone.length >= 10 && inputPhoneNormalized.length >= 10 &&
                            normalizedRegisteredPhone.takeLast(10) == inputPhoneNormalized.takeLast(10)) ||
                    normalizedRegisteredPhone.endsWith(inputPhoneNormalized) ||
                    inputPhoneNormalized.endsWith(normalizedRegisteredPhone)

            if (!phoneMatches) {
                return@withContext Result.failure(
                    Exception("Incorrect registered mobile number. Please check and try again.")
                )
            }

            val adm = (targetDoc.getString("adm") ?: targetDoc.getString("admNo") ?: targetDoc.id).trim()
            val father = targetDoc.getString("fatherName") ?: targetDoc.getString("father") ?: targetDoc.getString("guardian") ?: targetDoc.getString("guardianName") ?: ""
            val mother = targetDoc.getString("motherName") ?: targetDoc.getString("mother") ?: ""

            val profile = StudentProfile(
                id = targetDoc.id,
                admNo = adm,
                uid = targetDoc.getString("uid") ?: "STD-$adm",
                name = targetDoc.getString("name") ?: "Student",
                studentClass = targetDoc.getString("class") ?: targetDoc.getString("studentClass") ?: studentClass,
                rollNo = targetDoc.getString("rollNo") ?: targetDoc.getString("roll") ?: "",
                guardianName = father,
                phone = regPhoneRaw,
                gender = targetDoc.getString("gender") ?: "Male",
                dob = targetDoc.getString("dob") ?: targetDoc.getString("birthDate") ?: "",
                address = targetDoc.getString("address") ?: targetDoc.getString("place") ?: "",
                status = targetDoc.getString("status") ?: "ACTIVE",
                photoUrl = targetDoc.getString("photo") ?: targetDoc.getString("photoUrl") ?: "",
                pendingDues = targetDoc.getDouble("pendingDue") ?: targetDoc.getDouble("balance") ?: 0.0,
                fatherName = father,
                fatherPhone = targetDoc.getString("fatherMobile") ?: targetDoc.getString("fatherPhone") ?: regPhoneRaw,
                motherName = mother,
                motherPhone = targetDoc.getString("motherMobile") ?: targetDoc.getString("motherPhone") ?: "",
                academicYear = targetDoc.getString("academicYear") ?: "2025-2026",
                concessionGroup = targetDoc.getString("concessionGroup") ?: targetDoc.getString("concessionFee") ?: ""
            )

            saveAccount(SavedStudentAccount(
                studentId = profile.id,
                name = profile.name,
                admNo = profile.admNo,
                studentClass = profile.studentClass
            ))

            Result.success(profile)
        } catch (e: Exception) {
            Log.e(TAG, "authenticateStudent failure", e)
            Result.failure(e)
        }
    }

    suspend fun getStudentProfile(studentId: String): StudentProfile? = withContext(Dispatchers.IO) {
        try {
            val doc = firestore.collection("$BASE_PATH/students").document(studentId).get().await()
            if (!doc.exists()) return@withContext null

            val adm = (doc.getString("adm") ?: doc.getString("admNo") ?: doc.id).trim()
            val father = doc.getString("fatherName") ?: doc.getString("father") ?: doc.getString("guardian") ?: doc.getString("guardianName") ?: ""
            val mother = doc.getString("motherName") ?: doc.getString("mother") ?: ""
            val phone = doc.getString("mobile") ?: doc.getString("phone") ?: doc.getString("fatherPhone") ?: ""

            StudentProfile(
                id = doc.id,
                admNo = adm,
                uid = doc.getString("uid") ?: "STD-$adm",
                name = doc.getString("name") ?: "Student",
                studentClass = doc.getString("class") ?: doc.getString("studentClass") ?: "",
                rollNo = doc.getString("rollNo") ?: doc.getString("roll") ?: "",
                guardianName = father,
                phone = phone,
                gender = doc.getString("gender") ?: "Male",
                dob = doc.getString("dob") ?: doc.getString("birthDate") ?: "",
                address = doc.getString("address") ?: doc.getString("place") ?: "",
                status = doc.getString("status") ?: "ACTIVE",
                photoUrl = doc.getString("photo") ?: doc.getString("photoUrl") ?: "",
                pendingDues = doc.getDouble("pendingDue") ?: doc.getDouble("balance") ?: 0.0,
                fatherName = father,
                fatherPhone = doc.getString("fatherMobile") ?: doc.getString("fatherPhone") ?: phone,
                motherName = mother,
                motherPhone = doc.getString("motherMobile") ?: doc.getString("motherPhone") ?: "",
                academicYear = doc.getString("academicYear") ?: "2025-2026",
                concessionGroup = doc.getString("concessionGroup") ?: doc.getString("concessionFee") ?: ""
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching student profile", e)
            null
        }
    }

    suspend fun searchStudents(query: String, filterClass: String = "All Classes"): List<StudentProfile> = withContext(Dispatchers.IO) {
        try {
            val cleanQuery = query.trim().lowercase()
            val snap = firestore.collection("$BASE_PATH/students").get().await()
            val list = mutableListOf<StudentProfile>()

            for (doc in snap.documents) {
                val sClass = (doc.getString("class") ?: doc.getString("studentClass") ?: "").trim()
                val sAdm = (doc.getString("adm") ?: doc.getString("admNo") ?: doc.id).trim()
                val sName = (doc.getString("name") ?: "").trim()
                val sStatus = (doc.getString("status") ?: "ACTIVE").trim()

                if (filterClass != "All Classes" && filterClass.isNotEmpty() && !sClass.equals(filterClass, ignoreCase = true)) {
                    continue
                }

                if (cleanQuery.isEmpty() || sName.lowercase().contains(cleanQuery) || sAdm.lowercase().contains(cleanQuery)) {
                    val phone = doc.getString("mobile") ?: doc.getString("phone") ?: ""
                    list.add(
                        StudentProfile(
                            id = doc.id,
                            admNo = sAdm,
                            uid = doc.getString("uid") ?: "STD-$sAdm",
                            name = sName.ifEmpty { "Student" },
                            studentClass = sClass,
                            rollNo = doc.getString("rollNo") ?: doc.getString("roll") ?: "",
                            guardianName = doc.getString("guardian") ?: doc.getString("fatherName") ?: "",
                            phone = phone,
                            gender = doc.getString("gender") ?: "Male",
                            dob = doc.getString("dob") ?: "",
                            address = doc.getString("address") ?: doc.getString("place") ?: "",
                            status = sStatus,
                            photoUrl = doc.getString("photo") ?: doc.getString("photoUrl") ?: "",
                            pendingDues = doc.getDouble("pendingDue") ?: doc.getDouble("balance") ?: 0.0
                        )
                    )
                }
            }

            list.sortedBy { it.name }
        } catch (e: Exception) {
            Log.e(TAG, "Search students exception", e)
            emptyList()
        }
    }

    suspend fun recordFeePayment(payload: FeePaymentPayload): Result<PaymentReceipt> = withContext(Dispatchers.IO) {
        if (!isOnline()) {
            return@withContext Result.failure(Exception("Active internet connection required for real-time fee receipt validation."))
        }

        try {
            val dateStr = SimpleDateFormat("dd-MMM-yyyy HH:mm", Locale.getDefault()).format(Date())
            val dateDay = SimpleDateFormat("dd-MMM-yyyy", Locale.getDefault()).format(Date())
            val receiptNo = "REC-${SimpleDateFormat("yyyyMMdd").format(Date())}-${(1000..9999).random()}"

            val paymentMap = hashMapOf(
                "receiptNo" to receiptNo,
                "studentId" to payload.studentId,
                "admNo" to payload.admNo,
                "studentName" to payload.studentName,
                "studentClass" to payload.studentClass,
                "amount" to payload.amount,
                "feeCategory" to payload.feeCategory,
                "title" to payload.feeCategory,
                "paymentMode" to payload.paymentMode,
                "mode" to payload.paymentMode,
                "remarks" to payload.remarks,
                "collectorName" to payload.collectorName,
                "date" to dateDay,
                "dateTime" to dateStr,
                "timestamp" to System.currentTimeMillis()
            )

            firestore.collection("$BASE_PATH/payments").add(paymentMap).await()

            try {
                val studentRef = firestore.collection("$BASE_PATH/students").document(payload.studentId)
                val currentSnap = studentRef.get().await()
                if (currentSnap.exists()) {
                    val currentDue = currentSnap.getDouble("pendingDue") ?: currentSnap.getDouble("balance") ?: 0.0
                    val updatedDue = (currentDue - payload.amount).coerceAtLeast(0.0)
                    studentRef.update("pendingDue", updatedDue, "balance", updatedDue).await()
                }
            } catch (e: Exception) {
                Log.w(TAG, "Balance update notice", e)
            }

            val receipt = PaymentReceipt(
                receiptNo = receiptNo,
                date = dateStr,
                studentId = payload.studentId,
                admNo = payload.admNo,
                studentName = payload.studentName,
                studentClass = payload.studentClass,
                amount = payload.amount,
                feeCategory = payload.feeCategory,
                paymentMode = payload.paymentMode,
                collectorName = payload.collectorName
            )
            Result.success(receipt)
        } catch (e: Exception) {
            Log.e(TAG, "recordFeePayment failed", e)
            Result.failure(e)
        }
    }

    suspend fun getStudentPayments(studentId: String): List<PaymentRecord> = withContext(Dispatchers.IO) {
        try {
            val snap = firestore.collection("$BASE_PATH/payments")
                .whereEqualTo("studentId", studentId)
                .orderBy("timestamp", Query.Direction.DESCENDING)
                .limit(25)
                .get()
                .await()

            snap.documents.map { doc ->
                PaymentRecord(
                    id = doc.id,
                    receiptNo = doc.getString("receiptNo") ?: "REC-${doc.id.take(6).uppercase()}",
                    date = doc.getString("date") ?: doc.getString("dateTime") ?: "",
                    amount = doc.getDouble("amount") ?: 0.0,
                    paymentMode = doc.getString("paymentMode") ?: doc.getString("mode") ?: "CASH",
                    title = doc.getString("title") ?: doc.getString("feeCategory") ?: "Fee Payment",
                    collectorName = doc.getString("collectorName") ?: "Madrasa Desk",
                    academicYear = doc.getString("academicYear") ?: ""
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error fetching payments for student $studentId", e)
            emptyList()
        }
    }

    suspend fun getStudentFeeLedger(studentId: String): List<FeeItem> = withContext(Dispatchers.IO) {
        try {
            val payments = getStudentPayments(studentId)
            val studentDoc = firestore.collection("$BASE_PATH/students").document(studentId).get().await()
            val pendingDues = studentDoc.getDouble("pendingDue") ?: studentDoc.getDouble("balance") ?: 0.0
            val academicYear = studentDoc.getString("academicYear") ?: "2025-2026"

            val ledger = mutableListOf<FeeItem>()

            // Add verified paid items from Firestore payments
            for (p in payments) {
                ledger.add(
                    FeeItem(
                        key = p.id,
                        title = p.title,
                        amount = p.amount,
                        isPaid = true,
                        category = "Paid Fee",
                        academicYear = p.academicYear.ifEmpty { academicYear },
                        paidDate = p.date,
                        receiptNo = p.receiptNo
                    )
                )
            }

            // If there are outstanding dues, show pending balance item
            if (pendingDues > 0) {
                ledger.add(
                    0,
                    FeeItem(
                        key = "pending_dues",
                        title = "Current Outstanding Dues",
                        amount = pendingDues,
                        isPaid = false,
                        category = "Tuition / Examination",
                        academicYear = academicYear,
                        dueDate = "Payable at Office"
                    )
                )
            }

            ledger
        } catch (e: Exception) {
            Log.e(TAG, "Error building fee ledger", e)
            emptyList()
        }
    }

    /**
     * Fetch real Exam Report with full subject breakdown, grades, and percentage from Firestore.
     * Mirrors student-page.js /examResults logic.
     */
    suspend fun getStudentExamReport(studentId: String): ExamReport? = withContext(Dispatchers.IO) {
        try {
            val snap = firestore.collection("$BASE_PATH/examResults")
                .whereEqualTo("studentId", studentId)
                .get()
                .await()

            if (snap.isEmpty) {
                return@withContext null
            }

            // Pick the latest published exam result
            val publishedDocs = snap.documents.filter { it.getBoolean("published") != false }
            if (publishedDocs.isEmpty()) return@withContext null

            val targetDoc = publishedDocs.first()

            val examKey = targetDoc.getString("examKey") ?: ""
            val examTitle = targetDoc.getString("examLabel") ?: targetDoc.getString("title") ?: "Annual Examination"
            val academicYear = targetDoc.getString("academicYear") ?: ""
            val classLabel = targetDoc.getString("classLabel") ?: ""

            // Subject marks & grades map
            val marksMap = targetDoc.get("marks") as? Map<*, *> ?: emptyMap<Any, Any>()
            val gradesMap = targetDoc.get("grades") as? Map<*, *> ?: emptyMap<Any, Any>()
            val totalsMap = targetDoc.get("totals") as? Map<*, *> ?: emptyMap<Any, Any>()

            val subjectsList = mutableListOf<ExamResultItem>()
            var calculatedObtained = 0.0
            var calculatedMax = 0.0

            val allSubjectKeys = (marksMap.keys + gradesMap.keys).mapNotNull { it?.toString() }.distinct()

            for (subjKey in allSubjectKeys) {
                val markObj = marksMap[subjKey]
                val gradeObj = gradesMap[subjKey]?.toString() ?: ""

                val (score, maxScore, status) = when (markObj) {
                    is Number -> Triple(markObj.toDouble(), 100.0, "PASS")
                    is Map<*, *> -> {
                        val m = (markObj["mark"] ?: markObj["marks"] ?: markObj["score"]) as? Number
                        val max = (markObj["maxMarks"] ?: markObj["maxScore"] ?: 100.0) as? Number
                        val st = markObj["status"]?.toString() ?: "PASS"
                        Triple(m?.toDouble() ?: 0.0, max?.toDouble() ?: 100.0, st)
                    }
                    else -> Triple(0.0, 100.0, "PASS")
                }

                calculatedObtained += score
                calculatedMax += maxScore

                val resolvedGrade = if (gradeObj.isNotEmpty()) {
                    gradeObj
                } else {
                    val pct = if (maxScore > 0) (score / maxScore) * 100 else 0.0
                    when {
                        pct >= 90 -> "A+"
                        pct >= 80 -> "A"
                        pct >= 70 -> "B+"
                        pct >= 60 -> "B"
                        pct >= 50 -> "C+"
                        pct >= 40 -> "C"
                        else -> "F"
                    }
                }

                subjectsList.add(
                    ExamResultItem(
                        subject = formatSubjectName(subjKey),
                        marks = score,
                        maxMarks = maxScore,
                        grade = resolvedGrade,
                        status = status
                    )
                )
            }

            val finalObtained = (totalsMap["obtained"] as? Number)?.toDouble() ?: calculatedObtained
            val finalMax = (totalsMap["max"] as? Number)?.toDouble() ?: if (calculatedMax > 0) calculatedMax else 400.0
            val percentage = if (finalMax > 0) (finalObtained / finalMax) * 100.0 else 0.0
            val passStatus = totalsMap["passStatus"]?.toString() ?: if (percentage >= 40) "PASSED" else "NEEDS IMPROVEMENT"
            val gpa = totalsMap["gpa"]?.toString() ?: String.format(Locale.US, "%.1f", (percentage / 100.0) * 4.0)

            ExamReport(
                id = targetDoc.id,
                examKey = examKey,
                examTitle = examTitle,
                academicYear = academicYear,
                classLabel = classLabel,
                totalMarks = finalObtained,
                maxTotal = finalMax,
                percentage = percentage,
                gpa = gpa,
                status = passStatus,
                subjects = subjectsList,
                published = true
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching exam report for student $studentId", e)
            null
        }
    }

    private fun formatSubjectName(key: String): String {
        return key.replace("_", " ")
            .split(" ")
            .joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
    }

    suspend fun getAdminOverview(): AdminOverview = withContext(Dispatchers.IO) {
        val stats = getInstitutionStats()
        var todayTotal = 0.0
        var todayCount = 0
        val recentPayments = mutableListOf<PaymentRecord>()

        try {
            val snap = firestore.collection("$BASE_PATH/payments")
                .orderBy("timestamp", Query.Direction.DESCENDING)
                .limit(20)
                .get()
                .await()

            val todayDay = SimpleDateFormat("dd-MMM-yyyy", Locale.getDefault()).format(Date())

            for (doc in snap.documents) {
                val amt = doc.getDouble("amount") ?: 0.0
                val date = doc.getString("date") ?: ""
                if (date == todayDay) {
                    todayTotal += amt
                    todayCount++
                }

                if (recentPayments.size < 10) {
                    recentPayments.add(
                        PaymentRecord(
                            id = doc.id,
                            receiptNo = doc.getString("receiptNo") ?: "REC-${doc.id.take(6).uppercase()}",
                            date = doc.getString("date") ?: todayDay,
                            amount = amt,
                            paymentMode = doc.getString("paymentMode") ?: doc.getString("mode") ?: "CASH",
                            title = doc.getString("title") ?: doc.getString("feeCategory") ?: "Fee Payment"
                        )
                    )
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Admin overview fetch notice", e)
        }

        AdminOverview(
            stats = stats,
            todayCollectionTotal = todayTotal,
            todayReceiptsCount = todayCount,
            recentPayments = recentPayments
        )
    }

    fun generateReceiptPdf(receipt: PaymentReceipt): File? {
        return try {
            val pdfDoc = PdfDocument()
            val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create()
            val page = pdfDoc.startPage(pageInfo)
            val canvas = page.canvas
            val paint = Paint()

            // Header Banner
            paint.color = Color.rgb(15, 23, 42)
            canvas.drawRect(0f, 0f, 595f, 110f, paint)

            paint.color = Color.WHITE
            paint.textSize = 18f
            paint.isFakeBoldText = true
            paint.textAlign = Paint.Align.CENTER
            canvas.drawText("NOORUL ISLAM HIGHER SECONDARY MADRASA", 297.5f, 50f, paint)

            paint.textSize = 11f
            paint.isFakeBoldText = false
            paint.color = Color.rgb(147, 197, 253)
            canvas.drawText("KODUVALLY, KOZHIKODE • REG NO: 4883", 297.5f, 75f, paint)

            paint.textSize = 12f
            paint.color = Color.WHITE
            paint.isFakeBoldText = true
            canvas.drawText("OFFICIAL FEE PAYMENT RECEIPT", 297.5f, 95f, paint)

            // Receipt Box
            val boxPaint = Paint()
            boxPaint.color = Color.rgb(241, 245, 249)
            boxPaint.style = Paint.Style.FILL
            canvas.drawRoundRect(40f, 130f, 555f, 210f, 12f, 12f, boxPaint)

            paint.textAlign = Paint.Align.LEFT
            paint.color = Color.rgb(71, 85, 105)
            paint.textSize = 11f
            paint.isFakeBoldText = false
            canvas.drawText("Receipt No:", 60f, 160f, paint)
            canvas.drawText("Date & Time:", 60f, 185f, paint)

            paint.color = Color.rgb(15, 23, 42)
            paint.isFakeBoldText = true
            paint.textSize = 12f
            canvas.drawText(receipt.receiptNo, 160f, 160f, paint)
            canvas.drawText(receipt.date, 160f, 185f, paint)

            paint.color = Color.rgb(71, 85, 105)
            paint.isFakeBoldText = false
            paint.textSize = 11f
            canvas.drawText("Payment Mode:", 340f, 160f, paint)
            canvas.drawText("Cashier / Desk:", 340f, 185f, paint)

            paint.color = Color.rgb(15, 23, 42)
            paint.isFakeBoldText = true
            paint.textSize = 12f
            canvas.drawText(receipt.paymentMode, 440f, 160f, paint)
            canvas.drawText(receipt.collectorName, 440f, 185f, paint)

            // Student Information Section
            paint.color = Color.rgb(30, 41, 59)
            paint.textSize = 14f
            paint.isFakeBoldText = true
            canvas.drawText("Student Particulars", 40f, 240f, paint)

            paint.color = Color.rgb(203, 213, 225)
            paint.strokeWidth = 1f
            canvas.drawLine(40f, 250f, 555f, 250f, paint)

            var y = 275f
            val labelX = 60f
            val valX = 220f

            fun drawRow(label: String, value: String) {
                paint.color = Color.rgb(100, 116, 139)
                paint.textSize = 12f
                paint.isFakeBoldText = false
                canvas.drawText(label, labelX, y, paint)

                paint.color = Color.rgb(15, 23, 42)
                paint.textSize = 12f
                paint.isFakeBoldText = true
                canvas.drawText(value, valX, y, paint)
                y += 26f
            }

            drawRow("Student Name", receipt.studentName)
            drawRow("Admission Number", receipt.admNo)
            drawRow("Current Class", receipt.studentClass)
            drawRow("Fee Classification", receipt.feeCategory)

            // Amount Box
            y += 15f
            val amtPaint = Paint()
            amtPaint.color = Color.rgb(238, 242, 255)
            canvas.drawRoundRect(40f, y, 555f, y + 70f, 12f, 12f, amtPaint)

            paint.color = Color.rgb(67, 56, 202)
            paint.textSize = 14f
            paint.isFakeBoldText = true
            canvas.drawText("Total Amount Paid", 60f, y + 42f, paint)

            paint.textSize = 22f
            paint.textAlign = Paint.Align.RIGHT
            paint.color = Color.rgb(30, 27, 75)
            canvas.drawText("₹ ${String.format(Locale.US, "%.2f", receipt.amount)}", 535f, y + 44f, paint)

            // Footer
            y += 120f
            paint.textAlign = Paint.Align.CENTER
            paint.textSize = 10f
            paint.color = Color.rgb(148, 163, 184)
            paint.isFakeBoldText = false
            canvas.drawText("This is an electronically generated receipt verified by Noorul Islam Madrasa System.", 297.5f, y, paint)
            canvas.drawText("For inquiries contact the institutional office. Generated on ${receipt.date}", 297.5f, y + 16f, paint)

            pdfDoc.finishPage(page)

            val dir = File(context.cacheDir, "receipts")
            if (!dir.exists()) dir.mkdirs()
            val file = File(dir, "Receipt_${receipt.receiptNo}.pdf")
            val outputStream = FileOutputStream(file)
            pdfDoc.writeTo(outputStream)
            outputStream.flush()
            outputStream.close()
            pdfDoc.close()
            file
        } catch (e: Exception) {
            Log.e(TAG, "Error generating receipt PDF", e)
            null
        }
    }

    fun sharePdf(file: File) {
        try {
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, "Fee Payment Receipt - ${file.name}")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(Intent.createChooser(intent, "Share Receipt PDF").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } catch (e: Exception) {
            Log.e(TAG, "Error sharing PDF", e)
        }
    }

    fun shareReceiptPdf(file: File) {
        sharePdf(file)
    }

    fun getSavedPrinterWidth(): String {
        return prefs.getString("printer_paper_width", "WIDTH_58MM") ?: "WIDTH_58MM"
    }

    fun savePrinterWidth(width: String) {
        prefs.edit().putString("printer_paper_width", width).apply()
    }

    fun getSavedPrinterAddress(): String? {
        return prefs.getString("printer_bluetooth_address", null)
    }

    fun savePrinterAddress(address: String) {
        prefs.edit().putString("printer_bluetooth_address", address).apply()
    }

    fun getSavedAccounts(): List<SavedStudentAccount> {
        val raw = prefs.getString("saved_student_accounts", null) ?: return emptyList()
        return try {
            val array = JSONArray(raw)
            val list = mutableListOf<SavedStudentAccount>()
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                list.add(
                    SavedStudentAccount(
                        studentId = obj.getString("studentId"),
                        name = obj.getString("name"),
                        admNo = obj.getString("admNo"),
                        studentClass = obj.getString("studentClass")
                    )
                )
            }
            list
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun saveAccount(account: SavedStudentAccount) {
        try {
            val list = getSavedAccounts().toMutableList()
            list.removeAll { it.studentId == account.studentId }
            list.add(0, account)
            val array = JSONArray()
            for (acc in list.take(10)) {
                val obj = JSONObject().apply {
                    put("studentId", acc.studentId)
                    put("name", acc.name)
                    put("admNo", acc.admNo)
                    put("studentClass", acc.studentClass)
                }
                array.put(obj)
            }
            prefs.edit().putString("saved_student_accounts", array.toString()).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Error saving account", e)
        }
    }

    fun removeAccount(studentId: String) {
        val list = getSavedAccounts().filter { it.studentId != studentId }
        val array = JSONArray()
        for (acc in list) {
            val obj = JSONObject().apply {
                put("studentId", acc.studentId)
                put("name", acc.name)
                put("admNo", acc.admNo)
                put("studentClass", acc.studentClass)
            }
            array.put(obj)
        }
        prefs.edit().putString("saved_student_accounts", array.toString()).apply()
    }
}
