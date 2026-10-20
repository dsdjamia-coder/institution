package org.noorulislam.app.printer

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.OutputStream
import java.text.SimpleDateFormat
import java.util.*

data class ReceiptData(
    val receiptNo: String,
    val date: String,
    val studentName: String,
    val admNo: String,
    val studentClass: String,
    val items: List<ReceiptItem>,
    val totalAmount: Double,
    val collectorName: String
)

data class ReceiptItem(
    val title: String,
    val amount: Double
)

class BluetoothPrinterService {
    private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    @SuppressLint("MissingPermission")
    suspend fun printReceipt(device: BluetoothDevice, receipt: ReceiptData): Boolean = withContext(Dispatchers.IO) {
        var socket: BluetoothSocket? = null
        var outputStream: OutputStream? = null
        try {
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
            socket.connect()
            outputStream = socket.outputStream

            // ESC/POS Commands
            val ESC = 0x1B.toByte()
            val GS = 0x1D.toByte()
            val INIT = byteArrayOf(ESC, '@'.code.toByte())
            val ALIGN_CENTER = byteArrayOf(ESC, 'a'.code.toByte(), 1)
            val ALIGN_LEFT = byteArrayOf(ESC, 'a'.code.toByte(), 0)
            val BOLD_ON = byteArrayOf(ESC, 'E'.code.toByte(), 1)
            val BOLD_OFF = byteArrayOf(ESC, 'E'.code.toByte(), 0)
            val FEED_LINE = byteArrayOf(0x0A.toByte())

            outputStream.write(INIT)
            
            // Header
            outputStream.write(ALIGN_CENTER)
            outputStream.write(BOLD_ON)
            outputStream.write("NOORUL ISLAM MADRASA\n".toByteArray())
            outputStream.write(BOLD_OFF)
            outputStream.write("Fee Collection Receipt\n".toByteArray())
            outputStream.write("--------------------------------\n".toByteArray())

            // Metadata
            outputStream.write(ALIGN_LEFT)
            outputStream.write("Receipt No: ${receipt.receiptNo}\n".toByteArray())
            outputStream.write("Date: ${receipt.date}\n".toByteArray())
            outputStream.write("Student: ${receipt.studentName}\n".toByteArray())
            outputStream.write("Adm No: ${receipt.admNo} | Class: ${receipt.studentClass}\n".toByteArray())
            outputStream.write("--------------------------------\n".toByteArray())

            // Line Items
            for (item in receipt.items) {
                val line = String.format("%-20s %10.2f\n", item.title.take(20), item.amount)
                outputStream.write(line.toByteArray())
            }
            outputStream.write("--------------------------------\n".toByteArray())

            // Total
            outputStream.write(BOLD_ON)
            val totalLine = String.format("%-20s %10.2f\n", "TOTAL PAID (INR):", receipt.totalAmount)
            outputStream.write(totalLine.toByteArray())
            outputStream.write(BOLD_OFF)

            // Footer
            outputStream.write(ALIGN_CENTER)
            outputStream.write("\nCollector: ${receipt.collectorName}\n".toByteArray())
            outputStream.write("Thank you!\n\n\n".toByteArray())

            // Cut paper command (GS V 66 0)
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
}
