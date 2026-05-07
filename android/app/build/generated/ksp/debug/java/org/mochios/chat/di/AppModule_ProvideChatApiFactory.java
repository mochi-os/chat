package org.mochios.chat.di;

import com.google.gson.Gson;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;
import okhttp3.OkHttpClient;
import org.mochios.android.auth.SessionManager;
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
public final class AppModule_ProvideChatApiFactory implements Factory<ChatApi> {
  private final Provider<OkHttpClient> okHttpClientProvider;

  private final Provider<Gson> gsonProvider;

  private final Provider<SessionManager> sessionManagerProvider;

  public AppModule_ProvideChatApiFactory(Provider<OkHttpClient> okHttpClientProvider,
      Provider<Gson> gsonProvider, Provider<SessionManager> sessionManagerProvider) {
    this.okHttpClientProvider = okHttpClientProvider;
    this.gsonProvider = gsonProvider;
    this.sessionManagerProvider = sessionManagerProvider;
  }

  @Override
  public ChatApi get() {
    return provideChatApi(okHttpClientProvider.get(), gsonProvider.get(), sessionManagerProvider.get());
  }

  public static AppModule_ProvideChatApiFactory create(Provider<OkHttpClient> okHttpClientProvider,
      Provider<Gson> gsonProvider, Provider<SessionManager> sessionManagerProvider) {
    return new AppModule_ProvideChatApiFactory(okHttpClientProvider, gsonProvider, sessionManagerProvider);
  }

  public static ChatApi provideChatApi(OkHttpClient okHttpClient, Gson gson,
      SessionManager sessionManager) {
    return Preconditions.checkNotNullFromProvides(AppModule.INSTANCE.provideChatApi(okHttpClient, gson, sessionManager));
  }
}
