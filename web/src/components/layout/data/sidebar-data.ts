import {
  Bell,
  Home,
  LayoutTemplate,
  MessageCircle,
  MessagesSquare,
  Newspaper,
  UserPlus,
} from 'lucide-react'
import { APP_ROUTES } from '@/config/app-routes'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'Apps',
      items: [
        {
          title: 'Home',
          url: APP_ROUTES.HOME.HOME,
          icon: Home,
          external: true,
        },
        {
          title: 'Chat',
          url: APP_ROUTES.CHAT.HOME,
          icon: MessagesSquare,
        },
        {
          title: 'Friends',
          url: APP_ROUTES.FRIENDS.HOME,
          icon: UserPlus,
          external: true,
        },
        {
          title: 'Notifications',
          url: APP_ROUTES.NOTIFICATIONS.HOME,
          icon: Bell,
          external: true,
        },
        {
          title: 'Feeds',
          url: APP_ROUTES.FEEDS.HOME,
          icon: Newspaper,
          external: true,
        },
        {
          title: 'Forums',
          url: APP_ROUTES.FORUMS.HOME,
          icon: MessageCircle,
          external: true,
        },
        {
          title: 'Template',
          url: APP_ROUTES.TEMPLATE.HOME,
          icon: LayoutTemplate,
          external: true,
        },
      ],
    },
  ],
}
