import { Logo } from "@/components/logo";

export function SiteHeader() {
  return (
    <header className="flex w-full flex-col gap-6">
      <div className="flex items-center">
        <Logo className="size-12 sm:size-16" />
      </div>

      <div className="flex flex-col gap-8 sm:gap-10">
        <h1 className="font-heading text-[2.5rem] font-normal leading-[1.05] text-foreground sm:text-6xl sm:leading-none">
          <span className="block">Beautifully</span>
          <span className="block">animated icons.</span>
        </h1>

        <p className="font-description text-2xl font-normal leading-tight text-muted-foreground sm:text-3xl sm:leading-9">
          Fast, energetic, delightful motion.
        </p>
      </div>
    </header>
  );
}
