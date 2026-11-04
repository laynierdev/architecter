import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="ar-main text-center py-5">
      <h1 className="h3">Page not found</h1>
      <p className="text-muted-ar">In this prototype only the demo project exists.</p>
      <Link href="/" className="btn btn-primary">
        Back to dashboard
      </Link>
    </main>
  );
}
