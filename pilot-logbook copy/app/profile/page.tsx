import { requireUser } from "@/lib/auth";
import {
  certificatesForUser,
  medicalsForUser,
  endorsementsForUser,
  MEDICAL_CLASSES,
  CERTIFICATE_SUGGESTIONS,
  RATING_SUGGESTIONS,
  ENDORSEMENT_SUGGESTIONS,
} from "@/lib/db";
import {
  saveCertificate,
  saveMedical,
  saveEndorsement,
  savePilotDetails,
  removeAvatar,
  deleteProfileRecord,
} from "@/lib/actions";
import AvatarUpload from "@/components/AvatarUpload";
import { medicalPrivileges, finalExpiry } from "@/lib/medical";

/** Days until a date, or null when there's no date. */
function daysUntil(date: string): number | null {
  if (!date) return null;
  return Math.floor((new Date(date + "T23:59:59").getTime() - Date.now()) / 86400000);
}

function ExpiryCell({ date }: { date: string }) {
  const days = daysUntil(date);
  if (days === null) return <span className="muted">—</span>;
  if (days < 0) return <span className="expiring">{date} (expired)</span>;
  if (days <= 60) return <span className="expiring">{date} ({days}d)</span>;
  return <>{date}</>;
}

function DeleteButton({ table, id }: { table: string; id: number }) {
  return (
    <form action={deleteProfileRecord} style={{ display: "inline" }}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <button className="btn-danger" type="submit">Delete</button>
    </form>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    editCert?: string;
    editMed?: string;
    editEnd?: string;
  }>;
}) {
  const user = await requireUser();
  const { error, saved, editCert, editMed, editEnd } = await searchParams;
  const initials = user.username.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const certificates = certificatesForUser(user.id);
  const medicals = medicalsForUser(user.id);
  const endorsements = endorsementsForUser(user.id);

  const cert = editCert ? certificates.find((c) => c.id === Number(editCert)) : undefined;
  const med = editMed ? medicals.find((m) => m.id === Number(editMed)) : undefined;
  const end = editEnd ? endorsements.find((e) => e.id === Number(editEnd)) : undefined;

  return (
    <main className="container">
      <h1>{user.username}</h1>
      <p className="muted" style={{ marginTop: -12 }}>
        {user.email} · certificates, medicals, and endorsements. Your newest medical and flight
        review feed the currency cards on the dashboard.
      </p>
      {error && <div className="error">{error}</div>}
      {saved && <div className="notice">Saved.</div>}

      <div className="card" style={{ maxWidth: 560 }}>
        <h2>About You</h2>

        <div className="avatar-row">
          {user.avatar_type ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/api/avatar?v=${user.avatar_version ?? ""}`}
              alt="Your profile picture"
              className="avatar avatar-lg"
            />
          ) : (
            <span className="avatar avatar-lg avatar-initials" aria-hidden>
              {initials}
            </span>
          )}
          <div className="avatar-controls">
            <AvatarUpload hasPicture={Boolean(user.avatar_type)} />
            {user.avatar_type && (
              <form action={removeAvatar}>
                <button type="submit" className="btn-danger" style={{ paddingLeft: 0 }}>
                  Remove picture
                </button>
              </form>
            )}
            <span className="muted" style={{ fontSize: 12 }}>
              PNG, JPEG, WebP, or GIF, up to 8 MB. Drag and zoom to frame it — only the square you
              choose is saved, in your logbook file, visible only to you.
            </span>
          </div>
        </div>

        <form action={savePilotDetails} className="stack" style={{ marginTop: 18 }}>
          <div className="field" style={{ maxWidth: 220 }}>
            <label htmlFor="date_of_birth">Date of birth</label>
            <input id="date_of_birth" name="date_of_birth" type="date" defaultValue={user.date_of_birth ?? ""} />
          </div>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Used only to work out your medical certificate&rsquo;s privilege durations — 61.23(d)
            gives different lengths depending on whether you had reached 40 on the date of the
            exam. Stored locally with the rest of your logbook.
          </p>
          <div>
            <button type="submit">Save</button>
          </div>
        </form>
      </div>

      {/* ---------- Certificates & ratings ---------- */}
      <div className="card">
        <h2>Certificates &amp; Ratings</h2>
        {certificates.length === 0 ? (
          <p className="muted">Nothing on file yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Number</th>
                  <th>Issued</th>
                  <th>Expires</th>
                  <th>Flight review</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((c) => (
                  <tr key={c.id}>
                    <td><span className="chip">{c.kind === "rating" ? "Rating" : "Certificate"}</span></td>
                    <td><a href={`/profile?editCert=${c.id}`}>{c.name}</a></td>
                    <td>{c.number || <span className="muted">—</span>}</td>
                    <td>{c.issued_date || <span className="muted">—</span>}</td>
                    <td><ExpiryCell date={c.expires_date} /></td>
                    <td>
                      {c.resets_flight_review && c.issued_date ? (
                        <span className="chip">Resets 61.56</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "normal" }}>{c.notes}</td>
                    <td><DeleteButton table="certificates" id={c.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form action={saveCertificate} className="stack" style={{ marginTop: 16 }}>
          {cert && <input type="hidden" name="id" value={cert.id} />}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="cert_kind">Type</label>
              <select id="cert_kind" name="kind" defaultValue={cert?.kind ?? "certificate"}>
                <option value="certificate">Certificate</option>
                <option value="rating">Rating</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="cert_name">Name *</label>
              <input id="cert_name" name="name" required list="cert-options"
                placeholder="Private Pilot" defaultValue={cert?.name ?? ""} />
              <datalist id="cert-options">
                {[...CERTIFICATE_SUGGESTIONS, ...RATING_SUGGESTIONS].map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="cert_number">Certificate number</label>
              <input id="cert_number" name="number" defaultValue={cert?.number ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="cert_issued">Date issued</label>
              <input id="cert_issued" name="issued_date" type="date" defaultValue={cert?.issued_date ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="cert_expires">Expires (if any)</label>
              <input id="cert_expires" name="expires_date" type="date" defaultValue={cert?.expires_date ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="cert_notes">Notes</label>
              <input id="cert_notes" name="notes" defaultValue={cert?.notes ?? ""} />
            </div>
          </div>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, cursor: "pointer" }}>
              <input
                type="checkbox"
                name="resets_flight_review"
                defaultChecked={cert ? !!cert.resets_flight_review : true}
              />
              Earned by a practical test (resets the flight review under 61.56(d))
            </label>
            <span className="muted" style={{ fontSize: 12 }}>
              Leave this on for any checkride. Turn it off for certificates issued without a
              practical test — Remote Pilot (Part 107), Ground Instructor, or a certificate issued
              on the basis of a foreign licence — since those don&rsquo;t substitute for a review.
            </span>
          </div>
          <div className="page-actions" style={{ marginBottom: 0 }}>
            <button type="submit">{cert ? "Save Changes" : "Add Certificate or Rating"}</button>
            {cert && <a href="/profile" className="btn btn-secondary">Cancel</a>}
          </div>
        </form>
      </div>

      {/* ---------- Medicals ---------- */}
      <div className="card">
        <h2>Medical Certificates</h2>
        {medicals.length === 0 ? (
          <p className="muted">Nothing on file yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Exam date</th>
                  <th>Expires</th>
                  <th>Examiner</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {medicals.map((m, i) => (
                  <tr key={m.id}>
                    <td>
                      <a href={`/profile?editMed=${m.id}`}>{m.medical_class}</a>
                      {i === 0 && <> <span className="chip">Current</span></>}
                    </td>
                    <td>{m.exam_date || <span className="muted">—</span>}</td>
                    <td>
                      <ExpiryCell date={finalExpiry(m, user.date_of_birth) ?? ""} />
                      {medicalPrivileges(m, user.date_of_birth) && (
                        <span className="muted" style={{ fontSize: 11, display: "block" }}>
                          lowest privilege level
                        </span>
                      )}
                    </td>
                    <td>{m.examiner || <span className="muted">—</span>}</td>
                    <td style={{ whiteSpace: "normal" }}>{m.notes}</td>
                    <td><DeleteButton table="medicals" id={m.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form action={saveMedical} className="stack" style={{ marginTop: 16 }}>
          {med && <input type="hidden" name="id" value={med.id} />}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="med_class">Class</label>
              <select id="med_class" name="medical_class" defaultValue={med?.medical_class ?? "Third class"}>
                {MEDICAL_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="med_exam">Exam date *</label>
              <input id="med_exam" name="exam_date" type="date" defaultValue={med?.exam_date ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="med_expires">Expires (optional)</label>
              <input id="med_expires" name="expires_date" type="date" defaultValue={med?.expires_date ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="med_examiner">AME / examiner</label>
              <input id="med_examiner" name="examiner" defaultValue={med?.examiner ?? ""} />
            </div>
            <div className="field wide">
              <label htmlFor="med_notes">Notes</label>
              <input id="med_notes" name="notes" defaultValue={med?.notes ?? ""} />
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            For a first, second, or third class medical, the exam date plus your date of birth is
            all that&rsquo;s needed — every privilege level is worked out from 61.23(d) and shown
            on the dashboard, so leave &ldquo;Expires&rdquo; blank. A medical doesn&rsquo;t expire
            all at once: a first class stops covering ATP operations after 12 months (6 if you had
            turned 40 by the exam) but still covers commercial operations to 12 months and private
            operations to 60 months (24 if 40 or over). BasicMed has no such ladder — enter its
            expiration directly, keeping in mind its own 24-month course and 48-month exam clocks.
          </p>
          <div className="page-actions" style={{ marginBottom: 0 }}>
            <button type="submit">{med ? "Save Changes" : "Add Medical"}</button>
            {med && <a href="/profile" className="btn btn-secondary">Cancel</a>}
          </div>
        </form>
      </div>

      {/* ---------- Endorsements ---------- */}
      <div className="card">
        <h2>Endorsements</h2>
        {endorsements.length === 0 ? (
          <p className="muted">Nothing on file yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Endorsement</th>
                  <th>Date</th>
                  <th>Expires</th>
                  <th>Instructor</th>
                  <th>CFI number</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {endorsements.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "normal" }}>
                      <a href={`/profile?editEnd=${e.id}`}>{e.endorsement_type}</a>
                    </td>
                    <td>{e.date}</td>
                    <td><ExpiryCell date={e.expires_date} /></td>
                    <td>{e.instructor_name || <span className="muted">—</span>}</td>
                    <td>{e.instructor_cert || <span className="muted">—</span>}</td>
                    <td style={{ whiteSpace: "normal" }}>{e.notes}</td>
                    <td><DeleteButton table="endorsements" id={e.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form action={saveEndorsement} className="stack" style={{ marginTop: 16 }}>
          {end && <input type="hidden" name="id" value={end.id} />}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="end_type">Endorsement *</label>
              <input id="end_type" name="endorsement_type" required list="endorsement-options"
                placeholder="Flight review (61.56)" defaultValue={end?.endorsement_type ?? ""} />
              <datalist id="endorsement-options">
                {ENDORSEMENT_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="end_date">Date received *</label>
              <input id="end_date" name="date" type="date" required defaultValue={end?.date ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="end_expires">Expires (if any)</label>
              <input id="end_expires" name="expires_date" type="date" defaultValue={end?.expires_date ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="end_cfi">Instructor</label>
              <input id="end_cfi" name="instructor_name" defaultValue={end?.instructor_name ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="end_cfi_num">CFI certificate number</label>
              <input id="end_cfi_num" name="instructor_cert" defaultValue={end?.instructor_cert ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="end_notes">Notes</label>
              <input id="end_notes" name="notes" defaultValue={end?.notes ?? ""} />
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            A flight review, a 61.58 pilot proficiency check, or a WINGS phase all restart the
            61.56 clock, and the dashboard uses whichever is most recent — including checkrides
            logged above. An <em>instrument</em> proficiency check does not: 61.57(d) restores
            instrument currency but isn&rsquo;t a check for a certificate or rating. A CFI renewal
            replaces only the ground hour of a review, not the whole thing, so log the review
            itself when you do one.
          </p>
          <div className="page-actions" style={{ marginBottom: 0 }}>
            <button type="submit">{end ? "Save Changes" : "Add Endorsement"}</button>
            {end && <a href="/profile" className="btn btn-secondary">Cancel</a>}
          </div>
        </form>
      </div>
    </main>
  );
}
