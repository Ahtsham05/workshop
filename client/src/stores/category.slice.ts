import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { catchAsync } from '../utils/errorHandler'
import Axios from '../utils/Axios'
import summery from '../utils/summery'

export interface Category {
  id: string
  name: string
  image?: {
    url: string
    publicId: string
  }
  createdAt: string
  updatedAt: string
}

interface CategoryState {
  categories: Category[]
  loading: boolean
  error: string | null
}

const initialState: CategoryState = {
  categories: [],
  loading: false,
  error: null,
}

// Async thunks for API calls
export const fetchCategories = createAsyncThunk(
  'category/fetchCategories',
  catchAsync(async (params: {
    page?: number
    limit?: number
    sortBy?: string
    search?: string
    fieldName?: string
  }) => {
    // Filter out empty string parameters
    const filteredParams = Object.entries(params).reduce((acc, [key, value]) => {
      if (value !== '' && value !== undefined && value !== null) {
        acc[key] = value
      }
      return acc
    }, {} as any)
    
    const query = new URLSearchParams(filteredParams).toString()
    const response = await Axios({
      ...summery.fetchCategories,
      url: `${summery.fetchCategories.url}?${query}`,
    })
    return response.data
  })
)

export const createCategory = createAsyncThunk(
  'category/createCategory',
  catchAsync(async (categoryData: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) => {
    const response = await Axios({
      ...summery.addCategory,
      data: categoryData,
    })
    return response.data
  })
)

export const updateCategory = createAsyncThunk(
  'category/updateCategory',
  catchAsync(async ({ id, ...categoryData }: Partial<Category> & { id: string }) => {
    const response = await Axios({
      ...summery.updateCategory,
      url: `${summery.updateCategory.url}/${id}`,
      data: categoryData,
    })
    return response.data
  })
)

export const deleteCategory = createAsyncThunk(
  'category/deleteCategory',
  catchAsync(async (id: string) => {
    await Axios({
      ...summery.deleteCategory,
      url: `${summery.deleteCategory.url}/${id}`,
    })
    return { id }
  })
)

export const fetchAllCategories = createAsyncThunk(
  'category/fetchAllCategories',
  catchAsync(async () => {
    const response = await Axios({
      ...summery.fetchAllCategories,
    })
    return response.data
  })
)

const categorySlice = createSlice({
  name: 'category',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch categories
      .addCase(fetchCategories.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.loading = false
        state.categories = action.payload.results || action.payload
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch categories'
      })
      
      // Create category
      .addCase(createCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createCategory.fulfilled, (state, action) => {
        state.loading = false
        state.categories.unshift(action.payload)
      })
      .addCase(createCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to create category'
      })
      
      // Update category
      .addCase(updateCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateCategory.fulfilled, (state, action) => {
        state.loading = false
        const index = state.categories.findIndex(cat => cat.id === action.payload.id)
        if (index !== -1) {
          state.categories[index] = action.payload
        }
      })
      .addCase(updateCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to update category'
      })
      
      // Delete category
      .addCase(deleteCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteCategory.fulfilled, (state, action) => {
        state.loading = false
        state.categories = state.categories.filter(cat => cat.id !== action.payload.id)
      })
      .addCase(deleteCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to delete category'
      })
      
      // Fetch all categories
      .addCase(fetchAllCategories.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchAllCategories.fulfilled, (state, action) => {
        state.loading = false
        state.categories = action.payload.results || action.payload
      })
      .addCase(fetchAllCategories.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch all categories'
      })
  },
})

export const { clearError } = categorySlice.actions
export default categorySlice.reducer
