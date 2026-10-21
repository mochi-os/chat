// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// A Matrix or XMPP conversation's encryption, which the server holds the
// device for: the device's fingerprints, the people's devices and the user's
// word on each, and on Matrix comparing emoji with someone and the account's
// recovery key.

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'
import {
  Button,
  DataChip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FieldRow,
  GeneralError,
  Input,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  Section,
  StatusPill,
  getErrorMessage,
  naturalCompare,
  toast,
  toastAction,
  useQueryWithError,
} from '@mochi/web'
import {
  Check,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Smile,
} from 'lucide-react'
import {
  encryptionApi,
  type EncryptionDevice,
  type EncryptionStatus,
  type Trust,
} from '@/api/encryption'
import { fingerprintGroups } from '@/features/chats/utils/encryption'

const keys = {
  overview: (chatId: string) => ['chats', chatId, 'encryption'] as const,
  devices: (chatId: string, person: string) =>
    ['chats', chatId, 'encryption', 'devices', person] as const,
}

export function EncryptionSection({ chatId }: { chatId: string }) {
  const { t } = useLingui()
  const { data, error, isLoading, refetch } = useQueryWithError({
    queryKey: keys.overview(chatId),
    queryFn: () => encryptionApi.overview(chatId),
  })
  const [setup, setSetup] = useState(false)
  const [recover, setRecover] = useState(false)

  if (error) {
    return (
      <Section title={t`Encryption`}>
        <GeneralError error={error} minimal mode='inline' reset={refetch} />
      </Section>
    )
  }
  if (isLoading || !data) {
    return (
      <Section title={t`Encryption`}>
        <div className='flex justify-center py-4'>
          <Loader2 className='text-muted-foreground size-5 animate-spin' />
        </div>
      </Section>
    )
  }
  const { status } = data
  const matrix = status.network === 'matrix'
  const people = [...data.people].sort((a, b) =>
    naturalCompare(a.name || a.id, b.name || b.id)
  )

  return (
    <Section
      title={t`Encryption`}
      action={
        matrix ? (
          <div className='flex flex-wrap justify-end gap-2'>
            {!status.signing || !status.recovery ? (
              <Button
                size='sm'
                variant='outline'
                onClick={() => setSetup(true)}
                icon={<KeyRound className='size-4' />}
              >
                <Trans>Set up recovery</Trans>
              </Button>
            ) : null}
            <Button
              size='sm'
              variant='outline'
              onClick={() => setRecover(true)}
              icon={<KeyRound className='size-4' />}
            >
              <Trans>Enter recovery key</Trans>
            </Button>
          </div>
        ) : undefined
      }
    >
      <DeviceRows status={status} />
      <PersonDevices
        chatId={chatId}
        person={status.network === 'xmpp' ? 'xmpp:' + status.address : status.address}
        name={t`Your other devices`}
        matrix={matrix}
        own
      />
      {people.map((person) => (
        <PersonDevices
          key={person.id}
          chatId={chatId}
          person={person.id}
          name={person.name || person.id}
          matrix={matrix}
        />
      ))}
      {matrix ? (
        <>
          <SetupDialog
            chatId={chatId}
            open={setup}
            onOpenChange={setSetup}
            onDone={() => void refetch()}
          />
          <RecoverDialog
            chatId={chatId}
            open={recover}
            onOpenChange={setRecover}
            onDone={() => void refetch()}
          />
        </>
      ) : null}
    </Section>
  )
}

// The server's device for the account: its fingerprints, and on Matrix
// whether it is verified.
function DeviceRows({ status }: { status: EncryptionStatus }) {
  const { t } = useLingui()
  if (status.network === 'xmpp') {
    return (
      <>
        {(status.fingerprints ?? []).map((f) => (
          <FieldRow
            key={f.version}
            label={
              f.version === 'urn:xmpp:omemo:2'
                ? t`This device (OMEMO 2)`
                : t`This device (OMEMO)`
            }
          >
            <DataChip value={fingerprintGroups(f.fingerprint)} truncate='none' />
          </FieldRow>
        ))}
      </>
    )
  }
  return (
    <FieldRow label={t`This device`}>
      <div className='flex min-w-0 flex-wrap items-center gap-2'>
        <DataChip
          value={fingerprintGroups(status.fingerprint ?? '')}
          truncate='none'
        />
        <StatusPill tone={status.verified ? 'success' : 'neutral'}>
          {status.verified ? t`Verified` : t`Not verified`}
        </StatusPill>
      </div>
    </FieldRow>
  )
}

// A person's devices, read when opened.
function PersonDevices({
  chatId,
  person,
  name,
  matrix,
  own = false,
}: {
  chatId: string
  person: string
  name: string
  matrix: boolean
  own?: boolean
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const { data, error, isLoading, refetch } = useQueryWithError({
    queryKey: keys.devices(chatId, person),
    queryFn: () => encryptionApi.devices(chatId, person),
    enabled: open && person !== '',
  })
  const verify = useMutation({
    mutationFn: () => encryptionApi.verify(chatId, person),
  })
  const devices = (data ?? []).filter((d) => !d.own)

  return (
    <div className='border-border/60 border-t py-2 first:border-t-0'>
      <div className='flex items-center gap-2'>
        <Button
          variant='ghost'
          size='sm'
          className='min-w-0 flex-1 justify-start'
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className='me-2 size-4 shrink-0' />
          ) : (
            <ChevronRight className='me-2 size-4 shrink-0 rtl:rotate-180' />
          )}
          <span className='truncate'>{name}</span>
        </Button>
        {matrix ? (
          <Button
            size='sm'
            variant='outline'
            loading={verify.isPending}
            icon={<Smile className='size-4' />}
            onClick={() =>
              void toastAction(verify.mutateAsync(), {
                loading: t`Asking to compare emoji...`,
                success: t`Waiting for them to accept`,
                error: (e) => getErrorMessage(e, t`The verification could not be started`),
              }).catch(() => undefined)
            }
          >
            <Trans>Compare emoji</Trans>
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className='space-y-2 ps-8 pt-1'>
          {error ? (
            <GeneralError error={error} minimal mode='inline' reset={refetch} />
          ) : isLoading ? (
            <Loader2 className='text-muted-foreground size-4 animate-spin' />
          ) : devices.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {own ? (
                <Trans>No other devices</Trans>
              ) : (
                <Trans>No devices</Trans>
              )}
            </p>
          ) : (
            devices.map((device) => (
              <DeviceRow
                key={device.id + (device.version ?? '')}
                chatId={chatId}
                person={person}
                device={device}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

// The user's word on a device, as it shows.
function trustOf(device: EncryptionDevice): Trust {
  if (device.trust) return device.trust
  return device.verified ? 'verified' : 'undecided'
}

function DeviceRow({
  chatId,
  person,
  device,
}: {
  chatId: string
  person: string
  device: EncryptionDevice
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const trust = trustOf(device)
  const change = useMutation({
    mutationFn: (value: Trust) =>
      encryptionApi.trust(chatId, person, device.id, value),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: keys.devices(chatId, person),
      }),
  })
  const tone =
    trust === 'verified' ? 'success' : trust === 'distrusted' ? 'danger' : 'neutral'
  const label =
    trust === 'verified'
      ? t`Verified`
      : trust === 'distrusted'
        ? t`Distrusted`
        : t`Not verified`
  const set = (value: Trust) =>
    void toastAction(change.mutateAsync(value), {
      loading: t`Saving...`,
      success: t`Saved`,
      error: (e) => getErrorMessage(e, t`Failed to save`),
    }).catch(() => undefined)

  return (
    <div className='flex min-w-0 flex-wrap items-center gap-2'>
      <span className='text-sm font-medium'>{device.name || device.id}</span>
      {device.fingerprint ? (
        <DataChip value={fingerprintGroups(device.fingerprint)} truncate='none' />
      ) : null}
      <StatusPill tone={tone}>{label}</StatusPill>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' size='icon' aria-label={t`Device options`}>
            <MoreHorizontal className='size-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          {trust !== 'verified' ? (
            <DropdownMenuItem onSelect={() => set('verified')}>
              <Trans>The fingerprint matches</Trans>
            </DropdownMenuItem>
          ) : null}
          {trust !== 'distrusted' ? (
            <DropdownMenuItem onSelect={() => set('distrusted')}>
              <Trans>Distrust</Trans>
            </DropdownMenuItem>
          ) : null}
          {trust !== 'undecided' ? (
            <DropdownMenuItem onSelect={() => set('undecided')}>
              <Trans>Forget my decision</Trans>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// Setting up the account's recovery: its password where its server wants
// it, then the recovery key, shown this once.
function SetupDialog({
  chatId,
  open,
  onOpenChange,
  onDone,
}: {
  chatId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const { t } = useLingui()
  const [password, setPassword] = useState('')
  const [asked, setAsked] = useState(false)
  const [recovery, setRecovery] = useState('')
  const setup = useMutation({
    mutationFn: () => encryptionApi.setup(chatId, password || undefined),
    onSuccess: (result) => {
      if (result.password) {
        if (asked) toast.error(t`The password was not accepted`)
        setAsked(true)
        return
      }
      setRecovery(result.recovery ?? '')
      onDone()
    },
    onError: (e) =>
      toast.error(getErrorMessage(e, t`Recovery could not be set up`)),
  })
  const close = (value: boolean) => {
    onOpenChange(value)
    if (!value) {
      setPassword('')
      setAsked(false)
      setRecovery('')
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={close}>
      <ResponsiveDialogContent className='sm:max-w-120'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {recovery ? t`Your recovery key` : t`Set up recovery`}
          </ResponsiveDialogTitle>
          {recovery ? (
            <ResponsiveDialogDescription>
              <Trans>
                Keep this key safe. It is shown once, and your other Matrix
                clients ask for it to read your encrypted messages.
              </Trans>
            </ResponsiveDialogDescription>
          ) : asked ? (
            <ResponsiveDialogDescription>
              <Trans>Your Matrix server asks for your account's password.</Trans>
            </ResponsiveDialogDescription>
          ) : null}
        </ResponsiveDialogHeader>
        {recovery ? (
          <DataChip value={recovery} truncate='none' copyButtonMode='always' />
        ) : asked ? (
          <Input
            type='password'
            autoComplete='current-password'
            aria-label={t`Password`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        ) : null}
        <ResponsiveDialogFooter>
          {recovery ? (
            <Button
              onClick={() => close(false)}
              icon={<Check className='size-4' />}
            >
              <Trans>Done</Trans>
            </Button>
          ) : (
            <Button
              onClick={() => setup.mutate()}
              disabled={asked && !password}
              loading={setup.isPending}
              icon={<KeyRound className='size-4' />}
            >
              <Trans>Set up recovery</Trans>
            </Button>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

// Entering a recovery key set up on another client.
function RecoverDialog({
  chatId,
  open,
  onOpenChange,
  onDone,
}: {
  chatId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const { t } = useLingui()
  const [key, setKey] = useState('')
  const recover = useMutation({
    mutationFn: () => encryptionApi.recover(chatId, key),
    onSuccess: (result) => {
      toast.success(
        plural(result.restored, {
          one: `# message key restored`,
          other: `# message keys restored`,
        })
      )
      onOpenChange(false)
      setKey('')
      onDone()
    },
    onError: (e) =>
      toast.error(getErrorMessage(e, t`That is not your recovery key`)),
  })

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value)
        if (!value) setKey('')
      }}
    >
      <ResponsiveDialogContent className='sm:max-w-120'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            <Trans>Enter recovery key</Trans>
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <Input
          autoComplete='off'
          aria-label={t`Recovery key`}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className='font-mono'
        />
        <ResponsiveDialogFooter>
          <Button
            onClick={() => recover.mutate()}
            disabled={!key.trim()}
            loading={recover.isPending}
            icon={<Check className='size-4' />}
          >
            <Trans>Restore</Trans>
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
