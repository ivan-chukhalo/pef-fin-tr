import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { formatKopecks } from '../lib/money'

export type AccountOption = { id: string; name: string; balance: bigint }

function AccountLabel({ account }: { account: AccountOption }) {
  return (
    <>
      {account.name} — <span className={account.balance < 0n ? 'tabular-nums text-rose-300' : 'tabular-nums'}>{formatKopecks(account.balance)}</span>
    </>
  )
}

export default function AccountPicker({ id, label, accounts, value, onChange }: {
  id: string
  label: string
  accounts: AccountOption[]
  value: string
  onChange: (id: string) => void
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const picker = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const selectedIndex = accounts.findIndex((account) => account.id === value)
  const selectedAccount = accounts[selectedIndex]
  const activeAccount = activeIndex === null ? undefined : accounts[activeIndex]
  const listId = `${id}-options`
  const activeOptionId = activeAccount && `${listId}-${activeAccount.id}`
  const isOpen = activeAccount !== undefined

  useEffect(() => {
    if (!isOpen) return
    function closeOnOutsidePress(event: PointerEvent) {
      if (event.target instanceof Node && !picker.current?.contains(event.target)) setActiveIndex(null)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress)
  }, [isOpen])

  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' })
  }, [activeOptionId])

  function select(account: AccountOption) {
    onChange(account.id)
    setActiveIndex(null)
    trigger.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        const nextIndex = activeIndex === null ? selectedIndex : activeIndex + direction
        setActiveIndex(Math.min(Math.max(nextIndex, 0), accounts.length - 1))
        return
      }
      case 'Home':
      case 'End':
        event.preventDefault()
        setActiveIndex(event.key === 'Home' ? 0 : accounts.length - 1)
        return
      case 'Enter':
      case ' ':
        if (activeAccount) {
          event.preventDefault()
          select(activeAccount)
        }
        return
      case 'Escape':
        if (isOpen) {
          event.preventDefault()
          setActiveIndex(null)
        }
        return
    }

    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return
    const character = event.key.toLocaleLowerCase('uk-UA')
    const start = (activeIndex ?? selectedIndex) + 1
    for (let offset = 0; offset < accounts.length; offset += 1) {
      const index = (start + offset) % accounts.length
      if (accounts[index].name.toLocaleLowerCase('uk-UA').startsWith(character)) {
        event.preventDefault()
        setActiveIndex(index)
        break
      }
    }
  }

  return (
    <div ref={picker} className="min-w-0 space-y-2 text-sm font-medium">
      <label id={`${id}-label`} htmlFor={id} className="block">{label}</label>
      <div className="relative">
        <button
          ref={trigger}
          id={id}
          type="button"
          disabled={!accounts.length}
          role="combobox"
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-value`}
          aria-required="true"
          aria-controls={listId}
          aria-expanded={isOpen}
          aria-activedescendant={activeOptionId}
          className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-left text-zinc-100 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30 focus:outline-none"
          onClick={() => setActiveIndex(isOpen ? null : Math.max(selectedIndex, 0))}
          onKeyDown={handleKeyDown}
          onBlur={() => setActiveIndex(null)}
        >
          <span id={`${id}-value`} className="[overflow-wrap:anywhere]">{selectedAccount ? <AccountLabel account={selectedAccount} /> : 'Оберіть рахунок'}</span>
          <span aria-hidden="true" className="mr-0.5 size-2 shrink-0 -translate-y-0.5 rotate-45 border-r border-b border-zinc-400" />
        </button>
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={`${id}-label`}
          hidden={!isOpen}
          onMouseDown={(event) => event.preventDefault()}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-zinc-700 bg-zinc-950 p-1 text-zinc-100 shadow-lg"
        >
          {accounts.map((account, index) => (
            <li
              key={account.id}
              id={`${listId}-${account.id}`}
              role="option"
              aria-selected={account.id === value}
              onClick={() => select(account)}
              className={`min-h-11 cursor-pointer rounded-lg px-3 py-2.5 [overflow-wrap:anywhere] hover:bg-zinc-800 ${index === activeIndex ? 'bg-zinc-800' : ''}`}
            >
              <AccountLabel account={account} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
