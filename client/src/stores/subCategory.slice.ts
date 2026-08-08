import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { catchAsync } from '../utils/errorHandler'
import Axios from '../utils/Axios'
import summery from '../utils/summery'
import { Category } from './category.slice'

export interface SubCategory {
  id: string
  name: string
  nameUrdu?: string
  category: Category | string
  image?: {
    url: string
    publicId: string
  }
  createdAt: string
  updatedAt: string
}

interface SubCategoryState {
  subCategories: SubCategory[]
  loading: boolean
  error: string | null
}

const initialState: SubCategoryState = {
  subCategories: [],
  loading: false,
  error: null,
}

// Async thunks for API calls
export const fetchSubCategories = createAsyncThunk(
  'subCategory/fetchSubCategories',
  catchAsync(async (params: {
    page?: number
    limit?: number
    sortBy?: string
    search?: string
    fieldName?: string
    category?: string
  }) => {
    const filteredParams = Object.entries(params ?? {}).reduce((acc, [key, value]) => {
      if (value !== '' && value !== undefined && value !== null) {
        acc[key] = value
      }
      return acc
    }, {} as any)

    const query = new URLSearchParams(filteredParams).toString()
    const response = await Axios({
      ...summery.fetchSubCategories,
      url: `${summery.fetchSubCategories.url}?${query}`,
    })
    return response.data
  })
)

export const fetchAllSubCategories = createAsyncThunk(
  'subCategory/fetchAllSubCategories',
  catchAsync(async (params?: { category?: string }) => {
    const query = new URLSearchParams(
      Object.entries(params ?? {}).reduce((acc, [key, value]) => {
        if (value) acc[key] = String(value)
        return acc
      }, {} as any)
    ).toString()
    const response = await Axios({
      ...summery.fetchAllSubCategories,
      url: `${summery.fetchAllSubCategories.url}${query ? `?${query}` : ''}`,
    })
    return response.data
  })
)

export const createSubCategory = createAsyncThunk(
  'subCategory/createSubCategory',
  catchAsync(async (subCategoryData: { name: string; nameUrdu?: string; category: string; image?: { url: string; publicId: string } }) => {
    const response = await Axios({
      ...summery.addSubCategory,
      data: subCategoryData,
    })
    return response.data
  })
)

export const bulkCreateSubCategories = createAsyncThunk(
  'subCategory/bulkCreateSubCategories',
  catchAsync(async (data: { category: string; items: { name: string; nameUrdu?: string }[] }) => {
    const response = await Axios({
      ...summery.bulkAddSubCategories,
      data,
    })
    return response.data
  })
)

export const updateSubCategory = createAsyncThunk(
  'subCategory/updateSubCategory',
  catchAsync(async ({ id, ...subCategoryData }: Partial<SubCategory> & { id: string }) => {
    const response = await Axios({
      ...summery.updateSubCategory,
      url: `${summery.updateSubCategory.url}/${id}`,
      data: subCategoryData,
    })
    return response.data
  })
)

export const deleteSubCategory = createAsyncThunk(
  'subCategory/deleteSubCategory',
  catchAsync(async (id: string) => {
    await Axios({
      ...summery.deleteSubCategory,
      url: `${summery.deleteSubCategory.url}/${id}`,
    })
    return { id }
  })
)

const subCategorySlice = createSlice({
  name: 'subCategory',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    resetSubCategories: (state) => {
      state.subCategories = []
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch sub-categories
      .addCase(fetchSubCategories.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchSubCategories.fulfilled, (state, action) => {
        state.loading = false
        state.subCategories = action.payload.results || action.payload
      })
      .addCase(fetchSubCategories.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch sub-categories'
      })

      // Fetch all sub-categories
      .addCase(fetchAllSubCategories.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchAllSubCategories.fulfilled, (state, action) => {
        state.loading = false
        state.subCategories = action.payload.results || action.payload
      })
      .addCase(fetchAllSubCategories.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch all sub-categories'
      })

      // Create sub-category
      .addCase(createSubCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createSubCategory.fulfilled, (state, action) => {
        state.loading = false
        state.subCategories.unshift(action.payload)
      })
      .addCase(createSubCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to create sub-category'
      })

      // Bulk create sub-categories
      .addCase(bulkCreateSubCategories.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(bulkCreateSubCategories.fulfilled, (state, action) => {
        state.loading = false
        const created = action.payload?.subCategories || []
        state.subCategories = [...created, ...state.subCategories]
      })
      .addCase(bulkCreateSubCategories.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to create sub-categories'
      })

      // Update sub-category
      .addCase(updateSubCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateSubCategory.fulfilled, (state, action) => {
        state.loading = false
        const index = state.subCategories.findIndex((sc) => sc.id === action.payload.id)
        if (index !== -1) {
          state.subCategories[index] = action.payload
        }
      })
      .addCase(updateSubCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to update sub-category'
      })

      // Delete sub-category
      .addCase(deleteSubCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteSubCategory.fulfilled, (state, action) => {
        state.loading = false
        state.subCategories = state.subCategories.filter((sc) => sc.id !== action.payload.id)
      })
      .addCase(deleteSubCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to delete sub-category'
      })
  },
})

export const { clearError, resetSubCategories } = subCategorySlice.actions
export default subCategorySlice.reducer
