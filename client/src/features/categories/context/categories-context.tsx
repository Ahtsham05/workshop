import React, { createContext, useContext, useReducer } from 'react'
import { Category } from '@/stores/category.slice'

type Action = 
  | { type: 'SET_OPEN'; payload: boolean }
  | { type: 'SET_CATEGORY'; payload: Category | null }
  | { type: 'SET_DELETE_OPEN'; payload: boolean }

interface State {
  open: boolean
  currentCategory: Category | null
  deleteOpen: boolean
}

const initialState: State = {
  open: false,
  currentCategory: null,
  deleteOpen: false,
}

const CategoriesContext = createContext<{
  state: State
  dispatch: React.Dispatch<Action>
} | null>(null)

function categoriesReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_OPEN':
      return { ...state, open: action.payload }
    case 'SET_CATEGORY':
      return { ...state, currentCategory: action.payload }
    case 'SET_DELETE_OPEN':
      return { ...state, deleteOpen: action.payload }
    default:
      return state
  }
}

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(categoriesReducer, initialState)

  return (
    <CategoriesContext.Provider value={{ state, dispatch }}>
      {children}
    </CategoriesContext.Provider>
  )
}

export function useCategories() {
  const context = useContext(CategoriesContext)
  if (!context) {
    throw new Error('useCategories must be used within a CategoriesProvider')
  }
  return context
}

export default CategoriesProvider
