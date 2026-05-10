package org.mochios.chat

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import dagger.hilt.android.HiltAndroidApp
import org.mochios.android.i18n.AppContext
import org.mochios.android.i18n.LanguageStore
import org.mochios.android.i18n.LocaleHelper

@HiltAndroidApp
class ChatApplication : Application() {

    override fun attachBaseContext(base: Context) {
        super.attachBaseContext(LocaleHelper.wrap(base, LanguageStore.get(base)))
    }

    override fun onCreate() {
        super.onCreate()
        AppContext.set(this)
        LocaleHelper.apply(this, LanguageStore.get(this))
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            getString(R.string.notification_channel_chat),
            NotificationManager.IMPORTANCE_DEFAULT,
        )
        nm.createNotificationChannel(channel)
    }

    companion object {
        const val NOTIFICATION_CHANNEL_ID = "chat"
    }
}
