// GraphQL mutation for adjusting inventory (transfer between locations)

export const ADJUST_INVENTORY_MUTATION = `
  mutation AdjustInventory($input: InventoryAdjustQuantitiesInput!) {
    inventoryAdjustQuantities(input: $input) {
      inventoryAdjustmentGroup {
        id
        createdAt
        reason
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Helper to build the input for a transfer
export function buildTransferInput(
  inventoryItemId: string,
  originLocationId: string,
  destinationLocationId: string,
  quantity: number
) {
  return {
    reason: "correction",
    name: "available",
    changes: [
      {
        inventoryItemId,
        locationId: originLocationId,
        delta: -Math.abs(quantity), // Remove from origin
      },
      {
        inventoryItemId,
        locationId: destinationLocationId,
        delta: Math.abs(quantity), // Add to destination
      },
    ],
  };
}
