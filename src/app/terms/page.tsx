import type { Metadata } from "next";
import { PolicyRedirect } from "@/components/PolicyRedirect";

export const metadata: Metadata = {
  title: "Booking information | Português com a Inês",
  alternates: { canonical: "/book/" },
  robots: { index: false, follow: true }
};

export default function TermsPrivacyPage() {
  return <PolicyRedirect />;
}
