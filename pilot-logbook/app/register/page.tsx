import Link from "next/link";
import { redirect } from "next/navigation";
import { register } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth";
import AuthLayout from "@/components/AuthLayout";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    name?: string;
    email?: string;
    dob?: string;
    deleted?: string;
  }>;
}) {
  if (await getSessionUser()) redirect("/");
  const { error, name, email, dob, deleted } = await searchParams;
  return (
    <AuthLayout>
      <div className="auth-card">
        <h2 className="auth-title">Create account</h2>
        <p className="auth-sub">Start your digital logbook</p>
        {deleted && (
          <div className="notice">Your account and all of its data have been deleted.</div>
        )}
        {error && <div className="error">{error}</div>}
        <form action={register} className="stack">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={30}
              autoComplete="username"
              placeholder="Amelia Reyes"
              defaultValue={name ?? ""}
            />
            <span className="field-hint">
              Shown on your logbook and used to sign in, so it has to be unique. Letters, numbers,
              spaces, and . _ &rsquo; - are allowed, and you can change it later.
            </span>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={email ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="date_of_birth">Date of birth</label>
            <input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              required
              autoComplete="bday"
              defaultValue={dob ?? ""}
            />
            <span className="field-hint">
              Your medical&rsquo;s privilege durations depend on your age at the exam (61.23(d)).
              Saved to your profile and stored locally.
            </span>
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <span className="field-hint">At least 8 characters.</span>
          </div>
          <div className="field">
            <label htmlFor="confirm_password">Confirm password</label>
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <button type="submit">Create account</button>
        </form>
        <p className="auth-switch">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
