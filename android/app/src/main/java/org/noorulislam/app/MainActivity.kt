package org.noorulislam.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import org.noorulislam.app.ui.screens.CollectionScreen
import org.noorulislam.app.ui.screens.HomeScreen
import org.noorulislam.app.ui.screens.StudentPortalScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            NoorulIslamAppTheme {
                MainAppNavigation()
            }
        }
    }
}

@Composable
fun NoorulIslamAppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = androidx.compose.ui.graphics.Color(0xFF0F172A),
            secondary = androidx.compose.ui.graphics.Color(0xFF2563EB),
            background = androidx.compose.ui.graphics.Color(0xFFF8FAFC),
            surface = androidx.compose.ui.graphics.Color.White
        ),
        content = content
    )
}

@Composable
fun MainAppNavigation() {
    val navController = rememberNavController()
    var selectedItem by remember { mutableIntStateOf(0) }
    val items = listOf("Home", "Collection", "Student", "Results")

    Scaffold(
        bottomBar = {
            NavigationBar {
                items.forEachIndexed { index, item ->
                    NavigationBarItem(
                        icon = {
                            when (index) {
                                0 -> Icon(Icons.Default.Home, contentDescription = item)
                                1 -> Icon(Icons.Default.ShoppingCart, contentDescription = item)
                                2 -> Icon(Icons.Default.Person, contentDescription = item)
                                else -> Icon(Icons.Default.DateRange, contentDescription = item)
                            }
                        },
                        label = { Text(item) },
                        selected = selectedItem == index,
                        onClick = {
                            selectedItem = index
                            when (index) {
                                0 -> navController.navigate("home")
                                1 -> navController.navigate("collection")
                                2 -> navController.navigate("student")
                                3 -> navController.navigate("results")
                            }
                        }
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = "home",
            modifier = Modifier.padding(innerPadding)
        ) {
            composable("home") { HomeScreen(onNavigate = { route -> navController.navigate(route) }) }
            composable("collection") { CollectionScreen() }
            composable("student") { StudentPortalScreen() }
            composable("results") { /* Result screen */ }
        }
    }
}
