import { Claimed } from "../../generated/RewardDistributor/RewardDistributor";
import { AccountClaim } from "../../generated/schema";

export function handleClaimed(event: Claimed): void {
  let accountClaimId = event.params.recipient.toHex();
  let accountClaim = AccountClaim.load(accountClaimId);

  if (accountClaim == null) {
    accountClaim = new AccountClaim(accountClaimId);
    accountClaim.claimAmount = event.params.amount;
  } else {
    accountClaim.claimAmount = event.params.amount.plus(
      accountClaim.claimAmount
    );
  }

  accountClaim.account = event.params.recipient;
  accountClaim.nonce = event.params.nonce;
  accountClaim.save();
}
