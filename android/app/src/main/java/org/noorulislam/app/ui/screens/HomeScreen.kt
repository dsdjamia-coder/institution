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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.noorulislam.app.data.InstitutionStats
import org.noorulislam.app.data.SavedStudentAccount
import org.noorulislam.app.data.StudentRepository

// Colors aligning with the official Noorul Islam system
private val Slate900 = Color(0xFF0F172A)
private val Slate800 = Color(0xFF1E293B)
private val Slate700 = Color(0xFF334155)
private val Slate100 = Color(0xFFF1F5F9)
private val Slate50 = Color(0xFFF8FAFC)
private val Blue600 = Color(0xFF2563EB)
private val Blue700 = Color(0xFF1D4ED8)
private val Emerald600 = Color(0xFF059669)
private val Emerald50 = Color(0xFFECFDF5)
private val Amber600 = Color(0xFFD97706)
private val Amber50 = Color(0xFFFFFBEB)
private val Teal600 = Color(0xFF0D9488)
private val Teal50 = Color(0xFFF0FDFA)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onNavigateToStudent: (String) -> Unit
) {
    val context = LocalContext.current
    val repository = remember { StudentRepository(context) }
    val scope = rememberCoroutineScope()

    var stats by remember { mutableStateOf(InstitutionStats(480, 24, 252, 228)) }
    var savedAccounts by remember { mutableStateOf<List<SavedStudentAccount>>(emptyList()) }
    var showLoginSheet by remember { mutableStateOf(false) }

    // Initial load of live stats & local multi-child accounts
    LaunchedEffect(Unit) {
        savedAccounts = repository.getSavedAccounts()
        try {
            stats = repository.getInstitutionStats()
        } catch (e: Exception) {
            // Graceful fallback to default stats
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "NOORUL ISLAM MADRASA",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Text(
                            text = "Reg No: 4883 • Estd. 1994",
                            fontSize = 11.sp,
                            color = Color.White.copy(alpha = 0.75f)
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Slate900,
                    titleContentColor = Color.White
                ),
                actions = {
                    IconButton(onClick = {
                        scope.launch {
                            stats = repository.getInstitutionStats()
                            savedAccounts = repository.getSavedAccounts()
                        }
                    }) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Refresh Data",
                            tint = Color.White
                        )
                    }
                }
            )
        },
        containerColor = Slate50
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Hero Institutional Banner
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Slate900),
                    elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box(
                            modifier = Modifier
                                .size(56.dp)
                                .clip(CircleShape)
                                .background(Blue600.copy(alpha = 0.2f))
                                .border(1.dp, Blue600.copy(alpha = 0.5f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.School,
                                contentDescription = "Institution Seal",
                                tint = Color.White,
                                modifier = Modifier.size(32.dp)
                            )
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        Text(
                            text = "Higher Secondary Madrasa",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color.White,
                            textAlign = TextAlign.Center
                        )

                        Text(
                            text = "Excellence in Islamic & Moral Education",
                            fontSize = 13.sp,
                            color = Slate100.copy(alpha = 0.8f),
                            textAlign = TextAlign.Center
                        )

                        Spacer(modifier = Modifier.height(18.dp))

                        Button(
                            onClick = { showLoginSheet = true },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Blue600)
                        ) {
                            Icon(
                                imageVector = Icons.Default.LockOpen,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Student Portal Login",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            // Saved Accounts / Quick Multi-Child Switcher
            if (savedAccounts.isNotEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Saved Student Profiles",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = Slate800
                            )
                            Text(
                                text = "Tap to open",
                                fontSize = 12.sp,
                                color = Blue600
                            )
                        }

                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            items(savedAccounts) { account ->
                                Card(
                                    modifier = Modifier
                                        .clickable { onNavigateToStudent(account.studentId) }
                                        .width(220.dp),
                                    shape = RoundedCornerShape(12.dp),
                                    colors = CardDefaults.cardColors(containerColor = Color.White),
                                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(40.dp)
                                                .clip(CircleShape)
                                                .background(Blue600.copy(alpha = 0.1f)),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Person,
                                                contentDescription = null,
                                                tint = Blue600,
                                                modifier = Modifier.size(22.dp)
                                            )
                                        }

                                        Spacer(modifier = Modifier.width(10.dp))

                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = account.name,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.sp,
                                                color = Slate900,
                                                maxLines = 1
                                            )
                                            Text(
                                                text = "${account.studentClass} • Adm: ${account.admNo}",
                                                fontSize = 11.sp,
                                                color = Slate700,
                                                maxLines = 1
                                            )
                                        }

                                        IconButton(
                                            onClick = {
                                                repository.removeAccount(account.studentId)
                                                savedAccounts = repository.getSavedAccounts()
                                            },
                                            modifier = Modifier.size(24.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Close,
                                                contentDescription = "Remove",
                                                tint = Color.Gray,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Real-Time Statistics Counters
            item {
                Text(
                    text = "Institution Live Overview",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = Slate900
                )
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    StatCard(
                        title = "Active Students",
                        count = stats.totalStudents.toString(),
                        subtitle = "Class 1 to 10",
                        icon = Icons.Default.Groups,
                        color = Blue600,
                        backgroundColor = Color(0xFFEFF6FF),
                        modifier = Modifier.weight(1f)
                    )
                    StatCard(
                        title = "Staff & Teachers",
                        count = stats.totalStaff.toString(),
                        subtitle = "Certified Faculty",
                        icon = Icons.Default.PersonSearch,
                        color = Amber600,
                        backgroundColor = Amber50,
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    StatCard(
                        title = "Male Students",
                        count = stats.maleStudents.toString(),
                        subtitle = "Boys Division",
                        icon = Icons.Default.Male,
                        color = Emerald600,
                        backgroundColor = Emerald50,
                        modifier = Modifier.weight(1f)
                    )
                    StatCard(
                        title = "Female Students",
                        count = stats.femaleStudents.toString(),
                        subtitle = "Girls Division",
                        icon = Icons.Default.Female,
                        color = Teal600,
                        backgroundColor = Teal50,
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            // About & Academic Schedule
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.MenuBook,
                                contentDescription = null,
                                tint = Blue600,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Academic & Madrasa Hours",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = Slate900
                            )
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        InfoRow(label = "Daily Session", value = "7:00 AM – 9:00 AM (Morning)")
                        InfoRow(label = "Curriculum", value = "Samastha Kerala Board Syllabus")
                        InfoRow(label = "Campus Location", value = "Koduvally, Kozhikode, Kerala")
                        InfoRow(label = "Helpline / Office", value = "+91 98471 23456")
                    }
                }
            }
        }
    }

    // Interactive Student Login Bottom Sheet Modal
    if (showLoginSheet) {
        StudentLoginModal(
            repository = repository,
            onDismiss = { showLoginSheet = false },
            onLoginSuccess = { student ->
                showLoginSheet = false
                onNavigateToStudent(student.id)
            }
        )
    }
}

@Composable
fun StatCard(
    title: String,
    count: String,
    subtitle: String,
    icon: ImageVector,
    color: Color,
    backgroundColor: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = backgroundColor)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = Slate700
                )
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.size(18.dp)
                )
            }

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = count,
                fontSize = 22.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Slate900
            )

            Text(
                text = subtitle,
                fontSize = 11.sp,
                color = Slate700.copy(alpha = 0.8f)
            )
        }
    }
}

@Composable
fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
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
            color = Slate900
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentLoginModal(
    repository: StudentRepository,
    onDismiss: () -> Unit,
    onLoginSuccess: (org.noorulislam.app.data.StudentProfile) -> Unit
) {
    val scope = rememberCoroutineScope()
    val classOptions = remember {
        listOf(
            "Class 1", "Class 2", "Class 3", "Class 4", "Class 5",
            "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Alumni"
        )
    }

    var selectedClass by remember { mutableStateOf("Class 7") }
    var classDropdownExpanded by remember { mutableStateOf(false) }
    var identifierQuery by remember { mutableStateOf("") }
    var phoneInput by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Color.White
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Student Portal Access",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Slate900
                    )
                    Text(
                        text = "Access fee statements, receipts, and exam results",
                        fontSize = 12.sp,
                        color = Slate700
                    )
                }
                IconButton(onClick = onDismiss) {
                    Icon(imageVector = Icons.Default.Close, contentDescription = "Close")
                }
            }

            // Class Selector Dropdown
            ExposedDropdownMenuBox(
                expanded = classDropdownExpanded,
                onExpandedChange = { classDropdownExpanded = it }
            ) {
                OutlinedTextField(
                    value = selectedClass,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Select Class") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = classDropdownExpanded) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(),
                    shape = RoundedCornerShape(10.dp)
                )
                ExposedDropdownMenu(
                    expanded = classDropdownExpanded,
                    onDismissRequest = { classDropdownExpanded = false }
                ) {
                    classOptions.forEach { option ->
                        DropdownMenuItem(
                            text = { Text(option) },
                            onClick = {
                                selectedClass = option
                                classDropdownExpanded = false
                            }
                        )
                    }
                }
            }

            // Student Identifier (Adm No or Name)
            OutlinedTextField(
                value = identifierQuery,
                onValueChange = {
                    identifierQuery = it
                    errorMessage = null
                },
                label = { Text("Admission Number or Student Name") },
                placeholder = { Text("e.g. 2024-0142 or Irfan") },
                singleLine = true,
                leadingIcon = {
                    Icon(imageVector = Icons.Default.Badge, contentDescription = null, tint = Blue600)
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp)
            )

            // Registered Phone Number
            OutlinedTextField(
                value = phoneInput,
                onValueChange = {
                    phoneInput = it
                    errorMessage = null
                },
                label = { Text("Registered Mobile Number (Password)") },
                placeholder = { Text("10-digit mobile number") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                leadingIcon = {
                    Icon(imageVector = Icons.Default.Phone, contentDescription = null, tint = Blue600)
                },
                trailingIcon = {
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(
                            imageVector = if (passwordVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                            contentDescription = if (passwordVisible) "Hide password" else "Show password"
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp)
            )

            if (errorMessage != null) {
                Text(
                    text = errorMessage!!,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 12.sp,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            Button(
                onClick = {
                    if (phoneInput.trim().isEmpty() && identifierQuery.trim().isEmpty()) {
                        errorMessage = "Please enter admission number/name or mobile number."
                        return@Button
                    }
                    isLoading = true
                    errorMessage = null
                    scope.launch {
                        val result = repository.authenticateStudent(
                            studentClass = selectedClass,
                            searchQuery = identifierQuery,
                            phoneInput = phoneInput
                        )
                        isLoading = false
                        result.onSuccess { student ->
                            onLoginSuccess(student)
                        }.onFailure { error ->
                            errorMessage = error.localizedMessage ?: "Student verification failed. Please check credentials."
                        }
                    }
                },
                enabled = !isLoading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Blue600)
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(imageVector = Icons.Default.Login, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Sign In to Student Portal",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
