import {
  AudioWaveform,
  Command,
  GalleryVerticalEnd,
  Home,
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
      title: 'Apps',
      items: [
        {
          title: 'Home',
          url: APP_ROUTES.HOME.HOME,
          icon: Home,
          external: true,
        },
        {
          title: 'Chats',
          url: '/',
          badge: '3',
          icon: MessagesSquare,
        },
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
