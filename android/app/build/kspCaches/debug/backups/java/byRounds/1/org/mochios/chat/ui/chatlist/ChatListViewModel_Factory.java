package org.mochios.chat.ui.chatlist;

import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;
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
public final class ChatListViewModel_Factory implements Factory<ChatListViewModel> {
  private final Provider<ChatRepository> repositoryProvider;

  public ChatListViewModel_Factory(Provider<ChatRepository> repositoryProvider) {
    this.repositoryProvider = repositoryProvider;
  }

  @Override
  public ChatListViewModel get() {
    return newInstance(repositoryProvider.get());
  }

  public static ChatListViewModel_Factory create(Provider<ChatRepository> repositoryProvider) {
    return new ChatListViewModel_Factory(repositoryProvider);
  }

  public static ChatListViewModel newInstance(ChatRepository repository) {
    return new ChatListViewModel(repository);
  }
}
