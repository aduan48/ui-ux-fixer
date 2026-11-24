import { Plus, X } from 'lucide-react'
import { useStore } from '../store'
import type { BrandToken, TokenKind, TokenRole } from '../types'
import { SectionLabel } from './ComponentBank'

const SECTIONS: { kind: TokenKind; label: string; roles?: TokenRole[] }[] = [
  { kind: 'color', label: 'Colors', roles: ['primary', 'accent'] },
  { kind: 'font', label: 'Fonts', roles: ['heading', 'body'] },
  { kind: 'fontSize', label: 'Font sizes' },
  { kind: 'radius', label: 'Corner radius' },
  { kind: 'spacing', label: 'Spacing' },
]

export function BrandPanel() {
  const tokens = useStore(s => s.project.tokens)
  const { addToken } = useStore.getState()
  const byRole = (role: TokenRole) => tokens.find(t => t.roles?.includes(role))

  return (
    <div className="p-3">
      <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-neutral-200 bg-white p-2 text-xs">
        <RoleSummary label="Primary" token={byRole('primary')} />
        <RoleSummary label="Accent" token={byRole('accent')} />
        <RoleSummary label="Heading" token={byRole('heading')} />
        <RoleSummary label="Body" token={byRole('body')} />
      </div>
      {tokens.length === 0 && (
        <p className="mt-3 text-xs text-neutral-500">Import a project to pull in its colors, fonts and sizes, or add tokens yourself.</p>
      )}

      {SECTIONS.map(({ kind, label, roles }) => {
        const list = tokens.filter(t => t.kind === kind)
        return (
          <section key={kind}>
            <div className="mt-4 mb-1.5 flex items-center justify-between">
              <SectionLabel>{label}</SectionLabel>
              <button
                onClick={() => addToken(kind)}
                aria-label={`Add ${label.toLowerCase()} token`}
                className="-mt-1 rounded p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            {list.length === 0 ? (
              <p className="text-[11px] text-neutral-400">None found.</p>
            ) : (
              <ul className="space-y-1">{list.map(t => <TokenRow key={t.id} token={t} roles={roles} />)}</ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function RoleSummary({ label, token }: { label: string; token?: BrandToken }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {token?.kind === 'color' ? (
        <span className="size-3.5 shrink-0 rounded-sm ring-1 ring-black/10" style={{ background: token.value }} />
      ) : (
        <span className="shrink-0 text-neutral-400">Aa</span>
      )}
      <span className="min-w-0">
        <span className="block text-[10px] text-neutral-400 uppercase">{label}</span>
        <span className="block truncate font-medium text-neutral-700">{token ? token.value : '—'}</span>
      </span>
    </div>
  )
}

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v)

function TokenRow({ token: t, roles }: { token: BrandToken; roles?: TokenRole[] }) {
  const { updateToken, deleteToken, toggleTokenRole } = useStore.getState()
  const where = t.source === 'classes' ? 'Tailwind classes' : t.source === 'added' ? 'Added by you' : t.source
  return (
    <li className="group rounded-md border border-neutral-200 bg-white px-2 py-1.5">
      <div className="flex items-center gap-2">
        <Swatch token={t} onPick={value => updateToken(t.id, { value })} />
        <input
          value={t.value}
          onChange={e => updateToken(t.id, { value: e.target.value })}
          aria-label={`${t.kind} value`}
          spellCheck={false}
          className="min-w-0 flex-1 rounded px-1 py-0.5 font-mono text-[12px] text-neutral-800 hover:bg-neutral-50 focus:bg-white focus:outline-2 focus:outline-blue-500"
        />
        {t.count > 0 && <span className="shrink-0 text-[10px] text-neutral-400" title="Times used">×{t.count}</span>}
        <button
          onClick={() => deleteToken(t.id)}
          aria-label={`Delete ${t.value}`}
          className="shrink-0 rounded p-0.5 text-neutral-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 focus:opacity-100"
        >
          <X className="size-3" />
        </button>
      </div>
      {(t.name || where || roles) && (
        <div className="mt-1 flex items-center gap-1 pl-7">
          <span className="min-w-0 flex-1 truncate text-[10px] text-neutral-400" title={[t.name, where].filter(Boolean).join(' · ')}>
            {[t.name, where].filter(Boolean).join(' · ')}
          </span>
          {roles?.map(role => (
            <button
              key={role}
              onClick={() => toggleTokenRole(t.id, role)}
              aria-pressed={!!t.roles?.includes(role)}
              className={`shrink-0 rounded px-1.5 py-px text-[10px] font-medium capitalize ${t.roles?.includes(role) ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'}`}
            >
              {role}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}

/** A visual sample of the token; colours that are plain hex open the native colour picker. */
function Swatch({ token: t, onPick }: { token: BrandToken; onPick: (v: string) => void }) {
  const box = 'grid size-5 shrink-0 place-items-center overflow-hidden rounded'
  switch (t.kind) {
    case 'color':
      return (
        <label className={`${box} relative ring-1 ring-black/10 ${isHex(t.value) ? 'cursor-pointer' : ''}`} style={{ background: t.value }} title={isHex(t.value) ? 'Pick a color' : undefined}>
          {isHex(t.value) && (
            <input type="color" value={t.value} onChange={e => onPick(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Pick a color" />
          )}
        </label>
      )
    case 'font':
      return <span className={`${box} bg-neutral-100 text-[12px] text-neutral-700`} style={{ fontFamily: `"${t.value}", sans-serif` }}>Aa</span>
    case 'fontSize':
      return <span className={`${box} bg-neutral-100 text-neutral-700`} style={{ fontSize: `min(${t.value}, 16px)` }}>A</span>
    case 'radius':
      return <span className={`${box} bg-neutral-100`}><span className="size-3.5 border-2 border-neutral-500" style={{ borderRadius: `min(${t.value}, 7px)`, borderBottomColor: 'transparent', borderLeftColor: 'transparent' }} /></span>
    case 'spacing':
      return <span className={`${box} bg-neutral-100`}><span className="h-1.5 rounded-sm bg-blue-400" style={{ width: `min(${t.value}, 18px)` }} /></span>
  }
}
