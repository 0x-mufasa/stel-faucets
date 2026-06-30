# Stellar Testnet Faucet

A simple Stellar testnet faucet for connecting Freighter and requesting testnet
XLM in one click.

The interface is intentionally small: connect, request XLM, confirm the result.

Live app: [https://stelfaucet.netlify.app/](https://stelfaucet.netlify.app/)

## Features

- Connect and disconnect a Freighter wallet.
- Restore an already approved Freighter wallet session.
- Request testnet XLM from Stellar Friendbot.
- Fetch and display the connected wallet's native XLM balance.
- Show clear success and error states with inline status and toast notifications.
- Link to the funded account or Friendbot transaction on Stellar Expert.

## Tech Stack

- React + Vite + TypeScript
- Tailwind CSS
- Freighter API
- Horizon testnet
- Stellar Friendbot

## Local Setup

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## How To Test

1. Install the Freighter browser extension.
2. Switch Freighter to `Testnet`.
3. Open the local app from the Vite dev server.
4. Click `Connect Freighter`.
5. Click `Request testnet XLM`.
6. Confirm the success state, transaction hash link, and updated XLM balance.

## Screenshots

Current app screenshots:

### Disconnected wallet state

![Disconnected wallet state](docs/screenshots/disconnected-wallet.png)

### Wallet connected state and balance displayed

![Wallet connected state and balance displayed](docs/screenshots/wallet-connected-and-balance-displayed.png)

### Successful testnet transaction

![Successful testnet transaction](docs/screenshots/successful-testnet-transaction.png)

This screenshot shows the funded account and balance on Stellar Expert testnet.


## Project Structure

```text
.
├── docs
│   └── screenshots
├── src
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

This is a frontend-only Stellar faucet. It uses Freighter, Horizon testnet, and
Friendbot without requiring a smart contract.
