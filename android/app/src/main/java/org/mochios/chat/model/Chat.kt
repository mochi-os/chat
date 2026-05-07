package org.mochios.chat.model

import com.google.gson.annotations.SerializedName

data class Chat(
    val id: String = "",
    val fingerprint: String = "",
    val identity: String = "",
    val key: String = "",
    val name: String = "",
    val updated: Long = 0,
    val members: Int = 0,
    val other: String = "",
    val left: Int = 0
)

data class ChatMember(
    val id: String = "",
    val name: String = ""
)

data class ChatDetail(
    val id: String = "",
    val fingerprint: String = "",
    val identity: String = "",
    val key: String = "",
    val name: String = "",
    val updated: Long = 0,
    val members: List<ChatMember> = emptyList(),
    val left: Int = 0
)

data class ChatViewResponse(
    val chat: ChatDetail = ChatDetail(),
    val identity: String = ""
)

data class ChatMessageAttachment(
    val id: String = "",
    val name: String = "",
    val size: Long = 0,
    @SerializedName("content_type") val contentType: String = "",
    val rank: Int = 0,
    val created: Long = 0
)

data class ChatMessage(
    val id: String = "",
    val chat: String = "",
    val member: String = "",
    val name: String = "",
    val body: String = "",
    val created: Long = 0,
    val attachments: List<ChatMessageAttachment> = emptyList()
)

data class Friend(
    val id: String = "",
    val identity: String = "",
    val name: String = "",
    @SerializedName("class") val klass: String = "",
    val chatId: String = ""
)
