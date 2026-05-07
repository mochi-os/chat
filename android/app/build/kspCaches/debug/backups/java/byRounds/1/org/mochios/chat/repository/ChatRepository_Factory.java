package org.mochios.chat.repository;

import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;
import org.mochios.chat.api.ChatApi;

@ScopeMetadata("javax.inject.Singleton")
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
public final class ChatRepository_Factory implements Factory<ChatRepository> {
  private final Provider<ChatApi> apiProvider;

  public ChatRepository_Factory(Provider<ChatApi> apiProvider) {
    this.apiProvider = apiProvider;
  }

  @Override
  public ChatRepository get() {
    return newInstance(apiProvider.get());
  }

  public static ChatRepository_Factory create(Provider<ChatApi> apiProvider) {
    return new ChatRepository_Factory(apiProvider);
  }

  public static ChatRepository newInstance(ChatApi api) {
    return new ChatRepository(api);
  }
}
