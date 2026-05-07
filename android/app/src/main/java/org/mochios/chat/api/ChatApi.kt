package org.mochios.chat.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import org.mochios.android.api.ApiResponse
import org.mochios.chat.model.Chat
import org.mochios.chat.model.ChatMember
import org.mochios.chat.model.ChatMessage
import org.mochios.chat.model.ChatViewResponse
import org.mochios.chat.model.Friend
import retrofit2.Response
import retrofit2.http.Field
import retrofit2.http.FormUrlEncoded
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

data class CreateChatResponse(
    val id: String = "",
    val fingerprint: String = "",
    val name: String = "",
    val members: List<ChatMember> = emptyList()
)

data class NewChatResponse(
    val name: String = "",
    val friends: List<Friend> = emptyList()
)

data class MessageListResponse(
    val messages: List<ChatMessage> = emptyList(),
    val hasMore: Boolean = false,
    val nextCursor: Long? = null
)

data class SendMessageResponse(val id: String = "")

data class MemberListResponse(val members: List<ChatMember> = emptyList())

data class MemberAddResponse(
    val success: Boolean = false,
    val member: ChatMember = ChatMember()
)

data class SuccessResponse(val success: Boolean = false)

interface ChatApi {

    @GET("-/list")
    suspend fun listChats(): Response<ApiResponse<List<Chat>>>

    @GET("-/new")
    suspend fun getNewChatData(): Response<ApiResponse<NewChatResponse>>

    @FormUrlEncoded
    @POST("-/create")
    suspend fun createChat(
        @Field("name") name: String,
        @Field("members") members: String?
    ): Response<ApiResponse<CreateChatResponse>>

    @GET("{chatId}/-/view")
    suspend fun viewChat(@Path("chatId") chatId: String): Response<ApiResponse<ChatViewResponse>>

    @GET("{chatId}/-/messages")
    suspend fun getMessages(
        @Path("chatId") chatId: String,
        @Query("before") before: Long? = null,
        @Query("limit") limit: Int? = null
    ): Response<ApiResponse<MessageListResponse>>

    @FormUrlEncoded
    @POST("{chatId}/-/send")
    suspend fun sendMessage(
        @Path("chatId") chatId: String,
        @Field("body") body: String
    ): Response<ApiResponse<SendMessageResponse>>

    @Multipart
    @POST("{chatId}/-/send")
    suspend fun sendMessageWithFiles(
        @Path("chatId") chatId: String,
        @Part("body") body: RequestBody,
        @Part files: List<MultipartBody.Part>
    ): Response<ApiResponse<SendMessageResponse>>

    @GET("{chatId}/-/members")
    suspend fun getMembers(@Path("chatId") chatId: String): Response<ApiResponse<MemberListResponse>>

    @FormUrlEncoded
    @POST("{chatId}/-/rename")
    suspend fun renameChat(
        @Path("chatId") chatId: String,
        @Field("name") name: String
    ): Response<ApiResponse<SuccessResponse>>

    @FormUrlEncoded
    @POST("{chatId}/-/leave")
    suspend fun leaveChat(
        @Path("chatId") chatId: String,
        @Field("delete") delete: String?
    ): Response<ApiResponse<SuccessResponse>>

    @POST("{chatId}/-/delete")
    suspend fun deleteChat(@Path("chatId") chatId: String): Response<ApiResponse<SuccessResponse>>

    @FormUrlEncoded
    @POST("{chatId}/-/member_add")
    suspend fun addMember(
        @Path("chatId") chatId: String,
        @Field("member") member: String
    ): Response<ApiResponse<MemberAddResponse>>

    @FormUrlEncoded
    @POST("{chatId}/-/member_remove")
    suspend fun removeMember(
        @Path("chatId") chatId: String,
        @Field("member") member: String
    ): Response<ApiResponse<SuccessResponse>>
}
