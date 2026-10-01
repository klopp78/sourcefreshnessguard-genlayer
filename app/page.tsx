import { SOURCE_FRESHNESS_GUARD_CONTRACT_ADDRESS } from "@/lib/genlayer";

const repoUrl = "https://github.com/klopp78/sourcefreshnessguard-genlayer";
const studioUrl = `https://explorer-studio.genlayer.com/address/${SOURCE_FRESHNESS_GUARD_CONTRACT_ADDRESS}`;

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f5f7fb] text-[#15171a]">
      <section className="border-b border-[#d7dee9] bg-[#fbfcff]">
        <div className="mx-auto max-w-6xl px-5 py-10 lg:px-8">
          <span className="pill">GenLayer Project</span>
          <div className="mt-7 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-4xl font-semibold leading-tight md:text-6xl">
                SourceFreshnessGuard
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-[#60707b]">
                Consensus freshness checks for public evidence links. Register a
                source bundle, ask validators to read independent pages, and
                store a freshness receipt when content looks stale, changed, or risky.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a className="action-button primary" href="/market">Register bundle</a>
                <a className="action-button" href="/assess">Run freshness check</a>
                <a className="action-button" href="/records">Inspect records</a>
              </div>
            </div>
            <div className="release-map">
              <div>
                <span>Source bundle</span>
                <strong>bundle_* records bind the subject, cadence, source URLs, and baseline snapshots</strong>
              </div>
              <div>
                <span>Consensus read</span>
                <strong>Validators render every page, recompute a pairwise source matrix, and bind quorum inputs</strong>
              </div>
              <div>
                <span>Freshness receipt</span>
                <strong>fresh_* records preserve commitments, central comparison, robustness score, and tamper risk</strong>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-8 md:grid-cols-3 lg:px-8">
        <article className="tool-panel">
          <span className="field-label">01 Register</span>
          <h2 className="mt-2 text-2xl font-semibold">Evidence surface</h2>
          <p className="mt-3 leading-7 text-[#60707b]">
            Define the monitored subject, expected update cadence, freshness
            window, and three public URLs validators will treat as the baseline.
          </p>
          <a className="mt-5 inline-block text-sm font-semibold text-[#2f6e5f]" href="/market">Open bundle flow</a>
        </article>
        <article className="tool-panel">
          <span className="field-label">02 Evaluate</span>
          <h2 className="mt-2 text-2xl font-semibold">Freshness decision</h2>
          <p className="mt-3 leading-7 text-[#60707b]">
            Submit an observation URL and timestamp. The contract asks validators
            to assess freshness, source consistency, and tamper risk.
          </p>
          <a className="mt-5 inline-block text-sm font-semibold text-[#2f6e5f]" href="/assess">Open check flow</a>
        </article>
        <article className="tool-panel">
          <span className="field-label">03 Inspect</span>
          <h2 className="mt-2 text-2xl font-semibold">On-chain audit trail</h2>
          <p className="mt-3 leading-7 text-[#60707b]">
            Read bundle_* and fresh_* records directly from the deployed
            GenLayer contract, including every snapshot commitment.
          </p>
          <a className="mt-5 inline-block text-sm font-semibold text-[#2f6e5f]" href="/records">Open records</a>
        </article>
      </section>
      <section className="mx-auto max-w-6xl px-5 pb-8 lg:px-8">
        <div className="difference-panel">
          <span className="field-label">Distinct workflow</span>
          <h2 className="text-2xl font-semibold">Built for teams that rely on public source evidence</h2>
          <p className="mt-3 max-w-4xl leading-7 text-[#60707b]">
            SourceFreshnessGuard is useful when dashboards, integrations, agents,
            or governance workflows depend on public pages that can become stale,
            silently change, or disagree. The UI writes to a real Intelligent
            Contract and reads back accepted IDs instead of doing local scoring.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div>
            <strong>Snapshot commitments</strong>
            <span>Every accepted record binds what validators rendered.</span>
          </div>
          <div>
              <strong>Central comparison</strong>
              <span>Each check stores pairwise source agreement and contradiction signals.</span>
          </div>
          <div>
              <strong>Tamper-risk signal</strong>
              <span>Receipts include robustness score, source consistency, and manual-review flags.</span>
          </div>
          </div>
        </div>
      </section>
      <footer className="mx-auto flex max-w-6xl flex-wrap gap-4 px-5 pb-10 text-sm text-[#60707b] lg:px-8">
        <a href={repoUrl} rel="noreferrer" target="_blank">Source repository</a>
        <a href={studioUrl} rel="noreferrer" target="_blank">Studio contract</a>
        <code>{SOURCE_FRESHNESS_GUARD_CONTRACT_ADDRESS}</code>
      </footer>
    </main>
  );
}
