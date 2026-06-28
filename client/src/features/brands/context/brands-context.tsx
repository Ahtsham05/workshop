import React, { createContext, useContext, useReducer } from 'react'
import type { Brand } from '@/stores/brand.api'

type Action =
  | { type: 'SET_OPEN'; payload: boolean }
  | { type: 'SET_BRAND'; payload: Brand | null }
  | { type: 'SET_DELETE_OPEN'; payload: boolean }

interface State {
  open: boolean
  currentBrand: Brand | null
  deleteOpen: boolean
}

const initialState: State = {
  open: false,
  currentBrand: null,
  deleteOpen: false,
}

const BrandsContext = createContext<{
  state: State
  dispatch: React.Dispatch<Action>
} | null>(null)

function brandsReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_OPEN':
      return { ...state, open: action.payload }
    case 'SET_BRAND':
      return { ...state, currentBrand: action.payload }
    case 'SET_DELETE_OPEN':
      return { ...state, deleteOpen: action.payload }
    default:
      return state
  }
}

export function BrandsProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(brandsReducer, initialState)

  return (
    <BrandsContext.Provider value={{ state, dispatch }}>
      {children}
    </BrandsContext.Provider>
  )
}

export function useBrands() {
  const context = useContext(BrandsContext)
  if (!context) {
    throw new Error('useBrands must be used within a BrandsProvider')
  }
  return context
}

export default BrandsProvider
