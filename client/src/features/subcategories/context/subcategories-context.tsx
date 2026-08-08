import React, { createContext, useContext, useReducer } from 'react'
import { SubCategory } from '@/stores/subCategory.slice'

type Action =
  | { type: 'SET_OPEN'; payload: boolean }
  | { type: 'SET_SUBCATEGORY'; payload: SubCategory | null }
  | { type: 'SET_DELETE_OPEN'; payload: boolean }
  | { type: 'SET_DEFAULT_CATEGORY_ID'; payload: string | null }

interface State {
  open: boolean
  currentSubCategory: SubCategory | null
  deleteOpen: boolean
  /** Category to pre-select when opening the create dialog from a filtered view. */
  defaultCategoryId: string | null
}

const initialState: State = {
  open: false,
  currentSubCategory: null,
  deleteOpen: false,
  defaultCategoryId: null,
}

const SubCategoriesContext = createContext<{
  state: State
  dispatch: React.Dispatch<Action>
} | null>(null)

function subCategoriesReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_OPEN':
      return { ...state, open: action.payload }
    case 'SET_SUBCATEGORY':
      return { ...state, currentSubCategory: action.payload }
    case 'SET_DELETE_OPEN':
      return { ...state, deleteOpen: action.payload }
    case 'SET_DEFAULT_CATEGORY_ID':
      return { ...state, defaultCategoryId: action.payload }
    default:
      return state
  }
}

export function SubCategoriesProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(subCategoriesReducer, initialState)

  return (
    <SubCategoriesContext.Provider value={{ state, dispatch }}>
      {children}
    </SubCategoriesContext.Provider>
  )
}

export function useSubCategories() {
  const context = useContext(SubCategoriesContext)
  if (!context) {
    throw new Error('useSubCategories must be used within a SubCategoriesProvider')
  }
  return context
}

export default SubCategoriesProvider
