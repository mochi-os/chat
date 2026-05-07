package org.mochios.chat.ui.newchat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.mochios.android.api.MochiError
import org.mochios.android.api.toMochiError
import org.mochios.chat.model.Friend
import org.mochios.chat.repository.ChatRepository
import javax.inject.Inject

data class NewChatUiState(
    val friends: List<Friend> = emptyList(),
    val selected: Set<String> = emptySet(),
    val groupName: String = "",
    val searchQuery: String = "",
    val isLoading: Boolean = false,
    val isCreating: Boolean = false,
    val error: MochiError? = null,
    val createdChatId: String? = null
)

@HiltViewModel
class NewChatViewModel @Inject constructor(
    private val repository: ChatRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(NewChatUiState())
    val uiState: StateFlow<NewChatUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val data = repository.getNewChatData()
                _uiState.value = _uiState.value.copy(
                    friends = data.friends,
                    isLoading = false
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, error = e.toMochiError())
            }
        }
    }

    fun toggleSelect(friendId: String) {
        val current = _uiState.value.selected
        _uiState.value = _uiState.value.copy(
            selected = if (friendId in current) current - friendId else current + friendId
        )
    }

    fun updateGroupName(name: String) {
        _uiState.value = _uiState.value.copy(groupName = name)
    }

    fun updateSearchQuery(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
    }

    fun filteredFriends(): List<Friend> {
        val query = _uiState.value.searchQuery.lowercase().trim()
        if (query.isEmpty()) return _uiState.value.friends
        return _uiState.value.friends.filter { it.name.lowercase().contains(query) }
    }

    fun createChat(fallbackName: String) {
        viewModelScope.launch {
            val state = _uiState.value
            if (state.selected.isEmpty()) return@launch
            _uiState.value = state.copy(isCreating = true, error = null)
            try {
                val chosenName = state.groupName.ifBlank { fallbackName }
                val response = repository.createChat(chosenName, state.selected.toList())
                _uiState.value = _uiState.value.copy(
                    isCreating = false,
                    createdChatId = response.fingerprint.ifEmpty { response.id }
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isCreating = false, error = e.toMochiError())
            }
        }
    }

    fun consumeCreatedChat() {
        _uiState.value = _uiState.value.copy(createdChatId = null)
    }

    fun openExistingChat(chatId: String) {
        _uiState.value = _uiState.value.copy(createdChatId = chatId)
    }
}
