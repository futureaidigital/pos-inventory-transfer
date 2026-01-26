import React, { useState, useCallback, useEffect } from 'react';
import {
  Text,
  Screen,
  ScrollView,
  Navigator,
  TextField,
  Button,
  reactExtension,
  useApi,
} from '@shopify/ui-extensions-react/point-of-sale';
import type { Product, ProductVariant, InventoryLevels } from './types';

// ============================================================================
// CONFIGURATION - UPDATE THESE WITH YOUR ACTUAL LOCATION IDs
// ============================================================================
const CONFIG = {
  ORIGIN_LOCATION_ID: 'gid://shopify/Location/102914851179',
  ORIGIN_NAME: 'Shop 45',
  DESTINATION_LOCATION_ID: 'gid://shopify/Location/111696085355',
  DESTINATION_NAME: 'Shop 47',
  // Direct app URL for API calls
  APP_URL: 'https://pos-inventory-transfer.fly.dev',
  // Hardcoded shop domain for Calibre 88
  SHOP_DOMAIN: 'da0kzz-iu.myshopify.com',
};
// ============================================================================

function SearchScreen({ onSelectProduct }: { onSelectProduct: (product: Product) => void }) {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const api = useApi<'pos.home.modal.render'>();

  const loadProducts = useCallback(async (searchQuery: string) => {
    setLoading(true);
    setError(null);
    try {
      // Get session token for authenticated requests
      const sessionToken = await api.session.getSessionToken();
      console.log('Session token obtained:', sessionToken ? `${sessionToken.substring(0, 20)}...` : 'NULL/EMPTY');

      const url = `${CONFIG.APP_URL}/api/search?q=${encodeURIComponent(searchQuery)}&shop=${encodeURIComponent(CONFIG.SHOP_DOMAIN)}`;
      console.log('Fetching:', url);
      console.log('Headers being sent:', { Authorization: sessionToken ? 'Bearer [token]' : 'Bearer NULL' });

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
        },
      });
      const responseText = await response.text();
      console.log('Response status:', response.status, 'Body:', responseText.substring(0, 500));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText.substring(0, 200)}`);
      }

      const data = JSON.parse(responseText);
      if (data.error) {
        throw new Error(data.error);
      }
      setProducts(data.products || []);
    } catch (err: any) {
      console.error('Load error:', err);
      setError(`${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Load products on mount (show all by default)
  useEffect(() => {
    loadProducts('');
  }, [loadProducts]);

  const handleSearch = useCallback(() => {
    loadProducts(query);
  }, [query, loadProducts]);

  return (
    <Navigator>
      <Screen name="Search" title="Quick Transfer">
        <ScrollView>
          <TextField
            label="Search by name, SKU, or barcode"
            placeholder="Filter products..."
            value={query}
            onChange={setQuery}
            action={{
              label: 'Search',
              onPress: handleSearch,
            }}
          />

          {loading && !error && <Text>Loading products...</Text>}

          {error && (
            <>
              <Text>Error: {error}</Text>
              <Button
                title="Retry"
                type="primary"
                onPress={handleSearch}
              />
            </>
          )}

          {!loading && products.length > 0 && (
            <>
              <Text>Products ({products.length}):</Text>
              {products.map((product) => (
                <Button
                  key={product.id}
                  title={`${product.title}${product.variants[0]?.sku ? ` (${product.variants[0].sku})` : ''}`}
                  type="basic"
                  onPress={() => onSelectProduct(product)}
                />
              ))}
            </>
          )}

          {!loading && products.length === 0 && !error && (
            <Text>No products found</Text>
          )}
        </ScrollView>
      </Screen>
    </Navigator>
  );
}

function ProductScreen({
  product,
  variant,
  onTransferSuccess,
  onBack,
}: {
  product: Product;
  variant: ProductVariant;
  onTransferSuccess: (qty: number, newOrigin: number, newDest: number) => void;
  onBack: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [inventory, setInventory] = useState<InventoryLevels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const api = useApi<'pos.home.modal.render'>();

  useEffect(() => {
    async function fetchInventory() {
      if (!variant.inventoryItemId) {
        setError('No inventory tracking');
        setLoading(false);
        return;
      }
      try {
        const sessionToken = await api.session.getSessionToken();
        const url = `${CONFIG.APP_URL}/api/product/${encodeURIComponent(variant.inventoryItemId)}?shop=${encodeURIComponent(CONFIG.SHOP_DOMAIN)}`;
        const response = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`,
          },
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
        }
        const data = await response.json();
        setInventory(data.levels);
      } catch (err: any) {
        console.error('Inventory error:', err);
        setError(`Failed to load inventory: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }
    fetchInventory();
  }, [variant.inventoryItemId]);

  const originStock = inventory?.[CONFIG.ORIGIN_LOCATION_ID]?.available ?? 0;
  const destinationStock = inventory?.[CONFIG.DESTINATION_LOCATION_ID]?.available ?? 0;

  const handleTransfer = async () => {
    if (quantity > originStock) {
      setError(`Only ${originStock} available`);
      return;
    }
    setTransferring(true);
    setError(null);
    try {
      const sessionToken = await api.session.getSessionToken();
      const url = `${CONFIG.APP_URL}/api/transfer?shop=${encodeURIComponent(CONFIG.SHOP_DOMAIN)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          inventoryItemId: variant.inventoryItemId,
          originLocationId: CONFIG.ORIGIN_LOCATION_ID,
          destinationLocationId: CONFIG.DESTINATION_LOCATION_ID,
          quantity,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Transfer failed');
      }
      onTransferSuccess(quantity, originStock - quantity, destinationStock + quantity);
    } catch (err: any) {
      console.error('Transfer error:', err);
      setError(err.message || 'Transfer failed');
    } finally {
      setTransferring(false);
    }
  };

  const incrementQty = () => setQuantity(q => Math.min(q + 1, Math.max(originStock, 1)));
  const decrementQty = () => setQuantity(q => Math.max(q - 1, 1));

  return (
    <Navigator>
      <Screen name="Product" title="Transfer Inventory">
        <ScrollView>
          <Text>{product.title}</Text>
          {variant.title !== 'Default Title' && <Text>{variant.title}</Text>}
          {variant.sku && <Text>SKU: {variant.sku}</Text>}

          {loading ? (
            <Text>Loading inventory...</Text>
          ) : (
            <>
              <Text>Current Stock:</Text>
              <Text>{CONFIG.ORIGIN_NAME}: {originStock} available</Text>
              <Text>{CONFIG.DESTINATION_NAME}: {destinationStock} available</Text>
            </>
          )}

          <Text>Quantity: {quantity}</Text>
          <Button title="-" type="basic" onPress={decrementQty} />
          <Button title="+" type="basic" onPress={incrementQty} />

          {error && <Text>Error: {error}</Text>}

          <Button
            title={transferring ? 'Transferring...' : `Transfer ${quantity} to ${CONFIG.DESTINATION_NAME}`}
            type="primary"
            isDisabled={loading || transferring || originStock < 1}
            onPress={handleTransfer}
          />

          {originStock < 1 && !loading && (
            <Text>No stock available at {CONFIG.ORIGIN_NAME}</Text>
          )}

          <Button title="Back" type="basic" onPress={onBack} />
        </ScrollView>
      </Screen>
    </Navigator>
  );
}

function SuccessScreen({
  product,
  variant,
  quantity,
  newOriginStock,
  newDestinationStock,
  onDone,
}: {
  product: Product;
  variant: ProductVariant;
  quantity: number;
  newOriginStock: number;
  newDestinationStock: number;
  onDone: () => void;
}) {
  const api = useApi<'pos.home.modal.render'>();

  useEffect(() => {
    const timer = setTimeout(() => api.action.dismissModal(), 3000);
    return () => clearTimeout(timer);
  }, [api]);

  return (
    <Navigator>
      <Screen name="Success" title="Transfer Complete">
        <ScrollView>
          <Text>Success!</Text>
          <Text>Transferred {quantity}x {product.title}</Text>
          {variant.title !== 'Default Title' && <Text>{variant.title}</Text>}

          <Text>Updated Stock:</Text>
          <Text>{CONFIG.ORIGIN_NAME}: {newOriginStock} left</Text>
          <Text>{CONFIG.DESTINATION_NAME}: {newDestinationStock} now</Text>

          <Button title="Transfer Another" type="primary" onPress={onDone} />
          <Button title="Close" type="basic" onPress={() => api.action.dismissModal()} />
        </ScrollView>
      </Screen>
    </Navigator>
  );
}

function VariantSelectScreen({
  product,
  onSelectVariant,
  onBack,
}: {
  product: Product;
  onSelectVariant: (variant: ProductVariant) => void;
  onBack: () => void;
}) {
  return (
    <Navigator>
      <Screen name="Variants" title="Select Variant">
        <ScrollView>
          <Text>{product.title}</Text>
          <Text>Select variant to transfer:</Text>

          {product.variants.map((variant) => (
            <Button
              key={variant.id}
              title={`${variant.title}${variant.sku ? ` (${variant.sku})` : ''}`}
              type="basic"
              onPress={() => onSelectVariant(variant)}
            />
          ))}

          <Button title="Back" type="basic" onPress={onBack} />
        </ScrollView>
      </Screen>
    </Navigator>
  );
}

function Modal() {
  const [currentScreen, setCurrentScreen] = useState<'search' | 'variants' | 'product' | 'success'>('search');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [transferResult, setTransferResult] = useState<{
    quantity: number;
    newOriginStock: number;
    newDestinationStock: number;
  } | null>(null);

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    // If product has multiple variants, show variant selection screen
    if (product.variants.length > 1) {
      setCurrentScreen('variants');
    } else {
      // Single variant - go directly to product screen
      setSelectedVariant(product.variants[0]);
      setCurrentScreen('product');
    }
  };

  const handleSelectVariant = (variant: ProductVariant) => {
    setSelectedVariant(variant);
    setCurrentScreen('product');
  };

  const handleTransferSuccess = (quantity: number, newOriginStock: number, newDestinationStock: number) => {
    setTransferResult({ quantity, newOriginStock, newDestinationStock });
    setCurrentScreen('success');
  };

  const handleBackToSearch = () => {
    setCurrentScreen('search');
    setSelectedProduct(null);
    setSelectedVariant(null);
  };

  const handleBackToVariants = () => {
    if (selectedProduct && selectedProduct.variants.length > 1) {
      setCurrentScreen('variants');
      setSelectedVariant(null);
    } else {
      handleBackToSearch();
    }
  };

  const handleDone = () => {
    setCurrentScreen('search');
    setSelectedProduct(null);
    setSelectedVariant(null);
    setTransferResult(null);
  };

  if (currentScreen === 'search') {
    return <SearchScreen onSelectProduct={handleSelectProduct} />;
  }

  if (currentScreen === 'variants' && selectedProduct) {
    return (
      <VariantSelectScreen
        product={selectedProduct}
        onSelectVariant={handleSelectVariant}
        onBack={handleBackToSearch}
      />
    );
  }

  if (currentScreen === 'product' && selectedProduct && selectedVariant) {
    return (
      <ProductScreen
        product={selectedProduct}
        variant={selectedVariant}
        onTransferSuccess={handleTransferSuccess}
        onBack={handleBackToVariants}
      />
    );
  }

  if (currentScreen === 'success' && selectedProduct && selectedVariant && transferResult) {
    return (
      <SuccessScreen
        product={selectedProduct}
        variant={selectedVariant}
        quantity={transferResult.quantity}
        newOriginStock={transferResult.newOriginStock}
        newDestinationStock={transferResult.newDestinationStock}
        onDone={handleDone}
      />
    );
  }

  return <SearchScreen onSelectProduct={handleSelectProduct} />;
}

export default reactExtension('pos.home.modal.render', () => <Modal />);
