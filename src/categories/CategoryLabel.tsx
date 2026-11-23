import { categoryColorStyle } from './color'

export default function CategoryLabel({ name, color }: { name: string; color?: string | null }) {
  return (
    <span
      className="inline-block w-fit max-w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 align-middle font-medium text-zinc-100 [overflow-wrap:anywhere]"
      style={categoryColorStyle(color)}
    >
      {name}
    </span>
  )
}
