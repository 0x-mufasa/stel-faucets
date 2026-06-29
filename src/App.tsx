import {
  ExternalLink,
  Loader2,
  Wallet,
} from "lucide-react";
import { isConnected, requestAccess } from "@stellar/freighter-api";
import { Toaster, toast } from "sonner";

import { useState } from "react";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const FRIENDBOT_URL = "https://friendbot.stellar.org";

type NoticeKind = "success" | "error" | "info";

type Notice = {
  kind: NoticeKind;
  title: string;
  message: string;
  hash?: string;
};

type BalanceLine = {
  asset_type: string;
  balance: string;
};

type HorizonAccount = {
  balances: BalanceLine[];
};

type FreighterAddressResponse = string | { address?: string; error?: unknown };

type FriendbotResponse = {
  hash?: string;
  successful?: boolean;
  title?: string;
  detail?: string;
  extras?: {
    result_codes?: {
      transaction?: string;
      operations?: string[];
    };
  };
};

function unwrapFreighterAddress(response: FreighterAddressResponse): string {
  if (typeof response === "string") {
    return response;
  }

  if (response.error) {
    throw new Error(getFriendlyError(response.error, "Freighter returned an error."));
  }

  if (!response.address) {
    throw new Error("Freighter did not return a wallet address.");
  }

  return response.address;
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function getFriendlyError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const nestedError = record.error;

    if (typeof record.message === "string") {
      return record.message;
    }

    if (typeof record.detail === "string") {
      return record.detail;
    }

    if (typeof record.title === "string") {
      return record.title;
    }

    if (typeof nestedError === "string") {
      return nestedError;
    }

    if (nestedError && typeof nestedError === "object") {
      return getFriendlyError(nestedError, fallback);
    }

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") {
        return serialized;
      }
    } catch {
      return fallback;
    }
  }

  return fallback;
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function App() {
  const [publicKey, setPublicKey] = useState("");
  const [faucetAddress, setFaucetAddress] = useState("");
  const [balance, setBalance] = useState("0.0000000");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<Notice>({
    kind: "info",
    title: "Ready",
    message: "Connect Freighter to request testnet XLM.",
  });

  const connected = Boolean(publicKey);
  const canRequest = connected && /^G[A-Z2-7]{55}$/.test(faucetAddress.trim());

  function showNotice(nextNotice: Notice, options?: { silent?: boolean }) {
    setNotice(nextNotice);

    if (options?.silent) {
      return;
    }

    const toastOptions = {
      description: nextNotice.message,
      action: nextNotice.hash
        ? {
            label: "View",
            onClick: () => {
              window.open(
                `https://stellar.expert/explorer/testnet/tx/${nextNotice.hash}`,
                "_blank",
                "noreferrer",
              );
            },
          }
        : undefined,
    };

    if (nextNotice.kind === "success") {
      toast.success(nextNotice.title, toastOptions);
      return;
    }

    if (nextNotice.kind === "error") {
      toast.error(nextNotice.title, toastOptions);
      return;
    }

    toast.info(nextNotice.title, toastOptions);
  }

  async function refreshBalance(address = publicKey, quiet = false) {
    if (!address) {
      return;
    }

    setIsRefreshing(true);

    try {
      const response = await fetch(
        `${HORIZON_URL}/accounts/${encodeURIComponent(address)}`,
      );

      if (response.status === 404) {
        setBalance("0.0000000");
        if (!quiet) {
          showNotice({
            kind: "info",
            title: "No balance yet",
            message: "Request testnet XLM to activate this account.",
          });
        }
        return;
      }

      if (!response.ok) {
        throw new Error("Could not fetch the wallet balance.");
      }

      const account = await readJson<HorizonAccount>(response);
      const nativeBalance = account?.balances.find(
        (item) => item.asset_type === "native",
      );

      setBalance(nativeBalance?.balance ?? "0.0000000");
      if (!quiet) {
        showNotice({
          kind: "success",
          title: "Balance updated",
          message: "Your testnet XLM balance is current.",
        });
      }
    } catch (error) {
      showNotice({
        kind: "error",
        title: "Balance error",
        message: getFriendlyError(error, "Unable to fetch balance."),
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function connectWallet() {
    setIsConnecting(true);

    try {
      const connection = await isConnected();
      const freighterReady =
        typeof connection === "boolean" ? connection : connection.isConnected;

      if (!freighterReady) {
        throw new Error("Install or unlock Freighter.");
      }

      const address = unwrapFreighterAddress(await requestAccess());
      setPublicKey(address);
      setFaucetAddress(address);
      showNotice({
        kind: "success",
        title: "Connected",
        message: shortenAddress(address),
      });
      await refreshBalance(address, true);
    } catch (error) {
      showNotice({
        kind: "error",
        title: "Connection failed",
        message: getFriendlyError(error, "Unable to connect Freighter."),
      });
    } finally {
      setIsConnecting(false);
    }
  }

  function disconnectWallet() {
    setPublicKey("");
    setFaucetAddress("");
    setBalance("0.0000000");
    showNotice({
      kind: "info",
      title: "Disconnected",
      message: "Wallet cleared from this session.",
    });
  }

  async function requestTestnetXlm() {
    const targetAddress = faucetAddress.trim();

    if (!publicKey) {
      showNotice({
        kind: "error",
        title: "Connect first",
        message: "Connect Freighter before requesting XLM.",
      });
      return;
    }

    if (!/^G[A-Z2-7]{55}$/.test(targetAddress)) {
      showNotice({
        kind: "error",
        title: "Invalid address",
        message: "Enter a valid Stellar testnet public key.",
      });
      return;
    }

    setIsFunding(true);

    try {
      const response = await fetch(
        `${FRIENDBOT_URL}?addr=${encodeURIComponent(targetAddress)}`,
      );
      const result = await readJson<FriendbotResponse>(response);

      if (!response.ok || result?.successful === false) {
        const operationCode = result?.extras?.result_codes?.operations?.[0];
        const transactionCode = result?.extras?.result_codes?.transaction;
        const reason =
          result?.detail ||
          result?.title ||
          operationCode ||
          transactionCode ||
          "Friendbot could not fund this wallet.";

        throw new Error(reason);
      }

      showNotice({
        kind: "success",
        title: "XLM received",
        message: "Friendbot funded your testnet wallet.",
        hash: result?.hash,
      });
      await refreshBalance(targetAddress, true);
    } catch (error) {
      showNotice({
        kind: "error",
        title: "Request failed",
        message: getFriendlyError(error, "Unable to request testnet XLM."),
      });
    } finally {
      setIsFunding(false);
    }
  }

  return (
    <main>
      <Toaster closeButton position="top-center" richColors />
      <section className="faucet-shell">
        <header className="faucet-header">
          <a className="brand" href="#">
            <span className="brand-mark" aria-hidden="true">
              <span />
            </span>
            <span>Stellar Faucet</span>
          </a>
          <p>Testnet XLM for builders.</p>
        </header>

        <div className="balance-display">
          {Number(balance).toLocaleString(undefined, {
            maximumFractionDigits: 7,
          })}{" "}
          <span>XLM</span>
        </div>

        {connected ? (
          <>
            <label className="address-field">
              <span>Wallet address</span>
              <input
                value={faucetAddress}
                onChange={(event) => setFaucetAddress(event.target.value)}
                placeholder="G..."
                spellCheck={false}
              />
            </label>
            <button
              className="primary-button"
              onClick={requestTestnetXlm}
              disabled={isFunding || !canRequest}
            >
              {isFunding ? <Loader2 size={18} /> : <Wallet size={18} />}
              Request testnet XLM
            </button>
            <button className="text-button" onClick={disconnectWallet}>
              Disconnect wallet
            </button>
          </>
        ) : (
          <button
            className="primary-button"
            onClick={connectWallet}
            disabled={isConnecting}
          >
            {isConnecting ? <Loader2 size={18} /> : <Wallet size={18} />}
            Connect wallet
          </button>
        )}

        <aside className={`status-card ${notice.kind}`}>
          <strong>{notice.title}</strong>
          <p>{notice.message}</p>
          {notice.hash ? (
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${notice.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction
              <ExternalLink size={14} />
            </a>
          ) : connected ? (
            <a
              href={`https://stellar.expert/explorer/testnet/account/${publicKey}`}
              target="_blank"
              rel="noreferrer"
            >
              View account
              <ExternalLink size={14} />
            </a>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
