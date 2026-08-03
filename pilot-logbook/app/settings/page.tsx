import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { saveSettings, changePassword, eraseLogbookData, deleteAccount } from "@/lib/actions";
import { dataCountsForUser } from "@/lib/db";
import { THEMES, DEFAULT_CUSTOM_HEX } from "@/lib/theme";
import AccentPicker from "@/components/AccentPicker";

/** Ties the password controls in the Account card to their form element. */
const PASSWORD_FORM = "change-password";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; erased?: string; password?: string }>;
}) {
  const user = await requireUser();
  const { saved, error, erased, password } = await searchParams;
  const counts = dataCountsForUser(user.id).filter(([n]) => n > 0);
  const summary = counts.length
    ? counts.map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(", ")
    : "no logbook data";
  return (
    <main className="container">
      <h1>Settings</h1>
      {error && <div className="error">{error}</div>}
      {saved && <div className="notice">Settings saved.</div>}
      {erased && <div className="notice">Your logbook data has been erased.</div>}
      {password && (
        <div className="notice">
          Password changed. Any other browser signed in to this logbook has been signed out.
        </div>
      )}

      <form action={saveSettings} className="stack" style={{ maxWidth: 620 }}>
        <div className="card">
          <h2>Account</h2>
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="name">Name</label>
            <input id="name" name="name" defaultValue={user.username} minLength={2} maxLength={30} />
            <span className="field-hint">
              Your display name and your sign-in handle. Must be unique — change it to anything you
              like.
            </span>
          </div>
          <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>
            Signed in as <strong>{user.username}</strong> ({user.email}) — either one works at sign
            in. Certificates, medicals, and endorsements live on your{" "}
            <Link href="/profile">profile</Link>.
          </p>

          {/* These controls sit inside the Account card but belong to the
              PASSWORD_FORM element further down: a form can't be nested inside
              the settings one, and `form=` is how HTML lets a control live
              somewhere other than its owning form. Because their owner is that
              form, Save Settings neither submits nor validates them. */}
          <div className="account-password">
            <div>
              <h3>Password</h3>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Changing it signs out every other browser you&rsquo;re signed in on. This one stays
                signed in.
              </p>
            </div>
            <div className="field" style={{ maxWidth: 320 }}>
              <label htmlFor="current_password">Current password</label>
              <input
                id="current_password"
                name="current_password"
                type="password"
                form={PASSWORD_FORM}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="field" style={{ maxWidth: 320 }}>
              <label htmlFor="new_password">New password</label>
              <input
                id="new_password"
                name="new_password"
                type="password"
                form={PASSWORD_FORM}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <span className="field-hint">At least 8 characters.</span>
            </div>
            <div className="field" style={{ maxWidth: 320 }}>
              <label htmlFor="confirm_password">Confirm new password</label>
              <input
                id="confirm_password"
                name="confirm_password"
                type="password"
                form={PASSWORD_FORM}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <button type="submit" form={PASSWORD_FORM} className="btn-secondary">
              Change Password
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Appearance</h2>

          <div className="field">
            <label>Theme</label>
            <div className="choice-row">
              {THEMES.map(([value, label]) => (
                <label className="choice" key={value}>
                  <input type="radio" name="theme" value={value} defaultChecked={user.theme === value} />
                  <span className="choice-body">{label}</span>
                </label>
              ))}
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              &ldquo;Match system&rdquo; follows your device&rsquo;s light or dark setting.
            </span>
          </div>

          <div className="field" style={{ marginTop: 18 }}>
            <label>Accent Color</label>
            <AccentPicker accent={user.accent} customHex={user.accent_custom ?? DEFAULT_CUSTOM_HEX} />
            <span className="muted" style={{ fontSize: 12 }}>
              Sets buttons, links, and highlights, and previews as you choose. Any custom color
              keeps its hue but is lightened or darkened as needed so text stays readable on it in
              both themes — so a very pale or very dark pick will shift. Chart colors keep their
              own colorblind-safe palette.
            </span>
          </div>
        </div>

        <div>
          <button type="submit">Save Settings</button>
        </div>
      </form>

      {/* The owner of the password controls up in the Account card. It carries
          no fields of its own — it only exists out here because it cannot be
          nested inside the settings form. */}
      <form action={changePassword} id={PASSWORD_FORM} />

      {/* Outside the settings form — nesting forms is invalid, and these must
          not be submittable by the Save button. */}
      <div className="card danger-zone" style={{ maxWidth: 620 }}>
        <h2>Erase Data</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          You currently have {summary}. Both actions below are immediate and cannot be undone —
          there is no backup unless you make one, so consider{" "}
          <a href="/api/export">downloading a CSV export</a> first.
        </p>

        <form action={eraseLogbookData} className="stack danger-action">
          <div>
            <strong>Erase logbook data</strong>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
              Deletes every flight, aircraft, certificate, medical, and endorsement. Your account,
              name, and appearance settings stay as they are.
            </p>
          </div>
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="confirm-erase">
              Type <code>{user.username}</code> to confirm
            </label>
            <input id="confirm-erase" name="confirm" autoComplete="off" required />
          </div>
          <div>
            <button type="submit" className="btn-destructive">Erase Logbook Data</button>
          </div>
        </form>

        <form action={deleteAccount} className="stack danger-action">
          <div>
            <strong>Delete account</strong>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
              Everything above, plus the account itself. You&rsquo;ll be signed out and{" "}
              {user.email} will be free to register again.
            </p>
          </div>
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="confirm-delete">
              Type <code>{user.username}</code> to confirm
            </label>
            <input id="confirm-delete" name="confirm" autoComplete="off" required />
          </div>
          <div>
            <button type="submit" className="btn-destructive">Delete Account</button>
          </div>
        </form>
      </div>
    </main>
  );
}
