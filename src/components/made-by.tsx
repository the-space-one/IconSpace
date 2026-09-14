import Image from "next/image";

export function MadeBy() {
  return (
    <div className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-3 font-display text-base leading-none text-foreground sm:flex-nowrap sm:text-xl">
      <span className="shrink-0 whitespace-nowrap">Made By</span>

      {/* avatar · "Vansh +" · avatar — all 10px apart */}
      <div className="flex shrink-0 items-center gap-2.5">
        <Image
          src="/made-by/avatar-1.png"
          alt=""
          width={32}
          height={32}
          className="size-8 rounded-full border border-border object-cover"
        />
        <span className="whitespace-nowrap">Vansh +</span>
        <Image
          src="/made-by/avatar-2.png"
          alt=""
          width={32}
          height={32}
          className="size-8 rounded-full border border-border object-cover"
        />
      </div>

      <span className="shrink-0 whitespace-nowrap">Abhinav</span>

      {/* The line ends at Abhinav on mobile. The tool credit needs the two
          connectors to read as one sentence, and there is no width for them —
          it would wrap to a second row and read as a separate line instead.
          Connector lines grow to fill the remaining width. */}
      <span className="hidden h-[1.5px] min-w-7 flex-1 rounded-full bg-[#9FA1FF] sm:block" />
      <span className="hidden shrink-0 whitespace-nowrap sm:inline">with</span>
      <span className="hidden h-[1.5px] min-w-7 flex-1 rounded-full bg-[#9FA1FF] sm:block" />
      <span className="hidden shrink-0 whitespace-nowrap sm:inline">
        Motion + Pure svg
      </span>
    </div>
  );
}
