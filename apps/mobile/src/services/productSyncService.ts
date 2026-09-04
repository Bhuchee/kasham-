import { API_URL } from '../config';
import { createProduct, updateProduct, getProducts } from '../db';

// NOTE: unused — zero call sites anywhere in the app (confirmed by grep),
// and calls a `/products` endpoint that doesn't exist in the current API
// (the real one is `/user-products/restore`; see syncService.ts's
// pushProductsToBackend for the actual, working pull). Left in place, not
// deleted — only fixed to compile — since removing dead code wasn't asked
// for in this pass.
export const syncProductsFromBackend = async (token: string, userId: string, workspaceId: string) => {
    try {
        const res = await fetch(`${API_URL}/products`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;

        const globalProducts = await res.json();
        const localProducts = await getProducts(workspaceId, userId);

        for (const gp of globalProducts) {
            const exists = localProducts.find((lp: any) => lp.barcode === gp.barcode || lp.id === gp.id);
            if (!exists) {
                await createProduct(gp.id, gp.name, gp.price, gp.stock, gp.barcode, gp.imageUrl || gp.image_uri, userId);
            } else if (new Date(gp.updatedAt).getTime() > (exists.updated_at || 0)) {
                await updateProduct(exists.id, gp.name, gp.price, gp.stock, gp.barcode, gp.imageUrl || gp.image_uri);
            }
        }
        console.log('Products restored from backend');
    } catch (e) {
        console.error('Failed to sync products from backend', e);
    }
};
