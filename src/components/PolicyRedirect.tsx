import Link from "next/link";
import { publicAssetPath } from "@/lib/paths";

// Cloudflare redirects these addresses before serving HTML. This fallback also
// works in the static GitHub preview and without JavaScript.
export function PolicyRedirect({ section }: { section: "booking" | "privacy" }) {
  const destination = `/terms/#${section}`;

  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${publicAssetPath(destination)}`} />
      <main className="policy-page__body" id="main-content">
        <h1>Terms &amp; privacy</h1>
        <p><Link href={destination}>Read our terms and privacy information</Link>.</p>
      </main>
    </>
  );
}
