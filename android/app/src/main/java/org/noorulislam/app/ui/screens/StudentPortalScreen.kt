package org.noorulislam.app.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.noorulislam.app.data.*

import org.noorulislam.app.ui.theme.*

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
    var showAccountSwitcher by remember { mutableStateOf(false) }

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
                            text = "Student Dashboard",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = Slate900
                        )
                        Text(
                            text = student?.name ?: "Noorul Islam Madrasa",
                            fontSize = 12.sp,
                            color = Slate500,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Slate800)
                    }
                },
                actions = {
                    // Sibling Switcher Icon
                    if (savedAccounts.size > 1) {
                        IconButton(onClick = { showAccountSwitcher = true }) {
                            Icon(Icons.Default.SwitchAccount, contentDescription = "Switch Student", tint = Blue600)
                        }
                    }
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.Logout, contentDescription = "Logout", tint = Red600)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        },
        containerColor = Slate50
    ) { innerPadding ->
        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = Blue600)
            }
        } else {
            val profile = student ?: StudentProfile(name = "Student", admNo = "2024-0142")

            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // 1. ID BADGE CARD (1:1 with student.html ID Badge Card)
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Slate200),
                        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)
                    ) {
                        Column {
                            // Top Gradient Banner (.bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700)
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(
                                        Brush.horizontalGradient(
                                            listOf(Blue700, Blue600, Indigo700)
                                        )
                                    )
                                    .padding(vertical = 18.dp, horizontal = 16.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Surface(
                                        color = Color.White.copy(alpha = 0.2f),
                                        shape = RoundedCornerShape(50.dp)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Icon(Icons.Default.School, contentDescription = null, tint = Color.White, modifier = Modifier.size(13.dp))
                                            Text(
                                                text = "STUDENT PROFILE",
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.ExtraBold,
                                                color = Color.White,
                                                letterSpacing = 0.8.sp
                                            )
                                        }
                                    }

                                    Spacer(modifier = Modifier.height(6.dp))

                                    Text(
                                        text = "Noorul Islam Higher Secondary Madrasa",
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = Color.White,
                                        textAlign = TextAlign.Center
                                    )

                                    Text(
                                        text = "Excellence in Islamic Education • Estd. 1994",
                                        fontSize = 11.sp,
                                        color = Blue100,
                                        textAlign = TextAlign.Center
                                    )
                                }
                            }

                            // Avatar & Identity Headline Info
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(20.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                // Student Avatar
                                Surface(
                                    modifier = Modifier.size(86.dp),
                                    shape = CircleShape,
                                    color = Slate100,
                                    border = androidx.compose.foundation.BorderStroke(3.dp, Color.White),
                                    shadowElevation = 4.dp
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            imageVector = Icons.Default.Person,
                                            contentDescription = "Avatar",
                                            tint = Slate500,
                                            modifier = Modifier.size(46.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(10.dp))

                                Text(
                                    text = profile.name,
                                    fontSize = 20.sp,
                                    fontWeight = FontWeight.Black,
                                    color = Slate900,
                                    textAlign = TextAlign.Center
                                )

                                Spacer(modifier = Modifier.height(6.dp))

                                // Status Badges Row (Class, Active Status, Gender)
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    BadgeChip(label = profile.studentClass, icon = Icons.Default.School, bgColor = Blue100, textColor = Blue700)
                                    BadgeChip(label = profile.status, icon = Icons.Default.CheckCircle, bgColor = Emerald100, textColor = Emerald700)
                                    BadgeChip(label = profile.gender, icon = Icons.Default.Wc, bgColor = Slate100, textColor = Slate700)
                                }

                                Spacer(modifier = Modifier.height(8.dp))

                                // Adm No & UID
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "Adm No: ${profile.admNo}",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Slate600
                                    )
                                    Text(
                                        text = "Roll No: ${profile.rollNo}",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Slate600
                                    )
                                }

                                Spacer(modifier = Modifier.height(8.dp))

                                // Academic Year Pill
                                Surface(
                                    color = Indigo50,
                                    shape = RoundedCornerShape(8.dp),
                                    border = androidx.compose.foundation.BorderStroke(1.dp, Indigo600.copy(alpha = 0.2f))
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Icon(Icons.Default.DateRange, contentDescription = null, tint = Indigo600, modifier = Modifier.size(13.dp))
                                        Text(
                                            text = "Academic Year: ${profile.academicYear}",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Indigo700
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // 2. TAB CONTROLS (Profile, Fee Details, Results)
                item {
                    TabRow(
                        selectedTabIndex = selectedTab,
                        containerColor = Color.White,
                        contentColor = Blue600,
                        modifier = Modifier
                            .clip(RoundedCornerShape(14.dp))
                            .border(1.dp, Slate200, RoundedCornerShape(14.dp))
                    ) {
                        Tab(
                            selected = selectedTab == 0,
                            onClick = { selectedTab = 0 },
                            text = { Text("Profile", fontWeight = FontWeight.Bold, fontSize = 13.sp) },
                            icon = { Icon(Icons.Default.Badge, contentDescription = null, modifier = Modifier.size(18.dp)) }
                        )
                        Tab(
                            selected = selectedTab == 1,
                            onClick = { selectedTab = 1 },
                            text = { Text("Fee Details", fontWeight = FontWeight.Bold, fontSize = 13.sp) },
                            icon = { Icon(Icons.Default.ReceiptLong, contentDescription = null, modifier = Modifier.size(18.dp)) }
                        )
                        Tab(
                            selected = selectedTab == 2,
                            onClick = { selectedTab = 2 },
                            text = { Text("Results", fontWeight = FontWeight.Bold, fontSize = 13.sp) },
                            icon = { Icon(Icons.Default.Poll, contentDescription = null, modifier = Modifier.size(18.dp)) }
                        )
                    }
                }

                // TAB 0: PROFILE BIODATA
                if (selectedTab == 0) {
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Slate200)
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Text(
                                    text = "Guardian & Contact Information",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Slate900
                                )

                                BioInfoCard(label = "Father's Name", value = profile.fatherName, icon = Icons.Default.Male)
                                BioInfoCard(label = "Father's Mobile", value = profile.fatherPhone, icon = Icons.Default.Phone)
                                BioInfoCard(label = "Mother's Name", value = profile.motherName, icon = Icons.Default.Female)
                                BioInfoCard(label = "Mother's Mobile", value = profile.motherPhone, icon = Icons.Default.Phone)
                                BioInfoCard(label = "Permanent Address", value = profile.address, icon = Icons.Default.LocationOn)
                                BioInfoCard(label = "Fee Concession Tier", value = profile.concessionGroup, icon = Icons.Default.Groups)
                            }
                        }
                    }
                }

                // TAB 1: FEE DETAILS & LEDGER (1:1 with student.html #fees-page)
                if (selectedTab == 1) {
                    item {
                        // Outstanding Dues Banner
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = if (profile.pendingDues > 0) Amber50 else Emerald50),
                            border = androidx.compose.foundation.BorderStroke(1.dp, if (profile.pendingDues > 0) Amber500.copy(alpha = 0.4f) else Emerald500.copy(alpha = 0.4f))
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = "Current Outstanding Dues",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = if (profile.pendingDues > 0) Amber600 else Emerald700
                                    )
                                    Text(
                                        text = "₹${profile.pendingDues.toInt()}.00",
                                        fontSize = 24.sp,
                                        fontWeight = FontWeight.Black,
                                        color = Slate900
                                    )
                                }
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = if (profile.pendingDues > 0) Amber500 else Emerald600
                                ) {
                                    Text(
                                        text = if (profile.pendingDues > 0) "PAYMENT DUE" else "ALL PAID",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color.White,
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                                    )
                                }
                            }
                        }
                    }

                    item {
                        Text(
                            text = "Categorized Fee Schedule (${profile.academicYear})",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = Slate900
                        )
                    }

                    // Fee items list with Paid / Unpaid badges
                    items(feeLedger) { feeItem ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Slate200)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(14.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = feeItem.title,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Slate900
                                    )
                                    Text(
                                        text = "Category: ${feeItem.category} • Due: ${feeItem.dueDate}",
                                        fontSize = 11.sp,
                                        color = Slate500
                                    )
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text(
                                        text = "₹${feeItem.amount.toInt()}",
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.Black,
                                        color = Slate900
                                    )
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = if (feeItem.isPaid) Emerald100 else Red100
                                    ) {
                                        Text(
                                            text = if (feeItem.isPaid) "PAID" else "PENDING",
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            color = if (feeItem.isPaid) Emerald700 else Red700,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Payment Receipts with PDF Export
                    item {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Official Payment Receipts (PDF)",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = Slate900
                        )
                    }

                    items(payments) { payment ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = Slate50),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Slate200)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(14.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = payment.receiptNo,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Slate900
                                    )
                                    Text(
                                        text = "${payment.title} • ${payment.date}",
                                        fontSize = 11.sp,
                                        color = Slate500
                                    )
                                    Text(
                                        text = "₹${payment.amount.toInt()} (${payment.paymentMode})",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Emerald600,
                                        modifier = Modifier.padding(top = 2.dp)
                                    )
                                }
                                Button(
                                    onClick = {
                                        val receipt = PaymentReceipt(
                                            receiptNo = payment.receiptNo,
                                            date = payment.date,
                                            studentId = profile.id,
                                            admNo = profile.admNo,
                                            studentName = profile.name,
                                            studentClass = profile.studentClass,
                                            amount = payment.amount,
                                            feeCategory = payment.title,
                                            paymentMode = payment.paymentMode,
                                            collectorName = payment.collectorName
                                        )
                                        val file = repository.generateReceiptPdf(receipt)
                                        if (file != null) {
                                            repository.shareReceiptPdf(file)
                                        } else {
                                            Toast.makeText(context, "Could not generate receipt PDF", Toast.LENGTH_SHORT).show()
                                        }
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = Blue600),
                                    shape = RoundedCornerShape(8.dp),
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                                ) {
                                    Icon(Icons.Default.PictureAsPdf, contentDescription = null, modifier = Modifier.size(14.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Share PDF", fontSize = 11.sp)
                                }
                            }
                        }
                    }
                }

                // TAB 2: EXAM RESULTS & GPA CARD (1:1 with student.html #results-page)
                if (selectedTab == 2) {
                    val report = examReport
                    if (report == null || report.subjects.isEmpty()) {
                        item {
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(16.dp),
                                colors = CardDefaults.cardColors(containerColor = Indigo50.copy(alpha = 0.5f)),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Indigo100)
                            ) {
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(28.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Poll,
                                        contentDescription = null,
                                        tint = Indigo600,
                                        modifier = Modifier.size(48.dp)
                                    )
                                    Spacer(modifier = Modifier.height(12.dp))
                                    Text(
                                        text = "Results will be published here",
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Slate900,
                                        textAlign = TextAlign.Center
                                    )
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        text = "Academic year examination results have not been published yet for this student. Once uploaded and verified, official score cards and grades will appear here.",
                                        fontSize = 12.sp,
                                        color = Slate600,
                                        textAlign = TextAlign.Center,
                                        lineHeight = 18.sp
                                    )
                                }
                            }
                        }
                    } else {
                        item {
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(16.dp),
                                colors = CardDefaults.cardColors(containerColor = Color.White),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Slate200)
                            ) {
                                Column(modifier = Modifier.padding(18.dp)) {
                                    Text(
                                        text = report.examTitle,
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.Black,
                                        color = Slate900
                                    )
                                    Text(
                                        text = "Academic Session: ${report.academicYear} • Class: ${profile.studentClass}",
                                        fontSize = 12.sp,
                                        color = Slate500
                                    )

                                    Spacer(modifier = Modifier.height(14.dp))

                                    // GPA & Aggregate Highlights
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        ResultHighlightBox(
                                            title = "PERCENTAGE",
                                            value = "${report.percentage.toInt()}%",
                                            color = Blue600,
                                            modifier = Modifier.weight(1f)
                                        )
                                        ResultHighlightBox(
                                            title = "GPA SCORE",
                                            value = if (report.gpa.isNotEmpty()) "${report.gpa} / 4.0" else "--",
                                            color = Indigo600,
                                            modifier = Modifier.weight(1f)
                                        )
                                        ResultHighlightBox(
                                            title = "STATUS",
                                            value = report.status,
                                            color = if (report.status.contains("PASS", ignoreCase = true)) Emerald600 else Amber600,
                                            modifier = Modifier.weight(1f)
                                        )
                                    }
                                }
                            }
                        }

                        item {
                            Text(
                                text = "Subject-wise Score Card",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = Slate900
                            )
                        }

                        // Subjects score breakdown table
                        items(report.subjects) { subject ->
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.cardColors(containerColor = Color.White),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Slate200)
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(14.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text(
                                            text = subject.subject,
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Slate900
                                        )
                                        Text(
                                            text = "Max Marks: ${subject.maxMarks.toInt()}",
                                            fontSize = 11.sp,
                                            color = Slate500
                                        )
                                    }
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Text(
                                            text = "${subject.marks.toInt()}",
                                            fontSize = 16.sp,
                                            fontWeight = FontWeight.Black,
                                            color = Slate900
                                        )
                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = if (subject.grade == "F") Red100 else Blue100
                                        ) {
                                            Text(
                                                text = subject.grade.ifEmpty { "PASS" },
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.ExtraBold,
                                                color = if (subject.grade == "F") Red700 else Blue700,
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
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

    // MULTI-CHILD SIBLING ACCOUNT SWITCHER DIALOG
    if (showAccountSwitcher) {
        AlertDialog(
            onDismissRequest = { showAccountSwitcher = false },
            title = {
                Text(
                    text = "Switch Student Profile",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    savedAccounts.forEach { acc ->
                        val isCurrent = acc.studentId == studentId
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (isCurrent) Blue50 else Color.Transparent)
                                .clickable {
                                    showAccountSwitcher = false
                                    onSwitchStudent(acc.studentId)
                                }
                                .padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text(acc.name, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                Text("${acc.studentClass} • Adm: ${acc.admNo}", fontSize = 11.sp, color = Slate500)
                            }
                            if (isCurrent) {
                                Icon(Icons.Default.Check, contentDescription = "Active", tint = Blue600)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = { showAccountSwitcher = false }) {
                    Text("Close")
                }
            }
        )
    }
}

@Composable
fun BadgeChip(label: String, icon: ImageVector, bgColor: Color, textColor: Color) {
    Surface(
        color = bgColor,
        shape = RoundedCornerShape(50.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(icon, contentDescription = null, tint = textColor, modifier = Modifier.size(11.dp))
            Text(label, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = textColor)
        }
    }
}

@Composable
fun BioInfoCard(label: String, value: String, icon: ImageVector) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = Slate50,
        border = androidx.compose.foundation.BorderStroke(1.dp, Slate200),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = Blue50,
                modifier = Modifier.size(36.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(icon, contentDescription = null, tint = Blue600, modifier = Modifier.size(18.dp))
                }
            }
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(label, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Slate500)
                Text(value.ifEmpty { "--" }, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Slate900)
            }
        }
    }
}

@Composable
fun ResultHighlightBox(title: String, value: String, color: Color, modifier: Modifier = Modifier) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = Slate50,
        border = androidx.compose.foundation.BorderStroke(1.dp, Slate200),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(title, fontSize = 9.sp, fontWeight = FontWeight.Black, color = Slate500)
            Spacer(modifier = Modifier.height(2.dp))
            Text(value, fontSize = 14.sp, fontWeight = FontWeight.Black, color = color)
        }
    }
}
