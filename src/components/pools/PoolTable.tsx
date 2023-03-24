import { BigNumber } from 'bignumber.js'
import React, { useCallback, useState, useMemo, useEffect } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { TYPE } from 'theme'
import { DarkGreyCard, GreyBadge } from 'components/Card'
import Loader, { LoadingRows } from 'components/Loader'
import { AutoColumn } from 'components/Column'
import { RowFixed } from 'components/Row'
import { formatDollarAmount } from 'utils/numbers'
import { PoolData, ProcessedPoolData, PoolDayData } from 'state/pools/reducer'
import DoubleCurrencyLogo from 'components/DoubleLogo'
import { feeTierPercent } from 'utils'
import { Label, ClickableText } from 'components/Text'
import { PageButtons, Arrow, Break } from 'components/shared'
import { POOL_HIDE } from '../../constants/index'
import useTheme from 'hooks/useTheme'
import { networkPrefix } from 'utils/networkPrefix'
import { estimateFee, getTokensAmountFromDepositAmountUSD, getLiquidityDelta, getPriceFromTick } from 'utils/mathbn'
import { useActiveNetworkVersion } from 'state/application/hooks'

const Wrapper = styled(DarkGreyCard)`
  width: 100%;
`

const ResponsiveGrid = styled.div`
  display: grid;
  grid-gap: 1em;
  align-items: center;

  grid-template-columns: 20px 3.5fr repeat(6, 1fr);

  @media screen and (max-width: 900px) {
    grid-template-columns: 20px 1.5fr repeat(2, 1fr);
    & :nth-child(3) {
      display: none;
    }
  }

  @media screen and (max-width: 500px) {
    grid-template-columns: 20px 1.5fr repeat(1, 1fr);
    & :nth-child(5) {
      display: none;
    }
  }

  @media screen and (max-width: 480px) {
    grid-template-columns: 2.5fr repeat(1, 1fr);
    > *:nth-child(1) {
      display: none;
    }
  }
`

const LinkWrapper = styled(Link)`
  text-decoration: none;
  :hover {
    cursor: pointer;
    opacity: 0.7;
  }
`

const SORT_FIELD = {
  apr: 'apr',
  feeTier: 'feeTier',
  feesUSD: 'feesUSD',
  feesEstimate24h: 'feesEstimate24h',
  volumeUSD: 'volumeUSD',
  tvlUSD: 'tvlUSD',
  volumeUSDWeek: 'volumeUSDWeek',
}

const DataRow = ({ poolData, index }: { poolData: ProcessedPoolData; index: number }) => {
  const [activeNetwork] = useActiveNetworkVersion()

  return (
    <LinkWrapper to={networkPrefix(activeNetwork) + 'pools/' + poolData.address}>
      <ResponsiveGrid>
        <Label fontWeight={400}>{index + 1}</Label>
        <Label fontWeight={400}>
          <RowFixed>
            <DoubleCurrencyLogo address0={poolData.token0.address} address1={poolData.token1.address} />
            <TYPE.label ml="8px">
              {poolData.token0.symbol}/{poolData.token1.symbol}
            </TYPE.label>
            <GreyBadge ml="10px" fontSize="14px">
              {feeTierPercent(poolData.feeTier)}
            </GreyBadge>
          </RowFixed>
        </Label>
        <Label end={1} fontWeight={400}>
          {`${poolData.apr.toFixed(2)} %`}
        </Label>
        <Label end={1} fontWeight={400}>
          {formatDollarAmount(poolData.feesEstimate24h)}
        </Label>
        <Label end={1} fontWeight={400}>
          {formatDollarAmount(poolData.feesUSD)}
        </Label>
        <Label end={1} fontWeight={400}>
          {formatDollarAmount(poolData.tvlUSD)}
        </Label>
        <Label end={1} fontWeight={400}>
          {formatDollarAmount(poolData.volumeUSD)}
        </Label>
        <Label end={1} fontWeight={400}>
          {formatDollarAmount(poolData.volumeUSDWeek)}
        </Label>
      </ResponsiveGrid>
    </LinkWrapper>
  )
}

const MAX_ITEMS = 50
const MIN_VOLUMES = 50000

export default function PoolTable({ poolDatas, maxItems = MAX_ITEMS }: { poolDatas: PoolData[]; maxItems?: number }) {
  const [currentNetwork] = useActiveNetworkVersion()

  // theming
  const theme = useTheme()

  // for sorting
  const [sortField, setSortField] = useState(SORT_FIELD.apr)
  const [sortDirection, setSortDirection] = useState<boolean>(true)

  // pagination
  const [page, setPage] = useState(1)
  const [maxPage, setMaxPage] = useState(1)

  const processedPools: ProcessedPoolData[] = useMemo(() => {
    return poolDatas
      ? poolDatas
          .filter(
            (pool) => !!pool && !POOL_HIDE[currentNetwork.id].includes(pool.address) && pool.volumeUSD >= MIN_VOLUMES
          )
          .map((pool) => {
            const poolDayData7d = pool.poolDayData.slice(0, 7)
            const poolDayData14d = pool.poolDayData
            const priceVolatility24HPercentage: number =
              poolDayData14d
                .map((d: PoolDayData) => {
                  return (100 * (Number(d.high) - Number(d.low))) / Number(d.high)
                })
                .reduce((a, b) => a + b, 0) / 14

            const P = getPriceFromTick(Number(pool.tick), pool.token0.decimals, pool.token1.decimals)
            const Pl = P - (P * priceVolatility24HPercentage) / 100
            const Pu = P + (P * priceVolatility24HPercentage) / 100
            const priceUSDX = Number(pool.token1?.tokenDayData ? pool.token1?.tokenDayData[0].priceUSD : 0)
            const priceUSDY = Number(pool.token0?.tokenDayData ? pool.token0?.tokenDayData[0].priceUSD : 0)
            const depositAmountUSD = 50000
            const { amount0, amount1 } = getTokensAmountFromDepositAmountUSD(
              P,
              Pl,
              Pu,
              priceUSDX,
              priceUSDY,
              depositAmountUSD
            )
            const deltaL = getLiquidityDelta(
              P,
              Pl,
              Pu,
              amount0,
              amount1,
              Number(pool.token0?.decimals || 18),
              Number(pool.token1?.decimals || 18)
            )
            const volume24h = Number(poolDayData7d[0].volumeUSD)
            const L = new BigNumber(pool.liquidity)
            const feesEstimate24h = P >= Pl && P <= Pu ? estimateFee(deltaL, L, volume24h, pool.feeTier) : 0
            const apr = (feesEstimate24h * 365 * 100) / depositAmountUSD

            return {
              ...pool,
              feesUSD: pool.volumeUSD * (pool.feeTier / 1000000),
              feesEstimate24h: feesEstimate24h / 500,
              apr,
            }
          })
      : []
  }, [currentNetwork.id, poolDatas])
  const sortedPools = useMemo(() => {
    return processedPools
      ? processedPools
          .sort((a, b) => {
            if (a && b) {
              return a[sortField as keyof PoolData] > b[sortField as keyof PoolData]
                ? (sortDirection ? -1 : 1) * 1
                : (sortDirection ? -1 : 1) * -1
            } else {
              return -1
            }
          })
          .slice(maxItems * (page - 1), page * maxItems)
      : []
  }, [maxItems, page, processedPools, sortDirection, sortField])

  useEffect(() => {
    let extraPages = 1
    if (processedPools.length % maxItems === 0) {
      extraPages = 0
    }
    setMaxPage(Math.floor(processedPools.length / maxItems) + extraPages)
  }, [maxItems, processedPools])

  const handleSort = useCallback(
    (newField: string) => {
      setSortField(newField)
      setSortDirection(sortField !== newField ? true : !sortDirection)
    },
    [sortDirection, sortField]
  )

  const arrow = useCallback(
    (field: string) => {
      return sortField === field ? (!sortDirection ? '↑' : '↓') : ''
    },
    [sortDirection, sortField]
  )

  if (!poolDatas) {
    return <Loader />
  }

  return (
    <Wrapper>
      {sortedPools.length > 0 ? (
        <AutoColumn gap="16px">
          <ResponsiveGrid>
            <Label color={theme.text2}>#</Label>
            <ClickableText color={theme.text2} onClick={() => handleSort(SORT_FIELD.feeTier)}>
              Pool {arrow(SORT_FIELD.feeTier)}
            </ClickableText>
            <ClickableText color={theme.text2} end={1} onClick={() => handleSort(SORT_FIELD.feesEstimate24h)}>
              APR {arrow(SORT_FIELD.apr)}
            </ClickableText>
            <ClickableText color={theme.text2} end={1} onClick={() => handleSort(SORT_FIELD.feesEstimate24h)}>
              (100$/24H) {arrow(SORT_FIELD.feesEstimate24h)}
            </ClickableText>
            <ClickableText color={theme.text2} end={1} onClick={() => handleSort(SORT_FIELD.feesUSD)}>
              Fee 24H {arrow(SORT_FIELD.feesUSD)}
            </ClickableText>
            <ClickableText color={theme.text2} end={1} onClick={() => handleSort(SORT_FIELD.tvlUSD)}>
              TVL {arrow(SORT_FIELD.tvlUSD)}
            </ClickableText>
            <ClickableText color={theme.text2} end={1} onClick={() => handleSort(SORT_FIELD.volumeUSD)}>
              Volume 24H {arrow(SORT_FIELD.volumeUSD)}
            </ClickableText>
            <ClickableText color={theme.text2} end={1} onClick={() => handleSort(SORT_FIELD.volumeUSDWeek)}>
              Volume 7D {arrow(SORT_FIELD.volumeUSDWeek)}
            </ClickableText>
          </ResponsiveGrid>
          <Break />
          {sortedPools.map((poolData, i) => {
            if (poolData) {
              return (
                <React.Fragment key={i}>
                  <DataRow index={(page - 1) * MAX_ITEMS + i} poolData={poolData} />
                  <Break />
                </React.Fragment>
              )
            }
            return null
          })}
          <PageButtons>
            <div
              onClick={() => {
                setPage(page === 1 ? page : page - 1)
              }}
            >
              <Arrow faded={page === 1 ? true : false}>←</Arrow>
            </div>
            <TYPE.body>{'Page ' + page + ' of ' + maxPage}</TYPE.body>
            <div
              onClick={() => {
                setPage(page === maxPage ? page : page + 1)
              }}
            >
              <Arrow faded={page === maxPage ? true : false}>→</Arrow>
            </div>
          </PageButtons>
        </AutoColumn>
      ) : (
        <LoadingRows>
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
        </LoadingRows>
      )}
    </Wrapper>
  )
}
