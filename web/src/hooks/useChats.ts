// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
  type InfiniteData,
} from '@tanstack/react-query'
import {
  useQueryWithError,
  useInfiniteQueryWithError,
} from '@mochi/web'
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
  type MarkReadRequest,
  type MarkReadResponse,
  type DeleteMessagesResponse,
  type ForwardMessagesResponse,
} from '@/api/chats'
import type { ChatMessage } from '@/api/types/chats'

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
        throw new Error("Chat ID is required")
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
    'enabled' | 'staleTime' | 'gcTime' | 'refetchInterval'
  >
) =>
  useQueryWithError({
    queryKey: chatKeys.all(),
    queryFn: () => chatsApi.list(),
    ...options,
  })

const DEFAULT_PAGE_SIZE = 30

// Keyset cursor carried between pages: the oldest message's timestamp plus its
// id. `undefined` on the first page loads the newest messages.
type MessagesPageParam = { before: number; beforeId?: string } | undefined

export const useInfiniteMessagesQuery = (
  chatId?: string,
  options?: {
    enabled?: boolean
  }
) =>
  useInfiniteQueryWithError<GetMessagesResponse, Error, InfiniteData<GetMessagesResponse>, ReturnType<typeof chatKeys.messages>, MessagesPageParam>({
    queryKey: chatKeys.messages(chatId ?? 'unknown'),
    enabled: Boolean(chatId) && (options?.enabled ?? true),
    initialPageParam: undefined,
    queryFn: ({ pageParam }) => {
      if (!chatId) {
        return Promise.resolve<GetMessagesResponse>({ messages: [] })
      }
      return chatsApi.messages(chatId, {
        before: pageParam?.before,
        beforeId: pageParam?.beforeId,
        limit: DEFAULT_PAGE_SIZE,
      })
    },
    getNextPageParam: (lastPage, _allPages, _lastPageParam, allPageParams) => {
      // Keyset pagination: nextCursor is the oldest message's timestamp and
      // nextCursorId its id. The id is the unique tiebreaker — `created`
      // alone (whole seconds) repeats within a busy second and would stall
      // paging, so dedupe on the id, not the timestamp.
      if (!lastPage.hasMore || lastPage.nextCursor === undefined) {
        return undefined
      }
      const next: MessagesPageParam = {
        before: lastPage.nextCursor,
        beforeId: lastPage.nextCursorId,
      }
      if (
        allPageParams.some(
          (p) => p?.before === next.before && p?.beforeId === next.beforeId
        )
      ) {
        return undefined
      }
      return next
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
              ? { ...chat, updated: Math.floor(Date.now() / 1000) }
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
        throw new Error("Chat ID is required")
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

interface MarkChatReadVariables extends MarkReadRequest {
  chatId: string
}

export const useMarkChatReadMutation = (
  options?: UseMutationOptions<
    MarkReadResponse,
    Error,
    MarkChatReadVariables,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ chatId, ...payload }: MarkChatReadVariables) =>
      chatsApi.markRead(chatId, payload),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData<GetChatsResponse>(chatKeys.all(), (old) => {
        if (!old) return old
        return {
          ...old,
          chats: old.chats.map((chat) =>
            chat.id === variables.chatId ? { ...chat, unread: 0 } : chat
          ),
        }
      })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}

// Replace the given messages in the cache with tombstones (delete-for-everyone).
const tombstoneMessagesInCache = (
  queryClient: QueryClient,
  chatId: string,
  deletedIds: string[]
) => {
  if (deletedIds.length === 0) return
  const ids = new Set(deletedIds)
  queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
    chatKeys.messages(chatId),
    (current) => {
      if (!current?.pages) return current
      return {
        ...current,
        pages: current.pages.map((page) => ({
          ...page,
          messages: page.messages.map((message): ChatMessage =>
            ids.has(message.id)
              ? {
                  ...message,
                  deleted: true,
                  body: '',
                  attachments: [],
                  reaction_counts: {},
                  my_reaction: null,
                }
              : message
          ),
        })),
      }
    }
  )
}

interface DeleteMessagesVariables {
  chatId: string
  messageIds: string[]
}

export const useDeleteMessagesMutation = (
  options?: UseMutationOptions<
    DeleteMessagesResponse,
    Error,
    DeleteMessagesVariables,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ chatId, messageIds }: DeleteMessagesVariables) =>
      chatsApi.deleteMessages(chatId, messageIds),
    onSuccess: (data, variables, context, mutation) => {
      tombstoneMessagesInCache(queryClient, variables.chatId, data.deleted)
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}

interface ForwardMessagesVariables {
  chatId: string
  messageIds: string[]
  toChat: string
}

export const useForwardMessagesMutation = (
  options?: UseMutationOptions<
    ForwardMessagesResponse,
    Error,
    ForwardMessagesVariables,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ chatId, messageIds, toChat }: ForwardMessagesVariables) =>
      chatsApi.forwardMessages(chatId, messageIds, toChat),
    onSuccess: (data, variables, context, mutation) => {
      // Bump the destination chat so it sorts to the top of the list; the
      // destination message list itself fills in via its own websocket events.
      queryClient.setQueryData<GetChatsResponse>(chatKeys.all(), (old) => {
        if (!old) return old
        return {
          ...old,
          chats: old.chats.map((chat) =>
            chat.id === data.to_chat
              ? { ...chat, updated: Math.floor(Date.now() / 1000) }
              : chat
          ),
        }
      })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}
