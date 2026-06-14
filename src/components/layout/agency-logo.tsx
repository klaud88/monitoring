import Image from "next/image";

type AgencyLogoProps = {
  className?: string;
};

export function AgencyLogo({ className }: AgencyLogoProps) {
  return (
    <Image
      className={className}
      src="/agency.png"
      alt="თბილისის საბავშვო ბაგა-ბაღების მართვის სააგენტო"
      width={50}
      height={43}
      priority
    />
  );
}
