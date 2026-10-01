"use client";

import { useState } from "react";
import {
  SOURCE_FRESHNESS_GUARD_CONTRACT_ADDRESS,
  compactError,
  evaluateFreshness,
  type WalletAddress,
} from "@/lib/genlayer";

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  }
}

export default function AssessPage() {
  const [bundleId, setBundleId] = useState("bundle_");
  const [observationLabel, setObservationLabel] = useState("Weekly portal rule freshness check");
  const [observedAt, setObservedAt] = useState("2026-10-01T00:00:00Z");
  const [observationUrl, setObservationUrl] = useState("https://portal.genlayer.foundation/community/all-contributions");
  const [address, setAddress] = useState(SOURCE_FRESHNESS_GUARD_CONTRACT_ADDRESS);
  const [wallet, setWallet] = useState<WalletAddress | null>(null);
  const [message, setMessage] = useState("Enter a bundle_* ID, then request consensus freshness evaluation.");
  const [record, setRecord] = useState("");
  const [busy, setBusy] = useState(false);

  async function connectWallet() {
    if (!window.ethereum) throw new Error("No browser wallet detected.");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as WalletAddress[];
    if (!accounts[0]) throw new Error("No wallet account returned.");
    setWallet(accounts[0]);
    return accounts[0];
  }

  async function submit() {
    try {
      setBusy(true);
      setRecord("");
      setMessage("Waiting for GenLayer consensus on the freshness check...");
      const account = wallet ?? await connectWallet();
      const result = await evaluateFreshness({
        walletAddress: account,
        bundleId,
        observationLabel,
        observedAt,
        observationUrl,
        contractAddress: address as `0x${string}`,
      });
      setRecord(JSON.stringify({ checkId: result.checkId, check: result.check, readbackWarning: result.readbackWarning }, null, 2));
      setMessage(`Freshness check accepted: ${result.checkId}`);
    } catch (error) {
      setMessage(compactError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 text-[#15171a]">
      <a className="pill" href="/">SourceFreshnessGuard</a>
      <h1 className="mt-7 text-4xl font-semibold">Run freshness check</h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[#60707b]">
        Ask validators to render the registered sources plus an observation URL
        and store a fresh_* receipt tied to the bundle baseline, central
        comparison matrix, and validator quorum inputs.
      </p>
      <section className="tool-panel mt-8 grid gap-4">
        <Field id="bundle" label="Bundle ID" value={bundleId} setValue={setBundleId} />
        <Field id="label" label="Observation label" value={observationLabel} setValue={setObservationLabel} />
        <Field id="observed" label="Observed at" value={observedAt} setValue={setObservedAt} />
        <Field id="observation" label="Observation URL" value={observationUrl} setValue={setObservationUrl} />
        <Field id="address" label="Studio contract address" value={address} setValue={setAddress} />
        <div className="flex flex-wrap gap-3">
          <button className="action-button" onClick={() => connectWallet().then(() => setMessage("Wallet connected.")).catch((error) => setMessage(compactError(error)))}>
            Connect wallet
          </button>
          <button className="action-button primary" disabled={busy} onClick={submit}>
            {busy ? "Awaiting consensus" : "Evaluate freshness"}
          </button>
        </div>
        <p className="text-sm text-[#60707b]">{message}</p>
      </section>
      {record ? <pre className="result-card mt-6 overflow-x-auto text-sm">{record}</pre> : null}
    </main>
  );
}

function Field({ id, label, value, setValue }: { id: string; label: string; value: string; setValue: (value: string) => void }) {
  return (
    <label className="grid gap-2" htmlFor={id}>
      <span className="field-label">{label}</span>
      <input className="text-input" id={id} value={value} onChange={(event) => setValue(event.target.value)} />
    </label>
  );
}
