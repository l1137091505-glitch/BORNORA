# BORNORA

BORNORA rebuilds the weather, sky and dated public record for a person's birth date. A user can download the report locally, create a private backup, and optionally store only a salted fingerprint on BOT Chain.

## What is original here

- A new soot, white and pale-lime interface with a triptych product hero and full-width reconstruction desk.
- A new name, copy system, layout, component system and responsive behavior.
- Public-data reconstruction from Open-Meteo, Wikimedia and local SunCalc calculations.
- EIP-6963 wallet discovery, legacy multi-provider fallback, explicit user-authorized connection and a mobile MetaMask deep link.
- A new Solidity contract that stores hashes and timestamps—not raw birth details.

No source code, branding or visual assets from the reference application are included.

## Run locally

```bash
cd frontend
npm install
npm run dev
```

## Build

```bash
cd frontend
npm install
npm run build
```

## Contract

Compile `contracts/src/BornoraArchive.sol` with Solidity 0.8.24. The constructor has no arguments. Deploy it while connected to BOT Chain Mainnet (chain ID 677), copy the resulting contract address, then configure the frontend variable:

```text
VITE_BORNORA_ADDRESS=0xYourDeployedContractAddress
```

The contract charges 0.02 BOT to keep a fingerprint and 0.03 BOT to gift one. Fees go to the deployer address. Review and test the contract before using meaningful funds.

## Data and privacy

The browser sends the selected date and coordinates to public data providers only when needed for a report. A random salt is generated locally. BOT Chain receives only the salted fingerprint, an optional public year, and an optional public gift note. The downloaded private backup contains the data and salt required to reproduce the fingerprint; it must be kept private.

This project is not archival proof, financial advice or an audited protocol.
