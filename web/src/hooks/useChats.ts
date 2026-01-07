import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query'
import chatsApi, {
  type GetChatsResponse,
  type GetMessagesResponse,
  type SendMessageRequest,
  type SendMessageResponse,
  type GetNewChatResponse,
  type CreateChatRequest,
  type CreateChatResponse,
  type ChatDetail,
} from '@/api/chats'

export const chatKeys = {
  all: () => ['chats'] as const,
  detail: (chatId: string) => ['chats', chatId] as const,
  messages: (chatId: string) => ['chats', chatId, 'messages'] as const,
  newChat: () => ['chats', 'new'] as const,
}

export const useChatDetailQuery = (
  chatId?: string,
  options?: Omit<
    UseQueryOptions<
      ChatDetail,
      unknown,
      ChatDetail,
      ReturnType<typeof chatKeys.detail>
    >,
    'queryKey' | 'queryFn'
  >
) =>
  useQuery({
    queryKey: chatKeys.detail(chatId ?? 'unknown'),
    enabled: Boolean(chatId) && (options?.enabled ?? true),
    queryFn: () => {
      if (!chatId) {
        throw new Error('Chat ID is required')
      }
      return chatsApi.detail(chatId)
    },
    ...options,
  })

export const useChatsQuery = (
  options?: Pick<
    UseQueryOptions<
      GetChatsResponse,
      unknown,
      GetChatsResponse,
      ReturnType<typeof chatKeys.all>
    >,
    'enabled' | 'staleTime' | 'gcTime'
  >
) =>
  useQuery({
    queryKey: chatKeys.all(),
    queryFn: () => chatsApi.list(),
    ...options,
  })

export const useChatMessagesQuery = (
  chatId?: string,
  options?: Omit<
    UseQueryOptions<
      GetMessagesResponse,
      unknown,
      GetMessagesResponse,
      ReturnType<typeof chatKeys.messages>
    >,
    'queryKey' | 'queryFn'
  >
) =>
  useQuery({
    queryKey: chatKeys.messages(chatId ?? 'unknown'),
    enabled: Boolean(chatId) && (options?.enabled ?? true),
    queryFn: () => {
      if (!chatId) {
        return Promise.resolve<GetMessagesResponse>({ messages: [] })
      }

      return chatsApi.messages(chatId)
    },
    ...options,
  })

const DEFAULT_PAGE_SIZE = 30

export const useInfiniteMessagesQuery = (
  chatId?: string,
  options?: {
    enabled?: boolean
  }
) =>
  useInfiniteQuery({
    queryKey: chatKeys.messages(chatId ?? 'unknown'),
    enabled: Boolean(chatId) && (options?.enabled ?? true),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => {
      if (!chatId) {
        return Promise.resolve<GetMessagesResponse>({ messages: [] })
      }
      return chatsApi.messages(chatId, {
        before: pageParam,
        limit: DEFAULT_PAGE_SIZE,
      })
    },
    getNextPageParam: (lastPage) => {
      // Use cursor-based pagination: nextCursor is the timestamp of oldest message
      if (!lastPage.hasMore) {
        return undefined
      }
      return lastPage.nextCursor
    },
  })

interface SendMessageVariables extends SendMessageRequest {
  chatId: string
}

export const useSendMessageMutation = (
  options?: UseMutationOptions<
    SendMessageResponse,
    unknown,
    SendMessageVariables,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ chatId, ...payload }) =>
      chatsApi.sendMessage(chatId, payload),
    onSuccess: (data, variables, context, mutation) => {
      // Only invalidate messages for this specific chat
      queryClient.invalidateQueries({
        queryKey: chatKeys.messages(variables.chatId),
      })
      // Update the specific chat's timestamp so it sorts to top of list
      queryClient.setQueryData<GetChatsResponse>(chatKeys.all(), (old) => {
        if (!old) return old
        return {
          ...old,
          chats: old.chats.map((chat) =>
            chat.id === variables.chatId
              ? { ...chat, updated: Date.now() }
              : chat
          ),
        }
      })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}

export const useNewChatFriendsQuery = (
  options?: Omit<
    UseQueryOptions<
      GetNewChatResponse,
      unknown,
      GetNewChatResponse,
      ReturnType<typeof chatKeys.newChat>
    >,
    'queryKey' | 'queryFn'
  >
) =>
  useQuery({
    queryKey: chatKeys.newChat(),
    queryFn: () => chatsApi.getFriendsForNewChat(),
    ...options,
  })

export const useCreateChatMutation = (
  options?: UseMutationOptions<
    CreateChatResponse,
    unknown,
    CreateChatRequest,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: (payload: CreateChatRequest) => chatsApi.create(payload),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.all() })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}
