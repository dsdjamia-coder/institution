import SwiftUI
import FirebaseCore

@main
struct NoorulIslamApp: App {
    init() {
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
