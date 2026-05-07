package org.mochios.chat

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.runBlocking
import org.mochios.android.auth.SessionManager
import org.mochios.android.i18n.FormatProvider
import org.mochios.android.i18n.PreferencesManager
import org.mochios.android.ui.AppBootstrapHost
import org.mochios.android.ui.theme.MochiTheme
import org.mochios.chat.navigation.ChatNavigation
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var sessionManager: SessionManager
    @Inject lateinit var preferencesManager: PreferencesManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleOAuthIntent(intent)
        val startEntityId = intent?.getStringExtra("entityId")
        setContent {
            val themeAnchors by sessionManager.themeAnchors.collectAsState(initial = null)
            MochiTheme(themeAnchors = themeAnchors) {
                FormatProvider(manager = preferencesManager) {
                    AppBootstrapHost(
                        appName = "chat",
                        oauthScheme = "mochi-chat",
                        onLocaleChangeRequested = { recreate() }
                    ) { onLogout ->
                        ChatNavigation(
                            startEntityId = startEntityId,
                            onLogout = onLogout
                        )
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleOAuthIntent(intent)
    }

    private fun handleOAuthIntent(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "mochi-chat" || data.host != "oauth-return") return
        val code = data.getQueryParameter("code")
        val error = data.getQueryParameter("error")
        if (code == null && error == null) return
        runBlocking { sessionManager.setOAuthReturn(code, error) }
    }
}
