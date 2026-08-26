import type { Metadata } from "next";
import { ResetPassword } from "@/components/ResetPassword";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Reset your password · Português com a Inês",
  description: "Choose a new password.",
  robots: { index: false, follow: false }
};

export default function ResetPasswordPage() {
  return (
    <>
      <SiteHeader />
      <main className="manage-page" id="main-content">
        <section className="manage-page__intro">
          <h1>New password</h1>
          <div className="editorial-rule" aria-hidden="true" />
        </section>
        <ResetPassword />
      </main>
      <SiteFooter />
    </>
  );
}
