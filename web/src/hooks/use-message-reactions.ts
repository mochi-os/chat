import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { chatsApi, type GetMessagesResponse } from '@/api/chats'
import type { ReactionId } from '@/features/chats/constants/reactions'
import { patchMessageReaction } from '@/features/chats/utils/reactions'
import { chatKeys } from '@/hooks/useChats'

interface ReactToMessageVariables {
  chatId: string
  messageId: string
  reaction: ReactionId | ''
}

export const useReactToMessageMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ chatId, messageId, reaction }: ReactToMessageVariables) =>
      chatsApi.reactToMessage(chatId, messageId, reaction),
    onMutate: async ({ chatId, messageId, reaction }) => {
      await queryClient.cancelQueries({ queryKey: chatKeys.messages(chatId) })
      const previous = queryClient.getQueryData<InfiniteData<GetMessagesResponse>>(
        chatKeys.messages(chatId)
      )

      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        chatKeys.messages(chatId),
        (current) => {
          if (!current?.pages) return current
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              messages: page.messages.map((message) =>
                message.id === messageId
                  ? patchMessageReaction(message, reaction)
                  : message
              ),
            })),
          }
        }
      )

      return { previous, chatId }
    },
    onError: (_error, { chatId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(chatKeys.messages(chatId), context.previous)
      }
    },
    onSuccess: (data, { chatId, messageId }) => {
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        chatKeys.messages(chatId),
        (current) => {
          if (!current?.pages) return current
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              messages: page.messages.map((message) =>
                message.id === messageId
                  ? {
                      ...message,
                      reaction_counts: data.reaction_counts,
                      my_reaction: data.my_reaction,
                    }
                  : message
              ),
            })),
          }
        }
      )
    },
  })
}
