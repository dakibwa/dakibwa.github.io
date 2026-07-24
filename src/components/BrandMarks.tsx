import { publicAssetPath } from "@/lib/paths";

type AssetMarkProps = {
  asset: string;
  className?: string;
  mobileAsset?: string;
  priority?: boolean;
};

export function AssetMark({
  asset,
  className,
  mobileAsset,
  priority = false
}: AssetMarkProps) {
  return (
    <span
      className={className ? `asset-mark ${className}` : "asset-mark"}
      aria-hidden="true"
    >
      <picture className="asset-mark__picture">
        {mobileAsset ? (
          <source
            media="(max-width: 720px)"
            srcSet={publicAssetPath(mobileAsset)}
          />
        ) : null}
        {/* These source assets are already compressed and served directly by the static export. */}
        <img
          alt=""
          className="asset-mark__image"
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          loading={priority ? "eager" : "lazy"}
          src={publicAssetPath(asset)}
        />
      </picture>
    </span>
  );
}
