import type { ChatMessage } from '@/api/chats'

export interface ReplyTarget {
  id: string
  name: string
  excerpt: string
  isAttachment?: boolean
}

export function messageToReplyTarget(message: ChatMessage): ReplyTarget {
  const body = message.body ?? ''
  return {
    id: message.id,
    name: message.name,
    excerpt: body,
    isAttachment: !body.trim() && Boolean(message.attachments?.length),
  }
}
