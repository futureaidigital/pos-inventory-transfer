import type { LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  SEARCH_PRODUCTS_QUERY,
  SEARCH_BY_BARCODE_QUERY,
} from "../lib/graphql/search-products";

// CORS headers for POS extension
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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

// Handle CORS preflight
export async function action({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Handle CORS preflight for GET requests
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const shopParam = url.searchParams.get("shop");

  // Check for Authorization header (from POS extension)
  const authHeader = request.headers.get("Authorization");

  // Debug logging
  console.log("=== API Search Debug ===");
  console.log("Shop param:", shopParam);
  console.log("Auth header present:", !!authHeader);
  console.log("Auth header value:", authHeader ? `${authHeader.substring(0, 20)}...` : "null");
  console.log("All headers:", Object.fromEntries(request.headers.entries()));

  let admin;

  if (authHeader && authHeader.startsWith("Bearer ") && shopParam) {
    console.log("Using POS extension auth path");
    // POS extension request - use unauthenticated admin with stored session
    try {
      const unauthAdmin = await unauthenticated.admin(shopParam);
      admin = unauthAdmin.admin;
    } catch (e: any) {
      console.error("Auth failed:", e);
      return Response.json(
        { products: [], error: `Auth failed: ${e.message}` },
        { status: 401, headers: corsHeaders }
      );
    }
  } else {
    // Standard admin request
    console.log("Using standard admin auth path (no Bearer token or shop param)");
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

    return Response.json({ products }, { headers: corsHeaders });
  } catch (error: any) {
    console.error("Search error:", error);
    const errorMessage = error?.message || error?.toString() || "Unknown error";
    return Response.json(
      { products: [], error: `Search failed: ${errorMessage}` },
      { status: 500, headers: corsHeaders }
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
