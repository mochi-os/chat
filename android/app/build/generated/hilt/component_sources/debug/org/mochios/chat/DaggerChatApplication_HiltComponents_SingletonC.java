package org.mochios.chat;

import android.app.Activity;
import android.app.Service;
import android.view.View;
import androidx.fragment.app.Fragment;
import androidx.lifecycle.SavedStateHandle;
import androidx.lifecycle.ViewModel;
import com.google.common.collect.ImmutableMap;
import com.google.common.collect.ImmutableSet;
import com.google.errorprone.annotations.CanIgnoreReturnValue;
import com.google.gson.Gson;
import dagger.hilt.android.ActivityRetainedLifecycle;
import dagger.hilt.android.ViewModelLifecycle;
import dagger.hilt.android.internal.builders.ActivityComponentBuilder;
import dagger.hilt.android.internal.builders.ActivityRetainedComponentBuilder;
import dagger.hilt.android.internal.builders.FragmentComponentBuilder;
import dagger.hilt.android.internal.builders.ServiceComponentBuilder;
import dagger.hilt.android.internal.builders.ViewComponentBuilder;
import dagger.hilt.android.internal.builders.ViewModelComponentBuilder;
import dagger.hilt.android.internal.builders.ViewWithFragmentComponentBuilder;
import dagger.hilt.android.internal.lifecycle.DefaultViewModelFactories;
import dagger.hilt.android.internal.lifecycle.DefaultViewModelFactories_InternalFactoryFactory_Factory;
import dagger.hilt.android.internal.managers.ActivityRetainedComponentManager_LifecycleModule_ProvideActivityRetainedLifecycleFactory;
import dagger.hilt.android.internal.managers.SavedStateHandleHolder;
import dagger.hilt.android.internal.modules.ApplicationContextModule;
import dagger.hilt.android.internal.modules.ApplicationContextModule_ProvideContextFactory;
import dagger.internal.DaggerGenerated;
import dagger.internal.DoubleCheck;
import dagger.internal.IdentifierNameString;
import dagger.internal.KeepFieldType;
import dagger.internal.LazyClassKeyMap;
import dagger.internal.Preconditions;
import dagger.internal.Provider;
import java.util.Map;
import java.util.Set;
import javax.annotation.processing.Generated;
import okhttp3.Interceptor;
import okhttp3.OkHttpClient;
import org.mochios.android.api.ApiClient_ProvideAuthInterceptorFactory;
import org.mochios.android.api.ApiClient_ProvideGsonFactory;
import org.mochios.android.api.ApiClient_ProvideInvalidationInterceptorFactory;
import org.mochios.android.api.ApiClient_ProvideOkHttpClientFactory;
import org.mochios.android.api.ApiClient_ProvideRetrofitFactory;
import org.mochios.android.auth.AuthApi;
import org.mochios.android.auth.AuthModule_ProvideAuthApiFactory;
import org.mochios.android.auth.AuthRepository;
import org.mochios.android.auth.PasskeyManager;
import org.mochios.android.auth.SessionManager;
import org.mochios.android.i18n.LanguageRepository;
import org.mochios.android.i18n.PreferencesManager;
import org.mochios.android.places.NominatimModule_ProvideNominatimClientFactory;
import org.mochios.android.places.NominatimService;
import org.mochios.android.push.PushService;
import org.mochios.android.push.PushService_MembersInjector;
import org.mochios.android.ui.AppBootstrapViewModel;
import org.mochios.android.ui.AppBootstrapViewModel_HiltModules;
import org.mochios.android.ui.auth.AuthViewModel;
import org.mochios.android.ui.auth.AuthViewModel_HiltModules;
import org.mochios.android.ui.theme.ThemeRepository;
import org.mochios.android.websocket.MochiWebSocket;
import org.mochios.chat.api.ChatApi;
import org.mochios.chat.di.AppModule_ProvideChatApiFactory;
import org.mochios.chat.repository.ChatRepository;
import org.mochios.chat.ui.chat.ChatViewModel;
import org.mochios.chat.ui.chat.ChatViewModel_HiltModules;
import org.mochios.chat.ui.chatlist.ChatListViewModel;
import org.mochios.chat.ui.chatlist.ChatListViewModel_HiltModules;
import org.mochios.chat.ui.newchat.NewChatViewModel;
import org.mochios.chat.ui.newchat.NewChatViewModel_HiltModules;
import org.mochios.chat.ui.settings.ChatSettingsViewModel;
import org.mochios.chat.ui.settings.ChatSettingsViewModel_HiltModules;
import retrofit2.Retrofit;

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
public final class DaggerChatApplication_HiltComponents_SingletonC {
  private DaggerChatApplication_HiltComponents_SingletonC() {
  }

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private ApplicationContextModule applicationContextModule;

    private Builder() {
    }

    public Builder applicationContextModule(ApplicationContextModule applicationContextModule) {
      this.applicationContextModule = Preconditions.checkNotNull(applicationContextModule);
      return this;
    }

    public ChatApplication_HiltComponents.SingletonC build() {
      Preconditions.checkBuilderRequirement(applicationContextModule, ApplicationContextModule.class);
      return new SingletonCImpl(applicationContextModule);
    }
  }

  private static final class ActivityRetainedCBuilder implements ChatApplication_HiltComponents.ActivityRetainedC.Builder {
    private final SingletonCImpl singletonCImpl;

    private SavedStateHandleHolder savedStateHandleHolder;

    private ActivityRetainedCBuilder(SingletonCImpl singletonCImpl) {
      this.singletonCImpl = singletonCImpl;
    }

    @Override
    public ActivityRetainedCBuilder savedStateHandleHolder(
        SavedStateHandleHolder savedStateHandleHolder) {
      this.savedStateHandleHolder = Preconditions.checkNotNull(savedStateHandleHolder);
      return this;
    }

    @Override
    public ChatApplication_HiltComponents.ActivityRetainedC build() {
      Preconditions.checkBuilderRequirement(savedStateHandleHolder, SavedStateHandleHolder.class);
      return new ActivityRetainedCImpl(singletonCImpl, savedStateHandleHolder);
    }
  }

  private static final class ActivityCBuilder implements ChatApplication_HiltComponents.ActivityC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private Activity activity;

    private ActivityCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
    }

    @Override
    public ActivityCBuilder activity(Activity activity) {
      this.activity = Preconditions.checkNotNull(activity);
      return this;
    }

    @Override
    public ChatApplication_HiltComponents.ActivityC build() {
      Preconditions.checkBuilderRequirement(activity, Activity.class);
      return new ActivityCImpl(singletonCImpl, activityRetainedCImpl, activity);
    }
  }

  private static final class FragmentCBuilder implements ChatApplication_HiltComponents.FragmentC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private Fragment fragment;

    private FragmentCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, ActivityCImpl activityCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
    }

    @Override
    public FragmentCBuilder fragment(Fragment fragment) {
      this.fragment = Preconditions.checkNotNull(fragment);
      return this;
    }

    @Override
    public ChatApplication_HiltComponents.FragmentC build() {
      Preconditions.checkBuilderRequirement(fragment, Fragment.class);
      return new FragmentCImpl(singletonCImpl, activityRetainedCImpl, activityCImpl, fragment);
    }
  }

  private static final class ViewWithFragmentCBuilder implements ChatApplication_HiltComponents.ViewWithFragmentC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final FragmentCImpl fragmentCImpl;

    private View view;

    private ViewWithFragmentCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, ActivityCImpl activityCImpl,
        FragmentCImpl fragmentCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
      this.fragmentCImpl = fragmentCImpl;
    }

    @Override
    public ViewWithFragmentCBuilder view(View view) {
      this.view = Preconditions.checkNotNull(view);
      return this;
    }

    @Override
    public ChatApplication_HiltComponents.ViewWithFragmentC build() {
      Preconditions.checkBuilderRequirement(view, View.class);
      return new ViewWithFragmentCImpl(singletonCImpl, activityRetainedCImpl, activityCImpl, fragmentCImpl, view);
    }
  }

  private static final class ViewCBuilder implements ChatApplication_HiltComponents.ViewC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private View view;

    private ViewCBuilder(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
        ActivityCImpl activityCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
    }

    @Override
    public ViewCBuilder view(View view) {
      this.view = Preconditions.checkNotNull(view);
      return this;
    }

    @Override
    public ChatApplication_HiltComponents.ViewC build() {
      Preconditions.checkBuilderRequirement(view, View.class);
      return new ViewCImpl(singletonCImpl, activityRetainedCImpl, activityCImpl, view);
    }
  }

  private static final class ViewModelCBuilder implements ChatApplication_HiltComponents.ViewModelC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private SavedStateHandle savedStateHandle;

    private ViewModelLifecycle viewModelLifecycle;

    private ViewModelCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
    }

    @Override
    public ViewModelCBuilder savedStateHandle(SavedStateHandle handle) {
      this.savedStateHandle = Preconditions.checkNotNull(handle);
      return this;
    }

    @Override
    public ViewModelCBuilder viewModelLifecycle(ViewModelLifecycle viewModelLifecycle) {
      this.viewModelLifecycle = Preconditions.checkNotNull(viewModelLifecycle);
      return this;
    }

    @Override
    public ChatApplication_HiltComponents.ViewModelC build() {
      Preconditions.checkBuilderRequirement(savedStateHandle, SavedStateHandle.class);
      Preconditions.checkBuilderRequirement(viewModelLifecycle, ViewModelLifecycle.class);
      return new ViewModelCImpl(singletonCImpl, activityRetainedCImpl, savedStateHandle, viewModelLifecycle);
    }
  }

  private static final class ServiceCBuilder implements ChatApplication_HiltComponents.ServiceC.Builder {
    private final SingletonCImpl singletonCImpl;

    private Service service;

    private ServiceCBuilder(SingletonCImpl singletonCImpl) {
      this.singletonCImpl = singletonCImpl;
    }

    @Override
    public ServiceCBuilder service(Service service) {
      this.service = Preconditions.checkNotNull(service);
      return this;
    }

    @Override
    public ChatApplication_HiltComponents.ServiceC build() {
      Preconditions.checkBuilderRequirement(service, Service.class);
      return new ServiceCImpl(singletonCImpl, service);
    }
  }

  private static final class ViewWithFragmentCImpl extends ChatApplication_HiltComponents.ViewWithFragmentC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final FragmentCImpl fragmentCImpl;

    private final ViewWithFragmentCImpl viewWithFragmentCImpl = this;

    private ViewWithFragmentCImpl(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, ActivityCImpl activityCImpl,
        FragmentCImpl fragmentCImpl, View viewParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
      this.fragmentCImpl = fragmentCImpl;


    }
  }

  private static final class FragmentCImpl extends ChatApplication_HiltComponents.FragmentC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final FragmentCImpl fragmentCImpl = this;

    private FragmentCImpl(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, ActivityCImpl activityCImpl,
        Fragment fragmentParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;


    }

    @Override
    public DefaultViewModelFactories.InternalFactoryFactory getHiltInternalFactoryFactory() {
      return activityCImpl.getHiltInternalFactoryFactory();
    }

    @Override
    public ViewWithFragmentComponentBuilder viewWithFragmentComponentBuilder() {
      return new ViewWithFragmentCBuilder(singletonCImpl, activityRetainedCImpl, activityCImpl, fragmentCImpl);
    }
  }

  private static final class ViewCImpl extends ChatApplication_HiltComponents.ViewC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final ViewCImpl viewCImpl = this;

    private ViewCImpl(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
        ActivityCImpl activityCImpl, View viewParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;


    }
  }

  private static final class ActivityCImpl extends ChatApplication_HiltComponents.ActivityC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl = this;

    private ActivityCImpl(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, Activity activityParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;


    }

    @Override
    public DefaultViewModelFactories.InternalFactoryFactory getHiltInternalFactoryFactory() {
      return DefaultViewModelFactories_InternalFactoryFactory_Factory.newInstance(getViewModelKeys(), new ViewModelCBuilder(singletonCImpl, activityRetainedCImpl));
    }

    @Override
    public Map<Class<?>, Boolean> getViewModelKeys() {
      return LazyClassKeyMap.<Boolean>of(ImmutableMap.<String, Boolean>builderWithExpectedSize(6).put(LazyClassKeyProvider.org_mochios_android_ui_AppBootstrapViewModel, AppBootstrapViewModel_HiltModules.KeyModule.provide()).put(LazyClassKeyProvider.org_mochios_android_ui_auth_AuthViewModel, AuthViewModel_HiltModules.KeyModule.provide()).put(LazyClassKeyProvider.org_mochios_chat_ui_chatlist_ChatListViewModel, ChatListViewModel_HiltModules.KeyModule.provide()).put(LazyClassKeyProvider.org_mochios_chat_ui_settings_ChatSettingsViewModel, ChatSettingsViewModel_HiltModules.KeyModule.provide()).put(LazyClassKeyProvider.org_mochios_chat_ui_chat_ChatViewModel, ChatViewModel_HiltModules.KeyModule.provide()).put(LazyClassKeyProvider.org_mochios_chat_ui_newchat_NewChatViewModel, NewChatViewModel_HiltModules.KeyModule.provide()).build());
    }

    @Override
    public ViewModelComponentBuilder getViewModelComponentBuilder() {
      return new ViewModelCBuilder(singletonCImpl, activityRetainedCImpl);
    }

    @Override
    public FragmentComponentBuilder fragmentComponentBuilder() {
      return new FragmentCBuilder(singletonCImpl, activityRetainedCImpl, activityCImpl);
    }

    @Override
    public ViewComponentBuilder viewComponentBuilder() {
      return new ViewCBuilder(singletonCImpl, activityRetainedCImpl, activityCImpl);
    }

    @Override
    public void injectMainActivity(MainActivity arg0) {
      injectMainActivity2(arg0);
    }

    @CanIgnoreReturnValue
    private MainActivity injectMainActivity2(MainActivity instance) {
      MainActivity_MembersInjector.injectSessionManager(instance, singletonCImpl.sessionManagerProvider.get());
      MainActivity_MembersInjector.injectPreferencesManager(instance, singletonCImpl.preferencesManagerProvider.get());
      return instance;
    }

    @IdentifierNameString
    private static final class LazyClassKeyProvider {
      static String org_mochios_chat_ui_newchat_NewChatViewModel = "org.mochios.chat.ui.newchat.NewChatViewModel";

      static String org_mochios_android_ui_auth_AuthViewModel = "org.mochios.android.ui.auth.AuthViewModel";

      static String org_mochios_chat_ui_settings_ChatSettingsViewModel = "org.mochios.chat.ui.settings.ChatSettingsViewModel";

      static String org_mochios_android_ui_AppBootstrapViewModel = "org.mochios.android.ui.AppBootstrapViewModel";

      static String org_mochios_chat_ui_chatlist_ChatListViewModel = "org.mochios.chat.ui.chatlist.ChatListViewModel";

      static String org_mochios_chat_ui_chat_ChatViewModel = "org.mochios.chat.ui.chat.ChatViewModel";

      @KeepFieldType
      NewChatViewModel org_mochios_chat_ui_newchat_NewChatViewModel2;

      @KeepFieldType
      AuthViewModel org_mochios_android_ui_auth_AuthViewModel2;

      @KeepFieldType
      ChatSettingsViewModel org_mochios_chat_ui_settings_ChatSettingsViewModel2;

      @KeepFieldType
      AppBootstrapViewModel org_mochios_android_ui_AppBootstrapViewModel2;

      @KeepFieldType
      ChatListViewModel org_mochios_chat_ui_chatlist_ChatListViewModel2;

      @KeepFieldType
      ChatViewModel org_mochios_chat_ui_chat_ChatViewModel2;
    }
  }

  private static final class ViewModelCImpl extends ChatApplication_HiltComponents.ViewModelC {
    private final SavedStateHandle savedStateHandle;

    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ViewModelCImpl viewModelCImpl = this;

    private Provider<AppBootstrapViewModel> appBootstrapViewModelProvider;

    private Provider<AuthViewModel> authViewModelProvider;

    private Provider<ChatListViewModel> chatListViewModelProvider;

    private Provider<ChatSettingsViewModel> chatSettingsViewModelProvider;

    private Provider<ChatViewModel> chatViewModelProvider;

    private Provider<NewChatViewModel> newChatViewModelProvider;

    private ViewModelCImpl(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, SavedStateHandle savedStateHandleParam,
        ViewModelLifecycle viewModelLifecycleParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.savedStateHandle = savedStateHandleParam;
      initialize(savedStateHandleParam, viewModelLifecycleParam);

    }

    @SuppressWarnings("unchecked")
    private void initialize(final SavedStateHandle savedStateHandleParam,
        final ViewModelLifecycle viewModelLifecycleParam) {
      this.appBootstrapViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 0);
      this.authViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 1);
      this.chatListViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 2);
      this.chatSettingsViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 3);
      this.chatViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 4);
      this.newChatViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 5);
    }

    @Override
    public Map<Class<?>, javax.inject.Provider<ViewModel>> getHiltViewModelMap() {
      return LazyClassKeyMap.<javax.inject.Provider<ViewModel>>of(ImmutableMap.<String, javax.inject.Provider<ViewModel>>builderWithExpectedSize(6).put(LazyClassKeyProvider.org_mochios_android_ui_AppBootstrapViewModel, ((Provider) appBootstrapViewModelProvider)).put(LazyClassKeyProvider.org_mochios_android_ui_auth_AuthViewModel, ((Provider) authViewModelProvider)).put(LazyClassKeyProvider.org_mochios_chat_ui_chatlist_ChatListViewModel, ((Provider) chatListViewModelProvider)).put(LazyClassKeyProvider.org_mochios_chat_ui_settings_ChatSettingsViewModel, ((Provider) chatSettingsViewModelProvider)).put(LazyClassKeyProvider.org_mochios_chat_ui_chat_ChatViewModel, ((Provider) chatViewModelProvider)).put(LazyClassKeyProvider.org_mochios_chat_ui_newchat_NewChatViewModel, ((Provider) newChatViewModelProvider)).build());
    }

    @Override
    public Map<Class<?>, Object> getHiltViewModelAssistedMap() {
      return ImmutableMap.<Class<?>, Object>of();
    }

    @IdentifierNameString
    private static final class LazyClassKeyProvider {
      static String org_mochios_chat_ui_chatlist_ChatListViewModel = "org.mochios.chat.ui.chatlist.ChatListViewModel";

      static String org_mochios_chat_ui_settings_ChatSettingsViewModel = "org.mochios.chat.ui.settings.ChatSettingsViewModel";

      static String org_mochios_chat_ui_chat_ChatViewModel = "org.mochios.chat.ui.chat.ChatViewModel";

      static String org_mochios_android_ui_AppBootstrapViewModel = "org.mochios.android.ui.AppBootstrapViewModel";

      static String org_mochios_chat_ui_newchat_NewChatViewModel = "org.mochios.chat.ui.newchat.NewChatViewModel";

      static String org_mochios_android_ui_auth_AuthViewModel = "org.mochios.android.ui.auth.AuthViewModel";

      @KeepFieldType
      ChatListViewModel org_mochios_chat_ui_chatlist_ChatListViewModel2;

      @KeepFieldType
      ChatSettingsViewModel org_mochios_chat_ui_settings_ChatSettingsViewModel2;

      @KeepFieldType
      ChatViewModel org_mochios_chat_ui_chat_ChatViewModel2;

      @KeepFieldType
      AppBootstrapViewModel org_mochios_android_ui_AppBootstrapViewModel2;

      @KeepFieldType
      NewChatViewModel org_mochios_chat_ui_newchat_NewChatViewModel2;

      @KeepFieldType
      AuthViewModel org_mochios_android_ui_auth_AuthViewModel2;
    }

    private static final class SwitchingProvider<T> implements Provider<T> {
      private final SingletonCImpl singletonCImpl;

      private final ActivityRetainedCImpl activityRetainedCImpl;

      private final ViewModelCImpl viewModelCImpl;

      private final int id;

      SwitchingProvider(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
          ViewModelCImpl viewModelCImpl, int id) {
        this.singletonCImpl = singletonCImpl;
        this.activityRetainedCImpl = activityRetainedCImpl;
        this.viewModelCImpl = viewModelCImpl;
        this.id = id;
      }

      @SuppressWarnings("unchecked")
      @Override
      public T get() {
        switch (id) {
          case 0: // org.mochios.android.ui.AppBootstrapViewModel 
          return (T) new AppBootstrapViewModel(singletonCImpl.sessionManagerProvider.get(), singletonCImpl.authRepositoryProvider.get(), singletonCImpl.themeRepositoryProvider.get(), singletonCImpl.languageRepositoryProvider.get(), singletonCImpl.preferencesManagerProvider.get(), ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule));

          case 1: // org.mochios.android.ui.auth.AuthViewModel 
          return (T) new AuthViewModel(singletonCImpl.authRepositoryProvider.get(), singletonCImpl.sessionManagerProvider.get(), singletonCImpl.passkeyManagerProvider.get());

          case 2: // org.mochios.chat.ui.chatlist.ChatListViewModel 
          return (T) new ChatListViewModel(singletonCImpl.chatRepositoryProvider.get());

          case 3: // org.mochios.chat.ui.settings.ChatSettingsViewModel 
          return (T) new ChatSettingsViewModel(viewModelCImpl.savedStateHandle, singletonCImpl.chatRepositoryProvider.get());

          case 4: // org.mochios.chat.ui.chat.ChatViewModel 
          return (T) new ChatViewModel(viewModelCImpl.savedStateHandle, singletonCImpl.chatRepositoryProvider.get(), singletonCImpl.mochiWebSocketProvider.get(), singletonCImpl.sessionManagerProvider.get());

          case 5: // org.mochios.chat.ui.newchat.NewChatViewModel 
          return (T) new NewChatViewModel(singletonCImpl.chatRepositoryProvider.get());

          default: throw new AssertionError(id);
        }
      }
    }
  }

  private static final class ActivityRetainedCImpl extends ChatApplication_HiltComponents.ActivityRetainedC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl = this;

    private Provider<ActivityRetainedLifecycle> provideActivityRetainedLifecycleProvider;

    private ActivityRetainedCImpl(SingletonCImpl singletonCImpl,
        SavedStateHandleHolder savedStateHandleHolderParam) {
      this.singletonCImpl = singletonCImpl;

      initialize(savedStateHandleHolderParam);

    }

    @SuppressWarnings("unchecked")
    private void initialize(final SavedStateHandleHolder savedStateHandleHolderParam) {
      this.provideActivityRetainedLifecycleProvider = DoubleCheck.provider(new SwitchingProvider<ActivityRetainedLifecycle>(singletonCImpl, activityRetainedCImpl, 0));
    }

    @Override
    public ActivityComponentBuilder activityComponentBuilder() {
      return new ActivityCBuilder(singletonCImpl, activityRetainedCImpl);
    }

    @Override
    public ActivityRetainedLifecycle getActivityRetainedLifecycle() {
      return provideActivityRetainedLifecycleProvider.get();
    }

    private static final class SwitchingProvider<T> implements Provider<T> {
      private final SingletonCImpl singletonCImpl;

      private final ActivityRetainedCImpl activityRetainedCImpl;

      private final int id;

      SwitchingProvider(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
          int id) {
        this.singletonCImpl = singletonCImpl;
        this.activityRetainedCImpl = activityRetainedCImpl;
        this.id = id;
      }

      @SuppressWarnings("unchecked")
      @Override
      public T get() {
        switch (id) {
          case 0: // dagger.hilt.android.ActivityRetainedLifecycle 
          return (T) ActivityRetainedComponentManager_LifecycleModule_ProvideActivityRetainedLifecycleFactory.provideActivityRetainedLifecycle();

          default: throw new AssertionError(id);
        }
      }
    }
  }

  private static final class ServiceCImpl extends ChatApplication_HiltComponents.ServiceC {
    private final SingletonCImpl singletonCImpl;

    private final ServiceCImpl serviceCImpl = this;

    private ServiceCImpl(SingletonCImpl singletonCImpl, Service serviceParam) {
      this.singletonCImpl = singletonCImpl;


    }

    @Override
    public void injectPushService(PushService arg0) {
      injectPushService2(arg0);
    }

    @CanIgnoreReturnValue
    private PushService injectPushService2(PushService instance) {
      PushService_MembersInjector.injectWebSocket(instance, singletonCImpl.mochiWebSocketProvider.get());
      PushService_MembersInjector.injectOkHttpClient(instance, singletonCImpl.provideOkHttpClientProvider.get());
      return instance;
    }
  }

  private static final class SingletonCImpl extends ChatApplication_HiltComponents.SingletonC {
    private final ApplicationContextModule applicationContextModule;

    private final SingletonCImpl singletonCImpl = this;

    private Provider<SessionManager> sessionManagerProvider;

    private Provider<Interceptor> provideAuthInterceptorProvider;

    private Provider<Interceptor> provideInvalidationInterceptorProvider;

    private Provider<OkHttpClient> provideOkHttpClientProvider;

    private Provider<OkHttpClient> provideNominatimClientProvider;

    private Provider<NominatimService> nominatimServiceProvider;

    private Provider<Gson> provideGsonProvider;

    private Provider<Retrofit> provideRetrofitProvider;

    private Provider<PreferencesManager> preferencesManagerProvider;

    private Provider<AuthApi> provideAuthApiProvider;

    private Provider<AuthRepository> authRepositoryProvider;

    private Provider<ThemeRepository> themeRepositoryProvider;

    private Provider<LanguageRepository> languageRepositoryProvider;

    private Provider<PasskeyManager> passkeyManagerProvider;

    private Provider<ChatApi> provideChatApiProvider;

    private Provider<ChatRepository> chatRepositoryProvider;

    private Provider<MochiWebSocket> mochiWebSocketProvider;

    private SingletonCImpl(ApplicationContextModule applicationContextModuleParam) {
      this.applicationContextModule = applicationContextModuleParam;
      initialize(applicationContextModuleParam);

    }

    @SuppressWarnings("unchecked")
    private void initialize(final ApplicationContextModule applicationContextModuleParam) {
      this.sessionManagerProvider = DoubleCheck.provider(new SwitchingProvider<SessionManager>(singletonCImpl, 0));
      this.provideAuthInterceptorProvider = DoubleCheck.provider(new SwitchingProvider<Interceptor>(singletonCImpl, 2));
      this.provideInvalidationInterceptorProvider = DoubleCheck.provider(new SwitchingProvider<Interceptor>(singletonCImpl, 3));
      this.provideOkHttpClientProvider = DoubleCheck.provider(new SwitchingProvider<OkHttpClient>(singletonCImpl, 1));
      this.provideNominatimClientProvider = DoubleCheck.provider(new SwitchingProvider<OkHttpClient>(singletonCImpl, 5));
      this.nominatimServiceProvider = DoubleCheck.provider(new SwitchingProvider<NominatimService>(singletonCImpl, 4));
      this.provideGsonProvider = DoubleCheck.provider(new SwitchingProvider<Gson>(singletonCImpl, 8));
      this.provideRetrofitProvider = DoubleCheck.provider(new SwitchingProvider<Retrofit>(singletonCImpl, 7));
      this.preferencesManagerProvider = DoubleCheck.provider(new SwitchingProvider<PreferencesManager>(singletonCImpl, 6));
      this.provideAuthApiProvider = DoubleCheck.provider(new SwitchingProvider<AuthApi>(singletonCImpl, 10));
      this.authRepositoryProvider = DoubleCheck.provider(new SwitchingProvider<AuthRepository>(singletonCImpl, 9));
      this.themeRepositoryProvider = DoubleCheck.provider(new SwitchingProvider<ThemeRepository>(singletonCImpl, 11));
      this.languageRepositoryProvider = DoubleCheck.provider(new SwitchingProvider<LanguageRepository>(singletonCImpl, 12));
      this.passkeyManagerProvider = DoubleCheck.provider(new SwitchingProvider<PasskeyManager>(singletonCImpl, 13));
      this.provideChatApiProvider = DoubleCheck.provider(new SwitchingProvider<ChatApi>(singletonCImpl, 15));
      this.chatRepositoryProvider = DoubleCheck.provider(new SwitchingProvider<ChatRepository>(singletonCImpl, 14));
      this.mochiWebSocketProvider = DoubleCheck.provider(new SwitchingProvider<MochiWebSocket>(singletonCImpl, 16));
    }

    @Override
    public Set<Boolean> getDisableFragmentGetContextFix() {
      return ImmutableSet.<Boolean>of();
    }

    @Override
    public ActivityRetainedComponentBuilder retainedComponentBuilder() {
      return new ActivityRetainedCBuilder(singletonCImpl);
    }

    @Override
    public ServiceComponentBuilder serviceComponentBuilder() {
      return new ServiceCBuilder(singletonCImpl);
    }

    @Override
    public SessionManager sessionManager() {
      return sessionManagerProvider.get();
    }

    @Override
    public OkHttpClient okHttpClient() {
      return provideOkHttpClientProvider.get();
    }

    @Override
    public NominatimService nominatimService() {
      return nominatimServiceProvider.get();
    }

    @Override
    public void injectChatApplication(ChatApplication arg0) {
    }

    private static final class SwitchingProvider<T> implements Provider<T> {
      private final SingletonCImpl singletonCImpl;

      private final int id;

      SwitchingProvider(SingletonCImpl singletonCImpl, int id) {
        this.singletonCImpl = singletonCImpl;
        this.id = id;
      }

      @SuppressWarnings("unchecked")
      @Override
      public T get() {
        switch (id) {
          case 0: // org.mochios.android.auth.SessionManager 
          return (T) new SessionManager(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule));

          case 1: // okhttp3.OkHttpClient 
          return (T) ApiClient_ProvideOkHttpClientFactory.provideOkHttpClient(singletonCImpl.provideAuthInterceptorProvider.get(), singletonCImpl.provideInvalidationInterceptorProvider.get(), singletonCImpl.sessionManagerProvider.get());

          case 2: // @org.mochios.android.api.AuthInterceptor okhttp3.Interceptor 
          return (T) ApiClient_ProvideAuthInterceptorFactory.provideAuthInterceptor(singletonCImpl.sessionManagerProvider.get());

          case 3: // @org.mochios.android.api.InvalidationInterceptor okhttp3.Interceptor 
          return (T) ApiClient_ProvideInvalidationInterceptorFactory.provideInvalidationInterceptor(singletonCImpl.sessionManagerProvider.get());

          case 4: // org.mochios.android.places.NominatimService 
          return (T) new NominatimService(singletonCImpl.provideNominatimClientProvider.get());

          case 5: // @org.mochios.android.places.NominatimClient okhttp3.OkHttpClient 
          return (T) NominatimModule_ProvideNominatimClientFactory.provideNominatimClient();

          case 6: // org.mochios.android.i18n.PreferencesManager 
          return (T) new PreferencesManager(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule), singletonCImpl.sessionManagerProvider.get(), singletonCImpl.provideRetrofitProvider.get());

          case 7: // retrofit2.Retrofit 
          return (T) ApiClient_ProvideRetrofitFactory.provideRetrofit(singletonCImpl.provideOkHttpClientProvider.get(), singletonCImpl.provideGsonProvider.get(), singletonCImpl.sessionManagerProvider.get());

          case 8: // com.google.gson.Gson 
          return (T) ApiClient_ProvideGsonFactory.provideGson();

          case 9: // org.mochios.android.auth.AuthRepository 
          return (T) new AuthRepository(singletonCImpl.provideAuthApiProvider.get(), singletonCImpl.sessionManagerProvider.get());

          case 10: // org.mochios.android.auth.AuthApi 
          return (T) AuthModule_ProvideAuthApiFactory.provideAuthApi(singletonCImpl.provideRetrofitProvider.get());

          case 11: // org.mochios.android.ui.theme.ThemeRepository 
          return (T) new ThemeRepository(singletonCImpl.sessionManagerProvider.get(), singletonCImpl.provideRetrofitProvider.get());

          case 12: // org.mochios.android.i18n.LanguageRepository 
          return (T) new LanguageRepository(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule), singletonCImpl.sessionManagerProvider.get(), singletonCImpl.provideRetrofitProvider.get());

          case 13: // org.mochios.android.auth.PasskeyManager 
          return (T) new PasskeyManager(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule));

          case 14: // org.mochios.chat.repository.ChatRepository 
          return (T) new ChatRepository(singletonCImpl.provideChatApiProvider.get());

          case 15: // org.mochios.chat.api.ChatApi 
          return (T) AppModule_ProvideChatApiFactory.provideChatApi(singletonCImpl.provideOkHttpClientProvider.get(), singletonCImpl.provideGsonProvider.get(), singletonCImpl.sessionManagerProvider.get());

          case 16: // org.mochios.android.websocket.MochiWebSocket 
          return (T) new MochiWebSocket(singletonCImpl.provideOkHttpClientProvider.get(), singletonCImpl.sessionManagerProvider.get(), singletonCImpl.provideGsonProvider.get());

          default: throw new AssertionError(id);
        }
      }
    }
  }
}
