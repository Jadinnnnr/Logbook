import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  searchReference,
  lookupCitation,
  lookupBySourceCitation,
  referenceAvailable,
  referenceCounts,
  displayCitation,
  ReferenceHit,
} from "@/lib/reference";
import {
  bookmarksForUser,
  bookmarkGroupsForUser,
  bookmarkMembershipForUser,
  Bookmark,
  BookmarkGroup,
} from "@/lib/db";
import {
  saveBookmark,
  removeBookmark,
  createBookmarkGroup,
  deleteBookmarkGroup,
} from "@/lib/actions";

const SOURCES: [string, string][] = [
  ["", "All"],
  ["bookmarks", "Bookmarks"],
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
  saved,
  groups,
  filedIn,
}: {
  hit: ReferenceHit;
  expanded: boolean;
  query: string;
  source: string;
  saved?: Bookmark;
  groups: BookmarkGroup[];
  filedIn: Set<number>;
}) {
  return (
    <div className="ref-result">
      <div className="ref-head">
        <span className="chip">{hit.source}</span>
        <span className="ref-citation">{displayCitation(hit)}</span>
        <span className="ref-title">{hit.title}</span>
        <span style={{ flex: 1 }} />
        {!saved && (
          <form action={saveBookmark} style={{ display: "inline" }}>
            <input type="hidden" name="source" value={hit.source} />
            <input type="hidden" name="citation" value={hit.citation} />
            <button type="submit" className="link-button" style={{ fontSize: 13 }}>
              ☆ Bookmark
            </button>
          </form>
        )}
        <a href={hit.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
          Official text ↗
        </a>
      </div>

      {saved && (
        <form action={saveBookmark} className="bookmark-editor">
          <input type="hidden" name="source" value={hit.source} />
          <input type="hidden" name="citation" value={hit.citation} />
          <input
            name="name"
            defaultValue={saved.name}
            placeholder={displayCitation(hit)}
            aria-label="Bookmark name"
            style={{ maxWidth: 260 }}
          />
          {groups.map((g) => (
            <label key={g.id} className="chip-check">
              <input
                type="checkbox"
                name="groups"
                value={g.id}
                defaultChecked={filedIn.has(g.id)}
              />{" "}
              {g.name}
            </label>
          ))}
          {/* Present even when unticked, so submitting with every box cleared
              means "no groups" rather than "leave membership alone". */}
          <input type="hidden" name="groups" value="" />
          <button type="submit" style={{ fontSize: 13 }}>Save</button>
          <button
            type="submit"
            formAction={removeBookmark}
            className="link-button danger"
            style={{ fontSize: 13 }}
          >
            Remove
          </button>
        </form>
      )}
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
  searchParams: Promise<{ q?: string; source?: string; open?: string; group?: string }>;
}) {
  const user = await requireUser();
  const { q = "", source = "", open, group } = await searchParams;

  const available = referenceAvailable();
  const counts = referenceCounts();

  const marks = bookmarksForUser(user.id);
  const groups = bookmarkGroupsForUser(user.id);
  const membership = bookmarkMembershipForUser(user.id);
  const savedFor = new Map(marks.map((m) => [`${m.source}-${m.citation}`, m]));
  const groupId = group ? parseInt(group, 10) : null;

  const showingBookmarks = source === "bookmarks";

  // Bookmarks are filtered in memory rather than through FTS: there are a
  // handful, and a plain substring match finds what you saved without the
  // search ranking burying it.
  const bookmarkHits: ReferenceHit[] = showingBookmarks
    ? marks
        .filter((m) => groupId === null || (membership.get(m.id)?.has(groupId) ?? false))
        .map((m) => lookupBySourceCitation(m.source, m.citation))
        .filter((h): h is ReferenceHit => h !== null)
        .filter((h) => {
          const needle = q.trim().toLowerCase();
          if (!needle) return true;
          const custom = savedFor.get(`${h.source}-${h.citation}`)?.name ?? "";
          return (
            custom.toLowerCase().includes(needle) ||
            h.citation.toLowerCase().includes(needle) ||
            h.title.toLowerCase().includes(needle) ||
            h.body.toLowerCase().includes(needle)
          );
        })
    : [];

  const exact = !showingBookmarks && q.trim() ? lookupCitation(q) : null;
  const hits = !showingBookmarks && q.trim() ? searchReference(q, source) : [];

  const decorate = (hit: ReferenceHit) => {
    const saved = savedFor.get(`${hit.source}-${hit.citation}`);
    return {
      saved,
      groups,
      filedIn: saved ? membership.get(saved.id) ?? new Set<number>() : new Set<number>(),
    };
  };

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

        {showingBookmarks && (
          <div className="bookmark-panel">
            <div className="chip-row">
              <Link
                href={href({ source: "bookmarks", ...(q ? { q } : {}) })}
                className={groupId === null ? "chip chip-on" : "chip"}
              >
                All
              </Link>
              {groups.map((g) => (
                <span key={g.id} className="chip-with-action">
                  <Link
                    href={href({
                      source: "bookmarks",
                      group: String(g.id),
                      ...(q ? { q } : {}),
                    })}
                    className={groupId === g.id ? "chip chip-on" : "chip"}
                  >
                    {g.name}
                  </Link>
                  <form action={deleteBookmarkGroup} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={g.id} />
                    <button
                      type="submit"
                      className="link-button danger"
                      title={`Delete the ${g.name} group. The bookmarks in it are kept.`}
                      style={{ fontSize: 12 }}
                    >
                      ×
                    </button>
                  </form>
                </span>
              ))}
            </div>

            <form action={createBookmarkGroup} className="inline-form">
              <input name="name" placeholder="New group" aria-label="New group name" />
              <button type="submit" style={{ fontSize: 13 }}>Add group</button>
            </form>

            {marks.length === 0 ? (
              <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>
                No bookmarks yet. Search the regulations and use ☆ Bookmark on any result.
                Bookmarks store the citation, not the wording, so they stay current when the
                regulations are rebuilt.
              </p>
            ) : bookmarkHits.length === 0 ? (
              <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>
                {groupId !== null
                  ? "Nothing in this group yet — tick it on any bookmark below to file it here."
                  : `None of your ${marks.length} bookmarks match “${q}”.`}
              </p>
            ) : (
              <>
                <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>
                  {bookmarkHits.length < marks.length
                    ? `${bookmarkHits.length} of ${marks.length} bookmarks`
                    : `${marks.length} bookmark${marks.length === 1 ? "" : "s"}`}
                </p>
                {bookmarkHits.map((h) => (
                  <Result
                    key={`${h.source}-${h.citation}`}
                    hit={h}
                    expanded={open === h.citation}
                    query={q}
                    source={source}
                    {...decorate(h)}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {!showingBookmarks && !q && (
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

        {!showingBookmarks && q &&
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
              {exact && (
                <Result hit={exact} expanded query={q} source={source} {...decorate(exact)} />
              )}
              {hits
                .filter((h) => !exact || h.citation !== exact.citation)
                .map((h) => (
                  <Result
                    key={`${h.source}-${h.citation}`}
                    hit={h}
                    expanded={open === h.citation}
                    query={q}
                    source={source}
                    {...decorate(h)}
                  />
                ))}
            </>
          ))}
      </div>
    </main>
  );
}
