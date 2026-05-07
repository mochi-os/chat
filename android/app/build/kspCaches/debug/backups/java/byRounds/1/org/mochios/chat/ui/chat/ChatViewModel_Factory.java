package org.mochios.chat.ui.chat;

import androidx.lifecycle.SavedStateHandle;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;
import org.mochios.android.auth.SessionManager;
import org.mochios.android.websocket.MochiWebSocket;
import org.mochios.chat.repository.ChatRepository;

@ScopeMetadata
@QualifierMetadata
@DaggerGenerated
@Generated(
    value = "dagger.internal.codegen.ComponentProcessor",
    comments = "https://dagger.dev"
)
@SuppressWarnings({
    "unchecked",
    "rawtypes",
    "KotlinInternal",
    "KotlinInternalInJava",
    "cast",
    "deprecation"
})
public final class ChatViewModel_Factory implements Factory<ChatViewModel> {
  private final Provider<SavedStateHandle> savedStateHandleProvider;

  private final Provider<ChatRepository> repositoryProvider;

  private final Provider<MochiWebSocket> webSocketProvider;

  private final Provider<SessionManager> sessionManagerProvider;

  public ChatViewModel_Factory(Provider<SavedStateHandle> savedStateHandleProvider,
      Provider<ChatRepository> repositoryProvider, Provider<MochiWebSocket> webSocketProvider,
      Provider<SessionManager> sessionManagerProvider) {
    this.savedStateHandleProvider = savedStateHandleProvider;
    this.repositoryProvider = repositoryProvider;
    this.webSocketProvider = webSocketProvider;
    this.sessionManagerProvider = sessionManagerProvider;
  }

  @Override
  public ChatViewModel get() {
    return newInstance(savedStateHandleProvider.get(), repositoryProvider.get(), webSocketProvider.get(), sessionManagerProvider.get());
  }

  public static ChatViewModel_Factory create(Provider<SavedStateHandle> savedStateHandleProvider,
      Provider<ChatRepository> repositoryProvider, Provider<MochiWebSocket> webSocketProvider,
      Provider<SessionManager> sessionManagerProvider) {
    return new ChatViewModel_Factory(savedStateHandleProvider, repositoryProvider, webSocketProvider, sessionManagerProvider);
  }

  public static ChatViewModel newInstance(SavedStateHandle savedStateHandle,
      ChatRepository repository, MochiWebSocket webSocket, SessionManager sessionManager) {
    return new ChatViewModel(savedStateHandle, repository, webSocket, sessionManager);
  }
}
