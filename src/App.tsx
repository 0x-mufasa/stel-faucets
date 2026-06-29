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
    <main className="grid min-h-dvh place-items-center bg-[#f8f7f3] bg-[linear-gradient(90deg,rgba(17,17,17,0.04)_1px,transparent_1px),linear-gradient(rgba(17,17,17,0.032)_1px,transparent_1px)] bg-[length:74px_74px] p-[18px] font-['Instrument_Sans',system-ui,sans-serif] text-[#111111] antialiased">
      <Toaster closeButton position="top-center" richColors />
      <section className="grid w-full max-w-[560px] -translate-y-[9vh] justify-items-center gap-3">
        <header className="grid justify-items-center gap-2 text-center">
          <a
            className="inline-flex items-center gap-3 text-[clamp(2.1rem,7vw,3.1rem)] font-bold leading-none no-underline"
            href="#"
          >
            <span className="relative inline-grid h-9 w-9 place-items-center" aria-hidden="true">
              <span className="absolute top-[5px] h-[5px] w-[34px] rotate-[-24deg] rounded-full border-[3px] border-r-0 border-[#111111]" />
              <span className="absolute top-3.5 h-[5px] w-[29px] rotate-[-24deg] rounded-full border-[3px] border-r-0 border-[#111111]" />
              <span className="absolute top-[23px] h-[5px] w-[23px] rotate-[-24deg] rounded-full border-[3px] border-r-0 border-[#111111]" />
            </span>
            <span>Stellar Faucet</span>
          </a>
          <p className="m-0 text-[1.15rem] font-semibold text-[#7a7a7a]">
            Testnet XLM for builders.
          </p>
        </header>

        <div className="mt-2.5 text-center font-['Instrument_Serif',Georgia,serif] text-[clamp(4rem,14vw,6.5rem)] leading-[0.9] text-[#24313f]">
          {Number(balance).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          <span className="font-['Instrument_Sans',system-ui,sans-serif] text-[0.68em] font-bold">
            XLM
          </span>
        </div>

        {connected ? (
          <>
            <label className="grid w-full gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-[#7a7a7a]">
                Wallet address
              </span>
              <input
                className="min-h-[46px] w-full rounded-xl border border-[#d7d3c9] bg-[#fffdf8] px-3.5 text-center font-['DM_Mono',monospace] text-base font-medium text-[#111111] outline-none focus:border-[#111111] focus:shadow-[0_0_0_3px_#1479ff]"
                value={faucetAddress}
                onChange={(event) => setFaucetAddress(event.target.value)}
                placeholder="G..."
                spellCheck={false}
              />
            </label>
            <button
              className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2.5 rounded-full border border-[#111111] bg-[#111111] px-[22px] font-bold text-white shadow-[0_0_0_3px_#1479ff] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-[30px] [&_svg]:w-[30px] [&_svg]:rounded-full [&_svg]:bg-[#ffd92e] [&_svg]:p-[7px] [&_svg]:text-[#111111] [&_svg.lucide-loader-2]:animate-spin"
              onClick={requestTestnetXlm}
              disabled={isFunding || !canRequest}
            >
              {isFunding ? <Loader2 size={18} /> : <Wallet size={18} />}
              Request testnet XLM
            </button>
            <button
              className="cursor-pointer border-0 bg-transparent font-bold text-[#6f6f6f] underline underline-offset-4"
              onClick={disconnectWallet}
            >
              Disconnect wallet
            </button>
          </>
        ) : (
          <button
            className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2.5 rounded-full border border-[#111111] bg-[#111111] px-[22px] font-bold text-white shadow-[0_0_0_3px_#1479ff] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-[30px] [&_svg]:w-[30px] [&_svg]:rounded-full [&_svg]:bg-[#ffd92e] [&_svg]:p-[7px] [&_svg]:text-[#111111] [&_svg.lucide-loader-2]:animate-spin"
            onClick={connectWallet}
            disabled={isConnecting}
          >
            {isConnecting ? <Loader2 size={18} /> : <Wallet size={18} />}
            Connect wallet
          </button>
        )}

        <aside
          className={`mt-1 w-full rounded-xl border border-[#dedbd2] bg-[rgba(255,253,248,0.74)] px-4 py-3.5 text-center ${
            notice.kind === "error"
              ? "border-red-200"
              : notice.kind === "success"
                ? "border-green-200"
                : ""
          }`}
        >
          <strong className="block text-[0.95rem]">{notice.title}</strong>
          <p className="mt-1 text-[#707070]">{notice.message}</p>
          {notice.hash ? (
            <a
              className="mt-2.5 inline-flex max-w-full items-center gap-2 [overflow-wrap:anywhere] font-['DM_Mono',monospace] text-xs underline underline-offset-4"
              href={`https://stellar.expert/explorer/testnet/tx/${notice.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction
              <ExternalLink size={14} />
            </a>
          ) : connected ? (
            <a
              className="mt-2.5 inline-flex max-w-full items-center gap-2 [overflow-wrap:anywhere] font-['DM_Mono',monospace] text-xs underline underline-offset-4"
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
