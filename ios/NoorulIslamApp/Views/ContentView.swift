import SwiftUI

struct ContentView: View {
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeOverviewView()
                .tabItem {
                    Label("Home", systemImage: "house.fill")
                }
                .tag(0)

            CollectionDeskView()
                .tabItem {
                    Label("Collection", systemImage: "indianrupeesign.circle.fill")
                }
                .tag(1)

            StudentPortalView()
                .tabItem {
                    Label("Student", systemImage: "person.crop.circle.fill")
                }
                .tag(2)

            Text("Academic Results & TC")
                .tabItem {
                    Label("Results", systemImage: "doc.text.fill")
                }
                .tag(3)
        }
        .tint(Color(red: 0.06, green: 0.09, blue: 0.16))
    }
}

struct HomeOverviewView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("NOORUL ISLAM MADRASA")
                            .font(.headline)
                            .fontWeight(.heavy)
                            .foregroundColor(.white)
                        Text("Higher Secondary Madrasa Management System")
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.8))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(20)
                    .background(Color(red: 0.06, green: 0.09, blue: 0.16))
                    .cornerRadius(16)

                    HStack(spacing: 12) {
                        NavigationLink(destination: CollectionDeskView()) {
                            Text("Fee Collection")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.blue)
                                .foregroundColor(.white)
                                .cornerRadius(12)
                        }

                        NavigationLink(destination: StudentPortalView()) {
                            Text("Student Portal")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color(.systemGray6))
                                .foregroundColor(.primary)
                                .cornerRadius(12)
                        }
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Real-time Statistics")
                            .font(.subheadline)
                            .fontWeight(.bold)
                        HStack {
                            Text("Total Students: 480")
                                .font(.footnote)
                            Spacer()
                            Text("Staff Members: 24")
                                .font(.footnote)
                        }
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color(.systemBackground))
                    .cornerRadius(12)
                    .shadow(color: Color.black.opacity(0.05), radius: 5, x: 0, y: 2)
                }
                .padding()
            }
            .navigationTitle("Dashboard")
        }
    }
}
