package org.mochios.chat.repository

import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.mochios.android.api.unwrap
import org.mochios.chat.api.ChatApi
import org.mochios.chat.api.CreateChatResponse
import org.mochios.chat.api.MemberAddResponse
import org.mochios.chat.api.MessageListResponse
import org.mochios.chat.api.NewChatResponse
import org.mochios.chat.model.Chat
import org.mochios.chat.model.ChatMember
import org.mochios.chat.model.ChatViewResponse
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChatRepository @Inject constructor(
    private val api: ChatApi
) {
    suspend fun listChats(): List<Chat> =
        api.listChats().unwrap()

    suspend fun getNewChatData(): NewChatResponse =
        api.getNewChatData().unwrap()

    suspend fun createChat(name: String, members: List<String> = emptyList()): CreateChatResponse =
        api.createChat(name, members.takeIf { it.isNotEmpty() }?.joinToString(",")).unwrap()

    suspend fun viewChat(chatId: String): ChatViewResponse =
        api.viewChat(chatId).unwrap()

    suspend fun getMessages(chatId: String, before: Long? = null, limit: Int? = null): MessageListResponse =
        api.getMessages(chatId, before, limit).unwrap()

    suspend fun sendMessage(chatId: String, body: String, files: List<File> = emptyList()): String {
        if (files.isEmpty()) {
            return api.sendMessage(chatId, body).unwrap().id
        }
        val bodyPart = body.toRequestBody("text/plain".toMediaTypeOrNull())
        val parts = files.map { file ->
            val mediaType = guessMediaType(file).toMediaTypeOrNull()
            val requestFile = file.asRequestBody(mediaType)
            MultipartBody.Part.createFormData("files", file.name, requestFile)
        }
        return api.sendMessageWithFiles(chatId, bodyPart, parts).unwrap().id
    }

    suspend fun getMembers(chatId: String): List<ChatMember> =
        api.getMembers(chatId).unwrap().members

    suspend fun renameChat(chatId: String, name: String) {
        api.renameChat(chatId, name).unwrap()
    }

    suspend fun leaveChat(chatId: String, deleteLocally: Boolean = false) {
        api.leaveChat(chatId, if (deleteLocally) "true" else null).unwrap()
    }

    suspend fun deleteChat(chatId: String) {
        api.deleteChat(chatId).unwrap()
    }

    suspend fun addMember(chatId: String, member: String): MemberAddResponse =
        api.addMember(chatId, member).unwrap()

    suspend fun removeMember(chatId: String, member: String) {
        api.removeMember(chatId, member).unwrap()
    }

    private fun guessMediaType(file: File): String {
        val ext = file.extension.lowercase()
        return when (ext) {
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "gif" -> "image/gif"
            "webp" -> "image/webp"
            "mp4" -> "video/mp4"
            "pdf" -> "application/pdf"
            else -> "application/octet-stream"
        }
    }
}
