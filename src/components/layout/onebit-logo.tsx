import Image from "next/image";

type OneBitLogoProps = {
  className?: string;
};

// Animated OneBit wordmark (a red trace runs from the "i" through the e–B link
// and around the O). Plays once and holds on the final red-accented frame.
export function OneBitLogo({ className }: OneBitLogoProps) {
  return (
    <Image
      className={`onebit-logo${className ? ` ${className}` : ""}`}
      src="/onebit.webp"
      alt="OneBit"
      width={560}
      height={210}
      unoptimized
      priority
    />
  );
}
