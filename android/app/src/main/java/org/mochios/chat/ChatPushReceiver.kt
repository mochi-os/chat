package org.mochios.chat

import android.content.Context
import android.net.Uri
import org.mochios.android.push.MochiPushReceiver

class ChatPushReceiver : MochiPushReceiver() {

    override fun channelId(context: Context, instance: String): String =
        ChatApplication.NOTIFICATION_CHANNEL_ID

    override fun deepLinkFor(context: Context, instance: String, link: String): Uri =
        Uri.parse("mochi-chat://notification")
            .buildUpon()
            .appendQueryParameter("link", link)
            .build()
}
