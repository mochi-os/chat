import {
  AudioWaveform,
  Bell,
  Command,
  GalleryVerticalEnd,
  Home,
  MessagesSquare,
  Newspaper,
  MessageSquare,
  UserPlus,
  LayoutTemplate,
} from 'lucide-react'
import { type SidebarData } from '../types'
import { getPath } from '@mochi/config/routes'

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
          url: getPath('home'),
          icon: Home,
          external: true,
        },
        {
          title: 'Chat',
          url: './',
          icon: MessagesSquare,
        },
        {
          title: 'Friends',
          url: getPath('friends'),
          icon: UserPlus,
          external: true,
        },
        {
          title: 'Notifications',
          url: getPath('notifications'),
          icon: Bell,
          external: true,
        },
        {
          title: 'Feeds',
          url: getPath('feeds'),
          icon: Newspaper,
          external: true,
        },
        {
          title: 'Forums',
          url: getPath('forums'),
          icon: MessageSquare,
          external: true,
        },
        {
          title: 'Template',
          url: '/template/',
          icon: LayoutTemplate,
          external: true,
        },
      ],
    },
  ],
}
