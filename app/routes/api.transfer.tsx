import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  ADJUST_INVENTORY_MUTATION,
  buildTransferInput,
} from "../lib/graphql/adjust-inventory";

interface TransferRequest {
  inventoryItemId: string;
  originLocationId: string;
  destinationLocationId: string;
  quantity: number;
}

export async function action({ request }: ActionFunctionArgs) {
  // Only allow POST requests
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");
  const authHeader = request.headers.get("Authorization");

  let admin;

  if (authHeader && authHeader.startsWith("Bearer ") && shopParam) {
    // POS extension request with session token
    try {
      const result = await unauthenticated.admin(shopParam);
      admin = result;
    } catch (e) {
      console.error("Auth failed:", e);
      return Response.json(
        { success: false, error: "Authentication failed. Please reinstall the app." },
        { status: 401 }
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
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
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
      { status: 400 }
    );
  }

  // Validate quantity
  if (typeof quantity !== "number" || quantity < 1) {
    return Response.json(
      {
        success: false,
        error: "Quantity must be a positive number",
      },
      { status: 400 }
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
        { status: 400 }
      );
    }

    // Success
    const adjustmentGroup =
      data?.data?.inventoryAdjustQuantities?.inventoryAdjustmentGroup;

    return {
      success: true,
      adjustmentId: adjustmentGroup?.id,
      createdAt: adjustmentGroup?.createdAt,
      changes: adjustmentGroup?.changes?.edges?.map((e: any) => e.node) || [],
    };
  } catch (error) {
    console.error("Transfer error:", error);
    return Response.json(
      {
        success: false,
        error: "Failed to transfer inventory",
      },
      { status: 500 }
    );
  }
}

// Disallow GET requests
export async function loader({ request }: LoaderFunctionArgs) {
  return Response.json({ error: "Use POST to transfer inventory" }, { status: 405 });
}
