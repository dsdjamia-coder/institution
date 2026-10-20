package org.noorulislam.app.ui.screens

import android.content.Intent
import android.net.Uri
import android.widget.Toast
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.noorulislam.app.data.*

import org.noorulislam.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onNavigateToStudent: (String) -> Unit
) {
    val context = LocalContext.current
    val repository = remember { StudentRepository(context) }
    val scope = rememberCoroutineScope()

    var stats by remember { mutableStateOf(InstitutionStats(480, 24, 252, 228)) }
    var aboutText by remember { mutableStateOf("") }
    var teachers by remember { mutableStateOf<List<TeacherProfile>>(emptyList()) }
    var notices by remember { mutableStateOf<List<NoticeItem>>(emptyList()) }
    var gallery by remember { mutableStateOf<List<GalleryItem>>(emptyList()) }
    var savedAccounts by remember { mutableStateOf<List<SavedStudentAccount>>(emptyList()) }

    var showLoginSheet by remember { mutableStateOf(false) }
    var selectedNotice by remember { mutableStateOf<NoticeItem?>(null) }
    var selectedTeacher by remember { mutableStateOf<TeacherProfile?>(null) }
    var selectedGalleryItem by remember { mutableStateOf<GalleryItem?>(null) }

    LaunchedEffect(Unit) {
        savedAccounts = repository.getSavedAccounts()
        try {
            stats = repository.getInstitutionStats()
            aboutText = repository.getAboutUsText()
            teachers = repository.getTeachers()
            notices = repository.getNotices()
            gallery = repository.getGallery()
        } catch (e: Exception) {
            // Graceful baseline
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Blue600,
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = Icons.Default.School,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "NOORUL ISLAM MADRASA",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Slate900
                            )
                            Text(
                                text = "Reg No: 4883 • Koduvally, Kozhikode",
                                fontSize = 11.sp,
                                color = Slate500
                            )
                        }
                    }
                },
                actions = {
                    Button(
                        onClick = { showLoginSheet = true },
                        colors = ButtonDefaults.buttonColors(containerColor = Slate900),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                        modifier = Modifier.height(36.dp)
                    ) {
                        Icon(Icons.Default.Login, contentDescription = null, modifier = Modifier.size(14.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Login", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.White,
                    titleContentColor = Slate900
                )
            )
        },
        containerColor = Color.White
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(bottom = 32.dp)
        ) {
            // HERO SECTION (1:1 with index.html .hero)
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    // Centered Big Logo Card (.hero-logo-target)
                    Surface(
                        modifier = Modifier
                            .size(110.dp)
                            .clip(RoundedCornerShape(26.dp)),
                        color = Color.White,
                        border = androidx.compose.foundation.BorderStroke(1.dp, Slate200),
                        shadowElevation = 6.dp
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Default.MenuBook,
                                contentDescription = "Logo",
                                tint = Blue600,
                                modifier = Modifier.size(54.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(18.dp))

                    Text(
                        text = "Noorul Islam Higher Secondary Madrasa",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Black,
                        color = Slate900,
                        textAlign = TextAlign.Center,
                        lineHeight = 28.sp
                    )

                    Spacer(modifier = Modifier.height(6.dp))

                    Text(
                        text = "Excellence in Islamic & Moral Education",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Blue600,
                        textAlign = TextAlign.Center
                    )

                    Text(
                        text = "Reg No: 4883  |  Koduvally, Kozhikode",
                        fontSize = 12.sp,
                        color = Slate500,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 4.dp)
                    )

                    Spacer(modifier = Modifier.height(22.dp))

                    // Primary Main Login Button (.main-login-btn)
                    Button(
                        onClick = { showLoginSheet = true },
                        modifier = Modifier
                            .fillMaxWidth(0.85f)
                            .height(50.dp),
                        shape = RoundedCornerShape(50.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Slate900),
                        elevation = ButtonDefaults.buttonElevation(defaultElevation = 6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Lock,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Student Portal Login",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Quick Navigation Pill Buttons (.secondary-actions .compact-btn)
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.padding(top = 4.dp)
                    ) {
                        CompactPillBtn(icon = Icons.Default.School, label = "Teachers", color = Amber500) {
                            if (teachers.isNotEmpty()) selectedTeacher = teachers.first()
                        }
                        CompactPillBtn(icon = Icons.Default.Notifications, label = "Notices", color = Color(0xFFEF4444)) {
                            if (notices.isNotEmpty()) selectedNotice = notices.first()
                        }
                        CompactPillBtn(icon = Icons.Default.Image, label = "Gallery", color = Emerald500) {
                            if (gallery.isNotEmpty()) selectedGalleryItem = gallery.first()
                        }
                    }
                }
            }

            // STATS GRID (1:1 with index.html .stats-grid .stat-blue, .stat-yellow, .stat-green, .stat-teal)
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        WebStatCard(
                            title = "STUDENTS",
                            count = stats.totalStudents.toString(),
                            icon = Icons.Default.Groups,
                            accentColor = Blue600,
                            iconTint = Color(0xFF93C5FD),
                            modifier = Modifier.weight(1f)
                        )
                        WebStatCard(
                            title = "TEACHERS",
                            count = stats.totalStaff.toString(),
                            icon = Icons.Default.RecordVoiceOver,
                            accentColor = Amber500,
                            iconTint = Color(0xFFFBBF24),
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        WebStatCard(
                            title = "MALE",
                            count = stats.maleStudents.toString(),
                            icon = Icons.Default.Person,
                            accentColor = Color(0xFF22C55E),
                            iconTint = Color(0xFF86EFAC),
                            modifier = Modifier.weight(1f)
                        )
                        WebStatCard(
                            title = "FEMALE",
                            count = stats.femaleStudents.toString(),
                            icon = Icons.Default.PersonOutline,
                            accentColor = Teal500,
                            iconTint = Color(0xFF5EEAD4),
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }

            // SAVED SIBLING ACCOUNTS (Quick Profile Switcher)
            if (savedAccounts.isNotEmpty()) {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 14.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Saved Student Profiles",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = Slate900
                            )
                            Text(
                                text = "Tap to switch",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Blue600
                            )
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            items(savedAccounts) { account ->
                                Card(
                                    modifier = Modifier
                                        .clickable { onNavigateToStudent(account.studentId) }
                                        .width(220.dp),
                                    shape = RoundedCornerShape(14.dp),
                                    colors = CardDefaults.cardColors(containerColor = Slate50),
                                    border = androidx.compose.foundation.BorderStroke(1.dp, Slate200)
                                ) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Surface(
                                            modifier = Modifier.size(38.dp),
                                            shape = CircleShape,
                                            color = Blue100
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(Icons.Default.Person, contentDescription = null, tint = Blue600, modifier = Modifier.size(20.dp))
                                            }
                                        }
                                        Spacer(modifier = Modifier.width(10.dp))
                                        Column {
                                            Text(
                                                text = account.name,
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Slate900,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                            Text(
                                                text = "${account.studentClass} • Adm: ${account.admNo}",
                                                fontSize = 11.sp,
                                                color = Slate500
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ABOUT US SECTION (1:1 with index.html #about-container)
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp)
                ) {
                    SectionHeaderWithUnderline(title = "About Us")

                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Slate50),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Slate200)
                    ) {
                        Text(
                            text = aboutText.ifEmpty { "Loading institution description..." },
                            fontSize = 13.sp,
                            lineHeight = 22.sp,
                            color = Slate700,
                            modifier = Modifier.padding(18.dp)
                        )
                    }
                }
            }

            // TEACHERS DIRECTORY (1:1 with index.html #teachers-container)
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp)
                ) {
                    SectionHeaderWithUnderline(title = "Teachers")

                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(teachers) { teacher ->
                            Card(
                                modifier = Modifier
                                    .width(200.dp)
                                    .clickable { selectedTeacher = teacher },
                                shape = RoundedCornerShape(16.dp),
                                colors = CardDefaults.cardColors(containerColor = Color.White),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Slate200),
                                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                            ) {
                                Column(
                                    modifier = Modifier.padding(16.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Surface(
                                        shape = CircleShape,
                                        color = Amber50,
                                        modifier = Modifier.size(60.dp),
                                        border = androidx.compose.foundation.BorderStroke(2.dp, Amber500.copy(alpha = 0.5f))
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Default.Person, contentDescription = null, tint = Amber600, modifier = Modifier.size(32.dp))
                                        }
                                    }

                                    Spacer(modifier = Modifier.height(10.dp))

                                    Text(
                                        text = teacher.name,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        color = Slate900,
                                        textAlign = TextAlign.Center,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )

                                    Text(
                                        text = teacher.role,
                                        fontSize = 11.sp,
                                        color = Slate500,
                                        textAlign = TextAlign.Center,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )

                                    Spacer(modifier = Modifier.height(8.dp))

                                    Surface(
                                        color = Slate100,
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Text(
                                            text = teacher.place,
                                            fontSize = 10.sp,
                                            color = Slate600,
                                            fontWeight = FontWeight.SemiBold,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // NOTIFICATIONS SECTION (1:1 with index.html #notices-container)
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp)
                ) {
                    SectionHeaderWithUnderline(title = "Notifications")

                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        notices.forEach { notice ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { selectedNotice = notice },
                                shape = RoundedCornerShape(14.dp),
                                colors = CardDefaults.cardColors(containerColor = Slate50),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Slate200)
                            ) {
                                Row(
                                    modifier = Modifier.padding(14.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Surface(
                                        shape = RoundedCornerShape(10.dp),
                                        color = Blue50,
                                        modifier = Modifier.size(44.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Default.Campaign, contentDescription = null, tint = Blue600, modifier = Modifier.size(24.dp))
                                        }
                                    }
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = notice.title,
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Slate900,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Text(
                                            text = notice.description,
                                            fontSize = 11.sp,
                                            color = Slate500,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis,
                                            lineHeight = 16.sp
                                        )
                                        Text(
                                            text = "${notice.date} • ${notice.category}",
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Blue600,
                                            modifier = Modifier.padding(top = 4.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // GALLERY SECTION (1:1 with index.html #gallery-container)
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp)
                ) {
                    SectionHeaderWithUnderline(title = "Gallery")

                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(gallery) { item ->
                            Card(
                                modifier = Modifier
                                    .width(220.dp)
                                    .clickable { selectedGalleryItem = item },
                                shape = RoundedCornerShape(16.dp),
                                colors = CardDefaults.cardColors(containerColor = Slate900),
                                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                            ) {
                                Column {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(130.dp)
                                            .background(Slate800),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Collections,
                                            contentDescription = null,
                                            tint = Slate500,
                                            modifier = Modifier.size(42.dp)
                                        )
                                    }
                                    Text(
                                        text = item.title,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color.White,
                                        modifier = Modifier.padding(12.dp),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // FOOTER (1:1 with index.html footer)
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Slate900)
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "FOLLOW US",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = Slate500,
                        letterSpacing = 1.sp
                    )

                    Spacer(modifier = Modifier.height(14.dp))

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        SocialIconBtn(Icons.Default.Phone) {
                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:+919847123456"))
                            context.startActivity(intent)
                        }
                        SocialIconBtn(Icons.Default.Email) {
                            val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:info@noorulislam.org"))
                            context.startActivity(intent)
                        }
                        SocialIconBtn(Icons.Default.Share) {
                            val intent = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_TEXT, "Noorul Islam Higher Secondary Madrasa: https://noorulislam.org")
                            }
                            context.startActivity(Intent.createChooser(intent, "Share Institution"))
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))
                    HorizontalDivider(color = Slate800)
                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "© Noorul Islam Higher Secondary Madrasa.\nAll Rights Reserved.",
                        fontSize = 11.sp,
                        color = Slate500,
                        textAlign = TextAlign.Center,
                        lineHeight = 16.sp
                    )

                    Spacer(modifier = Modifier.height(6.dp))

                    Text(
                        text = "Developed by HADI MAHIRI FAIZY",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White
                    )

                    Spacer(modifier = Modifier.height(4.dp))

                    Text(
                        text = "Version: v2.6.0 • Last Updated: 2026-04-25",
                        fontSize = 10.sp,
                        color = Slate600
                    )
                }
            }
        }
    }

    // Notice Full Detail Modal Dialog
    if (selectedNotice != null) {
        val notice = selectedNotice!!
        AlertDialog(
            onDismissRequest = { selectedNotice = null },
            title = {
                Text(notice.title, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Slate900)
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Date: ${notice.date} • ${notice.category}", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Blue600)
                    HorizontalDivider(color = Slate200)
                    Text(notice.description, fontSize = 13.sp, lineHeight = 20.sp, color = Slate700)
                }
            },
            confirmButton = {
                Button(onClick = { selectedNotice = null }) {
                    Text("Close")
                }
            }
        )
    }

    // Teacher Detail Dialog
    if (selectedTeacher != null) {
        val teacher = selectedTeacher!!
        AlertDialog(
            onDismissRequest = { selectedTeacher = null },
            title = {
                Text(teacher.name, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Slate900)
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Designation: ${teacher.role}", fontSize = 12.sp, color = Slate600)
                    Text("Place: ${teacher.place}", fontSize = 12.sp, color = Slate600)
                    if (teacher.phone.isNotEmpty()) {
                        Text("Phone: ${teacher.phone}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Blue600)
                    }
                }
            },
            confirmButton = {
                Button(onClick = { selectedTeacher = null }) {
                    Text("OK")
                }
            }
        )
    }

    // Gallery Zoom Dialog
    if (selectedGalleryItem != null) {
        val item = selectedGalleryItem!!
        AlertDialog(
            onDismissRequest = { selectedGalleryItem = null },
            title = {
                Text(item.title, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Slate900)
            },
            text = {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp)
                        .background(Slate900, RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.Image, contentDescription = null, tint = Slate500, modifier = Modifier.size(64.dp))
                }
            },
            confirmButton = {
                Button(onClick = { selectedGalleryItem = null }) {
                    Text("Close")
                }
            }
        )
    }

    // INTERACTIVE STUDENT LOGIN BOTTOM SHEET (1:1 with index.html #login-modal)
    if (showLoginSheet) {
        StudentLoginModalSheet(
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
fun WebStatCard(
    title: String,
    count: String,
    icon: ImageVector,
    accentColor: Color,
    iconTint: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.height(86.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            // Left color accent bar (.stat-blue::before, etc.)
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(4.dp)
                    .background(accentColor)
                    .align(Alignment.CenterStart)
            )

            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = title,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = accentColor,
                        letterSpacing = 0.5.sp
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = count,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Slate900
                    )
                }
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(32.dp)
                )
            }
        }
    }
}

@Composable
fun SectionHeaderWithUnderline(title: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = title,
            fontSize = 18.sp,
            fontWeight = FontWeight.ExtraBold,
            color = Slate900
        )
        Spacer(modifier = Modifier.height(6.dp))
        Box(
            modifier = Modifier
                .width(40.dp)
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(Blue600)
        )
    }
}

@Composable
fun CompactPillBtn(
    icon: ImageVector,
    label: String,
    color: Color,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        color = Color.White,
        border = androidx.compose.foundation.BorderStroke(1.dp, Slate200),
        shadowElevation = 1.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(16.dp))
            Text(label, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Slate800)
        }
    }
}

@Composable
fun SocialIconBtn(icon: ImageVector, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = Slate800,
        modifier = Modifier.size(42.dp)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentLoginModalSheet(
    repository: StudentRepository,
    onDismiss: () -> Unit,
    onLoginSuccess: (StudentProfile) -> Unit
) {
    val scope = rememberCoroutineScope()
    var classOptions by remember { mutableStateOf<List<String>>(emptyList()) }
    var selectedClass by remember { mutableStateOf("") }
    var classDropdownExpanded by remember { mutableStateOf(false) }
    var identifierQuery by remember { mutableStateOf("") }
    var suggestions by remember { mutableStateOf<List<StudentProfile>>(emptyList()) }
    var phoneInput by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showOfficeWarningDialog by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val loaded = repository.getDistinctClasses()
        classOptions = loaded
        if (loaded.isNotEmpty()) {
            selectedClass = loaded.first()
        }
    }

    LaunchedEffect(selectedClass, identifierQuery) {
        val cleanTxt = identifierQuery.trim()
        if (selectedClass.isNotEmpty() && cleanTxt.length >= 1) {
            suggestions = repository.searchStudents(cleanTxt, selectedClass).take(6)
        } else {
            suggestions = emptyList()
        }
    }

    if (showOfficeWarningDialog) {
        AlertDialog(
            onDismissRequest = { showOfficeWarningDialog = false },
            icon = { Icon(Icons.Default.Warning, contentDescription = null, tint = Amber500, modifier = Modifier.size(32.dp)) },
            title = {
                Text(
                    text = "No Registered Mobile Number",
                    fontWeight = FontWeight.Bold,
                    color = Slate900,
                    fontSize = 16.sp
                )
            },
            text = {
                Text(
                    text = "This student does not have a registered mobile number in the institutional database. For access to the Student Portal, please contact the Madrasa office.",
                    color = Slate700,
                    fontSize = 13.sp,
                    lineHeight = 19.sp
                )
            },
            confirmButton = {
                Button(
                    onClick = { showOfficeWarningDialog = false },
                    colors = ButtonDefaults.buttonColors(containerColor = Slate900),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("OK, Contact Office")
                }
            }
        )
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Color.White
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = CircleShape,
                        color = Blue50,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Lock, contentDescription = null, tint = Blue600, modifier = Modifier.size(18.dp))
                        }
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "Student Login",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Slate900
                    )
                }
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Close", tint = Slate500)
                }
            }

            // Class Selector Dropdown (Dynamic from Firestore)
            ExposedDropdownMenuBox(
                expanded = classDropdownExpanded,
                onExpandedChange = { classDropdownExpanded = it }
            ) {
                OutlinedTextField(
                    value = if (selectedClass.isEmpty()) "Loading classes..." else selectedClass,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Select Class") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = classDropdownExpanded) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(),
                    shape = RoundedCornerShape(12.dp)
                )
                ExposedDropdownMenu(
                    expanded = classDropdownExpanded,
                    onDismissRequest = { classDropdownExpanded = false }
                ) {
                    classOptions.forEach { cls ->
                        DropdownMenuItem(
                            text = { Text(cls, fontWeight = if (cls == selectedClass) FontWeight.Bold else FontWeight.Normal) },
                            onClick = {
                                selectedClass = cls
                                identifierQuery = ""
                                suggestions = emptyList()
                                classDropdownExpanded = false
                            }
                        )
                    }
                }
            }

            // Search Name or Admission Number with Live Autocomplete
            Column {
                OutlinedTextField(
                    value = identifierQuery,
                    onValueChange = { identifierQuery = it },
                    label = { Text("Search Name or Adm No") },
                    placeholder = { Text("Type name or admission number") },
                    leadingIcon = {
                        Icon(Icons.Default.Search, contentDescription = null, tint = Slate500)
                    },
                    trailingIcon = {
                        if (identifierQuery.isNotEmpty()) {
                            IconButton(onClick = { identifierQuery = ""; suggestions = emptyList() }) {
                                Icon(Icons.Default.Clear, contentDescription = "Clear", tint = Slate400, modifier = Modifier.size(16.dp))
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp)
                )

                // Suggestions Dropdown Card
                if (suggestions.isNotEmpty()) {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                        shape = RoundedCornerShape(10.dp),
                        color = Slate50,
                        border = androidx.compose.foundation.BorderStroke(1.dp, Slate200)
                    ) {
                        Column {
                            suggestions.forEach { st ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            identifierQuery = st.name
                                            suggestions = emptyList()
                                        }
                                        .padding(horizontal = 14.dp, vertical = 10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = st.name,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Slate900
                                    )
                                    Text(
                                        text = "Adm: ${st.admNo.ifEmpty { "--" }}",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Slate500
                                    )
                                }
                                Divider(color = Slate200, thickness = 0.5.dp)
                            }
                        }
                    }
                }
            }

            // Password (Mobile Number) with Eye Toggle
            OutlinedTextField(
                value = phoneInput,
                onValueChange = { phoneInput = it },
                label = { Text("Password (Registered Mobile Number)") },
                placeholder = { Text("10-digit mobile number") },
                leadingIcon = {
                    Icon(Icons.Default.Key, contentDescription = null, tint = Slate500)
                },
                trailingIcon = {
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(
                            imageVector = if (passwordVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                            contentDescription = "Toggle Password"
                        )
                    }
                },
                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(12.dp)
            )

            if (errorMessage != null) {
                Surface(
                    color = Red50,
                    shape = RoundedCornerShape(8.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Red100),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = errorMessage!!,
                        color = Red600,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }

            // Sign In Button
            Button(
                onClick = {
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
                        }.onFailure { err ->
                            val msg = err.localizedMessage ?: "Student verification failed."
                            if (msg.contains("MISSING_PHONE")) {
                                showOfficeWarningDialog = true
                            }
                            errorMessage = msg.replace("MISSING_PHONE: ", "")
                        }
                    }
                },
                enabled = !isLoading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Slate900)
            ) {
                if (isLoading) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp))
                } else {
                    Icon(Icons.Default.Login, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Sign In to Student Portal", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

