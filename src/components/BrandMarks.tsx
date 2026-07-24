import { publicAssetPath } from "@/lib/paths";

type AssetMarkProps = {
  asset: string;
  className?: string;
  priority?: boolean;
};

export function AssetMark({ asset, className, priority = false }: AssetMarkProps) {
  return (
    <span
      className={className ? `asset-mark ${className}` : "asset-mark"}
      aria-hidden="true"
    >
      {/* These source assets are already compressed and served directly by the static export. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        className="asset-mark__image"
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        loading={priority ? "eager" : "lazy"}
        src={publicAssetPath(asset)}
      />
    </span>
  );
}
