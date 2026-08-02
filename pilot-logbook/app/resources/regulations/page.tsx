import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  searchReference,
  lookupCitation,
  referenceAvailable,
  referenceCounts,
  displayCitation,
  ReferenceHit,
} from "@/lib/reference";

const SOURCES: [string, string][] = [
  ["", "All"],
  ["FAR", "FARs"],
  ["AIM", "AIM"],
];

const EXAMPLES = ["61.57", "flight review", "class B entry", "VFR fuel reserves", "holding pattern"];

/** The snippet comes from FTS5 with <mark> around hits; render those safely. */
function Snippet({ html }: { html: string }) {
  const parts = html.split(/(<mark>|<\/mark>)/);
  let inMark = false;
  return (
    <p className="ref-snippet">
      {parts.map((part, i) => {
        if (part === "<mark>") {
          inMark = true;
          return null;
        }
        if (part === "</mark>") {
          inMark = false;
          return null;
        }
        return inMark ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function href(params: Record<string, string>) {
  const s = new URLSearchParams(params).toString();
  return `/resources/regulations${s ? `?${s}` : ""}`;
}

function Result({
  hit,
  expanded,
  query,
  source,
}: {
  hit: ReferenceHit;
  expanded: boolean;
  query: string;
  source: string;
}) {
  return (
    <div className="ref-result">
      <div className="ref-head">
        <span className="chip">{hit.source}</span>
        <span className="ref-citation">{displayCitation(hit)}</span>
        <span className="ref-title">{hit.title}</span>
        <span style={{ flex: 1 }} />
        <a href={hit.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
          Official text ↗
        </a>
      </div>
      {expanded ? (
        <div className="ref-body">{hit.body}</div>
      ) : (
        <>
          <Snippet html={hit.snippet} />
          <Link
            href={href({ q: query || hit.citation, source, open: hit.citation })}
            scroll={false}
            style={{ fontSize: 13 }}
          >
            Read the full text
          </Link>
        </>
      )}
    </div>
  );
}

export default async function RegulationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string; open?: string }>;
}) {
  await requireUser();
  const { q = "", source = "", open } = await searchParams;

  const available = referenceAvailable();
  const counts = referenceCounts();
  const exact = q.trim() ? lookupCitation(q) : null;
  const hits = q.trim() ? searchReference(q, source) : [];

  return (
    <main className="container">
      <p className="crumb">
        <Link href="/resources">← Resources</Link>
      </p>
      <h1>FAR / AIM Search</h1>

      <div className="card">
        <form method="get" action="/resources/regulations" className="ref-search">
          <div className="field">
            <label htmlFor="q">Search the regulations</label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="61.57, night currency, class B entry…"
            />
          </div>
          <div className="field" style={{ flex: "none", minWidth: 140 }}>
            <label htmlFor="source">Source</label>
            <select id="source" name="source" defaultValue={source}>
              {SOURCES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <button type="submit">Search</button>
        </form>

        {!q && (
          <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>
            {available
              ? `Searching ${counts.far.toLocaleString()} FAR sections and ${counts.aim.toLocaleString()} AIM paragraphs. Try `
              : "Reference database not built yet — use Refresh All Data on the Resources page. Try "}
            {EXAMPLES.map((e, i) => (
              <span key={e}>
                {i > 0 && ", "}
                <Link href={href({ q: e })}>{e}</Link>
              </span>
            ))}
            .
          </p>
        )}

        {q &&
          (!available ? (
            <p className="muted" style={{ margin: "14px 0 0" }}>
              The reference database hasn&rsquo;t been built. Run{" "}
              <code>node scripts/build-reference.mjs</code>, or use Refresh All Data on the{" "}
              <Link href="/resources">Resources</Link> page.
            </p>
          ) : exact === null && hits.length === 0 ? (
            <p className="muted" style={{ margin: "14px 0 0" }}>
              Nothing found for &ldquo;{q}&rdquo;. Try fewer or more general words.
            </p>
          ) : (
            <>
              <p className="muted" style={{ margin: "14px 0 0", fontSize: 13 }}>
                {exact ? "Exact citation, plus " : ""}
                {hits.length} result{hits.length === 1 ? "" : "s"} for &ldquo;{q}&rdquo;
              </p>
              {exact && <Result hit={exact} expanded query={q} source={source} />}
              {hits
                .filter((h) => !exact || h.citation !== exact.citation)
                .map((h) => (
                  <Result
                    key={`${h.source}-${h.citation}`}
                    hit={h}
                    expanded={open === h.citation}
                    query={q}
                    source={source}
                  />
                ))}
            </>
          ))}
      </div>
    </main>
  );
}
