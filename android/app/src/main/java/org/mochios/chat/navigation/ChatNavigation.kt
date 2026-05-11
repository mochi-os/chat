package org.mochios.chat.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import org.mochios.android.push.PendingDeepLink
import org.mochios.chat.ui.chat.ChatScreen
import org.mochios.chat.ui.chatlist.ChatListScreen
import org.mochios.chat.ui.newchat.NewChatScreen
import org.mochios.chat.ui.settings.ChatSettingsScreen

object Routes {
    const val CHAT_LIST = "chatList"
    const val CHAT = "chat/{chatId}"
    const val NEW_CHAT = "newChat"
    const val CHAT_SETTINGS = "chat/{chatId}/settings"

    fun chat(chatId: String) = "chat/$chatId"
    fun chatSettings(chatId: String) = "chat/$chatId/settings"
}

@Composable
fun ChatNavigation(startEntityId: String? = null, onLogout: () -> Unit) {
    val navController = rememberNavController()
    val startDestination = if (startEntityId != null) Routes.chat(startEntityId) else Routes.CHAT_LIST

    // Notification tap → MainActivity stuffed the target path into PendingDeepLink.
    // Parse the second path segment as the chat id and navigate.
    val pendingLink by PendingDeepLink.link.collectAsState()
    LaunchedEffect(pendingLink) {
        val link = pendingLink ?: return@LaunchedEffect
        val chatId = link.trim('/').split('/').getOrNull(1)
        if (!chatId.isNullOrBlank()) {
            navController.navigate(Routes.chat(chatId)) {
                launchSingleTop = true
            }
        }
        PendingDeepLink.consume()
    }

    NavHost(navController = navController, startDestination = startDestination) {
        composable(Routes.CHAT_LIST) {
            ChatListScreen(
                onChatClick = { chatId -> navController.navigate(Routes.chat(chatId)) },
                onNewChat = { navController.navigate(Routes.NEW_CHAT) },
                onLogout = onLogout
            )
        }

        composable(
            route = Routes.CHAT,
            arguments = listOf(navArgument("chatId") { type = NavType.StringType }),
            deepLinks = listOf(
                navDeepLink { uriPattern = "https://{host}/chat/{chatId}" }
            )
        ) {
            ChatScreen(
                onBack = { navController.popBackStack() },
                onSettings = { chatId -> navController.navigate(Routes.chatSettings(chatId)) }
            )
        }

        composable(Routes.NEW_CHAT) {
            NewChatScreen(
                onBack = { navController.popBackStack() },
                onChatCreated = { chatId ->
                    navController.popBackStack()
                    navController.navigate(Routes.chat(chatId))
                }
            )
        }

        composable(
            route = Routes.CHAT_SETTINGS,
            arguments = listOf(navArgument("chatId") { type = NavType.StringType })
        ) {
            ChatSettingsScreen(
                onBack = { navController.popBackStack() },
                onChatLeft = {
                    navController.popBackStack(Routes.CHAT_LIST, inclusive = false)
                }
            )
        }
    }
}
