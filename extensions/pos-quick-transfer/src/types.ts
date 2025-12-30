// Type definitions for the POS Quick Transfer extension

export interface ProductVariant {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  inventoryItemId: string;
}

export interface Product {
  id: string;
  title: string;
  image: string | null;
  variants: ProductVariant[];
}

export interface InventoryLevel {
  name: string;
  available: number;
  onHand: number;
}

export interface InventoryLevels {
  [locationId: string]: InventoryLevel;
}

export interface TransferResult {
  success: boolean;
  adjustmentId?: string;
  error?: string;
  errors?: Array<{ field: string; message: string }>;
}

export interface Location {
  id: string;
  name: string;
  isActive: boolean;
}

// Configuration - Update these with your actual location IDs
export const CONFIG = {
  // Shop 45 - Main inventory location (origin)
  ORIGIN_LOCATION_ID: "gid://shopify/Location/SHOP45_ID",
  ORIGIN_NAME: "Shop 45",

  // Shop 47 - Satellite location (destination)
  DESTINATION_LOCATION_ID: "gid://shopify/Location/SHOP47_ID",
  DESTINATION_NAME: "Shop 47",
};
