import SwiftUI

struct CollectionDeskView: View {
    @State private var searchText = ""
    @State private var selectedClass = "All Classes"
    @State private var paymentAmount = "200"
    @State private var showingThermalSuccess = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.gray)
                        TextField("Search Name or Adm No...", text: $searchText)
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(12)

                    VStack(alignment: .leading, spacing: 14) {
                        Text("Quick Fee Entry")
                            .font(.headline)
                        
                        TextField("Payment Amount (INR)", text: $paymentAmount)
                            .keyboardType(.decimalPad)
                            .padding()
                            .background(Color(.systemBackground))
                            .cornerRadius(10)
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.gray.opacity(0.3), lineWidth: 1))

                        HStack(spacing: 12) {
                            Button(action: {
                                // Record Payment Action
                            }) {
                                Text("Record Payment")
                                    .fontWeight(.semibold)
                                    .frame(maxWidth: .infinity)
                                    .padding()
                                    .background(Color.blue)
                                    .foregroundColor(.white)
                                    .cornerRadius(10)
                            }

                            Button(action: {
                                showingThermalSuccess = true
                            }) {
                                Label("Thermal", systemImage: "printer.fill")
                                    .fontWeight(.semibold)
                                    .padding()
                                    .background(Color(.systemGray5))
                                    .foregroundColor(.primary)
                                    .cornerRadius(10)
                            }
                        }
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color(.systemBackground))
                    .cornerRadius(16)
                    .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 3)
                }
                .padding()
            }
            .navigationTitle("Fee Collection")
            .alert("Thermal Receipt Sent", isPresented: $showingThermalSuccess) {
                Button("OK", role: .cancel) { }
            } message: {
                Text("Receipt data was sent to the Bluetooth thermal printer.")
            }
        }
    }
}
