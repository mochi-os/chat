import {
  useLayout,
  Sidebar,
  SidebarContent,
  SidebarRail,
  NavGroup,
  type NavGroupType,
} from '@mochi/common'
import { sidebarData } from './data/sidebar-data'

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarContent className="pt-6">
        {sidebarData.navGroups.map((props: NavGroupType) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
