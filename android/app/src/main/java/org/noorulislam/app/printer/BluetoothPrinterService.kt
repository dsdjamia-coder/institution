package org.noorulislam.app.printer

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.OutputStream
import java.text.SimpleDateFormat
import java.util.*

enum class PrinterPaperWidth(val charsPerLine: Int, val label: String) {
    WIDTH_58MM(32, "58mm (2-inch Portable)"),
    WIDTH_80MM(48, "80mm (3-inch POS Desk)")
}

data class ReceiptData(
    val receiptNo: String,
    val date: String,
    val studentName: String,
    val admNo: String,
    val studentClass: String,
    val items: List<ReceiptItem>,
    val totalAmount: Double,
    val collectorName: String,
    val paymentMode: String = "CASH"
)

data class ReceiptItem(
    val title: String,
    val amount: Double
)

class BluetoothPrinterService(private val context: Context? = null) {
    private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    @SuppressLint("MissingPermission")
    fun getPairedDevices(): List<BluetoothDevice> {
        return try {
            val adapter = BluetoothAdapter.getDefaultAdapter()
            adapter?.bondedDevices?.toList() ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    @SuppressLint("MissingPermission")
    suspend fun printReceipt(
        device: BluetoothDevice,
        receipt: ReceiptData,
        paperWidth: PrinterPaperWidth = PrinterPaperWidth.WIDTH_58MM
    ): Boolean = withContext(Dispatchers.IO) {
        var socket: BluetoothSocket? = null
        var outputStream: OutputStream? = null
        try {
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
            socket.connect()
            outputStream = socket.outputStream

            val width = paperWidth.charsPerLine
            val divider = "-".repeat(width) + "\n"

            // ESC/POS Command bytes
            val ESC = 0x1B.toByte()
            val GS = 0x1D.toByte()
            val INIT = byteArrayOf(ESC, '@'.code.toByte())
            val ALIGN_CENTER = byteArrayOf(ESC, 'a'.code.toByte(), 1)
            val ALIGN_LEFT = byteArrayOf(ESC, 'a'.code.toByte(), 0)
            val BOLD_ON = byteArrayOf(ESC, 'E'.code.toByte(), 1)
            val BOLD_OFF = byteArrayOf(ESC, 'E'.code.toByte(), 0)

            outputStream.write(INIT)

            // Header
            outputStream.write(ALIGN_CENTER)
            outputStream.write(BOLD_ON)
            outputStream.write("NOORUL ISLAM MADRASA\n".toByteArray())
            outputStream.write(BOLD_OFF)
            outputStream.write("Higher Secondary Education Desk\n".toByteArray())
            outputStream.write("Reg No: 4883 • Estd. 1994\n".toByteArray())
            outputStream.write(divider.toByteArray())

            // Title & Mode
            outputStream.write(BOLD_ON)
            outputStream.write("FEE COLLECTION RECEIPT\n".toByteArray())
            outputStream.write(BOLD_OFF)
            outputStream.write(divider.toByteArray())

            // Student & Receipt Metadata
            outputStream.write(ALIGN_LEFT)
            outputStream.write("Receipt No : ${receipt.receiptNo}\n".toByteArray())
            outputStream.write("Date & Time: ${receipt.date}\n".toByteArray())
            outputStream.write("Student    : ${receipt.studentName}\n".toByteArray())
            outputStream.write("Adm No     : ${receipt.admNo}\n".toByteArray())
            outputStream.write("Class      : ${receipt.studentClass}\n".toByteArray())
            outputStream.write("Mode       : ${receipt.paymentMode}\n".toByteArray())
            outputStream.write(divider.toByteArray())

            // Line items header
            val colTitleWidth = width - 11 // leave 11 characters for amount: " 9999999.00"
            val itemHeader = String.format("%-${colTitleWidth}s %10s\n", "Description", "Amount")
            outputStream.write(BOLD_ON)
            outputStream.write(itemHeader.toByteArray())
            outputStream.write(BOLD_OFF)
            outputStream.write(divider.toByteArray())

            // Line items
            for (item in receipt.items) {
                val desc = item.title.take(colTitleWidth)
                val line = String.format("%-${colTitleWidth}s %10.2f\n", desc, item.amount)
                outputStream.write(line.toByteArray())
            }
            outputStream.write(divider.toByteArray())

            // Total
            outputStream.write(BOLD_ON)
            val totalLine = String.format("%-${colTitleWidth}s %10.2f\n", "TOTAL PAID (INR)", receipt.totalAmount)
            outputStream.write(totalLine.toByteArray())
            outputStream.write(BOLD_OFF)
            outputStream.write(divider.toByteArray())

            // Footer
            outputStream.write(ALIGN_CENTER)
            outputStream.write("Collector: ${receipt.collectorName}\n".toByteArray())
            outputStream.write("Status: VERIFIED & CONFIRMED\n".toByteArray())
            outputStream.write("Thank you for your timely payment!\n\n\n\n".toByteArray())

            // Paper Cut Command (GS V 66 0)
            outputStream.write(byteArrayOf(GS, 'V'.code.toByte(), 66, 0))
            outputStream.flush()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        } finally {
            try {
                outputStream?.close()
                socket?.close()
            } catch (_: Exception) {}
        }
    }

    @SuppressLint("MissingPermission")
    suspend fun testPrint(
        device: BluetoothDevice,
        paperWidth: PrinterPaperWidth = PrinterPaperWidth.WIDTH_58MM
    ): Boolean = withContext(Dispatchers.IO) {
        val sampleReceipt = ReceiptData(
            receiptNo = "TEST-REC-001",
            date = SimpleDateFormat("dd-MMM-yyyy HH:mm", Locale.getDefault()).format(Date()),
            studentName = "Sample Student (Test)",
            admNo = "TEST-01",
            studentClass = "Class 7",
            items = listOf(
                ReceiptItem("Test Tuition Fee", 200.0),
                ReceiptItem("Test Examination Fee", 50.0)
            ),
            totalAmount = 250.0,
            collectorName = "System Admin",
            paymentMode = "CASH (TEST)"
        )
        printReceipt(device, sampleReceipt, paperWidth)
    }
}
