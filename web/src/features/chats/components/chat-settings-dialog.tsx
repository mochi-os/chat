// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  Label,
  RadioGroup,
  RadioGroupItem,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  Skeleton,
  Switch,
  SwitchLabel,
  getErrorMessage,
  toastAction,
} from '@mochi/web'
import { Check } from 'lucide-react'
import type { ChatPolicy, ChatPreferences } from '@/api/chats'
import {
  useChatPreferencesQuery,
  useSetChatPreferencesMutation,
} from '@/hooks/useChats'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DEFAULTS: ChatPreferences = {
  policy: 'friends',
  presence: true,
  receipts: true,
  typing: true,
}

// Who may start a chat with the user, and what the user shares with the
// people they chat with.
export function ChatSettingsDialog({ open, onOpenChange }: Props) {
  const { t } = useLingui()
  const options: { value: ChatPolicy; label: string }[] = [
    { value: 'friends', label: t`Friends only` },
    { value: 'anyone', label: t`Anyone` },
  ]
  const switches: { key: 'presence' | 'receipts' | 'typing'; label: string }[] =
    [
      { key: 'presence', label: t`Show when I'm online` },
      { key: 'receipts', label: t`Send read receipts` },
      { key: 'typing', label: t`Show when I'm typing` },
    ]
  // The load error matters more than most: without it a failed load left the
  // controls on their defaults, which look like the user's real settings, and
  // saving then overwrote whatever they actually had.
  const { data, isLoading, isError, error } = useChatPreferencesQuery()
  const save = useSetChatPreferencesMutation()
  const [value, setValue] = useState<ChatPreferences>(DEFAULTS)

  useEffect(() => {
    if (data) setValue({ ...DEFAULTS, ...data })
  }, [data])

  const changes: Partial<ChatPreferences> = {}
  if (data) {
    for (const key of ['policy', 'presence', 'receipts', 'typing'] as const) {
      if (value[key] !== { ...DEFAULTS, ...data }[key]) {
        Object.assign(changes, { [key]: value[key] })
      }
    }
  }
  const changed = Object.keys(changes).length > 0

  const handleSave = async () => {
    if (!changed) {
      onOpenChange(false)
      return
    }
    try {
      await toastAction(save.mutateAsync(changes), {
        loading: t`Saving...`,
        success: t`Settings saved`,
        error: (error) => getErrorMessage(error, t`Failed to save`),
      })
      onOpenChange(false)
    } catch {
      // toastAction already showed error
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className='sm:max-w-md'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            <Trans>Privacy</Trans>
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        {isLoading ? (
          <div className='space-y-3 py-2'>
            <Skeleton className='h-12 w-full' />
            <Skeleton className='h-12 w-full' />
          </div>
        ) : isError ? (
          <p className='text-destructive py-2 text-sm'>
            {getErrorMessage(error, t`Failed to load your settings`)}
          </p>
        ) : (
          <div className='space-y-4 py-2'>
            <div className='space-y-2'>
              <h3 className='text-sm font-semibold'>
                <Trans>Incoming chats</Trans>
              </h3>
              <RadioGroup
                value={value.policy}
                onValueChange={(v) =>
                  setValue((current) => ({ ...current, policy: v as ChatPolicy }))
                }
              >
                {options.map((opt) => (
                  <label
                    key={opt.value}
                    htmlFor={`chat-policy-${opt.value}`}
                    className='hover:bg-hover flex cursor-pointer items-center gap-3 rounded-md border p-3'
                  >
                    <RadioGroupItem
                      value={opt.value}
                      id={`chat-policy-${opt.value}`}
                    />
                    <Label
                      htmlFor={`chat-policy-${opt.value}`}
                      className='cursor-pointer font-medium'
                    >
                      {opt.label}
                    </Label>
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div className='space-y-3'>
              {switches.map((option) => (
                <SwitchLabel key={option.key} label={option.label}>
                  <Switch
                    checked={value[option.key]}
                    onCheckedChange={(on) =>
                      setValue((current) => ({ ...current, [option.key]: on }))
                    }
                  />
                </SwitchLabel>
              ))}
            </div>
          </div>
        )}
        <ResponsiveDialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || isError || !changed}
            loading={save.isPending}
            icon={<Check className='size-4' />}
          >
            <Trans>Save</Trans>
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
