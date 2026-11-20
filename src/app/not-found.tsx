import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-slate-600">This page or record does not exist, or your account is not allowed to see it.</p>
      <Link href="/" className="btn-primary mt-6">Back to dashboard</Link>
    </main>
  );
}
