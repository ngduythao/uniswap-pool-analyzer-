import { Tick } from 'data/pools/tickData'
import BigNumber from 'bignumber.js'

const Q96 = new BigNumber(2).pow(96)

interface TokensAmount {
  amount0: number
  amount1: number
}

// private helper functions
const encodeSqrtPriceX96 = (price: number | string | BigNumber): BigNumber => {
  return new BigNumber(price).sqrt().multipliedBy(Q96).integerValue(3)
}

const mulDecimals = (n: number | string | BigNumber, exp: number): BigNumber => {
  return new BigNumber(n).multipliedBy(new BigNumber(10).pow(exp))
}

export const getPriceFromTick = (tick: number, token0Decimal: number, token1Decimal: number): number => {
  const sqrtPrice = new BigNumber(Math.pow(Math.sqrt(1.0001), tick)).multipliedBy(new BigNumber(2).pow(96))

  const token0 = mulDecimals(1, Number(token0Decimal))
  const token1 = mulDecimals(1, Number(token1Decimal))
  const L2 = encodeSqrtPriceX96(token0).multipliedBy(encodeSqrtPriceX96(token1)).div(Q96)
  const price = L2.multipliedBy(Q96)
    .div(sqrtPrice)
    .div(new BigNumber(2).pow(96))
    .div(new BigNumber(10).pow(token0Decimal))
    .pow(2)
  return price.toNumber()
}

export const getTokensAmountFromDepositAmountUSD = (
  P: number,
  Pl: number,
  Pu: number,
  priceUSDX: number,
  priceUSDY: number,
  depositAmountUSD: number
): TokensAmount => {
  const deltaL =
    depositAmountUSD / ((Math.sqrt(P) - Math.sqrt(Pl)) * priceUSDY + (1 / Math.sqrt(P) - 1 / Math.sqrt(Pu)) * priceUSDX)

  let deltaY = deltaL * (Math.sqrt(P) - Math.sqrt(Pl))
  if (deltaY * priceUSDY < 0) deltaY = 0
  if (deltaY * priceUSDY > depositAmountUSD) deltaY = depositAmountUSD / priceUSDY

  let deltaX = deltaL * (1 / Math.sqrt(P) - 1 / Math.sqrt(Pu))
  if (deltaX * priceUSDX < 0) deltaX = 0
  if (deltaX * priceUSDX > depositAmountUSD) deltaX = depositAmountUSD / priceUSDX
  return { amount0: deltaX, amount1: deltaY }
}

export const getLiquidityFromTick = (poolTicks: Tick[], tick: number): BigNumber => {
  let liquidity: BigNumber = new BigNumber(0)

  for (let i = 0; i < poolTicks.length - 1; ++i) {
    liquidity = liquidity.plus(new BigNumber(poolTicks[i].liquidityNet))

    const lowerTick = Number(poolTicks[i].tickIdx)
    const upperTick = Number(poolTicks[i + 1]?.tickIdx)

    if (lowerTick <= tick && tick <= upperTick) break
  }

  return liquidity
}

// amount0 * (sqrt(upper) * sqrt(lower)) / (sqrt(upper) - sqrt(lower))
const getLiquidityForAmount0 = (sqrtRatioAX96: BigNumber, sqrtRatioBX96: BigNumber, amount0: BigNumber): BigNumber => {
  const intermediate = sqrtRatioBX96.multipliedBy(sqrtRatioAX96).div(Q96)
  return amount0.multipliedBy(intermediate).div(sqrtRatioBX96.minus(sqrtRatioAX96))
}

// amount1 / (sqrt(upper) - sqrt(lower))
const getLiquidityForAmount1 = (sqrtRatioAX96: BigNumber, sqrtRatioBX96: BigNumber, amount1: BigNumber): BigNumber => {
  return amount1.multipliedBy(Q96).div(sqrtRatioBX96.minus(sqrtRatioAX96))
}

const getSqrtPriceX96 = (price: number, token0Decimal: number, token1Decimal: number): BigNumber => {
  const token0 = mulDecimals(price, token0Decimal)
  const token1 = mulDecimals(1, token1Decimal)

  return token0.div(token1).sqrt().multipliedBy(Q96)
}

export const getTickFromPrice = (price: number, token0Decimal: string, token1Decimal: string): number => {
  const token0 = mulDecimals(price, Number(token0Decimal))
  const token1 = mulDecimals(1, Number(token1Decimal))
  const sqrtPrice = encodeSqrtPriceX96(token1).div(encodeSqrtPriceX96(token0))

  return Math.log(sqrtPrice.toNumber()) / Math.log(Math.sqrt(1.0001))
}

export const getLiquidityDelta = (
  P: number,
  lowerP: number,
  upperP: number,
  amount0: number,
  amount1: number,
  token0Decimal: number,
  token1Decimal: number
): BigNumber => {
  const amt0 = mulDecimals(amount0, token1Decimal)
  const amt1 = mulDecimals(amount1, token0Decimal)

  const sqrtRatioX96 = getSqrtPriceX96(P, token0Decimal, token1Decimal)
  const sqrtRatioAX96 = getSqrtPriceX96(lowerP, token0Decimal, token1Decimal)
  const sqrtRatioBX96 = getSqrtPriceX96(upperP, token0Decimal, token1Decimal)

  let liquidity: BigNumber
  if (sqrtRatioX96.lte(sqrtRatioAX96)) {
    liquidity = getLiquidityForAmount0(sqrtRatioAX96, sqrtRatioBX96, amt0)
  } else if (sqrtRatioX96.lt(sqrtRatioBX96)) {
    const liquidity0 = getLiquidityForAmount0(sqrtRatioX96, sqrtRatioBX96, amt0)
    const liquidity1 = getLiquidityForAmount1(sqrtRatioAX96, sqrtRatioX96, amt1)

    liquidity = liquidity0.lt(liquidity1) ? liquidity0 : liquidity1
  } else {
    liquidity = getLiquidityForAmount1(sqrtRatioAX96, sqrtRatioBX96, amt1)
  }
  return liquidity
}

export const estimateFee = (
  liquidityDelta: BigNumber,
  liquidity: BigNumber,
  volume24H: number,
  feeTier: number
): number => {
  const feeTierPercentage = feeTier / 1000000
  const liquidityPercentage = liquidityDelta.div(liquidity.plus(liquidityDelta)).toNumber()
  return feeTierPercentage * volume24H * liquidityPercentage
}
