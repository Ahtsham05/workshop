import { createAsyncThunk, createSlice, isAnyOf, PayloadAction } from '@reduxjs/toolkit'
import Axios from '../utils/Axios'
import summery from '../utils/summery'
import {
  catchAsync,
  handleLoadingErrorParamsForAsycThunk,
  reduxToolKitCaseBuilder,
} from '../utils/errorHandler'

interface MobileRepairState {
  data: any
}

const initialState: MobileRepairState = {
  data: null,
}

export const fetchMobileRepairs = createAsyncThunk(
  'mobileRepair/fetchMobileRepairs',
  catchAsync(async (params: any) => {
    const query = new URLSearchParams(params).toString()
    const response = await Axios({
      ...summery.fetchMobileRepairs,
      url: `${summery.fetchMobileRepairs.url}?${query}`,
    })
    return response.data
  })
)

export const addMobileRepair = createAsyncThunk(
  'mobileRepair/addMobileRepair',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.addMobileRepair,
      data,
    })
    return response.data
  })
)

export const updateMobileRepair = createAsyncThunk(
  'mobileRepair/updateMobileRepair',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.updateMobileRepair,
      url: `${summery.updateMobileRepair.url}/${data._id}`,
      data,
    })
    return response.data
  })
)

export const deleteMobileRepair = createAsyncThunk(
  'mobileRepair/deleteMobileRepair',
  catchAsync(async (id: string) => {
    const response = await Axios({
      ...summery.deleteMobileRepair,
      url: `${summery.deleteMobileRepair.url}/${id}`,
    })
    return response.data
  })
)

const mobileRepairSlice = createSlice({
  name: 'mobileRepair',
  initialState,
  reducers: {
    setMobileRepairs(state, action: PayloadAction<any[]>) {
      state.data = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMobileRepairs.fulfilled, (state, action) => {
        state.data = action.payload
      })
      .addCase(addMobileRepair.fulfilled, (state, action) => {
        if (state.data?.length > 0) {
          state.data = [...state.data, action.payload]
        } else {
          state.data = [action.payload]
        }
      })
      .addCase(updateMobileRepair.fulfilled, (state, action) => {
        const updated = action.payload
        if (Array.isArray(state.data)) {
          state.data = state.data.map((item) =>
            item.id === updated.id || item._id === updated._id ? updated : item
          )
        }
      })
      .addCase(deleteMobileRepair.fulfilled, (state, action) => {
        if (Array.isArray(state.data)) {
          state.data = state.data.filter(
            (item) => item.id !== action.payload.id && item._id !== action.payload._id
          )
        }
      })
      .addMatcher(
        isAnyOf(
          ...reduxToolKitCaseBuilder([
            fetchMobileRepairs,
            addMobileRepair,
            updateMobileRepair,
            deleteMobileRepair,
          ])
        ),
        handleLoadingErrorParamsForAsycThunk
      )
  },
})

export const { setMobileRepairs } = mobileRepairSlice.actions

export default mobileRepairSlice.reducer
