import { currentTimestamp } from './../../utils/index'
import { updatePoolData, addPoolKeys, updatePoolChartData, updatePoolTransactions, updateTickData } from './actions'
import { createReducer } from '@reduxjs/toolkit'
import { SerializedToken } from 'state/user/actions'
import { Transaction } from 'types'
import { PoolTickData } from 'data/pools/tickData'
import { SupportedNetwork } from 'constants/networks'

export interface Pool {
  address: string
  token0: SerializedToken
  token1: SerializedToken
}

export interface TokenDayData {
  priceUSD: string
}

export interface Token {
  name: string
  symbol: string
  address: string
  decimals: number
  derivedETH: number
  tokenDayData?: TokenDayData[]
}

export interface PoolData {
  // basic token info
  address: string
  feeTier: number

  token0: Token
  token1: Token

  // for tick math
  liquidity: number
  sqrtPrice: number
  tick: number

  // volume
  volumeUSD: number
  volumeUSDChange: number
  volumeUSDWeek: number

  // liquidity
  tvlUSD: number
  tvlUSDChange: number

  // prices
  token0Price: number
  token1Price: number

  // token amounts
  tvlToken0: number
  tvlToken1: number

  poolDayData: PoolDayData[]
}

export interface PoolDayData {
  volumeUSD: number
  high: number
  low: number
}

export interface ProcessedPoolData extends PoolData {
  feesUSD: number
  feesEstimate24h: number
  apr: number
}

export type PoolChartEntry = {
  date: number
  volumeUSD: number
  totalValueLockedUSD: number
  feesUSD: number
}

export interface PoolsState {
  // analytics data from
  byAddress: {
    [networkId: string]: {
      [address: string]: {
        data: PoolData | undefined
        chartData: PoolChartEntry[] | undefined
        transactions: Transaction[] | undefined
        lastUpdated: number | undefined
        tickData: PoolTickData | undefined
      }
    }
  }
}

export const initialState: PoolsState = {
  byAddress: {
    [SupportedNetwork.ETHEREUM]: {},
    [SupportedNetwork.ARBITRUM]: {},
    [SupportedNetwork.OPTIMISM]: {},
    [SupportedNetwork.POLYGON]: {},
    [SupportedNetwork.CELO]: {},
    [SupportedNetwork.BNB]: {},
  },
}

export default createReducer(initialState, (builder) =>
  builder
    .addCase(updatePoolData, (state, { payload: { pools, networkId } }) => {
      pools.map(
        (poolData) =>
          (state.byAddress[networkId][poolData.address] = {
            ...state.byAddress[networkId][poolData.address],
            data: poolData,
            lastUpdated: currentTimestamp(),
          })
      )
    })
    // add address to byAddress keys if not included yet
    .addCase(addPoolKeys, (state, { payload: { poolAddresses, networkId } }) => {
      poolAddresses.map((address) => {
        if (!state.byAddress[networkId][address]) {
          state.byAddress[networkId][address] = {
            data: undefined,
            chartData: undefined,
            transactions: undefined,
            lastUpdated: undefined,
            tickData: undefined,
          }
        }
      })
    })
    .addCase(updatePoolChartData, (state, { payload: { poolAddress, chartData, networkId } }) => {
      state.byAddress[networkId][poolAddress] = { ...state.byAddress[networkId][poolAddress], chartData: chartData }
    })
    .addCase(updatePoolTransactions, (state, { payload: { poolAddress, transactions, networkId } }) => {
      state.byAddress[networkId][poolAddress] = { ...state.byAddress[networkId][poolAddress], transactions }
    })
    .addCase(updateTickData, (state, { payload: { poolAddress, tickData, networkId } }) => {
      state.byAddress[networkId][poolAddress] = { ...state.byAddress[networkId][poolAddress], tickData }
    })
)
