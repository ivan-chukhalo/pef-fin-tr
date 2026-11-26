import { defaultSubcategoryId, defaultSubcategoryName, listSubcategories, type Subcategory } from './subcategories'

export default function SubcategorySelect({ id, categoryId, subcategories, value, onChange, className, disabled }: {
  id: string
  categoryId: string
  subcategories: readonly Subcategory[]
  value: string
  onChange: (id: string) => void
  className: string
  disabled?: boolean
}) {
  const options = listSubcategories(subcategories, categoryId)
    .filter((subcategory) => !subcategory.is_hidden || subcategory.id === value)
  return (
    <select id={id} className={className} value={value} disabled={disabled}
      onChange={(event) => onChange(event.target.value)}>
      <option value={defaultSubcategoryId}>{defaultSubcategoryName}</option>
      {options.map((subcategory) => (
        <option key={subcategory.id} value={subcategory.id} disabled={subcategory.is_hidden}>
          {subcategory.name}{subcategory.is_hidden ? ' (приховано)' : ''}
        </option>
      ))}
    </select>
  )
}
