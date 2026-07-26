# Judge Notes

## Category target

Builder -> Projects

## Clear project use case

BuyerShield Desk is a buyer-protection operations app for community marketplaces,
escrow operators, and merchant support teams.

It gives users a real frontend flow to:

1. create a buyer claim
2. attach a merchant response
3. resolve the case through `BuyerProtectionOracle`
4. read the final onchain verdict back into the app
5. bind that verdict to an operational action

## Why this is a project, not only a contract

- includes a real app UI in `site/` with project-facing entrypoints in `app/`
- includes app logic that writes and reads the contract
- uses a deployed GenLayer intelligent contract as the core workflow engine
- binds the result to a downstream action panel for buyer protection decisions

## Reviewer checklist

1. open `site/index.html` and `site/app.js`
2. inspect `app/project-runtime.js` and `site/lib/oracle-client.js`
3. confirm the app uses `create_claim`, `add_merchant_response`, `resolve_claim`, `get_claim_json`
4. inspect `contracts/buyer_protection_oracle.py`
5. confirm the desk uses the live deployed contract address
