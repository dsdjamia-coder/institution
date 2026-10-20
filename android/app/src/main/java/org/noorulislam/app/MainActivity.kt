package org.noorulislam.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import org.noorulislam.app.ui.screens.CollectionScreen
import org.noorulislam.app.ui.screens.HomeScreen
import org.noorulislam.app.ui.screens.StudentPortalScreen

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            NoorulIslamAppTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    NoorulIslamNavigationApp()
                }
            }
        }
    }
}

@Composable
fun NoorulIslamNavigationApp() {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = "home"
    ) {
        composable("home") {
            HomeScreen(
                onNavigateToStudent = { studentId ->
                    navController.navigate("student/$studentId")
                }
            )
        }

        composable("collection") {
            CollectionScreen(
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable(
            route = "student/{studentId}",
            arguments = listOf(
                navArgument("studentId") {
                    type = NavType.StringType
                    defaultValue = "std_default"
                }
            )
        ) { backStackEntry ->
            val studentId = backStackEntry.arguments?.getString("studentId") ?: "std_default"
            StudentPortalScreen(
                studentId = studentId,
                onNavigateBack = {
                    navController.popBackStack()
                },
                onSwitchStudent = { targetStudentId ->
                    navController.navigate("student/$targetStudentId") {
                        popUpTo("home")
                    }
                }
            )
        }
    }
}

@Composable
fun NoorulIslamAppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        content = content
    )
}
