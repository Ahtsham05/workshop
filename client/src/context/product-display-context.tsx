import { createContext, useContext, useState } from 'react'

export const PRODUCT_NAME_WIDTH_MIN = 20
export const PRODUCT_NAME_WIDTH_MAX = 80
export const PRODUCT_NAME_WIDTH_DEFAULT = 45

type ProductDisplayProviderProps = {
  children: React.ReactNode
  storageKey?: string
}

type ProductDisplayProviderState = {
  /** Characters of the product name shown before truncating on the Products list page. */
  productNameMaxChars: number
  setProductNameMaxChars: (chars: number) => void
}

const clamp = (chars: number) =>
  Math.min(PRODUCT_NAME_WIDTH_MAX, Math.max(PRODUCT_NAME_WIDTH_MIN, chars))

const initialState: ProductDisplayProviderState = {
  productNameMaxChars: PRODUCT_NAME_WIDTH_DEFAULT,
  setProductNameMaxChars: () => null,
}

const ProductDisplayProviderContext = createContext<ProductDisplayProviderState>(initialState)

export function ProductDisplayProvider({
  children,
  storageKey = 'vite-ui-product-name-max-chars',
  ...props
}: ProductDisplayProviderProps) {
  const [productNameMaxChars, _setProductNameMaxChars] = useState<number>(() => {
    const stored = Number(localStorage.getItem(storageKey))
    return Number.isFinite(stored) && stored > 0 ? clamp(stored) : PRODUCT_NAME_WIDTH_DEFAULT
  })

  const setProductNameMaxChars = (chars: number) => {
    const clamped = clamp(chars)
    localStorage.setItem(storageKey, String(clamped))
    _setProductNameMaxChars(clamped)
  }

  const value = { productNameMaxChars, setProductNameMaxChars }

  return (
    <ProductDisplayProviderContext.Provider {...props} value={value}>
      {children}
    </ProductDisplayProviderContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useProductDisplay = () => {
  const context = useContext(ProductDisplayProviderContext)

  if (context === undefined)
    throw new Error('useProductDisplay must be used within a ProductDisplayProvider')

  return context
}
