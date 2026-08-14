import { publicAssetPath } from "@/lib/paths";

type AssetMarkProps = {
  asset: string;
  className?: string;
  height?: number;
  mobileAsset?: string;
  priority?: boolean;
  width?: number;
};

export function AssetMark({
  asset,
  className,
  height,
  mobileAsset,
  priority = false,
  width
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
        <img
          alt=""
          className="asset-mark__image"
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          height={height}
          loading={priority ? "eager" : "lazy"}
          src={publicAssetPath(asset)}
          width={width}
        />
      </picture>
    </span>
  );
}
