import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
  type InfiniteData,
} from '@tanstack/react-query'
import {
  useQueryWithError,
  useInfiniteQueryWithError,
} from '@mochi/common'
import { chatsApi,
  type GetChatsResponse,
  type GetMembersResponse,
  type GetMessagesResponse,
  type SendMessageRequest,
  type SendMessageResponse,
  type GetNewChatResponse,
  type CreateChatRequest,
  type CreateChatResponse,
  type ChatViewResponse,
  type RenameRequest,
  type RenameResponse,
  type LeaveRequest,
  type LeaveResponse,
  type DeleteResponse,
  type MemberAddRequest,
  type MemberAddResponse,
  type MemberRemoveRequest,
  type MemberRemoveResponse,
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
      ChatViewResponse,
      Error,
      ChatViewResponse,
      ReturnType<typeof chatKeys.detail>
    >,
    'queryKey' | 'queryFn'
  >
) =>
  useQueryWithError({
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
      Error,
      GetChatsResponse,
      ReturnType<typeof chatKeys.all>
    >,
    'enabled' | 'staleTime' | 'gcTime'
  >
) =>
  useQueryWithError({
    queryKey: chatKeys.all(),
    queryFn: () => chatsApi.list(),
    ...options,
  })

const DEFAULT_PAGE_SIZE = 30

export const useInfiniteMessagesQuery = (
  chatId?: string,
  options?: {
    enabled?: boolean
  }
) =>
  useInfiniteQueryWithError<GetMessagesResponse, Error, InfiniteData<GetMessagesResponse>, ReturnType<typeof chatKeys.messages>, number | undefined>({
    queryKey: chatKeys.messages(chatId ?? 'unknown'),
    enabled: Boolean(chatId) && (options?.enabled ?? true),
    initialPageParam: undefined,
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
    Error,
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
      queryClient.setQueryData<GetChatsResponse>(chatKeys.all(), (old: GetChatsResponse | undefined) => {
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
      Error,
      GetNewChatResponse,
      ReturnType<typeof chatKeys.newChat>
    >,
    'queryKey' | 'queryFn'
  >
) =>
  useQueryWithError({
    queryKey: chatKeys.newChat(),
    queryFn: () => chatsApi.getFriendsForNewChat(),
    ...options,
  })

export const useCreateChatMutation = (
  options?: UseMutationOptions<
    CreateChatResponse,
    Error,
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

export const useChatMembersQuery = (
  chatId?: string,
  options?: Omit<
    UseQueryOptions<
      GetMembersResponse,
      Error,
      GetMembersResponse,
      readonly ['chats', string, 'members']
    >,
    'queryKey' | 'queryFn'
  >
) =>
  useQueryWithError({
    queryKey: ['chats', chatId ?? 'unknown', 'members'] as const,
    enabled: Boolean(chatId) && (options?.enabled ?? true),
    queryFn: () => {
      if (!chatId) {
        throw new Error('Chat ID is required')
      }
      return chatsApi.getMembers(chatId)
    },
    ...options,
  })

interface RenameChatVariables extends RenameRequest {
  chatId: string
}

export const useRenameChatMutation = (
  options?: UseMutationOptions<RenameResponse, Error, RenameChatVariables, unknown>
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ chatId, ...payload }: RenameChatVariables) =>
      chatsApi.rename(chatId, payload),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.all() })
      queryClient.invalidateQueries({ queryKey: chatKeys.detail(variables.chatId) })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}

interface LeaveChatVariables extends LeaveRequest {
  chatId: string
}

export const useLeaveChatMutation = (
  options?: UseMutationOptions<LeaveResponse, Error, LeaveChatVariables, unknown>
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ chatId, ...payload }: LeaveChatVariables) =>
      chatsApi.leave(chatId, payload),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.all() })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}

interface DeleteChatVariables {
  chatId: string
}

export const useDeleteChatMutation = (
  options?: UseMutationOptions<DeleteResponse, Error, DeleteChatVariables, unknown>
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ chatId }: DeleteChatVariables) => chatsApi.delete(chatId),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.all() })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}

interface AddMemberVariables extends MemberAddRequest {
  chatId: string
}

export const useAddMemberMutation = (
  options?: UseMutationOptions<MemberAddResponse, Error, AddMemberVariables, unknown>
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ chatId, ...payload }: AddMemberVariables) =>
      chatsApi.addMember(chatId, payload),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({
        queryKey: ['chats', variables.chatId, 'members'],
      })
      queryClient.invalidateQueries({ queryKey: chatKeys.detail(variables.chatId) })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}

interface RemoveMemberVariables extends MemberRemoveRequest {
  chatId: string
}

export const useRemoveMemberMutation = (
  options?: UseMutationOptions<
    MemberRemoveResponse,
    Error,
    RemoveMemberVariables,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ chatId, ...payload }: RemoveMemberVariables) =>
      chatsApi.removeMember(chatId, payload),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({
        queryKey: ['chats', variables.chatId, 'members'],
      })
      queryClient.invalidateQueries({ queryKey: chatKeys.detail(variables.chatId) })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}
