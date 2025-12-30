import type { LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  SEARCH_PRODUCTS_QUERY,
  SEARCH_BY_BARCODE_QUERY,
} from "../lib/graphql/search-products";

interface ProductVariant {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  inventoryItemId: string;
}

interface Product {
  id: string;
  title: string;
  image: string | null;
  variants: ProductVariant[];
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const shopParam = url.searchParams.get("shop");

  // Check for Authorization header (from POS extension)
  const authHeader = request.headers.get("Authorization");

  let admin;

  if (authHeader && authHeader.startsWith("Bearer ") && shopParam) {
    // POS extension request - use unauthenticated admin with stored session
    try {
      const unauthAdmin = await unauthenticated.admin(shopParam);
      admin = unauthAdmin.admin;
    } catch (e: any) {
      console.error("Auth failed:", e);
      return Response.json(
        { products: [], error: `Auth failed: ${e.message}` },
        { status: 401 }
      );
    }
  } else {
    // Standard admin request
    const result = await authenticate.admin(request);
    admin = result.admin;
  }

  // Check if query looks like a barcode (8-14 digits)
  const isBarcode = query && /^\d{8,14}$/.test(query);

  try {
    let response;

    if (isBarcode) {
      response = await admin.graphql(SEARCH_BY_BARCODE_QUERY, {
        variables: { barcode: query },
      });
    } else if (query && query.length >= 2) {
      // Search by title or SKU
      const searchQuery = `title:*${query}* OR sku:*${query}*`;
      response = await admin.graphql(SEARCH_PRODUCTS_QUERY, {
        variables: { query: searchQuery },
      });
    } else {
      // No query - return first 50 products (most recently updated)
      response = await admin.graphql(SEARCH_PRODUCTS_QUERY, {
        variables: { query: "status:active" },
      });
    }

    const data = await response.json();

    // Normalize response format
    const products: Product[] = isBarcode
      ? normalizeVariantResponse(data)
      : normalizeProductResponse(data);

    return { products };
  } catch (error: any) {
    console.error("Search error:", error);
    const errorMessage = error?.message || error?.toString() || "Unknown error";
    return Response.json(
      { products: [], error: `Search failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}

function normalizeProductResponse(data: any): Product[] {
  const edges = data?.data?.products?.edges || [];
  return edges.map((edge: any) => ({
    id: edge.node.id,
    title: edge.node.title,
    image: edge.node.featuredImage?.url || null,
    variants: edge.node.variants.edges.map((v: any) => ({
      id: v.node.id,
      title: v.node.title,
      sku: v.node.sku,
      barcode: v.node.barcode,
      price: v.node.price,
      inventoryItemId: v.node.inventoryItem?.id || null,
    })),
  }));
}

function normalizeVariantResponse(data: any): Product[] {
  const variant = data?.data?.productVariants?.edges?.[0]?.node;
  if (!variant) return [];

  return [
    {
      id: variant.product.id,
      title: variant.product.title,
      image: variant.product.featuredImage?.url || null,
      variants: [
        {
          id: variant.id,
          title: variant.title,
          sku: variant.sku,
          barcode: variant.barcode,
          price: variant.price,
          inventoryItemId: variant.inventoryItem?.id || null,
        },
      ],
    },
  ];
}
