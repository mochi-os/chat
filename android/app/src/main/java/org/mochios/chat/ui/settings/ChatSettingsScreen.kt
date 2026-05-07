package org.mochios.chat.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.mochios.android.api.userMessage
import org.mochios.android.ui.components.ConfirmDialog
import org.mochios.chat.R
import org.mochios.chat.model.ChatMember
import org.mochios.android.R as MochiR

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatSettingsScreen(
    onBack: () -> Unit,
    onChatLeft: () -> Unit,
    viewModel: ChatSettingsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var nameDraft by remember(uiState.chat.id) { mutableStateOf(uiState.chat.name) }
    var memberToRemove by remember { mutableStateOf<ChatMember?>(null) }
    var showLeaveDialog by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }

    LaunchedEffect(uiState.chat.name) {
        if (nameDraft.isEmpty()) nameDraft = uiState.chat.name
    }

    LaunchedEffect(uiState.leftOrDeleted) {
        if (uiState.leftOrDeleted) onChatLeft()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.chat_settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(MochiR.string.common_back)
                        )
                    }
                }
            )
        }
    ) { padding ->
        when {
            uiState.isLoading -> {
                Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            uiState.error != null && uiState.chat.id.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    Text(
                        text = uiState.error!!.userMessage(),
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    item {
                        Text(
                            text = stringResource(R.string.chat_settings_rename),
                            style = MaterialTheme.typography.titleMedium
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = nameDraft,
                            onValueChange = { nameDraft = it },
                            label = { Text(stringResource(R.string.chat_settings_rename_label)) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedButton(
                            onClick = { viewModel.rename(nameDraft) },
                            enabled = nameDraft.isNotBlank() &&
                                nameDraft != uiState.chat.name &&
                                !uiState.isSaving
                        ) {
                            Text(stringResource(R.string.chat_settings_save))
                        }
                    }

                    item {
                        Text(
                            text = stringResource(R.string.chat_settings_members),
                            style = MaterialTheme.typography.titleMedium
                        )
                    }

                    if (uiState.chat.members.isEmpty()) {
                        item {
                            Text(
                                text = stringResource(R.string.chat_members_empty),
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else {
                        items(uiState.chat.members, key = { it.id }) { member ->
                            MemberRow(
                                member = member,
                                isMe = member.id == uiState.identity,
                                canRemove = uiState.chat.left == 0 && member.id != uiState.identity,
                                onRemove = { memberToRemove = member }
                            )
                        }
                    }

                    item {
                        Spacer(modifier = Modifier.height(16.dp))
                        if (uiState.chat.left == 0) {
                            OutlinedButton(
                                onClick = { showLeaveDialog = true },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(
                                    Icons.AutoMirrored.Filled.Logout,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(stringResource(R.string.chat_settings_leave))
                            }
                        } else {
                            Button(
                                onClick = { showDeleteDialog = true },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.errorContainer,
                                    contentColor = MaterialTheme.colorScheme.onErrorContainer
                                ),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(
                                    Icons.Default.Delete,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(stringResource(R.string.chat_settings_delete))
                            }
                        }
                    }
                }
            }
        }
    }

    val removeTitle = stringResource(R.string.chat_settings_remove_member_title)
    val removeMessageTemplate = stringResource(R.string.chat_settings_remove_member_message)
    val removeLabel = stringResource(R.string.chat_settings_remove_member)
    val cancelLabel = stringResource(MochiR.string.common_cancel)

    memberToRemove?.let { member ->
        ConfirmDialog(
            title = removeTitle,
            message = removeMessageTemplate.format(member.name),
            confirmLabel = removeLabel,
            dismissLabel = cancelLabel,
            isDestructive = true,
            onConfirm = {
                viewModel.removeMember(member)
                memberToRemove = null
            },
            onDismiss = { memberToRemove = null }
        )
    }

    if (showLeaveDialog) {
        ConfirmDialog(
            title = stringResource(R.string.chat_settings_leave_title),
            message = stringResource(R.string.chat_settings_leave_message),
            confirmLabel = stringResource(R.string.chat_settings_leave),
            dismissLabel = cancelLabel,
            isDestructive = true,
            onConfirm = {
                showLeaveDialog = false
                viewModel.leave(deleteLocally = false)
            },
            onDismiss = { showLeaveDialog = false }
        )
    }

    if (showDeleteDialog) {
        ConfirmDialog(
            title = stringResource(R.string.chat_settings_delete_title),
            message = stringResource(R.string.chat_settings_delete_message),
            confirmLabel = stringResource(R.string.chat_settings_delete),
            dismissLabel = cancelLabel,
            isDestructive = true,
            onConfirm = {
                showDeleteDialog = false
                viewModel.deleteLocally()
            },
            onDismiss = { showDeleteDialog = false }
        )
    }
}

@Composable
private fun MemberRow(
    member: ChatMember,
    isMe: Boolean,
    canRemove: Boolean,
    onRemove: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Default.Person,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(text = member.name, style = MaterialTheme.typography.bodyLarge)
            if (isMe) {
                Text(
                    text = stringResource(R.string.chat_members_you),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        if (canRemove) {
            IconButton(onClick = onRemove) {
                Icon(
                    Icons.Default.Delete,
                    contentDescription = stringResource(R.string.chat_settings_remove_member),
                    tint = MaterialTheme.colorScheme.error
                )
            }
        }
    }
}
