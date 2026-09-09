export type DeliveryAssetLink = { mediaAssetId?: string };

export function deliveryAssetIds(version: { links: DeliveryAssetLink[] }): string[] {
  return [
    ...new Set(version.links.flatMap((link) => (link.mediaAssetId ? [link.mediaAssetId] : []))),
  ];
}

export function newDeliveryAssetIds(
  version: { links: DeliveryAssetLink[] },
  previousVersion?: { links: DeliveryAssetLink[] },
): string[] {
  const previous = new Set(previousVersion ? deliveryAssetIds(previousVersion) : []);
  return deliveryAssetIds(version).filter((id) => !previous.has(id));
}
