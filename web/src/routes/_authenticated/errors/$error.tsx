import { createFileRoute } from '@tanstack/react-router'
import { ConfigDrawer } from '@mochi/common'
import { Header } from '@mochi/common'
import { ProfileDropdown } from '@mochi/common'
import { Search } from '@mochi/common'
import { ThemeSwitch } from '@mochi/common'
import { ForbiddenError } from '@mochi/common'
import { GeneralError } from '@mochi/common'
import { MaintenanceError } from '@mochi/common'
import { NotFoundError } from '@mochi/common'
import { UnauthorisedError } from '@mochi/common'

export const Route = createFileRoute('/_authenticated/errors/$error')({
  component: RouteComponent,
})

function RouteComponent() {
  const { error } = Route.useParams()

  const errorMap: Record<string, React.ComponentType> = {
    unauthorized: UnauthorisedError,
    forbidden: ForbiddenError,
    'not-found': NotFoundError,
    'internal-server-error': GeneralError,
    'maintenance-error': MaintenanceError,
  }
  const ErrorComponent = errorMap[error] || NotFoundError

  return (
    <>
      <Header fixed className='border-b'>
        <Search />
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>
      <div className='flex-1 [&>div]:h-full'>
        <ErrorComponent />
      </div>
    </>
  )
}
