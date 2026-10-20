package org.noorulislam.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.noorulislam.app.data.*

private val Slate900 = Color(0xFF0F172A)
private val Slate800 = Color(0xFF1E293B)
private val Slate700 = Color(0xFF334155)
private val Slate100 = Color(0xFFF1F5F9)
private val Slate50 = Color(0xFFF8FAFC)
private val Blue600 = Color(0xFF2563EB)
private val Emerald600 = Color(0xFF059669)
private val Emerald50 = Color(0xFFECFDF5)
private val Red600 = Color(0xFFDC2626)
private val Red50 = Color(0xFFFEF2F2)
private val Amber600 = Color(0xFFD97706)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentPortalScreen(
    studentId: String,
    onNavigateBack: () -> Unit,
    onSwitchStudent: (String) -> Unit
) {
    val context = LocalContext.current
    val repository = remember { StudentRepository(context) }
    val scope = rememberCoroutineScope()

    var student by remember { mutableStateOf<StudentProfile?>(null) }
    var payments by remember { mutableStateOf<List<PaymentRecord>>(emptyList()) }
    var feeLedger by remember { mutableStateOf<List<FeeItem>>(emptyList()) }
    var examReport by remember { mutableStateOf<ExamReport?>(null) }
    var savedAccounts by remember { mutableStateOf<List<SavedStudentAccount>>(emptyList()) }
    var selectedTab by remember { mutableIntStateOf(0) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(studentId) {
        isLoading = true
        savedAccounts = repository.getSavedAccounts()
        student = repository.getStudentProfile(studentId)
        payments = repository.getStudentPayments(studentId)
        feeLedger = repository.getStudentFeeLedger(studentId)
        examReport = repository.getStudentExamReport(studentId)
        isLoading = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Student Portal",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Text(
                            text = student?.name ?: "Noorul Islam Madrasa",
                            fontSize = 12.sp,
                            color = Color.White.copy(alpha = 0.8f)
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Back",
                            tint = Color.White
                        )
                    }
                },
                actions = {
                    IconButton(onClick = {
                        scope.launch {
                            isLoading = true
                            student = repository.getStudentProfile(studentId)
                            payments = repository.getStudentPayments(studentId)
                            feeLedger = repository.getStudentFeeLedger(studentId)
                            examReport = repository.getStudentExamReport(studentId)
                            savedAccounts = repository.getSavedAccounts()
                            isLoading = false
                        }
                    }) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Refresh",
                            tint = Color.White
                        )
                    }
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.Default.Logout,
                            contentDescription = "Log Out",
                            tint = Color.White
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Slate900,
                    titleContentColor = Color.White
                )
            )
        },
        containerColor = Slate50
    ) { innerPadding ->
        if (isLoading && student == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = Blue600)
            }
        } else {
            val currentStudent = student ?: StudentProfile(
                id = studentId,
                admNo = "2024-0142",
                name = "Mohammed Irfan",
                studentClass = "Class 7",
                rollNo = "14",
                guardianName = "Abdul Salam",
                phone = "9847123456",
                gender = "Male",
                status = "ACTIVE",
                pendingDues = 450.0
            )

            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Multi-child switcher if family has more than 1 child registered
                if (savedAccounts.size > 1) {
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                text = "Family Profiles (Multi-Child)",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = Slate700
                            )
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(savedAccounts) { acc ->
                                    val isSelected = acc.studentId == currentStudent.id
                                    FilterChip(
                                        selected = isSelected,
                                        onClick = {
                                            if (!isSelected) onSwitchStudent(acc.studentId)
                                        },
                                        label = {
                                            Text(
                                                text = "${acc.name} (${acc.studentClass})",
                                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                            )
                                        },
                                        leadingIcon = {
                                            Icon(
                                                imageVector = Icons.Default.Person,
                                                contentDescription = null,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    )
                                }
                            }
                        }
                    }
                }

                // Student Identity Card
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(60.dp)
                                    .clip(CircleShape)
                                    .background(Blue600.copy(alpha = 0.12f))
                                    .border(1.5.dp, Blue600, CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = currentStudent.name.take(1).uppercase(),
                                    fontSize = 24.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Blue600
                                )
                            }

                            Spacer(modifier = Modifier.width(14.dp))

                            Column(modifier = Modifier.weight(1f)) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Text(
                                        text = currentStudent.name,
                                        fontSize = 17.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Slate900
                                    )
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(Emerald50)
                                            .border(1.dp, Emerald600.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = currentStudent.status,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Emerald600
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(2.dp))

                                Text(
                                    text = "Admission No: ${currentStudent.admNo} • Roll: ${currentStudent.rollNo}",
                                    fontSize = 12.sp,
                                    color = Slate700
                                )

                                Text(
                                    text = "Class: ${currentStudent.studentClass} • Guardian: ${currentStudent.guardianName}",
                                    fontSize = 12.sp,
                                    color = Slate700
                                )
                            }
                        }
                    }
                }

                // Outstanding Fee Balance Card
                item {
                    val pendingAmount = currentStudent.pendingDues
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = if (pendingAmount > 0) Red50 else Emerald50
                        ),
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            if (pendingAmount > 0) Red600.copy(alpha = 0.3f) else Emerald600.copy(alpha = 0.3f)
                        )
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = if (pendingAmount > 0) Icons.Default.ReceiptLong else Icons.Default.CheckCircle,
                                        contentDescription = null,
                                        tint = if (pendingAmount > 0) Red600 else Emerald600,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = if (pendingAmount > 0) "Outstanding Dues" else "Fee Clearance Status",
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (pendingAmount > 0) Red600 else Emerald600
                                    )
                                }
                                Text(
                                    text = "Academic Year 2025-26",
                                    fontSize = 11.sp,
                                    color = Slate700
                                )
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            Text(
                                text = "INR ${String.format("%.2f", pendingAmount)}",
                                fontSize = 26.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = if (pendingAmount > 0) Red600 else Emerald600
                            )

                            Text(
                                text = if (pendingAmount > 0)
                                    "Pending: Monthly Tuition (April) + Exam Fee"
                                else
                                    "All academic fee dues are fully cleared.",
                                fontSize = 12.sp,
                                color = Slate700
                            )
                        }
                    }
                }

                // Tab Switcher
                item {
                    TabRow(
                        selectedTabIndex = selectedTab,
                        containerColor = Color.White,
                        contentColor = Blue600,
                        modifier = Modifier.clip(RoundedCornerShape(12.dp))
                    ) {
                        Tab(
                            selected = selectedTab == 0,
                            onClick = { selectedTab = 0 },
                            text = { Text("Overview", fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                        )
                        Tab(
                            selected = selectedTab == 1,
                            onClick = { selectedTab = 1 },
                            text = { Text("Fee Ledger", fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                        )
                        Tab(
                            selected = selectedTab == 2,
                            onClick = { selectedTab = 2 },
                            text = { Text("Exam Results", fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                        )
                    }
                }

                // TAB 0: OVERVIEW
                if (selectedTab == 0) {
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(
                                    text = "Bio & Guardian Information",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Slate900
                                )
                                Spacer(modifier = Modifier.height(10.dp))
                                DetailRow("Guardian / Father", currentStudent.guardianName)
                                DetailRow("Contact Phone", currentStudent.phone)
                                DetailRow("Date of Birth", currentStudent.dob)
                                DetailRow("Gender", currentStudent.gender)
                                DetailRow("Residential Address", currentStudent.address)
                                DetailRow("Madrasa Timing", "7:00 AM – 9:00 AM")
                                DetailRow("Enrolled Academic Year", "2025 – 2026")
                            }
                        }
                    }
                }

                // TAB 1: FEE LEDGER & RECEIPTS
                if (selectedTab == 1) {
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(
                                    text = "Class Fee Schedule",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Slate900
                                )
                                Spacer(modifier = Modifier.height(8.dp))

                                feeLedger.forEach { fee ->
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 6.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column {
                                            Text(
                                                text = fee.title,
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.Medium,
                                                color = Slate900
                                            )
                                            Text(
                                                text = if (fee.isPaid) "Status: Paid" else "Status: Pending",
                                                fontSize = 11.sp,
                                                color = if (fee.isPaid) Emerald600 else Red600
                                            )
                                        }
                                        Text(
                                            text = "INR ${String.format("%.2f", fee.amount)}",
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Slate900
                                        )
                                    }
                                    Divider(color = Slate100)
                                }
                            }
                        }
                    }

                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(
                                    text = "Payment Receipts & History",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Slate900
                                )
                                Spacer(modifier = Modifier.height(8.dp))

                                payments.forEach { p ->
                                    ListItem(
                                        headlineContent = {
                                            Text(
                                                text = p.title,
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.SemiBold
                                            )
                                        },
                                        supportingContent = {
                                            Text(
                                                text = "Receipt: ${p.receiptNo} • Date: ${p.date} • Mode: ${p.paymentMode}",
                                                fontSize = 11.sp,
                                                color = Slate700
                                            )
                                        },
                                        trailingContent = {
                                            Text(
                                                text = "INR ${String.format("%.2f", p.amount)}",
                                                fontSize = 14.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Emerald600
                                            )
                                        }
                                    )
                                    Divider(color = Slate100)
                                }
                            }
                        }
                    }
                }

                // TAB 2: EXAM RESULTS
                if (selectedTab == 2) {
                    val report = examReport
                    if (report != null) {
                        item {
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(14.dp),
                                colors = CardDefaults.cardColors(containerColor = Color.White)
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column {
                                            Text(
                                                text = report.examTitle,
                                                fontSize = 15.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Slate900
                                            )
                                            Text(
                                                text = "Overall GPA: ${report.gpa} • Percentage: ${report.percentage}%",
                                                fontSize = 12.sp,
                                                color = Slate700
                                            )
                                        }
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(Emerald50)
                                                .border(1.dp, Emerald600.copy(alpha = 0.5f), RoundedCornerShape(6.dp))
                                                .padding(horizontal = 10.dp, vertical = 4.dp)
                                        ) {
                                            Text(
                                                text = report.status,
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Emerald600
                                            )
                                        }
                                    }

                                    Spacer(modifier = Modifier.height(14.dp))

                                    // Subject mark table
                                    report.subjects.forEach { subject ->
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(vertical = 6.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(
                                                text = subject.subject,
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.Medium,
                                                color = Slate900
                                            )
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Text(
                                                    text = "${subject.marks.toInt()} / ${subject.maxMarks.toInt()}",
                                                    fontSize = 13.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = Slate900
                                                )
                                                Spacer(modifier = Modifier.width(8.dp))
                                                Box(
                                                    modifier = Modifier
                                                        .clip(RoundedCornerShape(4.dp))
                                                        .background(Blue600.copy(alpha = 0.1f))
                                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                                ) {
                                                    Text(
                                                        text = subject.grade,
                                                        fontSize = 11.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = Blue600
                                                    )
                                                }
                                            }
                                        }
                                        Divider(color = Slate100)
                                    }

                                    Spacer(modifier = Modifier.height(10.dp))

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(
                                            text = "Total Aggregate Marks",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.sp,
                                            color = Slate900
                                        )
                                        Text(
                                            text = "${report.totalMarks.toInt()} / ${report.maxTotal.toInt()}",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 14.sp,
                                            color = Blue600
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            fontSize = 12.sp,
            color = Slate700
        )
        Text(
            text = value,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Slate900,
            textAlign = TextAlign.End,
            modifier = Modifier.padding(start = 16.dp)
        )
    }
}
