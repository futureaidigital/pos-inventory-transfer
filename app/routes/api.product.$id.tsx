import type { LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { GET_INVENTORY_LEVELS_QUERY } from "../lib/graphql/get-inventory";

interface InventoryLevel {
  name: string;
  available: number;
  onHand: number;
}

interface InventoryResponse {
  inventoryItemId: string;
  levels: Record<string, InventoryLevel>;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
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
        { error: `Auth failed: ${e.message}` },
        { status: 401 }
      );
    }
  } else {
    // Standard admin request
    const result = await authenticate.admin(request);
    admin = result.admin;
  }

  // The id parameter is the inventory item ID (URL encoded)
  const inventoryItemId = decodeURIComponent(params.id || "");

  if (!inventoryItemId) {
    return Response.json({ error: "Inventory item ID is required" }, { status: 400 });
  }

  try {
    const response = await admin.graphql(GET_INVENTORY_LEVELS_QUERY, {
      variables: { inventoryItemId },
    });

    const data = await response.json();

    if (!data?.data?.inventoryItem) {
      return Response.json({ error: "Inventory item not found" }, { status: 404 });
    }

    const inventoryLevels = data.data.inventoryItem.inventoryLevels.edges;

    // Transform to simple format keyed by location ID
    const levels: Record<string, InventoryLevel> = {};

    inventoryLevels.forEach((edge: any) => {
      const locationId = edge.node.location.id;
      const locationName = edge.node.location.name;
      const quantities = edge.node.quantities || [];

      const available =
        quantities.find((q: any) => q.name === "available")?.quantity || 0;
      const onHand =
        quantities.find((q: any) => q.name === "on_hand")?.quantity || 0;

      levels[locationId] = {
        name: locationName,
        available,
        onHand,
      };
    });

    const result: InventoryResponse = {
      inventoryItemId,
      levels,
    };

    return result;
  } catch (error) {
    console.error("Get inventory error:", error);
    return Response.json(
      { error: "Failed to fetch inventory levels" },
      { status: 500 }
    );
  }
}
