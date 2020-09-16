import { DepositAPT, RedeemedAPT } from '../generated/APYLiquidityPoolImplementation/APYLiquidityPoolImplementation'
import { TotalValueLocked } from '../generated/schema'

export function handleDepositAPT(event: DepositAPT): void {
  let tvl = new TotalValueLocked(event.params.id.toHex())
  tvl.totalValueLocked = event.params.totalValueLocked
  tvl.save()
}

export function handleRedeemedAPT(event: RedeemedAPT): void {
  let tvl = new TotalValueLocked(event.params.id.toHex())
  tvl.totalValueLocked = event.params.totalValueLocked
  tvl.save()
}
