
import { Skeleton, PageHeader, Main } from '@mochi/common'

export function ChatSkeleton() {
  return (
    <div className='flex h-full flex-col overflow-hidden'>
      <PageHeader
        title={<Skeleton className='h-6 w-32' />}
        icon={<Skeleton className='size-5 rounded-md' />}
      />
      <Main className='flex min-h-0 flex-1 flex-col overflow-hidden'>
        <div className='flex w-full flex-col justify-end gap-3 p-4 flex-1'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`flex w-full flex-col gap-1 ${
                i % 2 === 0 ? 'items-start' : 'items-end'
              }`}
            >
              <Skeleton
                className={`h-10 w-[60%] rounded-2xl ${
                  i % 2 === 0 ? 'rounded-bl-lg' : 'rounded-br-lg'
                }`}
              />
              <Skeleton className='h-3 w-12 rounded-full' />
            </div>
          ))}
        </div>
        <div className='border-t p-4'>
          <Skeleton className='h-10 w-full rounded-md' />
        </div>
      </Main>
    </div>
  )
}
