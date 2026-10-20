import SwiftUI

struct StudentPortalView: View {
    @State private var studentName = "Mohammed Irfan"
    @State private var admNo = "2024-0142"
    @State private var studentClass = "Class 7"
    @State private var pendingDue = "INR 450.00"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Active Student")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(studentName)
                            .font(.title2)
                            .fontWeight(.bold)
                        Text("Adm No: \(admNo) • \(studentClass)")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Color(.systemBackground))
                    .cornerRadius(14)
                    .shadow(color: Color.black.opacity(0.04), radius: 5, x: 0, y: 2)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Outstanding Dues")
                            .font(.subheadline)
                            .foregroundColor(.red)
                        Text(pendingDue)
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(.red)
                        
                        Button(action: {
                            // View details
                        }) {
                            Text("View Itemized Ledger")
                                .font(.footnote)
                                .fontWeight(.semibold)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                                .background(Color.red)
                                .foregroundColor(.white)
                                .cornerRadius(8)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Color.red.opacity(0.08))
                    .cornerRadius(14)

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Recent Receipts")
                            .font(.headline)
                        
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Receipt #REC-2025-0891")
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                Text("15-Mar-2026 • Monthly Tuition")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Text("INR 200.00")
                                .font(.subheadline)
                                .fontWeight(.bold)
                        }
                        .padding()
                        .background(Color(.systemBackground))
                        .cornerRadius(10)
                        .shadow(color: Color.black.opacity(0.02), radius: 4, x: 0, y: 1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding()
            }
            .navigationTitle("Student Portal")
        }
    }
}
