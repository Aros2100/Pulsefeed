import Image from "next/image";
import Link from "next/link";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Image
            src="/pulsefeeds-stacked-onwhite-slate.svg"
            alt="PulseFeed"
            width={194}
            height={48}
            className="mx-auto h-10 w-auto"
            priority
          />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
            <svg
              className="h-8 w-8 text-indigo-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Check your email
          </h1>

          {email ? (
            <p className="text-slate-500 text-sm leading-relaxed">
              We sent a confirmation link to{" "}
              <span className="font-semibold text-slate-700">{email}</span>.
              Click the link in the email to activate your account.
            </p>
          ) : (
            <p className="text-slate-500 text-sm leading-relaxed">
              We sent you a confirmation link. Click the link in the email to
              activate your account.
            </p>
          )}

          <p className="mt-4 text-xs text-slate-400">
            Also check your spam folder. The link expires in 24 hours.
          </p>

          <hr className="my-6 border-slate-100" />

          <p className="text-sm text-slate-500">
            Didn&apos;t receive it?{" "}
            <Link
              href={
                email
                  ? `/forgot-password?email=${encodeURIComponent(email)}`
                  : "/forgot-password"
              }
              className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
            >
              Resend
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
