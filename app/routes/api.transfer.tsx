import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  ADJUST_INVENTORY_MUTATION,
  buildTransferInput,
} from "../lib/graphql/adjust-inventory";

// CORS headers for POS extension
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface TransferRequest {
  inventoryItemId: string;
  originLocationId: string;
  destinationLocationId: string;
  quantity: number;
}

export async function action({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST requests
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");
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
        { success: false, error: `Auth failed: ${e.message}` },
        { status: 401, headers: corsHeaders }
      );
    }
  } else {
    // Standard admin request
    const result = await authenticate.admin(request);
    admin = result.admin;
  }

  let body: TransferRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
  }

  const {
    inventoryItemId,
    originLocationId,
    destinationLocationId,
    quantity = 1,
  } = body;

  // Validate required fields
  if (!inventoryItemId || !originLocationId || !destinationLocationId) {
    return Response.json(
      {
        success: false,
        error: "Missing required fields: inventoryItemId, originLocationId, destinationLocationId",
      },
      { status: 400, headers: corsHeaders }
    );
  }

  // Validate quantity
  if (typeof quantity !== "number" || quantity < 1) {
    return Response.json(
      {
        success: false,
        error: "Quantity must be a positive number",
      },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // Build the transfer input
    const input = buildTransferInput(
      inventoryItemId,
      originLocationId,
      destinationLocationId,
      quantity
    );

    const response = await admin.graphql(ADJUST_INVENTORY_MUTATION, {
      variables: { input },
    });

    const data = await response.json();

    // Check for user errors
    const userErrors = data?.data?.inventoryAdjustQuantities?.userErrors || [];
    if (userErrors.length > 0) {
      return Response.json(
        {
          success: false,
          errors: userErrors,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Success
    const adjustmentGroup =
      data?.data?.inventoryAdjustQuantities?.inventoryAdjustmentGroup;

    return Response.json({
      success: true,
      adjustmentId: adjustmentGroup?.id,
      createdAt: adjustmentGroup?.createdAt,
      changes: adjustmentGroup?.changes?.edges?.map((e: any) => e.node) || [],
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Transfer error:", error);
    return Response.json(
      {
        success: false,
        error: "Failed to transfer inventory",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Handle OPTIONS and disallow GET requests
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return Response.json({ error: "Use POST to transfer inventory" }, { status: 405, headers: corsHeaders });
}
