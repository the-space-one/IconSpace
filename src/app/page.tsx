import { Basket } from "@/components/basket";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { IconShelves } from "@/components/icon-shelf";
import { IconPlaybackProvider } from "@/components/icon-playback";
import { Navbar } from "@/components/navbar";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="px-4 pt-4">
        <Navbar />
      </header>
      <IconPlaybackProvider>
        <main className="mt-16 sm:mt-24 xl:mt-40">
          <Hero />
          <IconShelves />
        </main>
      </IconPlaybackProvider>
      <div className="mt-auto pt-24">
        <Footer />
      </div>
      <Basket />
    </div>
  );
}
