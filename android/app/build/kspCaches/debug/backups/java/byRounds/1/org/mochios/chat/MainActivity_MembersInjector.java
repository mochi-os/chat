package org.mochios.chat;

import dagger.MembersInjector;
import dagger.internal.DaggerGenerated;
import dagger.internal.InjectedFieldSignature;
import dagger.internal.QualifierMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;
import org.mochios.android.auth.SessionManager;
import org.mochios.android.i18n.PreferencesManager;

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
public final class MainActivity_MembersInjector implements MembersInjector<MainActivity> {
  private final Provider<SessionManager> sessionManagerProvider;

  private final Provider<PreferencesManager> preferencesManagerProvider;

  public MainActivity_MembersInjector(Provider<SessionManager> sessionManagerProvider,
      Provider<PreferencesManager> preferencesManagerProvider) {
    this.sessionManagerProvider = sessionManagerProvider;
    this.preferencesManagerProvider = preferencesManagerProvider;
  }

  public static MembersInjector<MainActivity> create(
      Provider<SessionManager> sessionManagerProvider,
      Provider<PreferencesManager> preferencesManagerProvider) {
    return new MainActivity_MembersInjector(sessionManagerProvider, preferencesManagerProvider);
  }

  @Override
  public void injectMembers(MainActivity instance) {
    injectSessionManager(instance, sessionManagerProvider.get());
    injectPreferencesManager(instance, preferencesManagerProvider.get());
  }

  @InjectedFieldSignature("org.mochios.chat.MainActivity.sessionManager")
  public static void injectSessionManager(MainActivity instance, SessionManager sessionManager) {
    instance.sessionManager = sessionManager;
  }

  @InjectedFieldSignature("org.mochios.chat.MainActivity.preferencesManager")
  public static void injectPreferencesManager(MainActivity instance,
      PreferencesManager preferencesManager) {
    instance.preferencesManager = preferencesManager;
  }
}
