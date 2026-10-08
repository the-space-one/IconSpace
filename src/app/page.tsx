import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { IconShelf } from "@/components/icon-shelf";
import { Navbar } from "@/components/navbar";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="px-4 pt-4">
        <Navbar />
      </header>
      <main className="mt-40">
        <Hero />
        <div className="flex flex-col gap-16 px-4">
          {Array.from({ length: 10 }, (_, i) => (
            <IconShelf key={i} />
          ))}
        </div>
      </main>
      <div className="mt-auto pt-24">
        <Footer />
      </div>
    </div>
  );
}
