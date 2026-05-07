package org.mochios.chat.ui.newchat;

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
public final class NewChatViewModel_Factory implements Factory<NewChatViewModel> {
  private final Provider<ChatRepository> repositoryProvider;

  public NewChatViewModel_Factory(Provider<ChatRepository> repositoryProvider) {
    this.repositoryProvider = repositoryProvider;
  }

  @Override
  public NewChatViewModel get() {
    return newInstance(repositoryProvider.get());
  }

  public static NewChatViewModel_Factory create(Provider<ChatRepository> repositoryProvider) {
    return new NewChatViewModel_Factory(repositoryProvider);
  }

  public static NewChatViewModel newInstance(ChatRepository repository) {
    return new NewChatViewModel(repository);
  }
}
