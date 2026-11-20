import Link from "next/link";

/** Shown inside the normal header and menu, so people can carry on from where they are. */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-slate-700">This page or record does not exist, or your account is not allowed to see it.</p>
      <p className="mt-1 text-slate-700">Check the tracking number, or search for it on the Records page.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/records" className="btn-primary">Go to Records</Link>
        <Link href="/" className="btn-secondary">Back to dashboard</Link>
      </div>
    </div>
  );
}
