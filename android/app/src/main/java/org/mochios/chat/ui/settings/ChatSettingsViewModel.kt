package org.mochios.chat.ui.settings

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.mochios.android.api.MochiError
import org.mochios.android.api.toMochiError
import org.mochios.chat.model.ChatDetail
import org.mochios.chat.model.ChatMember
import org.mochios.chat.repository.ChatRepository
import javax.inject.Inject

data class ChatSettingsUiState(
    val chat: ChatDetail = ChatDetail(),
    val identity: String = "",
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val error: MochiError? = null,
    val leftOrDeleted: Boolean = false
)

@HiltViewModel
class ChatSettingsViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: ChatRepository
) : ViewModel() {

    private val chatId: String = savedStateHandle["chatId"] ?: ""

    private val _uiState = MutableStateFlow(ChatSettingsUiState())
    val uiState: StateFlow<ChatSettingsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val view = repository.viewChat(chatId)
                _uiState.value = _uiState.value.copy(
                    chat = view.chat,
                    identity = view.identity,
                    isLoading = false
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, error = e.toMochiError())
            }
        }
    }

    fun rename(newName: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSaving = true)
            try {
                repository.renameChat(chatId, newName)
                _uiState.value = _uiState.value.copy(
                    chat = _uiState.value.chat.copy(name = newName),
                    isSaving = false
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isSaving = false, error = e.toMochiError())
            }
        }
    }

    fun removeMember(member: ChatMember) {
        viewModelScope.launch {
            try {
                repository.removeMember(chatId, member.id)
                _uiState.value = _uiState.value.copy(
                    chat = _uiState.value.chat.copy(
                        members = _uiState.value.chat.members.filterNot { it.id == member.id }
                    )
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.toMochiError())
            }
        }
    }

    fun leave(deleteLocally: Boolean) {
        viewModelScope.launch {
            try {
                repository.leaveChat(chatId, deleteLocally)
                _uiState.value = _uiState.value.copy(leftOrDeleted = true)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.toMochiError())
            }
        }
    }

    fun deleteLocally() {
        viewModelScope.launch {
            try {
                repository.deleteChat(chatId)
                _uiState.value = _uiState.value.copy(leftOrDeleted = true)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.toMochiError())
            }
        }
    }
}
