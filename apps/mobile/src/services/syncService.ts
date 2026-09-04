import { getProducts, getUnsyncedSales, markSalesAsSynced, getUnsyncedPayments, markPaymentsAsSynced, getUnsyncedDebts, markDebtsAsSynced, getUnsyncedDebtPayments, markDebtPaymentsAsSynced, upsertDebtFromServer, upsertProductFromServer, upsertSaleFromServer, getCustomerById } from '../db';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { API_URL } from '../config';

/** Returns standard auth + store-scoping headers for every API request. */
export function buildHeaders(token: string, activeStoreOwnerId?: string | null): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };
    if (activeStoreOwnerId) {
        headers['x-workspace-id'] = activeStoreOwnerId;
    }
    return headers;
}

async function pushProductsToBackend(token: string, userId: string, activeStoreOwnerId: string | null) {
    // Scoped by workspace, not by which individual account created each
    // product — a cashier's or manager's own products get pushed too, not
    // just ones this exact logged-in account personally created.
    const ownerId = activeStoreOwnerId || userId;
    const products = await getProducts(ownerId, userId);
    if (products.length > 0) {
        try {
            await fetch(`${API_URL}/user-products/sync`, {
                method: 'POST',
                headers: buildHeaders(token, activeStoreOwnerId),
                body: JSON.stringify(products.map(p => ({
                    id: p.id,
                    name: p.name,
                    sellingPrice: p.price,
                    costPrice: p.cost_price ?? null,
                    stock: p.stock,
                    imageUrl: p.image_uri ?? null,
                    barcode: p.barcode ?? null,
                    updatedAt: p.updated_at,
                })))
            });
        } catch (e) {
            console.warn('[Sync] Could not push products:', e);
        }
    }

    // Pull the workspace's product catalog down from the server — this was
    // previously only a one-time "restore if local is empty" check in
    // App.tsx, so a product added or edited elsewhere never reached a
    // device again after its first launch. Runs every sync cycle now.
    try {
        const res = await fetch(`${API_URL}/user-products/restore`, {
            headers: buildHeaders(token, activeStoreOwnerId),
        });
        if (res.ok) {
            const workspaceProducts = await res.json();
            for (const p of workspaceProducts) {
                await upsertProductFromServer({
                    id: p.id,
                    name: p.name,
                    sellingPrice: p.sellingPrice,
                    costPrice: p.costPrice,
                    stock: p.stock,
                    barcode: p.barcode,
                    imageUrl: p.imageUrl,
                    category: p.category,
                    workspaceId: ownerId,
                    updatedAt: p.updatedAt,
                });
            }
        }
    } catch (e) {
        console.warn('[Sync] Could not pull products:', e);
    }
}

export async function pushSalesToBackend() {
    const { token, userId, activeStoreOwnerId } = useAuthStore.getState();
    const { isSyncing, setIsSyncing, setLastSyncedAt, lastSyncedAt } = useSyncStore.getState();

    if (isSyncing) return;
    if (!token || !userId) return;

    // Use active store owner for scoping — so a cashier's sales sync to the correct store
    const ownerId = activeStoreOwnerId || userId;

    try {
        setIsSyncing(true);

        await pushProductsToBackend(token, userId, activeStoreOwnerId);

        // Sync Sales — scoped by workspace (a cashier's/manager's own sales
        // get pushed too, not just ones this account personally created),
        // and always calls /sales/sync (even with nothing new to push) so
        // the pull half below runs on every cycle, not only when this
        // device has local changes to send.
        const { sales, saleItems } = await getUnsyncedSales(ownerId, userId);
        const changes = {
            sales: {
                created: sales.map(s => ({
                    id: s.id,
                    total: s.total,
                    paymentType: s.payment_type,
                    timestamp: s.timestamp
                }))
            },
            saleItems: {
                created: saleItems.map(si => ({
                    id: si.id,
                    saleId: si.sale_id,
                    productId: si.product_id,
                    quantity: si.quantity,
                    price: si.price
                }))
            }
        };

        try {
            // The previous successful sync's timestamp, so the server only
            // returns what actually changed since then — not "now", which
            // would return nothing (this was a pre-existing bug: the old
            // code always sent Date.now() as lastPulledAt, so pulled
            // changes were always empty in practice, even though the
            // backend has returned real data here since an earlier fix).
            const lastPulledAt = lastSyncedAt ? lastSyncedAt.getTime() : 0;

            const res = await fetch(`${API_URL}/sales/sync`, {
                method: 'POST',
                headers: buildHeaders(token, activeStoreOwnerId),
                body: JSON.stringify({ changes, lastPulledAt })
            });

            if (res.ok) {
                if (sales.length > 0) {
                    await markSalesAsSynced(sales.map(s => s.id));
                }

                // Pull: apply workspace sales/products changed since the
                // last successful sync — this is what makes a cashier's
                // sale visible on the owner's device, and vice versa. The
                // backend has returned this since an earlier fix, but
                // nothing consumed the response body until now.
                const body = await res.json().catch(() => null);
                const pulledSales = body?.changes?.sales ?? [];
                const pulledProducts = body?.changes?.products ?? [];

                for (const sale of pulledSales) {
                    await upsertSaleFromServer({
                        id: sale.id,
                        total: sale.total,
                        discountAmount: sale.discountAmount,
                        paymentType: sale.paymentType,
                        timestamp: sale.timestamp,
                        customerId: sale.customerId,
                        workspaceId: ownerId,
                        createdAt: sale.createdAt,
                        updatedAt: sale.updatedAt,
                        items: sale.items,
                    });
                }
                for (const product of pulledProducts) {
                    await upsertProductFromServer({
                        id: product.id,
                        name: product.name,
                        sellingPrice: product.sellingPrice,
                        costPrice: product.costPrice,
                        stock: product.stock,
                        barcode: product.barcode,
                        imageUrl: product.imageUrl,
                        category: product.category,
                        workspaceId: ownerId,
                        updatedAt: product.updatedAt,
                    });
                }
            }
        } catch (e) {
            console.warn('[Sync] Sales sync (push/pull) failed:', e);
        }

        // Sync Payments
        const payments = await getUnsyncedPayments();
        if (payments.length > 0) {
            for (const p of payments) {
                await fetch(`${API_URL}/payments`, {
                    method: 'POST',
                    headers: buildHeaders(token, activeStoreOwnerId),
                    body: JSON.stringify({
                        id: p.id, amount: p.amount, senderName: p.sender_name, matched: p.matched === 1, saleId: p.sale_id
                    })
                });
            }
            await markPaymentsAsSynced(payments.map(p => p.id));
        }

        // Sync Debts — scoped by workspace (the fix), not by which
        // individual account created them, so debts recorded by any staff
        // role on this device get pushed, not just the ones this exact
        // logged-in account personally created.
        const debts = await getUnsyncedDebts(ownerId, userId);
        if (debts.length > 0) {
             for (const d of debts) {
                // Embed the customer's name/phone — there's no customer-sync
                // endpoint, so if this workspace's customer record has never
                // reached the backend, the debt would otherwise be rejected
                // with "Customer does not belong to this workspace." The
                // backend now auto-creates the customer from these fields.
                const customer = await getCustomerById(d.customer_id);
                await fetch(`${API_URL}/debts`, {
                    method: 'POST',
                    headers: buildHeaders(token, activeStoreOwnerId),
                    body: JSON.stringify({
                        id: d.id, customerId: d.customer_id, amountOwed: d.amount_owed, saleId: d.sale_id, status: d.status,
                        customerName: customer?.name ?? null, customerPhone: customer?.phone ?? null,
                    })
                });
            }
            await markDebtsAsSynced(debts.map(d => d.id));
        }

        // Pull workspace debts down from the server — this is what makes a
        // debt created on one device (e.g. a cashier's) visible on another
        // (e.g. the owner's), since local reads only ever see this device's
        // own SQLite otherwise.
        try {
            const res = await fetch(`${API_URL}/debts`, {
                headers: buildHeaders(token, activeStoreOwnerId),
            });
            if (res.ok) {
                const workspaceDebts = await res.json();
                for (const d of workspaceDebts) {
                    await upsertDebtFromServer({
                        id: d.id,
                        customerId: d.customerId,
                        customerName: d.customer?.name,
                        customerPhone: d.customer?.phone,
                        amountOwed: d.amountOwed,
                        originalAmount: d.originalAmount,
                        saleId: d.saleId,
                        status: d.status,
                        workspaceId: ownerId,
                        createdAt: d.createdAt,
                        updatedAt: d.updatedAt,
                    });
                }
            }
        } catch (e) {
            console.warn('[Sync] Could not pull debts:', e);
        }

        // Sync Debt Payments — pushed as individual payment events, not a
        // recomputed running total, so two devices paying down the same
        // debt add up server-side instead of one overwriting the other.
        const debtPayments = await getUnsyncedDebtPayments(ownerId, userId);
        if (debtPayments.length > 0) {
            const res = await fetch(`${API_URL}/debts/payments/sync`, {
                method: 'POST',
                headers: buildHeaders(token, activeStoreOwnerId),
                body: JSON.stringify({
                    payments: debtPayments.map(p => ({
                        id: p.id, debtId: p.debt_id, amount: p.amount
                    }))
                })
            });
            if (res.ok) {
                await markDebtPaymentsAsSynced(debtPayments.map(p => p.id));
            }
        }

        setLastSyncedAt(new Date());

    } catch (e: any) {
        console.error('[Sync Error]', e.message);
    } finally {
        setIsSyncing(false);
    }
}
