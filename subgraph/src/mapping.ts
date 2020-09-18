import { DepositedAPT, RedeemedAPT } from '../generated/APYLiquidityPoolImplementation/APYLiquidityPoolImplementation'
import { TotalEthValueLocked } from '../generated/schema'

export function handleDepositedAPT(event: DepositedAPT): void {
  let tvl = new TotalEthValueLocked(
    event.params.sender.toHex()
    + event.block.timestamp.toString()
    + event.logIndex.toString()
    + event.transaction.hash.toString()
  )
  tvl.totalEthValueLocked = event.params.totalEthValueLocked
  tvl.save()
}

export function handleRedeemedAPT(event: RedeemedAPT): void {
  let tvl = new TotalEthValueLocked(
    event.params.sender.toHex()
    + event.block.timestamp.toString()
    + event.logIndex.toString()
    + event.transaction.hash.toString()
  )
  tvl.totalEthValueLocked = event.params.totalEthValueLocked
  tvl.save()
}
