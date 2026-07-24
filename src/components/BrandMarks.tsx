import type { CSSProperties } from "react";
import { publicAssetUrl } from "@/lib/paths";

type AssetMarkProps = {
  asset: string;
  className?: string;
};

type AssetMarkStyle = CSSProperties & {
  "--asset-mark-image": string;
};

export function AssetMark({ asset, className }: AssetMarkProps) {
  return (
    <span
      className={className ? `asset-mark ${className}` : "asset-mark"}
      aria-hidden="true"
      style={{ "--asset-mark-image": publicAssetUrl(asset) } as AssetMarkStyle}
    />
  );
}
