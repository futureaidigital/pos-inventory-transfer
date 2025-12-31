import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  ADJUST_INVENTORY_MUTATION,
  ACTIVATE_INVENTORY_MUTATION,
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
    // First, ensure the destination location has the item stocked (activate if needed)
    console.log("Activating inventory at destination location...");

    try {
      const activateResponse = await admin.graphql(ACTIVATE_INVENTORY_MUTATION, {
        variables: {
          inventoryItemId,
          locationId: destinationLocationId,
        },
      });
      const activateData = await activateResponse.json();
      console.log("Activate response:", JSON.stringify(activateData, null, 2));
      // If there's a user error about already being active, that's fine
      const activateErrors = activateData?.data?.inventoryActivate?.userErrors || [];
      if (activateErrors.length > 0) {
        console.log("Activate user errors (may be already active):", activateErrors);
      }
    } catch (activateError) {
      console.log("Activate inventory (may already be stocked):", activateError);
      // Continue anyway - the item might already be stocked
    }

    // Build the transfer input
    const input = buildTransferInput(
      inventoryItemId,
      originLocationId,
      destinationLocationId,
      quantity
    );

    console.log("Transfer input:", JSON.stringify(input, null, 2));

    const response = await admin.graphql(ADJUST_INVENTORY_MUTATION, {
      variables: { input },
    });

    const data = await response.json();
    console.log("GraphQL response:", JSON.stringify(data, null, 2));

    // Check for GraphQL errors
    if (data?.errors && data.errors.length > 0) {
      const errorMessages = data.errors.map((e: any) => e.message).join(", ");
      return Response.json(
        {
          success: false,
          error: errorMessages,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check for user errors
    const userErrors = data?.data?.inventoryAdjustQuantities?.userErrors || [];
    if (userErrors.length > 0) {
      const errorMessages = userErrors.map((e: any) => e.message).join(", ");
      return Response.json(
        {
          success: false,
          error: errorMessages,
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
      changes: [],
    }, { headers: corsHeaders });
  } catch (error: any) {
    console.error("Transfer error:", error);
    // Extract GraphQL errors if available
    let errorMessage = "Failed to transfer inventory";
    if (error?.graphQLErrors) {
      const gqlErrors = error.graphQLErrors.map((e: any) => e.message).join(", ");
      errorMessage = gqlErrors || errorMessage;
    } else if (error?.message) {
      errorMessage = error.message;
    }
    return Response.json(
      {
        success: false,
        error: errorMessage,
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
