"use client";

import { useState } from "react";
import {
  SOURCE_FRESHNESS_GUARD_CONTRACT_ADDRESS,
  compactError,
  readFreshnessCheck,
  readSourceBundle,
} from "@/lib/genlayer";

export default function RecordsPage() {
  const [address, setAddress] = useState(SOURCE_FRESHNESS_GUARD_CONTRACT_ADDRESS);
  const [bundleId, setBundleId] = useState("bundle_");
  const [checkId, setCheckId] = useState("fresh_");
  const [record, setRecord] = useState("");
  const [message, setMessage] = useState("Read a bundle_* baseline or fresh_* check from Studionet.");

  async function read(kind: "bundle" | "check") {
    try {
      setRecord("");
      const result = kind === "bundle"
        ? await readSourceBundle(bundleId, { contractAddress: address as `0x${string}` })
        : await readFreshnessCheck(checkId, { contractAddress: address as `0x${string}` });
      setRecord(typeof result === "string" ? result : JSON.stringify(result, null, 2));
      setMessage(`Loaded ${kind} record.`);
    } catch (error) {
      setMessage(compactError(error));
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 text-[#15171a]">
      <a className="pill" href="/">SourceFreshnessGuard</a>
      <h1 className="mt-7 text-4xl font-semibold">Inspect records</h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[#60707b]">
        Verify that source bundle baselines and freshness checks are read from
        the live GenLayer contract, including snapshot commitments and hashes.
      </p>
      <section className="tool-panel mt-8 grid gap-4">
        <Field id="address" label="Studio contract address" value={address} setValue={setAddress} />
        <Field id="bundle" label="Bundle ID" value={bundleId} setValue={setBundleId} />
        <Field id="check" label="Freshness check ID" value={checkId} setValue={setCheckId} />
        <div className="flex flex-wrap gap-3">
          <button className="action-button primary" onClick={() => read("bundle")}>Read bundle</button>
          <button className="action-button" onClick={() => read("check")}>Read freshness check</button>
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
