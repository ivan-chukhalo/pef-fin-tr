import type { CategoryType } from './data'

export const defaultSubcategoryId = '00000000-0000-0000-0000-000000000000'
export const defaultSubcategoryName = 'Без підкатегорії'

export type Subcategory = {
  id: string
  category_id: string
  category_type: CategoryType
  name: string
  is_hidden: boolean
}

export function getSubcategoryId(id?: string | null) {
  return id || defaultSubcategoryId
}

export function getSubcategoryName(id: string | null | undefined, subcategories: ReadonlyMap<string, Subcategory>) {
  return subcategories.get(getSubcategoryId(id))?.name ?? defaultSubcategoryName
}

export function listSubcategories(subcategories: readonly Subcategory[], categoryId: string) {
  return subcategories.filter(({ category_id }) => category_id === categoryId)
    .sort((first, second) => first.name.localeCompare(second.name, 'uk-UA'))
}
