package org.noorulislam.app.ui.screens

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.noorulislam.app.data.FeePaymentPayload
import org.noorulislam.app.data.PaymentReceipt
import org.noorulislam.app.data.StudentProfile
import org.noorulislam.app.data.StudentRepository
import org.noorulislam.app.printer.BluetoothPrinterService
import org.noorulislam.app.printer.PrinterPaperWidth
import org.noorulislam.app.printer.ReceiptData
import org.noorulislam.app.printer.ReceiptItem

import org.noorulislam.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CollectionScreen(
    onNavigateBack: () -> Unit
) {
    val context = LocalContext.current
    val repository = remember { StudentRepository(context) }
    val printerService = remember { BluetoothPrinterService(context) }
    val scope = rememberCoroutineScope()

    var searchQuery by remember { mutableStateOf("") }
    var selectedClass by remember { mutableStateOf("All Classes") }
    var searchResults by remember { mutableStateOf<List<StudentProfile>>(emptyList()) }
    var selectedStudent by remember { mutableStateOf<StudentProfile?>(null) }
    var isSearching by remember { mutableStateOf(false) }

    // Payment Form States
    var paymentAmount by remember { mutableStateOf("200") }
    var feeCategory by remember { mutableStateOf("Tuition Fee") }
    var paymentMode by remember { mutableStateOf("CASH") }
    var collectorRemarks by remember { mutableStateOf("") }
    var isSubmitting by remember { mutableStateOf(false) }

    // Printer States
    var showPrinterDialog by remember { mutableStateOf(false) }
    var paperWidth by remember {
        mutableStateOf(
            if (repository.getSavedPrinterWidth() == "WIDTH_80MM") PrinterPaperWidth.WIDTH_80MM
            else PrinterPaperWidth.WIDTH_58MM
        )
    }
    var pairedDevices by remember { mutableStateOf<List<BluetoothDevice>>(emptyList()) }
    var selectedDevice by remember { mutableStateOf<BluetoothDevice?>(null) }
    var lastReceipt by remember { mutableStateOf<PaymentReceipt?>(null) }
    var isPrintingReceipt by remember { mutableStateOf(false) }

    var classes by remember { mutableStateOf(listOf("All Classes")) }
    val feeCategories = listOf("Tuition Fee", "Examination Fee", "Admission Fee", "Welfare Fund", "Books & Stationary")
    val paymentModes = listOf("CASH", "UPI", "BANK")

    // Search trigger
    LaunchedEffect(searchQuery, selectedClass) {
        if (searchQuery.trim().length >= 2 || selectedClass != "All Classes") {
            isSearching = true
            searchResults = repository.searchStudents(searchQuery, selectedClass)
            isSearching = false
        } else {
            searchResults = emptyList()
        }
    }

    // Load paired devices and classes on launch
    LaunchedEffect(Unit) {
        try {
            val distinct = repository.getDistinctClasses()
            if (distinct.isNotEmpty()) {
                classes = listOf("All Classes") + distinct
            }
        } catch (e: Exception) {
            // keep default
        }
        pairedDevices = printerService.getPairedDevices()
        val savedAddr = repository.getSavedPrinterAddress()
        if (savedAddr != null) {
            selectedDevice = pairedDevices.find { it.address == savedAddr }
        }
        if (selectedDevice == null && pairedDevices.isNotEmpty()) {
            selectedDevice = pairedDevices.first()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Fee Collection Desk",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Text(
                            text = "Noorul Islam Madrasa • Real-time Validation",
                            fontSize = 11.sp,
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
                        pairedDevices = printerService.getPairedDevices()
                        showPrinterDialog = true
                    }) {
                        Icon(
                            imageVector = Icons.Default.Print,
                            contentDescription = "Printer Settings",
                            tint = Color.White
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Slate900,
                    titleContentColor = Color.White
                )
            )
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Slate50)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Printer Status Ribbon
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.Bluetooth,
                                contentDescription = null,
                                tint = Blue600,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Column {
                                @SuppressLint("MissingPermission")
                                val devName = selectedDevice?.name ?: "No printer paired"
                                Text(
                                    text = devName,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Slate900
                                )
                                Text(
                                    text = "Width: ${paperWidth.label}",
                                    fontSize = 11.sp,
                                    color = Slate700
                                )
                            }
                        }
                        OutlinedButton(
                            onClick = {
                                pairedDevices = printerService.getPairedDevices()
                                showPrinterDialog = true
                            },
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Text("Configure", fontSize = 11.sp)
                        }
                    }
                }
            }

            // Student Search & Class Filter
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = "Find Student",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = Slate900
                        )
                        Spacer(modifier = Modifier.height(8.dp))

                        // Class Filter Chips
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            items(classes) { cls ->
                                val isSelected = selectedClass == cls
                                FilterChip(
                                    selected = isSelected,
                                    onClick = { selectedClass = cls },
                                    label = { Text(cls, fontSize = 11.sp) }
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            placeholder = { Text("Search by Admission No or Student Name") },
                            leadingIcon = {
                                Icon(Icons.Default.Search, contentDescription = null, tint = Slate700)
                            },
                            trailingIcon = {
                                if (searchQuery.isNotEmpty()) {
                                    IconButton(onClick = { searchQuery = "" }) {
                                        Icon(Icons.Default.Clear, contentDescription = "Clear")
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )

                        if (isSearching) {
                            Spacer(modifier = Modifier.height(8.dp))
                            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
            }

            // Search Results Dropdown/List
            if (selectedStudent == null && searchResults.isNotEmpty()) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(
                                text = "Select Student (${searchResults.size} found):",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = Slate700
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            searchResults.forEach { student ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(8.dp))
                                        .clickable {
                                            selectedStudent = student
                                            paymentAmount = student.pendingDues.toInt().toString().ifEmpty { "200" }
                                        }
                                        .padding(vertical = 8.dp, horizontal = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column {
                                        Text(
                                            text = student.name,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 14.sp,
                                            color = Slate900
                                        )
                                        Text(
                                            text = "Adm: ${student.admNo} • ${student.studentClass} • Roll: ${student.rollNo}",
                                            fontSize = 12.sp,
                                            color = Slate700
                                        )
                                    }
                                    Surface(
                                        color = if (student.pendingDues > 0) Amber50 else Emerald50,
                                        shape = RoundedCornerShape(12.dp)
                                    ) {
                                        Text(
                                            text = "Due: ₹${student.pendingDues.toInt()}",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (student.pendingDues > 0) Amber600 else Emerald600,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                }
                                HorizontalDivider(color = Slate100)
                            }
                        }
                    }
                }
            }

            // Selected Student Profile & Payment Action Form
            if (selectedStudent != null) {
                val student = selectedStudent!!
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = student.name,
                                        fontSize = 17.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Slate900
                                    )
                                    Text(
                                        text = "Adm No: ${student.admNo} • ${student.studentClass} • Roll: ${student.rollNo}",
                                        fontSize = 12.sp,
                                        color = Slate700
                                    )
                                    Text(
                                        text = "Guardian: ${student.guardianName} (${student.phone})",
                                        fontSize = 12.sp,
                                        color = Slate700
                                    )
                                }
                                IconButton(onClick = { selectedStudent = null }) {
                                    Icon(Icons.Default.Close, contentDescription = "Deselect", tint = Red600)
                                }
                            }

                            Spacer(modifier = Modifier.height(10.dp))
                            Surface(
                                color = if (student.pendingDues > 0) Amber50 else Emerald50,
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "Outstanding Due Balance:",
                                        fontSize = 13.sp,
                                        color = Slate900
                                    )
                                    Text(
                                        text = "₹${student.pendingDues.toInt()}",
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (student.pendingDues > 0) Amber600 else Emerald600
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = "Fee Receipt Entry",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = Slate900
                            )
                            Spacer(modifier = Modifier.height(8.dp))

                            // Fee Category Selector
                            Text("Category", fontSize = 12.sp, color = Slate700)
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                items(feeCategories) { cat ->
                                    val isSelected = feeCategory == cat
                                    FilterChip(
                                        selected = isSelected,
                                        onClick = { feeCategory = cat },
                                        label = { Text(cat, fontSize = 11.sp) }
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(10.dp))

                            // Payment Amount Input
                            OutlinedTextField(
                                value = paymentAmount,
                                onValueChange = { paymentAmount = it.filter { char -> char.isDigit() } },
                                label = { Text("Amount Paid (INR)") },
                                leadingIcon = {
                                    Text("₹", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Slate900)
                                },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true
                            )

                            Spacer(modifier = Modifier.height(10.dp))

                            // Payment Mode Selector (Cash / UPI / Bank)
                            Text("Payment Mode", fontSize = 12.sp, color = Slate700)
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                paymentModes.forEach { mode ->
                                    val isSelected = paymentMode == mode
                                    FilledTonalButton(
                                        onClick = { paymentMode = mode },
                                        modifier = Modifier.weight(1f),
                                        colors = ButtonDefaults.filledTonalButtonColors(
                                            containerColor = if (isSelected) Blue600 else Slate100,
                                            contentColor = if (isSelected) Color.White else Slate900
                                        )
                                    ) {
                                        Text(mode, fontSize = 12.sp)
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(10.dp))

                            // Collector Remarks
                            OutlinedTextField(
                                value = collectorRemarks,
                                onValueChange = { collectorRemarks = it },
                                label = { Text("Remarks (Optional)") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true
                            )

                            Spacer(modifier = Modifier.height(16.dp))

                            // Submit & Print Action Buttons
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = {
                                        val amt = paymentAmount.toDoubleOrNull() ?: 0.0
                                        if (amt <= 0) {
                                            Toast.makeText(context, "Please enter a valid amount", Toast.LENGTH_SHORT).show()
                                            return@Button
                                        }

                                        scope.launch {
                                            isSubmitting = true
                                            val payload = FeePaymentPayload(
                                                studentId = student.id,
                                                admNo = student.admNo,
                                                studentName = student.name,
                                                studentClass = student.studentClass,
                                                amount = amt,
                                                feeCategory = feeCategory,
                                                paymentMode = paymentMode,
                                                remarks = collectorRemarks,
                                                collectorName = "Staff Desk"
                                            )
                                            val result = repository.recordFeePayment(payload)
                                            isSubmitting = false

                                            result.onSuccess { receipt ->
                                                lastReceipt = receipt
                                                Toast.makeText(context, "Payment recorded: ${receipt.receiptNo}", Toast.LENGTH_LONG).show()

                                                // Update current selected student balance locally
                                                selectedStudent = student.copy(
                                                    pendingDues = (student.pendingDues - amt).coerceAtLeast(0.0)
                                                )

                                                // Auto-trigger thermal print if printer configured
                                                if (selectedDevice != null) {
                                                    isPrintingReceipt = true
                                                    val printData = ReceiptData(
                                                        receiptNo = receipt.receiptNo,
                                                        date = receipt.date,
                                                        studentName = receipt.studentName,
                                                        admNo = receipt.admNo,
                                                        studentClass = receipt.studentClass,
                                                        items = listOf(ReceiptItem(receipt.feeCategory, receipt.amount)),
                                                        totalAmount = receipt.amount,
                                                        collectorName = receipt.collectorName,
                                                        paymentMode = receipt.paymentMode
                                                    )
                                                    val printed = printerService.printReceipt(selectedDevice!!, printData, paperWidth)
                                                    isPrintingReceipt = false
                                                    if (printed) {
                                                        Toast.makeText(context, "Receipt printed successfully!", Toast.LENGTH_SHORT).show()
                                                    } else {
                                                        Toast.makeText(context, "Printer not reachable. Use Reprint button.", Toast.LENGTH_SHORT).show()
                                                    }
                                                }
                                            }.onFailure { err ->
                                                Toast.makeText(context, "Validation Error: ${err.message}", Toast.LENGTH_LONG).show()
                                            }
                                        }
                                    },
                                    modifier = Modifier.weight(1f),
                                    enabled = !isSubmitting,
                                    colors = ButtonDefaults.buttonColors(containerColor = Emerald600)
                                ) {
                                    if (isSubmitting) {
                                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp))
                                    } else {
                                        Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("Record & Print")
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Last Generated Receipt Card with Reprint Button
            if (lastReceipt != null) {
                val receipt = lastReceipt!!
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Emerald50),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Emerald600.copy(alpha = 0.5f))
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = "Verified Receipt Generated",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                        color = Emerald600
                                    )
                                    Text(
                                        text = "${receipt.receiptNo} • ₹${receipt.amount.toInt()}",
                                        fontSize = 13.sp,
                                        color = Slate900
                                    )
                                }
                                FilledTonalButton(
                                    onClick = {
                                        if (selectedDevice != null) {
                                            scope.launch {
                                                isPrintingReceipt = true
                                                val printData = ReceiptData(
                                                    receiptNo = receipt.receiptNo,
                                                    date = receipt.date,
                                                    studentName = receipt.studentName,
                                                    admNo = receipt.admNo,
                                                    studentClass = receipt.studentClass,
                                                    items = listOf(ReceiptItem(receipt.feeCategory, receipt.amount)),
                                                    totalAmount = receipt.amount,
                                                    collectorName = receipt.collectorName,
                                                    paymentMode = receipt.paymentMode
                                                )
                                                val success = printerService.printReceipt(selectedDevice!!, printData, paperWidth)
                                                isPrintingReceipt = false
                                                if (success) {
                                                    Toast.makeText(context, "Receipt reprinted!", Toast.LENGTH_SHORT).show()
                                                } else {
                                                    Toast.makeText(context, "Printer communication error", Toast.LENGTH_SHORT).show()
                                                }
                                            }
                                        } else {
                                            Toast.makeText(context, "Please select a Bluetooth printer in settings", Toast.LENGTH_SHORT).show()
                                            showPrinterDialog = true
                                        }
                                    },
                                    enabled = !isPrintingReceipt
                                ) {
                                    Icon(Icons.Default.Print, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Reprint")
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Bluetooth Printer Settings Modal Dialog
    if (showPrinterDialog) {
        AlertDialog(
            onDismissRequest = { showPrinterDialog = false },
            title = {
                Text(
                    text = "Bluetooth Thermal Printer",
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        text = "Paper Width Format:",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                        color = Slate900
                    )

                    // 58mm vs 80mm Toggle
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        FilledTonalButton(
                            onClick = {
                                paperWidth = PrinterPaperWidth.WIDTH_58MM
                                repository.savePrinterWidth("WIDTH_58MM")
                            },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.filledTonalButtonColors(
                                containerColor = if (paperWidth == PrinterPaperWidth.WIDTH_58MM) Blue600 else Slate100,
                                contentColor = if (paperWidth == PrinterPaperWidth.WIDTH_58MM) Color.White else Slate900
                            )
                        ) {
                            Text("58mm (2-inch)", fontSize = 11.sp)
                        }

                        FilledTonalButton(
                            onClick = {
                                paperWidth = PrinterPaperWidth.WIDTH_80MM
                                repository.savePrinterWidth("WIDTH_80MM")
                            },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.filledTonalButtonColors(
                                containerColor = if (paperWidth == PrinterPaperWidth.WIDTH_80MM) Blue600 else Slate100,
                                contentColor = if (paperWidth == PrinterPaperWidth.WIDTH_80MM) Color.White else Slate900
                            )
                        ) {
                            Text("80mm (3-inch)", fontSize = 11.sp)
                        }
                    }

                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Paired Devices (${pairedDevices.size}):",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                        color = Slate900
                    )

                    if (pairedDevices.isEmpty()) {
                        Text(
                            text = "No Bluetooth devices paired. Please pair your thermal printer in Android Bluetooth settings.",
                            fontSize = 12.sp,
                            color = Slate700
                        )
                    } else {
                        pairedDevices.forEach { dev ->
                            @SuppressLint("MissingPermission")
                            val isSelected = selectedDevice?.address == dev.address
                            @SuppressLint("MissingPermission")
                            val dName = dev.name ?: "Unknown Device"
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(if (isSelected) Slate100 else Color.Transparent)
                                    .clickable {
                                        selectedDevice = dev
                                        repository.savePrinterAddress(dev.address)
                                    }
                                    .padding(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                RadioButton(
                                    selected = isSelected,
                                    onClick = {
                                        selectedDevice = dev
                                        repository.savePrinterAddress(dev.address)
                                    }
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Column {
                                    Text(dName, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                    Text(dev.address, fontSize = 11.sp, color = Slate700)
                                }
                            }
                        }
                    }

                    // Test Print Action
                    if (selectedDevice != null) {
                        OutlinedButton(
                            onClick = {
                                scope.launch {
                                    val success = printerService.testPrint(selectedDevice!!, paperWidth)
                                    if (success) {
                                        Toast.makeText(context, "Test receipt printed!", Toast.LENGTH_SHORT).show()
                                    } else {
                                        Toast.makeText(context, "Printer communication failed", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Default.Print, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Perform Test Print")
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = { showPrinterDialog = false }) {
                    Text("Done")
                }
            }
        )
    }
}
