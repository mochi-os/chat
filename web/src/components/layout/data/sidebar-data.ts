import {
  AudioWaveform,
  Command,
  GalleryVerticalEnd,
  MessagesSquare,
  UserPlus,
} from 'lucide-react'
import { APP_ROUTES } from '@/config/routes'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'satnaing',
    email: 'satnaingdev@gmail.com',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: 'Mochi OS',
      logo: Command,
      plan: 'Vite + ShadcnUI',
    },
    {
      name: 'Acme Inc',
      logo: GalleryVerticalEnd,
      plan: 'Enterprise',
    },
    {
      name: 'Acme Corp.',
      logo: AudioWaveform,
      plan: 'Startup',
    },
  ],
  navGroups: [
    {
      title: 'General',
      items: [
        {
          title: 'Chats',
          url: '/',
          badge: '3',
          icon: MessagesSquare,
        },
      ],
    },
    {
      title: 'Apps',
      items: [
        {
          title: 'Friends',
          url: APP_ROUTES.FRIENDS.HOME,
          icon: UserPlus,
          external: true, // Cross-app navigation
        },
      ],
    },
  ],
}
