import { SiteHeader } from "@/components/site-header";
import { WaitlistForm } from "@/components/waitlist-form";
import { IconShelves } from "@/components/icon-shelf";
import { MadeBy } from "@/components/made-by";
import { GrassFooter } from "@/components/grass-footer";
import { EggHunt } from "@/components/easter-eggs";

// Four eggs, each hidden BEHIND something rather than dropped in a blank
// corner — three down in the grass (grass-footer.tsx) and one behind a shelf
// (icon-shelf.tsx).
//
// They live next to whatever hides them because the hiding is a stacking
// question: an egg is concealed by what paints over it, and that is decided by
// the DOM around it, not by coordinates.
export default function Home() {
  return (
    <EggHunt>
      <main className="mx-auto w-full max-w-2xl px-6 pt-8 sm:px-8 sm:pt-12">
        <div className="flex flex-col gap-10">
          <SiteHeader />
          <WaitlistForm />
          <IconShelves />
          <MadeBy />
        </div>
      </main>

      <GrassFooter />
    </EggHunt>
  );
}
