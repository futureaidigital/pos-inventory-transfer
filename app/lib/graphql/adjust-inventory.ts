// GraphQL mutation for adjusting inventory (transfer between locations)

// Mutation to activate inventory at a location (enable stocking at that location)
export const ACTIVATE_INVENTORY_MUTATION = `
  mutation InventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
    inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
      inventoryLevel {
        id
        quantities(names: ["available", "on_hand"]) {
          name
          quantity
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

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
