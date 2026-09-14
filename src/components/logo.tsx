import { CuriousMascot } from "@/components/curious-mascot";

/**
 * The site's mark: the cat on its own, no squircle behind it and no hill in
 * front.
 *
 * `className` sizes a square box and the cat is centred inside it at full
 * width, which leaves a little room above and below because the artwork is
 * wider than it is tall. Sizing the box rather than the cat keeps the header's
 * spacing independent of the artwork's aspect ratio.
 *
 * The interactive rig is local to the header; other mascot copies stay still.
 */
export function Logo({ className }: { className?: string }) {
  return <CuriousMascot className={className} />;
}
