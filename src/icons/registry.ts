import type { ComponentType, Ref, SVGProps } from "react";
import { BookFlipSlowIcon } from "./BookFlipIcon";
import { DiscountIcon } from "./DiscountIcon";
import { Search3DIcon } from "./Search3DIcon";
import { GlobeSpinIcon } from "./GlobeSpinIcon";
import { EmailIcon } from "./EmailIcon";
import { MacbookIcon } from "./MacbookIcon";
import { CartIcon } from "./CartIcon";
import { PlayIcon } from "./PlayIcon";
import { FocusIcon } from "./FocusIcon";
import { TicketIcon } from "./TicketIcon";
import { LightningIcon } from "./LightningIcon";
import { HomeIcon } from "./HomeIcon";
import { HomeDoorIcon } from "./HomeDoorIcon";
import { GithubIcon } from "./GithubIcon";
import { SettingsPreviewIcon } from "./SettingsIcon";
import { SettingsSliderPreviewIcon } from "./SettingsSliderIcon";
import { BellIcon } from "./BellIcon";
import { CoinIcon } from "./CoinIcon";
import { CalendarIcon } from "./CalendarIcon";
import { Calendar2Icon } from "./Calendar2Icon";
import { KeyIcon } from "./KeyIcon";
import { CompassIcon } from "./CompassIcon";
import { ScanIcon } from "./ScanIcon";
import { GemIcon } from "./GemIcon";
import { SparkleIcon } from "./SparkleIcon";
import { ArrowIcon } from "./ArrowIcon";
import { LockIcon } from "./LockIcon";
import { EyeIcon } from "./EyeIcon";
import { CallIcon } from "./CallIcon";
import { HeartIcon } from "./HeartIcon";
import { Heart2Icon } from "./Heart2Icon";
import { TrashIcon } from "./TrashIcon";
import { PaperPlaneIcon } from "./PaperPlaneIcon";
import { FallIcon } from "./FallIcon";
import { MicIcon } from "./MicIcon";
import { PenLineIcon } from "./PenLineIcon";
import { ImageSunIcon } from "./ImageSunIcon";
import { SwooshIcon } from "./SwooshIcon";
import { BookmarkPreviewIcon } from "./BookmarkIcon";
import { BrushIcon } from "./BrushIcon";
import { GlobeMorphIcon } from "./GlobeMorphIcon";
import { CodeIcon } from "./CodeIcon";
import { EarthIcon } from "./EarthIcon";
import { RocketIcon } from "./RocketIcon";
import type { IconHandle } from "./types";

export type AnimatedIcon = ComponentType<
  Omit<SVGProps<SVGSVGElement>, "ref"> & { ref?: Ref<IconHandle> }
>;

export interface IconRegistryEntry {
  id: string;
  label: string;
  Icon: AnimatedIcon;
}

/**
 * Every scrubbable icon, in one place: add an entry here and the icon shows
 * up in the /scrub tool automatically.
 */
export const ICON_REGISTRY: IconRegistryEntry[] = [
  { id: "library-2", label: "Library 2", Icon: BookFlipSlowIcon },
  { id: "discount", label: "Discount", Icon: DiscountIcon },
  { id: "search-3d", label: "Search 3D", Icon: Search3DIcon },
  { id: "globe", label: "Globe", Icon: GlobeSpinIcon },
  { id: "email", label: "Email", Icon: EmailIcon },
  { id: "macbook", label: "MacBook", Icon: MacbookIcon },
  { id: "cart", label: "Cart", Icon: CartIcon },
  { id: "play", label: "Play", Icon: PlayIcon },
  { id: "focus", label: "Focus", Icon: FocusIcon },
  { id: "ticket", label: "Ticket", Icon: TicketIcon },
  { id: "lightning", label: "Lightning", Icon: LightningIcon },
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "home-door", label: "Home Door", Icon: HomeDoorIcon },
  { id: "github", label: "GitHub", Icon: GithubIcon },
  { id: "settings", label: "Settings", Icon: SettingsPreviewIcon },
  {
    id: "settings-slider",
    label: "Settings Slider",
    Icon: SettingsSliderPreviewIcon,
  },
  { id: "bell", label: "Bell", Icon: BellIcon },
  { id: "coin", label: "Coin", Icon: CoinIcon },
  { id: "calendar", label: "Calendar", Icon: CalendarIcon },
  { id: "calendar-2", label: "Calendar 2", Icon: Calendar2Icon },
  { id: "key", label: "Key", Icon: KeyIcon },
  { id: "compass", label: "Compass", Icon: CompassIcon },
  { id: "scan", label: "Scan", Icon: ScanIcon },
  { id: "gem", label: "Gem", Icon: GemIcon },
  { id: "sparkle", label: "Sparkle", Icon: SparkleIcon },
  { id: "arrow", label: "Arrow", Icon: ArrowIcon },
  { id: "lock", label: "Lock", Icon: LockIcon },
  { id: "eye", label: "Eye", Icon: EyeIcon },
  { id: "call", label: "Call", Icon: CallIcon },
  { id: "heart", label: "Heart", Icon: HeartIcon },
  { id: "heart-2", label: "Heart 2", Icon: Heart2Icon },
  { id: "trash", label: "Trash", Icon: TrashIcon },
  { id: "fall", label: "Fall", Icon: FallIcon },
  { id: "paper-plane", label: "Paper Plane", Icon: PaperPlaneIcon },
  { id: "mic", label: "Mic", Icon: MicIcon },
  { id: "pen-line", label: "Pen Line", Icon: PenLineIcon },
  { id: "image-sun", label: "Image Sun", Icon: ImageSunIcon },
  { id: "swoosh", label: "Swoosh", Icon: SwooshIcon },
  { id: "bookmark", label: "Bookmark", Icon: BookmarkPreviewIcon },
  { id: "brush", label: "Brush", Icon: BrushIcon },
  { id: "globe-morph", label: "Globe Morph", Icon: GlobeMorphIcon },
  { id: "code", label: "Code", Icon: CodeIcon },
  { id: "earth", label: "Earth", Icon: EarthIcon },
  { id: "rocket", label: "Rocket", Icon: RocketIcon },
];
