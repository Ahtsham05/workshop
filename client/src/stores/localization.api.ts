import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export interface CountryOption {
  code: string
  name: string
}

export interface CurrencyOption {
  code: string
  name: string
  symbol: string
  decimalPlaces: number
  symbolPosition: 'before' | 'after'
}

export interface CountryDefaults {
  defaultCurrency: string | null
  taxSystem: 'NONE' | 'VAT' | 'SALES_TAX' | 'GST' | 'CUSTOM'
  taxRegistrationLabel: string
  dateFormat: string
  locale: string
}

export const localizationApi = createApi({
  reducerPath: 'localizationApi',
  baseQuery,
  tagTypes: ['Localization'],
  endpoints: (builder) => ({
    // Static reference data — cached for the session, no need to ever refetch.
    getCountries: builder.query<CountryOption[], void>({
      query: () => '/localization/countries',
      keepUnusedDataFor: 3600,
    }),
    getCurrencies: builder.query<CurrencyOption[], void>({
      query: () => '/localization/currencies',
      keepUnusedDataFor: 3600,
    }),
    getCountryDefaults: builder.query<CountryDefaults, string>({
      query: (code) => `/localization/countries/${code}/defaults`,
      keepUnusedDataFor: 3600,
    }),
  }),
})

export const { useGetCountriesQuery, useGetCurrenciesQuery, useLazyGetCountryDefaultsQuery, useGetCountryDefaultsQuery } =
  localizationApi
