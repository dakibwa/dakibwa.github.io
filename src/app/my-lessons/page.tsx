import type { Metadata } from "next";
import { AccountHero } from "@/components/AccountHero";
import { MyLessons } from "@/components/MyLessons";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "My lessons · Português com a Inês",
  description: "Your booked Portuguese lessons.",
  robots: { index: false, follow: false }
};

export default function MyLessonsPage() {
  return (
    <>
      <SiteHeader currentPage="my-lessons" />
      <AccountHero
        intro="Everything you've booked, and everything you can change."
        mark="/visuals/v2-splats/at-your-pace-splat-v2.svg"
        title="My lessons"
      />
      <main className="manage-page" id="main-content">
        <MyLessons />
      </main>
      <SiteFooter />
    </>
  );
}
